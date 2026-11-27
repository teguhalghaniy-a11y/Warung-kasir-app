const KasirData = {
  // Hitung diskon bertingkat berantai (misal "10+5" atau "10, 5") -> 10000 -10% = 9000, lalu -5% = 8550
  applySequentialDiscount(baseAmount, discountStr) {
    let amount = Math.max(0, Number(baseAmount) || 0);
    if (!discountStr) return Math.round(amount);

    const parts = String(discountStr)
      .split(/[+,;\s]+/)
      .map((s) => parseFloat(s.replace("%", "").trim()))
      .filter((n) => !isNaN(n) && n > 0);

    for (let i = 0; i < parts.length; i++) {
      const pct = Math.min(100, parts[i]);
      amount = amount * (1 - pct / 100);
    }
    return Math.round(amount);
  },

  calculateCartTotals(cartItems, globalDiscountStr) {
    let grossSubtotal = 0;
    let itemDiscountTotal = 0;
    let netItemsSubtotal = 0;

    const calculatedItems = cartItems.map((item) => {
      const qty = Math.max(1, Number(item.qty) || 1);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      const lineGross = qty * unitPrice;
      const lineNet = this.applySequentialDiscount(lineGross, item.discountStr);
      const lineDiscount = lineGross - lineNet;

      grossSubtotal += lineGross;
      itemDiscountTotal += lineDiscount;
      netItemsSubtotal += lineNet;

      return Object.assign({}, item, {
        qty: qty,
        unitPrice: unitPrice,
        lineGross: lineGross,
        lineDiscount: lineDiscount,
        lineNet: lineNet
      });
    });

    const grandTotal = this.applySequentialDiscount(netItemsSubtotal, globalDiscountStr);
    const globalDiscountAmount = netItemsSubtotal - grandTotal;

    return {
      items: calculatedItems,
      grossSubtotal: grossSubtotal,
      itemDiscountTotal: itemDiscountTotal,
      netItemsSubtotal: netItemsSubtotal,
      globalDiscountAmount: globalDiscountAmount,
      grandTotal: grandTotal
    };
  },

  async processCheckout(payload) {
    const {
      cartItems,
      globalDiscountStr,
      paymentMethod, // "TUNAI" atau "HUTANG"
      cashPaid,
      customerName,
      customerPhone,
      dueDate,
      note
    } = payload;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error("Keranjang belanja masih kosong.");
    }

    const totals = this.calculateCartTotals(cartItems, globalDiscountStr);
    if (paymentMethod === "TUNAI" && Number(cashPaid) < totals.grandTotal) {
      throw new Error("Uang bayar kurang dari total belanja.");
    }
    if (paymentMethod === "HUTANG" && !String(customerName || "").trim()) {
      throw new Error("Nama pelanggan wajib diisi untuk transaksi hutang.");
    }

    const [allProducts, allBatches] = await Promise.all([
      WarungDB.getAll("products"),
      WarungDB.getAll("batches")
    ]);

    const prodMap = new Map(allProducts.map((p) => [p.id, p]));

    // Validasi stok total sebelum mutasi database
    const requiredUnitsByProd = {};
    for (let i = 0; i < totals.items.length; i++) {
      const item = totals.items[i];
      const prod = prodMap.get(item.productId);
      if (!prod) throw new Error("Produk " + item.name + " tidak ditemukan.");

      const packSize = Math.max(1, Number(prod.packSize) || 1);
      const unitsNeeded = item.saleMode === "ECERAN" ? item.qty : item.qty * packSize;
      requiredUnitsByProd[prod.id] = (requiredUnitsByProd[prod.id] || 0) + unitsNeeded;
    }

    for (const prodId in requiredUnitsByProd) {
      const prod = prodMap.get(prodId);
      const avail = Number(prod.totalSmallestUnits) || 0;
      if (requiredUnitsByProd[prodId] > avail) {
        throw new Error("Stok " + prod.name + " tidak cukup (tersedia " + avail + " unit).");
      }
    }

    const todayStr = Utils.getTodayISO();
    const timeStr = Utils.getCurrentTimeStr();
    const trxId = Utils.generateId("TRX");
    const invoiceNo = "INV-" + todayStr.replace(/-/g, "") + "-" + trxId.slice(-4);

    let totalCogs = 0;
    const finalizedItems = [];

    // Alokasi proporsional diskon global ke tiap baris item agar laba bersih akurat
    const globalRatio = totals.netItemsSubtotal > 0 ? totals.grandTotal / totals.netItemsSubtotal : 1;

    for (let i = 0; i < totals.items.length; i++) {
      const item = totals.items[i];
      const prod = prodMap.get(item.productId);
      const packSize = Math.max(1, Number(prod.packSize) || 1);
      const unitsToDeduct = item.saleMode === "ECERAN" ? item.qty : item.qty * packSize;

      // Ambil batch aktif urut FEFO (kedaluwarsa terdekat lebih dulu)
      const prodBatches = allBatches
        .filter((b) => b.productId === prod.id && Number(b.remainingSmallestUnits) > 0)
        .sort((a, b) => {
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return a.expiryDate.localeCompare(b.expiryDate);
        });

      let remainingNeed = unitsToDeduct;
      let itemCogs = 0;
      const batchAllocations = [];

      for (let bIdx = 0; bIdx < prodBatches.length; bIdx++) {
        if (remainingNeed <= 0) break;
        const batch = prodBatches[bIdx];
        const batchAvail = Number(batch.remainingSmallestUnits) || 0;
        const take = Math.min(batchAvail, remainingNeed);

        // Hitung modal historis per unit dari batch tersebut
        const unitCost =
          batch.buyPriceRetail !== undefined && Number(batch.buyPriceRetail) > 0
            ? Number(batch.buyPriceRetail)
            : (Number(batch.buyPricePack) || Number(prod.buyPricePack) || 0) / packSize;

        itemCogs += take * unitCost;
        batch.remainingSmallestUnits = batchAvail - take;
        remainingNeed -= take;

        batchAllocations.push({
          batchId: batch.id,
          unitsTaken: take,
          unitCostHistorical: unitCost
        });

        await WarungDB.put("batches", batch);
      }

      // Fallback jika ada stok tanpa record batch
      if (remainingNeed > 0) {
        const fallbackUnitCost = (Number(prod.buyPricePack) || 0) / packSize;
        itemCogs += remainingNeed * fallbackUnitCost;
      }

      itemCogs = Math.round(itemCogs);
      totalCogs += itemCogs;

      // Update total stok produk
      prod.totalSmallestUnits = Math.max(0, (Number(prod.totalSmallestUnits) || 0) - unitsToDeduct);
      prod.updatedAt = new Date().toISOString();
      await WarungDB.put("products", prod);

      // Catat ke riwayat pergerakan stok
      await WarungDB.put("stock_logs", {
        id: Utils.generateId("LOG"),
        productId: prod.id,
        productName: prod.name,
        date: todayStr,
        time: timeStr,
        type: "PENJUALAN",
        changeSmallestUnits: -unitsToDeduct,
        balanceSmallestUnits: prod.totalSmallestUnits,
        packSize: packSize,
        note: "Kasir " + invoiceNo + " (" + item.qty + " " + (item.saleMode === "ECERAN" ? "ecer" : "bks") + ")"
      });

      const effectiveRevenue = Math.round(item.lineNet * globalRatio);
      const itemProfit = effectiveRevenue - itemCogs;

      finalizedItems.push({
        productId: prod.id,
        name: prod.name,
        saleMode: item.saleMode,
        packSize: packSize,
        qty: item.qty,
        smallestUnitsDeducted: unitsToDeduct,
        unitPrice: item.unitPrice,
        discountStr: item.discountStr || "",
        lineGross: item.lineGross,
        lineNet: item.lineNet,
        effectiveRevenue: effectiveRevenue,
        cogs: itemCogs,
        profit: itemProfit,
        batchAllocations: batchAllocations
      });
    }

    const totalProfit = totals.grandTotal - totalCogs;
    const isTunai = paymentMethod === "TUNAI";
    const paidNow = isTunai ? totals.grandTotal : 0;
    const changeAmount = isTunai ? Math.max(0, Number(cashPaid) - totals.grandTotal) : 0;

    // Untuk hutang, omzet & profit terealisasi = 0 di awal, lalu bertumbuh proporsional saat dicicil
    const transactionRecord = {
      id: trxId,
      invoiceNo: invoiceNo,
      date: todayStr,
      time: timeStr,
      timestamp: new Date().toISOString(),
      paymentMethod: paymentMethod,
      status: isTunai ? "LUNAS" : "BELUM_LUNAS",
      customerName: isTunai ? (customerName || "Pelanggan Umum") : String(customerName).trim(),
      customerPhone: String(customerPhone || "").trim(),
      items: finalizedItems,
      grossSubtotal: totals.grossSubtotal,
      itemDiscountTotal: totals.itemDiscountTotal,
      globalDiscountStr: globalDiscountStr || "",
      globalDiscountAmount: totals.globalDiscountAmount,
      totalAmount: totals.grandTotal,
      totalCogs: totalCogs,
      totalProfit: totalProfit,
      paidAmount: paidNow,
      remainingDebt: isTunai ? 0 : totals.grandTotal,
      realizedRevenue: isTunai ? totals.grandTotal : 0,
      realizedProfit: isTunai ? totalProfit : 0,
      cashReceived: isTunai ? Number(cashPaid) : 0,
      changeAmount: changeAmount,
      note: String(note || "").trim()
    };

    await WarungDB.put("transactions", transactionRecord);

    // Jika Hutang, buat catatan piutang di store debts
    if (!isTunai) {
      await WarungDB.put("debts", {
        id: Utils.generateId("DBT"),
        transactionId: trxId,
        invoiceNo: invoiceNo,
        customerName: String(customerName).trim(),
        customerPhone: String(customerPhone || "").trim(),
        date: todayStr,
        dueDate: dueDate || "",
        totalDebt: totals.grandTotal,
        paidAmount: 0,
        remainingAmount: totals.grandTotal,
        totalCogs: totalCogs,
        totalProfit: totalProfit,
        realizedRevenue: 0,
        realizedProfit: 0,
        status: "BELUM_LUNAS",
        note: String(note || "").trim(),
        createdAt: new Date().toISOString()
      });
    }

    return transactionRecord;
  }
};
