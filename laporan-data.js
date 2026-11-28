const LaporanData = {
  getCutoffDateISO(period) {
    const now = new Date();
    if (period === "TODAY") {
      return Utils.getTodayISO();
    }
    if (period === "7D") {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    if (period === "30D") {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    return ""; // ALL
  },

  async buildReport(period) {
    const [products, transactions, debts, debtPayments] = await Promise.all([
      WarungDB.getAll("products"),
      WarungDB.getAll("transactions"),
      WarungDB.getAll("debts"),
      WarungDB.getAll("debt_payments")
    ]);

    const cutoffISO = this.getCutoffDateISO(period);
    const filteredTrx = transactions.filter((t) => !cutoffISO || (t.date && t.date >= cutoffISO));
    const filteredPayments = debtPayments.filter((p) => !cutoffISO || (p.date && p.date >= cutoffISO));

    let totalOmzetRealized = 0;
    let totalProfitRealized = 0;
    let totalOmzetBruto = 0;
    let totalCogs = 0;

    // Rincian metode pembayaran (Uang masuk nyata)
    let cashDrawerRevenue = 0; // Uang tunai langsung di kasir
    let cashDrawerCount = 0;
    let nonCashRevenue = 0;    // Uang non-tunai (QRIS / Transfer / EDC)
    let nonCashCount = 0;
    const nonCashBreakdown = {}; // Rincian per kanal: { QRIS: 50000, ... }

    // Cicilan piutang masuk pada periode ini
    let debtInstallmentCollected = 0;
    filteredPayments.forEach((pay) => {
      debtInstallmentCollected += Number(pay.amount) || 0;
    });

    let packRevenue = 0;
    let packProfit = 0;
    let packQtyCount = 0;

    let retailRevenue = 0;
    let retailProfit = 0;
    let retailQtyCount = 0;

    const productStatsMap = {};
    products.forEach((p) => {
      const packSize = Math.max(1, Number(p.packSize) || 1);
      const unitCost = (Number(p.buyPricePack) || 0) / packSize;
      productStatsMap[p.id] = {
        id: p.id,
        name: p.name,
        category: p.category || "Umum",
        packSize: packSize,
        stockUnits: Number(p.totalSmallestUnits) || 0,
        stockCapitalValue: Math.round((Number(p.totalSmallestUnits) || 0) * unitCost),
        soldSmallestUnits: 0,
        soldPacks: 0,
        soldRetail: 0,
        grossRevenue: 0,
        realizedRevenue: 0,
        realizedProfit: 0
      };
    });

    filteredTrx.forEach((trx) => {
      const trxTotal = Number(trx.totalAmount) || 0;
      const trxRealizedRev = Number(trx.realizedRevenue) || 0;
      const trxRealizedProf = Number(trx.realizedProfit) || 0;
      const paidRatio = trxTotal > 0 ? trxRealizedRev / trxTotal : 1;

      totalOmzetBruto += trxTotal;
      totalOmzetRealized += trxRealizedRev;
      totalProfitRealized += trxRealizedProf;
      totalCogs += Number(trx.totalCogs) || 0;

      // Hitung pemisahan Tunai vs Non-Tunai
      if (trx.paymentMethod === "TUNAI") {
        cashDrawerRevenue += trxTotal;
        cashDrawerCount += 1;
      } else if (trx.paymentMethod === "NON_TUNAI") {
        nonCashRevenue += trxTotal;
        nonCashCount += 1;
        const ch = (trx.nonCashChannel && trx.nonCashChannel.trim()) || "QRIS / Transfer";
        nonCashBreakdown[ch] = (nonCashBreakdown[ch] || 0) + trxTotal;
      }

      if (Array.isArray(trx.items)) {
        trx.items.forEach((it) => {
          const itemRev = Math.round((Number(it.effectiveRevenue) || Number(it.lineNet) || 0) * paidRatio);
          const itemProf = Math.round((Number(it.profit) || 0) * paidRatio);
          const units = Number(it.smallestUnitsDeducted) || 0;

          if (it.saleMode === "ECERAN") {
            retailRevenue += itemRev;
            retailProfit += itemProf;
            retailQtyCount += Number(it.qty) || 0;
          } else {
            packRevenue += itemRev;
            packProfit += itemProf;
            packQtyCount += Number(it.qty) || 0;
          }

          if (!productStatsMap[it.productId]) {
            productStatsMap[it.productId] = {
              id: it.productId,
              name: it.name,
              category: "Umum",
              packSize: Number(it.packSize) || 1,
              stockUnits: 0,
              stockCapitalValue: 0,
              soldSmallestUnits: 0,
              soldPacks: 0,
              soldRetail: 0,
              grossRevenue: 0,
              realizedRevenue: 0,
              realizedProfit: 0
            };
          }

          const st = productStatsMap[it.productId];
          st.soldSmallestUnits += units;
          if (it.saleMode === "ECERAN") {
            st.soldRetail += Number(it.qty) || 0;
          } else {
            st.soldPacks += Number(it.qty) || 0;
          }
          st.grossRevenue += Number(it.lineNet) || 0;
          st.realizedRevenue += itemRev;
          st.realizedProfit += itemProf;
        });
      }
    });

    const allStats = Object.values(productStatsMap);

    const topSelling = allStats
      .filter((s) => s.soldSmallestUnits > 0)
      .sort((a, b) => b.soldSmallestUnits - a.soldSmallestUnits)
      .slice(0, 10);

    const topProfit = allStats
      .filter((s) => s.realizedProfit > 0)
      .sort((a, b) => b.realizedProfit - a.realizedProfit)
      .slice(0, 10);

    const slowMoving = allStats
      .filter((s) => s.soldSmallestUnits === 0 && s.stockUnits > 0)
      .sort((a, b) => b.stockCapitalValue - a.stockCapitalValue);

    const totalAssetStockValue = allStats.reduce((sum, s) => sum + s.stockCapitalValue, 0);
    const totalPendingReceivables = debts
      .filter((d) => d.status === "BELUM_LUNAS")
      .reduce((sum, d) => sum + (Number(d.remainingAmount) || 0), 0);

    return {
      period: period,
      trxCount: filteredTrx.length,
      totalOmzetBruto: totalOmzetBruto,
      totalOmzetRealized: totalOmzetRealized,
      totalProfitRealized: totalProfitRealized,
      totalCogs: totalCogs,
      cashDrawerRevenue: cashDrawerRevenue,
      cashDrawerCount: cashDrawerCount,
      nonCashRevenue: nonCashRevenue,
      nonCashCount: nonCashCount,
      nonCashBreakdown: nonCashBreakdown,
      debtInstallmentCollected: debtInstallmentCollected,
      totalAssetStockValue: totalAssetStockValue,
      totalPendingReceivables: totalPendingReceivables,
      packStats: { revenue: packRevenue, profit: packProfit, qty: packQtyCount },
      retailStats: { revenue: retailRevenue, profit: retailProfit, qty: retailQtyCount },
      topSelling: topSelling,
      topProfit: topProfit,
      slowMoving: slowMoving
    };
  },

  async exportDatabaseJson() {
    const storeNames = ["settings", "products", "batches", "stock_logs", "transactions", "debts", "debt_payments"];
    const dump = {
      appName: "Warung Kasir Offline POS",
      exportedAt: new Date().toISOString(),
      stores: {}
    };

    for (let i = 0; i < storeNames.length; i++) {
      const name = storeNames[i];
      dump.stores[name] = await WarungDB.getAll(name);
    }

    const jsonStr = JSON.stringify(dump, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const fileName = "backup-warung-kasir-" + Utils.getTodayISO() + ".json";

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },

  async importDatabaseJson(file) {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Gagal membaca file backup."));
      reader.readAsText(file);
    });

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("Format file JSON tidak valid.");
    }

    if (!parsed || !parsed.stores || typeof parsed.stores !== "object") {
      throw new Error("Struktur file backup tidak dikenali.");
    }

    const validStores = ["settings", "products", "batches", "stock_logs", "transactions", "debts", "debt_payments"];
    let restoredCount = 0;

    for (let i = 0; i < validStores.length; i++) {
      const storeName = validStores[i];
      const records = parsed.stores[storeName];
      if (Array.isArray(records)) {
        for (let j = 0; j < records.length; j++) {
          await WarungDB.put(storeName, records[j]);
          restoredCount++;
        }
      }
    }

    return restoredCount;
  }
};
