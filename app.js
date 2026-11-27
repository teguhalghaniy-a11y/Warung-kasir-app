const App = {
  currentView: "dashboard",

  async init() {
    const dateEl = document.getElementById("header-date");
    if (dateEl && typeof Utils !== "undefined") {
      dateEl.textContent = Utils.formatDateIndonesian(new Date());
    }

    this.updateNetworkStatus();
    window.addEventListener("online", () => this.updateNetworkStatus());
    window.addEventListener("offline", () => this.updateNetworkStatus());

    this.bindNavigation();
    this.bindStokSubTabs();
    this.bindSettingsForm();
    this.bindBackupActions();

    try {
      await WarungDB.init();
      await this.applyStoreSettings();
      this.updateDbStatusDisplay(true);
      await DashboardModule.render();
    } catch (err) {
      console.error("Init Error:", err);
      this.updateDbStatusDisplay(false, err.message);
    }

    window.addEventListener("resize", () => {
      if (this.currentView === "dashboard" && typeof DashboardModule !== "undefined") {
        DashboardModule.render();
      }
    });
  },

  updateNetworkStatus() {
    const badge = document.getElementById("network-badge");
    if (!badge) return;
    if (navigator.onLine) {
      badge.textContent = "Offline Ready";
      badge.classList.remove("offline");
    } else {
      badge.textContent = "Mode Offline";
      badge.classList.add("offline");
    }
  },

  bindNavigation() {
    document.addEventListener("click", (e) => {
      const navTrigger = e.target.closest("[data-nav]");
      if (!navTrigger) return;
      this.navigateTo(navTrigger.getAttribute("data-nav"));
    });
  },

  bindStokSubTabs() {
    document.addEventListener("click", async (e) => {
      const subTabBtn = e.target.closest("[data-stok-tab]");
      if (!subTabBtn) return;

      const tabName = subTabBtn.getAttribute("data-stok-tab");
      if (typeof StokModule === "undefined") {
        this.showMissingModuleWarning("stok-dynamic-container", "stok-ui.js");
        return;
      }

      try {
        StokModule.currentSubTab = tabName;
        await StokModule.render();
      } catch (err) {
        alert("Error di stok-ui.js: " + err.message);
      }
    });
  },

  showMissingModuleWarning(containerId, fileName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentFolder = decodeURIComponent(window.location.href).replace(/\/[^/]*$/, "/");
    const errs = (window.__JS_ERRORS__ || []).join("<br/>") || ("Modul pada " + fileName + " belum terbaca.");

    container.innerHTML =
      '<div class="card empty-module-card" style="border-color:#ef4444; text-align:left;">' +
      '<h3 style="color:#f87171;">Modul Belum Terbaca (' + fileName + ')</h3>' +
      '<p style="font-size:12px; color:#cbd5e1; margin-bottom:8px;"><strong>Detail:</strong><br/>' + errs + '</p>' +
      '<p style="font-size:11px; color:#94a3b8; word-break:break-all;"><strong>Folder aktif:</strong><br/>' + currentFolder + '</p>' +
      '</div>';
  },

  async navigateTo(viewName) {
    const targetSection = document.getElementById("view-" + viewName);
    if (!targetSection) return;

    if (this.currentView === "kasir" && viewName !== "kasir" && typeof KasirModule !== "undefined") {
      KasirModule.stopScanner();
    }

    this.currentView = viewName;

    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.remove("active");
    });
    targetSection.classList.add("active");

    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-nav") === viewName);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (viewName === "dashboard") {
      await DashboardModule.render();
    } else if (viewName === "kasir") {
      if (typeof KasirModule === "undefined") {
        targetSection.innerHTML = '<div id="kasir-missing-box"></div>';
        this.showMissingModuleWarning("kasir-missing-box", "kasir-ui.js");
      } else {
        await KasirModule.render();
      }
    } else if (viewName === "stok") {
      if (typeof StokModule === "undefined") {
        this.showMissingModuleWarning("stok-dynamic-container", "stok-ui.js");
      } else {
        await StokModule.render();
      }
    } else if (viewName === "hutang") {
      if (typeof HutangModule === "undefined") {
        targetSection.innerHTML = '<div id="hutang-missing-box"></div>';
        this.showMissingModuleWarning("hutang-missing-box", "hutang-ui.js");
      } else {
        await HutangModule.render();
      }
    } else if (viewName === "riwayat") {
      if (typeof RiwayatModule === "undefined") {
        targetSection.innerHTML = '<div id="riwayat-missing-box"></div>';
        this.showMissingModuleWarning("riwayat-missing-box", "riwayat-ui.js");
      } else {
        await RiwayatModule.render();
      }
    } else if (viewName === "laporan") {
      if (typeof LaporanModule === "undefined") {
        targetSection.innerHTML = '<div id="laporan-missing-box"></div>';
        this.showMissingModuleWarning("laporan-missing-box", "laporan-ui.js");
      } else {
        await LaporanModule.render();
      }
    } else if (viewName === "pengaturan") {
      await this.loadSettingsToForm();
    }
  },

  async applyStoreSettings() {
  const config = await WarungDB.get("settings", "store_config");
  if (!config) return;
  const titleEl = document.getElementById("header-store-name");
  if (titleEl) titleEl.textContent = config.storeName || "WARUNG MADURA";
  const showAds=true;
  const adSlot = document.getElementById("ad-banner-slot");
  if (adSlot) adSlot.classList.toggle("hidden", !showAds);
  if (typeof AdMobBridge !== "undefined") {
    await AdMobBridge.syncWithSettings(showAds);
  }
},

  async loadSettingsToForm() {
    const config = await WarungDB.get("settings", "store_config");
    if (!config) return;
    document.getElementById("set-store-name").value = config.storeName || "";
    document.getElementById("set-store-address").value = config.storeAddress || "";
    document.getElementById("set-low-stock").value = config.lowStockThreshold || 5;
    document.getElementById("set-exp-days").value = config.expiryWarningDays || 30;
document.getElementById("set-enable-photos").checked = config.enablePhotos !== false;
  },

  bindSettingsForm() {
    const form = document.getElementById("form-settings");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const updatedConfig = {
        key: "store_config",
        storeName: document.getElementById("set-store-name").value.trim() || "WARUNG MADURA",
        storeAddress: document.getElementById("set-store-address").value.trim(),
        lowStockThreshold: Math.max(1, parseInt(document.getElementById("set-low-stock").value, 10) || 5),
        expiryWarningDays: Math.max(1, parseInt(document.getElementById("set-exp-days").value, 10) || 30),
        showAds:true,
        enablePhotos: document.getElementById("set-enable-photos").checked
      };
      await WarungDB.put("settings", updatedConfig);
      await this.applyStoreSettings();
      Utils.showToast("Pengaturan warung berhasil disimpan!");
    });
  },

  bindBackupActions() {
    const exportBtn = document.getElementById("btn-export-backup");
    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        if (typeof LaporanData === "undefined") {
          Utils.showToast("Modul laporan-data.js belum terbaca.", "danger");
          return;
        }
        try {
          await LaporanData.exportDatabaseJson();
          Utils.showToast("File backup JSON berhasil dibuat!");
        } catch (err) {
          Utils.showToast("Gagal membuat backup: " + err.message, "danger");
        }
      });
    }

    const importInput = document.getElementById("input-import-backup");
    if (importInput) {
      importInput.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!confirm("Pulihkan data dari file backup ini? Data yang cocok ID-nya akan diperbarui.")) {
          importInput.value = "";
          return;
        }
        try {
          const count = await LaporanData.importDatabaseJson(file);
          await this.applyStoreSettings();
          await DashboardModule.render();
          Utils.showToast("Restore berhasil (" + count + " record dipulihkan)!");
        } catch (err) {
          Utils.showToast("Gagal restore: " + err.message, "danger");
        } finally {
          importInput.value = "";
        }
      });
    }
  },

  updateDbStatusDisplay(isConnected, errorMsg = "") {
    const box = document.getElementById("db-status-info");
    if (!box) return;
    if (isConnected) {
      const stores = Array.from(WarungDB.db.objectStoreNames).join(", ");
      box.textContent = "STATUS: TERHUBUNG (" + WarungDB.DB_NAME + " v" + WarungDB.DB_VERSION + ")\nTabel Aktif: " + stores;
    } else {
      box.style.color = "#ef4444";
      box.textContent = "STATUS: GAGAL (" + errorMsg + ")";
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
