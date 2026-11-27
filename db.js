const WarungDB = {
  DB_NAME: "WarungMaduraPOS_DB",
  DB_VERSION: 1,
  db: null,

  /**
   * Inisialisasi koneksi IndexedDB & pembuatan skema tabel
   */
  init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("WebView/Browser tidak mendukung IndexedDB."));
        return;
      }

      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains("products")) {
          const prodStore = db.createObjectStore("products", { keyPath: "id" });
          prodStore.createIndex("barcode", "barcode", { unique: false });
          prodStore.createIndex("name", "name", { unique: false });
        }

        if (!db.objectStoreNames.contains("batches")) {
          const batchStore = db.createObjectStore("batches", { keyPath: "id" });
          batchStore.createIndex("productId", "productId", { unique: false });
          batchStore.createIndex("expiryDate", "expiryDate", { unique: false });
        }

        if (!db.objectStoreNames.contains("stock_logs")) {
          const logStore = db.createObjectStore("stock_logs", { keyPath: "id" });
          logStore.createIndex("productId", "productId", { unique: false });
          logStore.createIndex("date", "date", { unique: false });
        }

        if (!db.objectStoreNames.contains("transactions")) {
          const trxStore = db.createObjectStore("transactions", { keyPath: "id" });
          trxStore.createIndex("date", "date", { unique: false });
          trxStore.createIndex("type", "type", { unique: false });
        }

        if (!db.objectStoreNames.contains("debts")) {
          const debtStore = db.createObjectStore("debts", { keyPath: "id" });
          debtStore.createIndex("status", "status", { unique: false });
        }

        if (!db.objectStoreNames.contains("debt_payments")) {
          const payStore = db.createObjectStore("debt_payments", { keyPath: "id" });
          payStore.createIndex("debtId", "debtId", { unique: false });
          payStore.createIndex("date", "date", { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this.ensureDefaultSettings();
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  },

  async ensureDefaultSettings() {
    const existing = await this.get("settings", "store_config");
    if (!existing) {
      await this.put("settings", {
        key: "store_config",
        storeName: "WARUNG MADURA",
        storeAddress: "Buka 24 Jam - Melayani Tunai & Eceran",
        lowStockThreshold: 5,
        expiryWarningDays: 30,
        showAds: true,
        enablePhotos: true
      });
    }
  },

  get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
};
