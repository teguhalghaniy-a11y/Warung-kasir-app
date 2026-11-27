const AdMobBridge = {
  // Ganti dengan Banner Ad Unit ID asli milik Anda setelah daftar di admob.google.com
  // Saat ini menggunakan Test ID resmi Google agar aman saat diuji coba di HP sendiri
  BANNER_AD_UNIT_ID: "ca-app-pub-3940256099942544/6300978111",
  IS_TESTING: true,
  initialized: false,

  getPlugin() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
      return window.Capacitor.Plugins.AdMob;
    }
    return null;
  },

  async syncWithSettings(showAds) {
    const admob = this.getPlugin();
    const slotEl = document.getElementById("ad-banner-slot");

    // Jika dijalankan di browser/TrebEdit biasa (bukan APK), tampilkan slot info biasa
    if (!admob) {
      if (slotEl) slotEl.classList.toggle("hidden", showAds === false);
      return;
    }

    // Jika dijalankan di dalam APK Android:
    if (slotEl) {
      slotEl.innerHTML = "";
      slotEl.style.height = "52px";
      slotEl.classList.toggle("hidden", showAds === false);
    }

    try {
      if (!this.initialized) {
        await admob.initialize({
          requestTrackingAuthorization: false,
          initializeForTesting: this.IS_TESTING
        });
        this.initialized = true;
      }

      if (showAds === false) {
        await admob.hideBanner();
      } else {
        await admob.showBanner({
          adId: this.BANNER_AD_UNIT_ID,
          adSize: "BANNER",
          position: "BOTTOM_CENTER",
          margin: 66,
          isTesting: this.IS_TESTING
        });
      }
    } catch (err) {
      console.warn("AdMob info:", err.message);
    }
  }
};
