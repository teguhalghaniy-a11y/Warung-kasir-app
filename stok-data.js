const StokData = {
  async getEnrichedProducts() {
    const [settings, products, batches, transactions] = await Promise.all([
      WarungDB.get("settings", "store_config"),
      WarungDB.getAll("products"),
      WarungDB.getAll("batches"),
      WarungDB.getAll("transactions")
    ]);

    const lowStockLimit = settings && settings.lowStockThreshold ? Number(settings.lowStockThreshold) : 5;
    const expWarningDays = settings && settings.expiryWarningDays ? Number(settings.expiryWarningDays) : 30;
    const todayStr = Utils.getTodayISO();
    const nowTime = new Date(todayStr).getTime();
    const warningMs = expWarningDays * 24 * 60 * 60 * 1000;

    const salesMap = {};
    transactions.forEach((trx) => {
      if (Array.isArray(trx.items)) {
        trx.items.forEach((item) => {
          if (!salesMap[item.productId]) {
            salesMap[item.productId] = { soldPacks: 0, soldRetail: 0, totalSmallestSold: 0 };
          }
          if (item.saleMode === "ECERAN") {
            salesMap[item.productId].soldRetail += Number(item.qty || 0);
          } else {
            salesMap[item.productId].soldPacks += Number(item.qty || 0);
          }
          salesMap[item.productId].totalSmallestSold += Number(item.smallestUnitsDeducted || 0);
        });
      }
    });

    const list = products.map((prod) => {
      const prodBatches = batches
        .filter((b) => b.productId === prod.id && Number(b.remainingSmallestUnits) > 0)
        .sort((a, b) => {
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return a.expiryDate.localeCompare(b.expiryDate);
        });

      const packSize = Math.max(1, Number(prod.packSize) || 1);
      const totalUnits = Number(prod.totalSmallestUnits) || 0;
      const availablePacks = totalUnits / packSize;
      const isLowStock = availablePacks <= lowStockLimit;

      let hasExpired = false;
      let hasNearExp = false;

      const evaluatedBatches = prodBatches.map((b) => {
        let expStatus = "safe";
        let daysLeft = null;
        if (b.expiryDate) {
          const expTime = new Date(b.expiryDate).getTime();
          const diffMs = expTime - nowTime;
          daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
          if (diffMs < 0) {
            expStatus = "expired";
            hasExpired = true;
          } else if (diffMs <= warningMs) {
            expStatus = "near_exp";
            hasNearExp = true;
          }
        }
        return Object.assign({}, b, { expStatus: expStatus, daysLeft: daysLeft });
      });

      const soldStats = salesMap[prod.id] || { soldPacks: 0, soldRetail: 0, totalSmallestSold: 0 };

      return Object.assign({}, prod, {
        packSize: packSize,
        totalUnits: totalUnits,
        availablePacks: availablePacks,
        isLowStock: isLowStock,
        hasExpired: hasExpired,
        hasNearExp: hasNearExp,
        batches: evaluatedBatches,
        soldStats: soldStats
      });
    });

    return { settings: settings, products: list };
  },

  async saveNewProduct(data) {
    const productId = Utils.generateId("PRD");
    const totalInitialUnits = data.initPacks * data.packSize + data.initRetail;

    const newProduct = {
      id: productId,
      name: data.name,
      category: data.category,
      barcode: data.barcode,
      photo: data.photo,
      packSize: data.packSize,
      buyPricePack: data.buyPricePack,
      sellPricePack: data.sellPricePack,
      buyPriceRetail: data.buyPriceRetail,
      sellPriceRetail: data.sellPriceRetail,
      totalSmallestUnits: totalInitialUnits,
      notes: data.notes,
      createdAt: new Date().toISOString()
    };

    await WarungDB.put("products", newProduct);

    if (totalInitialUnits > 0 || data.expiryDate) {
      await WarungDB.put("batches", {
        id: Utils.generateId("BCH"),
        productId: productId,
        inputDate: data.inputDate,
        expiryDate: data.expiryDate || "",
        initialSmallestUnits: totalInitialUnits,
        remainingSmallestUnits: totalInitialUnits,
        buyPricePack: data.buyPricePack,
        buyPriceRetail: data.buyPriceRetail,
        notes: data.notes
      });

      if (totalInitialUnits > 0) {
        await WarungDB.put("stock_logs", {
          id: Utils.generateId("LOG"),
          productId: productId,
          productName: data.name,
          date: data.inputDate,
          time: Utils.getCurrentTimeStr(),
          type: "STOK_AWAL",
          changeSmallestUnits: totalInitialUnits,
          balanceSmallestUnits: totalInitialUnits,
          packSize: data.packSize,
          note: "Stok awal (" + data.initPacks + " bks + " + data.initRetail + " ecer)"
        });
      }
    }
    return newProduct;
  },

  async adjustStock(prod, deltaUnits, logType, dateStr, expiryDate, note) {
    const allBatches = await WarungDB.getAll("batches");
    const prodBatches = allBatches
      .filter((b) => b.productId === prod.id && Number(b.remainingSmallestUnits) > 0)
      .sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      });

    if (deltaUnits > 0) {
      await WarungDB.put("batches", {
        id: Utils.generateId("BCH"),
        productId: prod.id,
        inputDate: dateStr,
        expiryDate: expiryDate || "",
        initialSmallestUnits: deltaUnits,
        remainingSmallestUnits: deltaUnits,
        buyPricePack: prod.buyPricePack,
        buyPriceRetail: prod.buyPriceRetail,
        notes: note
      });
    } else if (deltaUnits < 0) {
      let toDeduct = Math.abs(deltaUnits);
      for (let i = 0; i < prodBatches.length; i++) {
        if (toDeduct <= 0) break;
        const batch = prodBatches[i];
        const available = Number(batch.remainingSmallestUnits) || 0;
        const take = Math.min(available, toDeduct);
        batch.remainingSmallestUnits = available - take;
        toDeduct -= take;
        await WarungDB.put("batches", batch);
      }
    }

    const newTotal = Math.max(0, (Number(prod.totalSmallestUnits) || 0) + deltaUnits);
    prod.totalSmallestUnits = newTotal;
    prod.updatedAt = new Date().toISOString();
    await WarungDB.put("products", prod);

    await WarungDB.put("stock_logs", {
      id: Utils.generateId("LOG"),
      productId: prod.id,
      productName: prod.name,
      date: dateStr,
      time: Utils.getCurrentTimeStr(),
      type: logType,
      changeSmallestUnits: deltaUnits,
      balanceSmallestUnits: newTotal,
      packSize: prod.packSize,
      note: note
    });
  }
};
