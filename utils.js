const Utils = {
  /**
   * Format angka menjadi mata uang Rupiah (Rp)
   */
  formatRupiah(amount) {
    const number = Number(amount) || 0;
    const isNegative = number < 0;
    const absValue = Math.round(Math.abs(number));
    const formatted = absValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${isNegative ? "-" : ""}Rp${formatted}`;
  },

  /**
   * Mendapatkan string tanggal hari ini format YYYY-MM-DD (waktu lokal)
   */
  getTodayISO(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  /**
   * Mendapatkan jam saat ini format HH:MM:SS
   */
  getCurrentTimeStr(dateObj = new Date()) {
    const h = String(dateObj.getHours()).padStart(2, "0");
    const m = String(dateObj.getMinutes()).padStart(2, "0");
    const s = String(dateObj.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  },

  /**
   * Format tanggal lengkap Bahasa Indonesia untuk header
   */
  formatDateIndonesian(dateObj = new Date()) {
    const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${hari[dateObj.getDay()]}, ${dateObj.getDate()} ${bulan[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  },

  /**
   * Generator ID unik lokal tanpa internet
   */
  generateId(prefix = "ID") {
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}-${Date.now()}-${rand}`;
  },

  /**
   * Kompres foto dari kamera/galeri HP agar ringan disimpan di IndexedDB
   */
  compressImageFile(file, maxSize = 360, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => reject(new Error("Gagal memuat gambar."));
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error("Gagal membaca file foto."));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Menampilkan pesan notifikasi singkat (Toast)
   */
  showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    if (type === "warning") toast.style.borderLeftColor = "#f59e0b";
    if (type === "danger") toast.style.borderLeftColor = "#ef4444";
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 200);
    }, 2600);
  }
};
