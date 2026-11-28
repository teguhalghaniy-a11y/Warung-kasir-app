const KasirModule = {
  activeSubTab: "katalog", // "katalog" atau "keranjang"
  searchQuery: "",
  cart: [],
  globalDiscountStr: "",
  manualGlobalDiscOverride: false,
  showPromoSettings: false,
  promoConfig: null,
  paymentMethod: "TUNAI",
  nonCashChannel: "QRIS",
  cashPaidInput: "",
  customerName: "",
  customerPhone: "",
  dueDate: "",
  note: "",
  scannerStream: null,
  scannerTimer: null,
  lastReceipt: null,
  cachedProducts: [],
  cachedShowPhotos: true,

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  async loadPromoConfig() {
    const saved = await WarungDB.get("settings", "promo_config");
    const def = KasirData.getDefaultPromoConfig();
    this.promoConfig = Object.assign({}, def, saved || {});
    return this.promoConfig;
  },

  async savePromoConfig() {
    if (!this.promoConfig) return;
    await WarungDB.put("settings", Object.assign({ key: "promo_config" }, this.promoConfig));
  },

  syncAutoPromosToCart() {
    const cfg = this.promoConfig || KasirData.getDefaultPromoConfig();

    // 1. Auto-terapkan diskon grosir per item jika mode BUNGKUS mencapai qty minimal
    this.cart.forEach((item) => {
      if (item.manualDiscOverride) return;
      const minGrosir = Math.max(2, Number(item.wholesaleMinQty) || Number(cfg.wholesaleMinQty) || 3);
      const discGrosir = String(item.wholesaleDiscountStr || cfg.wholesaleDiscountStr || "").trim();
      const isGrosirActive = Boolean(item.wholesaleDiscountStr) || Boolean(cfg.wholesaleEnabled);

      if (isGrosirActive && item.saleMode === "BUNGKUS" && item.qty >= minGrosir && discGrosir) {
        item.discountStr = discGrosir;
        item.isWholesaleApplied = true;
      } else if (item.isWholesaleApplied) {
        item.discountStr = "";
        item.isWholesaleApplied = false;
      }
    });

    // 2. Auto-terapkan diskon berulang akhir pekan pada diskon nota
    if (!this.manualGlobalDiscOverride) {
      const prelim = KasirData.calculateCartTotals(this.cart, "");
      const minSpend = Math.max(0, Number(cfg.weekendMinSpend) || 0);
      if (KasirData.isWeekendPromoActive(cfg) && prelim.netItemsSubtotal >= minSpend && prelim.netItemsSubtotal > 0) {
        this.globalDiscountStr = String(cfg.weekendDiscountStr || "").trim();
      } else {
        this.globalDiscountStr = "";
      }
    }
  },

  buildPromoPanelHtml() {
    const cfg = this.promoConfig || KasirData.getDefaultPromoConfig();
    const isWeekendNow = KasirData.isWeekendPromoActive(cfg);
    const dayLabels = [
      { d: 5, label: "Jum" },
      { d: 6, label: "Sab" },
      { d: 0, label: "Min" },
      { d: 1, label: "Sen" },
      { d: 2, label: "Sel" },
      { d: 3, label: "Rab" },
      { d: 4, label: "Kam" }
    ];

    let statusTags = [];
    if (cfg.weekendEnabled) {
      statusTags.push(
        (isWeekendNow ? "🟢 Promo Weekend AKTIF (" : "🟡 Promo Weekend Terjadwal (") +
        this.esc(cfg.weekendDiscountStr) + "%)"
      );
    }
    if (cfg.wholesaleEnabled) {
      statusTags.push("📦 Grosir ≥" + cfg.wholesaleMinQty + " bks (-" + this.esc(cfg.wholesaleDiscountStr) + "%)");
    }

    let html =
      '<div class="card" style="padding:10px 12px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
      '<div><strong style="font-size:13.5px; color:#0f172a;">🏷️ Aturan Diskon Otomatis</strong>' +
      '<div style="font-size:11.5px; color:#475569; margin-top:2px;">' +
      (statusTags.length > 0 ? statusTags.join(" • ") : "Nonaktif (Atur promo weekend & grosir)") +
      '</div></div>' +
      '<button type="button" id="btn-toggle-promo-panel" class="btn btn-secondary btn-sm">' +
      (this.showPromoSettings ? "Tutup" : "⚙️ Atur") +
      '</button></div>';

    if (this.showPromoSettings) {
      const selectedDays = Array.isArray(cfg.weekendDays) ? cfg.weekendDays : [];
      html +=
        '<div style="margin-top:10px; padding-top:10px; border-top:1px dashed #cbd5e1; display:flex; flex-direction:column; gap:12px;">' +
        // BAGIAN 1: DISKON BERULANG WEEKEND
        '<div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:10px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<strong style="font-size:13px; color:#0f172a;">1. Diskon Berulang Akhir Pekan</strong>' +
        '<button type="button" id="btn-toggle-weekend-on" class="chip-btn ' + (cfg.weekendEnabled ? "active" : "") + '">' +
        (cfg.weekendEnabled ? "● ON (Aktif)" : "○ OFF (Mati)") +
        '</button></div>' +
        '<div style="font-size:11.5px; color:#475569; margin-bottom:6px;">Pilih hari aktif setiap minggu (misal 2 atau 3 hari):</div>' +
        '<div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px;">' +
        dayLabels.map((item) => {
          const active = selectedDays.includes(item.d);
          return '<button type="button" class="chip-btn ' + (active ? "active" : "") + '" data-promo-day="' + item.d + '">' + item.label + '</button>';
        }).join("") +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label>Diskon Weekend (%)</label>' +
        '<input type="text" id="promo-wk-disc" class="form-control" placeholder="5 atau 5+2" value="' + this.esc(cfg.weekendDiscountStr) + '" /></div>' +
        '<div class="form-group"><label>Min. Belanja (Rp)</label>' +
        '<input type="number" id="promo-wk-min" class="form-control" min="0" placeholder="0 = semua" value="' + (Number(cfg.weekendMinSpend) || 0) + '" /></div>' +
        '</div></div>' +

        // BAGIAN 2: DISKON BELANJA GROSIR
        '<div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:10px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<strong style="font-size:13px; color:#0f172a;">2. Diskon Belanja Grosir (Bungkus)</strong>' +
        '<button type="button" id="btn-toggle-grosir-on" class="chip-btn ' + (cfg.wholesaleEnabled ? "active" : "") + '">' +
        (cfg.wholesaleEnabled ? "● ON (Aktif)" : "○ OFF (Mati)") +
        '</button></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label>Min. Beli (Bungkus)</label>' +
        '<input type="number" id="promo-gr-qty" class="form-control" min="2" value="' + (Number(cfg.wholesaleMinQty) || 3) + '" /></div>' +
        '<div class="form-group"><label>Diskon Grosir (%)</label>' +
        '<input type="text" id="promo-gr-disc" class="form-control" placeholder="5 atau 5+2" value="' + this.esc(cfg.wholesaleDiscountStr) + '" /></div>' +
        '</div></div>' +

        '<button type="button" id="btn-save-promo-cfg" class="btn btn-primary btn-sm">✓ Simpan Aturan Diskon</button>' +
        '</div>';
    }

    html += '</div>';
    return html;
  },

  buildCatalogResultsHtml() {
    const products = this.cachedProducts || [];
    const showPhotos = this.cachedShowPhotos;
    const totals = KasirData.calculateCartTotals(this.cart, this.globalDiscountStr);
    const q = this.searchQuery.toLowerCase().trim();

    const filteredProducts = products.filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });

    if (products.length === 0) {
      return (
        '<div class="card empty-module-card">' +
        '<h3>Belum Ada Data Barang</h3>' +
        '<p>Tambahkan barang terlebih dahulu di menu Stok.</p>' +
        '<button type="button" class="btn btn-primary" data-nav="stok">+ Ke Menu Stok</button>' +
        '</div>'
      );
    }

    if (filteredProducts.length === 0) {
      return (
        '<div class="card"><p style="color:#64748b; text-align:center; padding:14px 0;">Barang "' +
        this.esc(this.searchQuery) +
        '" tidak ditemukan.</p></div>'
      );
    }

    let html = '<div class="kasir-grid-2col" style="' + (totals.items.length > 0 ? "padding-bottom:76px;" : "") + '">';
    filteredProducts.forEach((p) => {
      const packSize = Math.max(1, Number(p.packSize) || 1);
      const totalUnits = Number(p.totalSmallestUnits) || 0;
      const availPacks = Math.floor(totalUnits / packSize);
      const looseUnits = totalUnits % packSize;
      const isOut = totalUnits <= 0;
      const canSellPack = totalUnits >= packSize;

      const photoHtml =
        showPhotos && p.photo
          ? '<img src="' + p.photo + '" alt="" class="kasir-tile-photo" />'
          : '';

      const stockLabel =
        packSize > 1
          ? "Stok: " + availPacks + " bks" + (looseUnits > 0 ? " (Sisa bks ini: " + looseUnits + ")" : "")
          : "Stok: " + totalUnits + " unit";

      html +=
        '<div class="kasir-prod-tile ' + (isOut ? "out-of-stock" : "") + '">' +
        '<div>' +
        photoHtml +
        '<div class="kasir-tile-title" style="' + (photoHtml ? "margin-top:8px;" : "") + '">' + this.esc(p.name) + '</div>' +
        '<div class="kasir-tile-price">' + Utils.formatRupiah(p.sellPricePack) + '</div>' +
        '<div class="kasir-tile-meta">' + stockLabel +
        (packSize > 1 ? '<br/>Eceran: ' + Utils.formatRupiah(p.sellPriceRetail) + '/unit' : '') +
        '</div></div>' +
        '<div class="kasir-tile-actions">' +
        '<button type="button" class="btn btn-primary" data-add-prod="' + p.id + '" data-add-mode="BUNGKUS" ' + (!canSellPack ? "disabled" : "") + '>+1 Bungkus/Item</button>' +
        (packSize > 1
          ? '<button type="button" class="btn btn-orange" data-add-prod="' + p.id + '" data-add-mode="ECERAN" ' + (isOut ? "disabled" : "") + '>+1 Eceran (' + Utils.formatRupiah(p.sellPriceRetail) + ')</button>'
          : '') +
        '<button type="button" class="btn btn-secondary" style="color:#dc2626; border-color:#fecaca; background:#fff5f5;" data-add-hutang="' + p.id + '" ' + (isOut ? "disabled" : "") + '>Hutang</button>' +
        '</div></div>';
    });
    html += '</div>';
    return html;
  },

  refreshCatalogResultsOnly() {
    const resultsContainer = document.getElementById("kasir-catalog-results");
    if (!resultsContainer) return;
    resultsContainer.innerHTML = this.buildCatalogResultsHtml();
    this.bindCatalogItemEvents(this.cachedProducts);

    const clearBtnWrap = document.getElementById("kasir-clear-search-wrap");
    if (clearBtnWrap) {
      clearBtnWrap.innerHTML = this.searchQuery
        ? '<button type="button" id="btn-clear-search" class="btn btn-secondary" style="padding:0 14px; min-height:44px;">✕</button>'
        : '';
      const clearSearchBtn = document.getElementById("btn-clear-search");
      if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
          this.searchQuery = "";
          const searchInp = document.getElementById("kasir-search-input");
          if (searchInp) {
            searchInp.value = "";
            searchInp.focus();
          }
          this.refreshCatalogResultsOnly();
        });
      }
    }
  },

  async render() {
    const viewKasir = document.getElementById("view-kasir");
    if (!viewKasir) return;

    const [products, settings] = await Promise.all([
      WarungDB.getAll("products"),
      WarungDB.get("settings", "store_config"),
      this.loadPromoConfig()
    ]);
    products.sort((a, b) => a.name.localeCompare(b.name));
    this.cachedProducts = products;
    this.cachedShowPhotos = !settings || settings.enablePhotos !== false;

    this.syncAutoPromosToCart();

    const totals = KasirData.calculateCartTotals(this.cart, this.globalDiscountStr);
    const totalQtyCount = this.cart.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const cashVal = parseFloat(this.cashPaidInput) || 0;
    const changeVal = Math.max(0, cashVal - totals.grandTotal);

    let html = "";

    if (this.lastReceipt) {
      html += this.buildReceiptCardHtml(this.lastReceipt);
    }

    // NAVIGASI SUB-TAB ATAS KASIR
    html +=
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:#ffffff; padding:6px; border-radius:14px; border:1px solid #cbd5e1; box-shadow:0 1px 4px rgba(15,23,42,0.05);">' +
      '<button type="button" data-kasir-tab="katalog" class="btn ' + (this.activeSubTab === "katalog" ? "btn-primary" : "btn-secondary") + '" style="min-height:46px; font-size:14px;">' +
      '🛍️ Pilih Barang (' + products.length + ')' +
      '</button>' +
      '<button type="button" data-kasir-tab="keranjang" class="btn ' + (this.activeSubTab === "keranjang" ? "btn-primary" : "btn-secondary") + '" style="min-height:46px; font-size:14px; position:relative;">' +
      '🛒 Keranjang (' + totalQtyCount + ')' +
      '</button>' +
      '</div>';

    // PANEL PENGATURAN DISKON WEEKEND & GROSIR
    html += this.buildPromoPanelHtml();

    if (this.activeSubTab === "katalog") {
      html +=
        '<div class="card">' +
        '<div class="card-header"><div><h2 class="card-title">Pilih Barang Terjual</h2>' +
        '<p class="card-subtitle">Ketuk tombol besar untuk menambah ke keranjang</p></div>' +
        '<button type="button" id="btn-toggle-scanner" class="btn btn-secondary btn-sm">📷 Scan</button></div>' +
        '<div id="barcode-scanner-box" class="hidden" style="margin-bottom:10px; background:#0f172a; border-radius:10px; padding:10px;">' +
        '<video id="barcode-video" autoplay playsinline style="width:100%; max-height:200px; border-radius:8px; object-fit:cover; background:#000;"></video>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">' +
        '<small id="scanner-status-text" style="color:#f8fafc;">Arahkan kamera ke barcode...</small>' +
        '<button type="button" id="btn-close-scanner" class="btn btn-secondary btn-sm">Tutup</button>' +
        '</div></div>' +
        '<div style="display:flex; gap:8px;">' +
        '<input type="text" id="kasir-search-input" class="form-control" placeholder="🔍 Ketik nama barang / barcode..." value="' + this.esc(this.searchQuery) + '" />' +
        '<span id="kasir-clear-search-wrap">' +
        (this.searchQuery ? '<button type="button" id="btn-clear-search" class="btn btn-secondary" style="padding:0 14px; min-height:44px;">✕</button>' : '') +
        '</span>' +
        '</div></div>';

      html += '<div id="kasir-catalog-results">' + this.buildCatalogResultsHtml() + '</div>';

      if (totals.items.length > 0) {
        html +=
          '<div style="position:fixed; bottom:106px; left:12px; right:12px; max-width:616px; margin:0 auto; z-index:45;">' +
          '<button type="button" id="btn-floating-goto-cart" class="btn btn-primary btn-block" style="justify-content:space-between; padding:12px 16px; box-shadow:0 6px 20px rgba(22,163,74,0.45); border:2px solid #ffffff;">' +
          '<span>🛒 ' + totalQtyCount + ' Barang • ' + Utils.formatRupiah(totals.grandTotal) + '</span>' +
          '<span>Bayar / Keranjang →</span>' +
          '</button></div>';
      }
    } else {
      html +=
        '<div class="card">' +
        '<div class="card-header"><div><h3 class="card-title">Keranjang Belanja (' + this.cart.length + ' jenis)</h3>' +
        '<p class="card-subtitle">Atur jumlah atau diskon bertingkat tiap barang</p></div>' +
        '<div style="display:flex; gap:6px;">' +
        '<button type="button" data-kasir-tab="katalog" class="btn btn-secondary btn-sm">+ Tambah Lagi</button>' +
        (this.cart.length > 0 ? '<button type="button" id="btn-clear-cart" class="btn btn-secondary btn-sm" style="color:#dc2626;">Hapus Semua</button>' : '') +
        '</div></div>';

      if (totals.items.length === 0) {
        html +=
          '<div class="empty-module-card">' +
          '<h3>Keranjang Masih Kosong</h3>' +
          '<p>Silakan pilih barang yang dibeli pelanggan terlebih dahulu.</p>' +
          '<button type="button" data-kasir-tab="katalog" class="btn btn-primary">🛍️ Kembali Pilih Barang</button>' +
          '</div>';
      } else {
        html += '<div style="display:flex; flex-direction:column; gap:10px;">';
        totals.items.forEach((item, idx) => {
          html +=
            '<div style="padding:12px; background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">' +
            '<div><strong style="font-size:15px; color:#0f172a;">' + this.esc(item.name) + '</strong> ' +
            '<span class="tag-badge ' + (item.saleMode === "ECERAN" ? "warning" : "safe") + '">' + item.saleMode + '</span>' +
            (item.isWholesaleApplied ? ' <span class="tag-badge safe">Grosir</span>' : '') +
            '<div style="font-size:12.5px; color:#475569; margin-top:2px;">Harga satuan: ' + Utils.formatRupiah(item.unitPrice) + '</div></div>' +
            '<button type="button" data-remove-cart="' + idx + '" class="btn btn-secondary btn-sm" style="color:#dc2626; min-height:38px; padding:4px 10px;">✕</button>' +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:10px; flex-wrap:wrap;">' +
            '<div style="display:flex; align-items:center; gap:6px;">' +
            '<button type="button" class="btn btn-secondary" style="min-width:46px; min-height:46px; padding:0; font-size:18px;" data-qty-minus="' + idx + '">-</button>' +
            '<input type="number" min="1" value="' + item.qty + '" data-qty-input="' + idx + '" class="form-control" style="width:66px; text-align:center; font-weight:800; font-size:16px;" />' +
            '<button type="button" class="btn btn-primary" style="min-width:46px; min-height:46px; padding:0; font-size:18px;" data-qty-plus="' + idx + '">+</button>' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:6px;">' +
            '<label style="font-size:12px; font-weight:700; color:#475569;">Disc %:</label>' +
            '<input type="text" placeholder="10+5" value="' + this.esc(item.discountStr || "") + '" data-item-disc="' + idx + '" class="form-control" style="width:82px; font-size:13px;" />' +
            '</div>' +
            '<div style="text-align:right; margin-left:auto;">' +
            (item.lineDiscount > 0 ? '<div style="font-size:11px; color:#64748b; text-decoration:line-through;">' + Utils.formatRupiah(item.lineGross) + '</div>' : '') +
            '<strong style="color:#16a34a; font-size:16px;">' + Utils.formatRupiah(item.lineNet) + '</strong>' +
            '</div></div></div>';
        });
        html += '</div>';
      }
      html += '</div>';

      // FORM PEMBAYARAN & CHECKOUT
      if (totals.items.length > 0) {
        const isWeekendActive = KasirData.isWeekendPromoActive(this.promoConfig);
        html +=
          '<div class="card" id="kasir-checkout-card">' +
          '<div class="card-header"><div><h3 class="card-title">Pembayaran &amp; Checkout</h3></div></div>' +
          '<div class="form-stack">' +
          '<div class="form-row">' +
          '<div class="form-group"><label>Diskon Nota (%)' +
          (isWeekendActive && !this.manualGlobalDiscOverride && this.globalDiscountStr ? ' <span style="color:#16a34a;">[Auto Weekend]</span>' : '') +
          '</label>' +
          '<input type="text" id="kasir-global-disc" class="form-control" placeholder="Contoh: 5 atau 10+2" value="' + this.esc(this.globalDiscountStr) + '" /></div>' +
          '<div class="form-group"><label>Metode Bayar *</label>' +
          '<select id="kasir-pay-method" class="form-control">' +
          '<option value="TUNAI" ' + (this.paymentMethod === "TUNAI" ? "selected" : "") + '>💵 TUNAI (Lunas)</option>' +
          '<option value="NON_TUNAI" ' + (this.paymentMethod === "NON_TUNAI" ? "selected" : "") + '>📱 NON-TUNAI (QRIS / Transfer)</option>' +
          '<option value="HUTANG" ' + (this.paymentMethod === "HUTANG" ? "selected" : "") + '>📒 HUTANG (Piutang)</option>' +
          '</select></div></div>' +
          '<div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:12px; padding:12px;">' +
          '<div style="display:flex; justify-content:space-between; font-size:13px; color:#475569; margin-bottom:4px;"><span>Subtotal Kotor:</span><span>' + Utils.formatRupiah(totals.grossSubtotal) + '</span></div>' +
          (totals.itemDiscountTotal > 0 ? '<div style="display:flex; justify-content:space-between; font-size:13px; color:#d97706; margin-bottom:4px;"><span>Diskon Item / Grosir:</span><span>-' + Utils.formatRupiah(totals.itemDiscountTotal) + '</span></div>' : '') +
          (totals.globalDiscountAmount > 0 ? '<div style="display:flex; justify-content:space-between; font-size:13px; color:#d97706; margin-bottom:4px;"><span>Diskon Nota / Weekend:</span><span>-' + Utils.formatRupiah(totals.globalDiscountAmount) + '</span></div>' : '') +
          '<div style="display:flex; justify-content:space-between; font-size:19px; font-weight:800; color:#15803d; border-top:1px solid #bbf7d0; padding-top:8px; margin-top:4px;"><span>TOTAL BAYAR:</span><span>' + Utils.formatRupiah(totals.grandTotal) + '</span></div>' +
          '</div>';

        if (this.paymentMethod === "TUNAI") {
          html +=
            '<div class="form-group"><label>Uang Diterima (Rp) *</label>' +
            '<input type="number" id="kasir-cash-paid" class="form-control" min="0" placeholder="Masukkan nominal uang..." value="' + this.esc(this.cashPaidInput) + '" />' +
            '<div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">' +
            '<button type="button" class="chip-btn" data-quick-cash="' + totals.grandTotal + '">Uang Pas</button>' +
            '<button type="button" class="chip-btn" data-quick-cash="10000">10rb</button>' +
            '<button type="button" class="chip-btn" data-quick-cash="20000">20rb</button>' +
            '<button type="button" class="chip-btn" data-quick-cash="50000">50rb</button>' +
            '<button type="button" class="chip-btn" data-quick-cash="100000">100rb</button>' +
            '</div></div>' +
            '<div class="info-callout" style="display:flex; justify-content:space-between; align-items:center;">' +
            '<span>Kembalian:</span><strong style="font-size:18px; color:' + (cashVal >= totals.grandTotal ? "#15803d" : "#dc2626") + ';">' +
            (cashVal >= totals.grandTotal ? Utils.formatRupiah(changeVal) : "Kurang " + Utils.formatRupiah(totals.grandTotal - cashVal)) +
            '</strong></div>';
        } else if (this.paymentMethod === "NON_TUNAI") {
          const channels = ["QRIS", "Transfer Bank", "Dana / GoPay / OVO", "EDC / Debit"];
          html +=
            '<div class="form-group"><label>Kanal Pembayaran Non-Tunai *</label>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">' +
            channels.map((ch) =>
              '<button type="button" class="chip-btn ' + (this.nonCashChannel === ch ? "active" : "") + '" data-noncash-ch="' + ch + '">' + ch + '</button>'
            ).join("") +
            '</div>' +
            '<input type="text" id="kasir-noncash-channel" class="form-control" placeholder="Contoh: QRIS / BRI / Dana..." value="' + this.esc(this.nonCashChannel) + '" />' +
            '</div>' +
            '<div class="info-callout" style="background:#eff6ff; border-color:#93c5fd; color:#1e40af; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>Nominal Diterima Pas (' + this.esc(this.nonCashChannel || "Non-Tunai") + '):</span>' +
            '<strong style="font-size:17px;">' + Utils.formatRupiah(totals.grandTotal) + '</strong>' +
            '</div>';
        } else {
          html +=
            '<div class="form-row">' +
            '<div class="form-group"><label>Nama Pelanggan Penghutang *</label>' +
            '<input type="text" id="kasir-cust-name" class="form-control" placeholder="Nama pelanggan" value="' + this.esc(this.customerName) + '" /></div>' +
            '<div class="form-group"><label>No. HP / WhatsApp</label>' +
            '<input type="tel" id="kasir-cust-phone" class="form-control" placeholder="08..." value="' + this.esc(this.customerPhone) + '" /></div>' +
            '</div>' +
            '<div class="form-group"><label>Jatuh Tempo (Opsional)</label>' +
            '<input type="date" id="kasir-due-date" class="form-control" value="' + this.esc(this.dueDate) + '" /></div>';
        }

        const btnClass = this.paymentMethod === "HUTANG" ? "btn-orange" : "btn-primary";
        const btnStyle = this.paymentMethod === "NON_TUNAI" ? 'style="background:#2563eb; border-color:#1d4ed8;"' : '';
        const btnLabel = this.paymentMethod === "TUNAI"
          ? "✓ SELESAIKAN TRANSAKSI TUNAI"
          : this.paymentMethod === "NON_TUNAI"
          ? "📱 SELESAIKAN NON-TUNAI (" + this.esc(this.nonCashChannel || "QRIS") + ")"
          : "📒 SIMPAN TRANSAKSI HUTANG";

        html +=
          '<div class="form-group"><label>Catatan Transaksi (Opsional)</label>' +
          '<input type="text" id="kasir-note" class="form-control" placeholder="Catatan tambahan / ref transfer..." value="' + this.esc(this.note) + '" /></div>' +
          '<button type="button" id="btn-process-checkout" class="btn ' + btnClass + ' btn-block" ' + btnStyle + '>' +
          btnLabel +
          '</button></div></div>';
      }
    }

    viewKasir.innerHTML = html;
    this.bindEvents(products);
  },

  buildReceiptCardHtml(trx) {
    const itemsHtml = trx.items
      .map(
        (it) =>
          '<div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">' +
          '<span>' + this.esc(it.name) + ' (' + it.qty + ' ' + (it.saleMode === "ECERAN" ? "ecer" : "bks") + ')</span>' +
          '<strong>' + Utils.formatRupiah(it.lineNet) + '</strong>' +
          '</div>'
      )
      .join("");

    const methodLabel = trx.paymentMethod === "NON_TUNAI"
      ? "NON-TUNAI (" + this.esc(trx.nonCashChannel || "QRIS") + ")"
      : trx.paymentMethod;

    return (
      '<div class="card" style="border:2px solid #16a34a; background:#f0fdf4;">' +
      '<div class="card-header"><div><h3 class="card-title" style="color:#15803d;">✓ Transaksi Berhasil!</h3>' +
      '<p class="card-subtitle">' + trx.invoiceNo + ' • ' + trx.date + ' ' + trx.time + '</p></div>' +
      '<button type="button" id="btn-close-receipt" class="btn btn-secondary btn-sm">Tutup Struk</button></div>' +
      '<div style="background:#ffffff; padding:12px; border-radius:10px; border:1px dashed #86efac;">' +
      itemsHtml +
      '<div style="border-top:1px dashed #cbd5e1; margin-top:8px; padding-top:8px; font-size:14px;">' +
      '<div style="display:flex; justify-content:space-between;"><span>Total Belanja:</span><strong>' + Utils.formatRupiah(trx.totalAmount) + '</strong></div>' +
      '<div style="display:flex; justify-content:space-between;"><span>Metode:</span><strong>' + methodLabel + ' (' + trx.status + ')</strong></div>' +
      (trx.paymentMethod === "TUNAI"
        ? '<div style="display:flex; justify-content:space-between;"><span>Tunai:</span><span>' + Utils.formatRupiah(trx.cashReceived) + '</span></div>' +
          '<div style="display:flex; justify-content:space-between; color:#15803d;"><span>Kembalian:</span><strong>' + Utils.formatRupiah(trx.changeAmount) + '</strong></div>'
        : trx.paymentMethod === "NON_TUNAI"
        ? '<div style="display:flex; justify-content:space-between; color:#1d4ed8;"><span>Diterima via:</span><strong>' + this.esc(trx.nonCashChannel || "QRIS") + ' (Lunas)</strong></div>'
        : '<div style="display:flex; justify-content:space-between; color:#b45309;"><span>Pelanggan:</span><strong>' + this.esc(trx.customerName) + '</strong></div>') +
      '</div></div></div>'
    );
  },

  bindCatalogItemEvents(products) {
    const prodMap = new Map(products.map((p) => [p.id, p]));

    document.querySelectorAll("[data-add-prod]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prod = prodMap.get(btn.getAttribute("data-add-prod"));
        const mode = btn.getAttribute("data-add-mode");
        if (prod) {
          this.addToCart(prod, mode);
          Utils.showToast("+1 " + prod.name + " (" + (mode === "ECERAN" ? "Ecer" : "Bks") + ")");
          this.render();
        }
      });
    });

    document.querySelectorAll("[data-add-hutang]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const prod = prodMap.get(btn.getAttribute("data-add-hutang"));
        if (!prod) return;
        const mode = Number(prod.totalSmallestUnits) >= Number(prod.packSize || 1) ? "BUNGKUS" : "ECERAN";
        this.addToCart(prod, mode);
        this.paymentMethod = "HUTANG";
        this.activeSubTab = "keranjang";
        this.stopScanner();
        window.scrollTo({ top: 0, behavior: "smooth" });
        await this.render();
      });
    });
  },

  bindEvents(products) {
    const prodMap = new Map(products.map((p) => [p.id, p]));
    this.bindCatalogItemEvents(products);

    // EVENT PENGATURAN PROMO WEEKEND & GROSIR
    const togglePromoBtn = document.getElementById("btn-toggle-promo-panel");
    if (togglePromoBtn) {
      togglePromoBtn.addEventListener("click", () => {
        this.showPromoSettings = !this.showPromoSettings;
        this.render();
      });
    }

    const toggleWeekendBtn = document.getElementById("btn-toggle-weekend-on");
    if (toggleWeekendBtn) {
      toggleWeekendBtn.addEventListener("click", async () => {
        this.promoConfig.weekendEnabled = !this.promoConfig.weekendEnabled;
        this.manualGlobalDiscOverride = false;
        await this.savePromoConfig();
        this.render();
      });
    }

    const toggleGrosirBtn = document.getElementById("btn-toggle-grosir-on");
    if (toggleGrosirBtn) {
      toggleGrosirBtn.addEventListener("click", async () => {
        this.promoConfig.wholesaleEnabled = !this.promoConfig.wholesaleEnabled;
        this.cart.forEach((c) => { c.manualDiscOverride = false; });
        await this.savePromoConfig();
        this.render();
      });
    }

    document.querySelectorAll("[data-promo-day]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const dayNum = parseInt(btn.getAttribute("data-promo-day"), 10);
        const days = Array.isArray(this.promoConfig.weekendDays) ? [...this.promoConfig.weekendDays] : [];
        const idx = days.indexOf(dayNum);
        if (idx >= 0) days.splice(idx, 1);
        else days.push(dayNum);
        this.promoConfig.weekendDays = days;
        this.manualGlobalDiscOverride = false;
        await this.savePromoConfig();
        this.render();
      });
    });

    const savePromoBtn = document.getElementById("btn-save-promo-cfg");
    if (savePromoBtn) {
      savePromoBtn.addEventListener("click", async () => {
        const wkDisc = document.getElementById("promo-wk-disc");
        const wkMin = document.getElementById("promo-wk-min");
        const grQty = document.getElementById("promo-gr-qty");
        const grDisc = document.getElementById("promo-gr-disc");

        if (wkDisc) this.promoConfig.weekendDiscountStr = wkDisc.value.trim();
        if (wkMin) this.promoConfig.weekendMinSpend = Math.max(0, Number(wkMin.value) || 0);
        if (grQty) this.promoConfig.wholesaleMinQty = Math.max(2, parseInt(grQty.value, 10) || 3);
        if (grDisc) this.promoConfig.wholesaleDiscountStr = grDisc.value.trim();

        this.manualGlobalDiscOverride = false;
        this.cart.forEach((c) => { c.manualDiscOverride = false; });
        await this.savePromoConfig();
        this.showPromoSettings = false;
        Utils.showToast("Aturan diskon weekend & grosir disimpan!");
        this.render();
      });
    }

    document.querySelectorAll("[data-kasir-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-kasir-tab");
        if (targetTab !== "katalog") this.stopScanner();
        this.activeSubTab = targetTab;
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.render();
      });
    });

    const floatingBtn = document.getElementById("btn-floating-goto-cart");
    if (floatingBtn) {
      floatingBtn.addEventListener("click", () => {
        this.stopScanner();
        this.activeSubTab = "keranjang";
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.render();
      });
    }

    const closeRec = document.getElementById("btn-close-receipt");
    if (closeRec) {
      closeRec.addEventListener("click", () => {
        this.lastReceipt = null;
        this.render();
      });
    }

    const searchInp = document.getElementById("kasir-search-input");
    if (searchInp) {
      searchInp.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        const trimmed = this.searchQuery.trim().toLowerCase();
        const exact = trimmed
          ? products.find((p) => p.barcode && p.barcode.toLowerCase() === trimmed)
          : null;

        if (exact && Number(exact.totalSmallestUnits) > 0) {
          const mode = Number(exact.totalSmallestUnits) >= Number(exact.packSize || 1) ? "BUNGKUS" : "ECERAN";
          this.addToCart(exact, mode);
          this.searchQuery = "";
          searchInp.value = "";
          Utils.showToast(exact.name + " masuk keranjang!");
          this.render();
          return;
        }
        this.refreshCatalogResultsOnly();
      });
    }

    const clearSearchBtn = document.getElementById("btn-clear-search");
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener("click", () => {
        this.searchQuery = "";
        if (searchInp) {
          searchInp.value = "";
          searchInp.focus();
        }
        this.refreshCatalogResultsOnly();
      });
    }

    const toggleScan = document.getElementById("btn-toggle-scanner");
    if (toggleScan) toggleScan.addEventListener("click", () => this.startScanner(products));

    const closeScan = document.getElementById("btn-close-scanner");
    if (closeScan) closeScan.addEventListener("click", () => this.stopScanner());

    const clearBtn = document.getElementById("btn-clear-cart");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.cart = [];
        this.globalDiscountStr = "";
        this.manualGlobalDiscOverride = false;
        this.cashPaidInput = "";
        this.render();
      });
    }

    document.querySelectorAll("[data-remove-cart]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.cart.splice(parseInt(btn.getAttribute("data-remove-cart"), 10), 1);
        this.render();
      });
    });

    document.querySelectorAll("[data-qty-minus]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-qty-minus"), 10);
        if (this.cart[idx].qty > 1) this.cart[idx].qty -= 1;
        else this.cart.splice(idx, 1);
        this.render();
      });
    });

    document.querySelectorAll("[data-qty-plus]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-qty-plus"), 10);
        const item = this.cart[idx];
        const prod = prodMap.get(item.productId);
        if (prod && this.canIncreaseQty(prod, item, item.qty + 1)) {
          item.qty += 1;
          this.render();
        } else {
          Utils.showToast("Stok maksimum tercapai!", "warning");
        }
      });
    });

    document.querySelectorAll("[data-qty-input]").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        const idx = parseInt(inp.getAttribute("data-qty-input"), 10);
        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
        const item = this.cart[idx];
        const prod = prodMap.get(item.productId);
        if (prod && this.canIncreaseQty(prod, item, val)) item.qty = val;
        else Utils.showToast("Jumlah melebihi stok tersedia!", "warning");
        this.render();
      });
    });

    document.querySelectorAll("[data-item-disc]").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        const idx = parseInt(inp.getAttribute("data-item-disc"), 10);
        this.cart[idx].discountStr = e.target.value.trim();
        this.cart[idx].manualDiscOverride = true;
        this.cart[idx].isWholesaleApplied = false;
        this.render();
      });
    });

    const globalDiscInp = document.getElementById("kasir-global-disc");
    if (globalDiscInp) {
      globalDiscInp.addEventListener("change", (e) => {
        this.globalDiscountStr = e.target.value.trim();
        this.manualGlobalDiscOverride = true;
        this.render();
      });
    }

    const payMethodSel = document.getElementById("kasir-pay-method");
    if (payMethodSel) {
      payMethodSel.addEventListener("change", (e) => {
        this.paymentMethod = e.target.value;
        this.render();
      });
    }

    document.querySelectorAll("[data-noncash-ch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.nonCashChannel = btn.getAttribute("data-noncash-ch");
        this.render();
      });
    });

    const nonCashInp = document.getElementById("kasir-noncash-channel");
    if (nonCashInp) {
      nonCashInp.addEventListener("input", (e) => {
        this.nonCashChannel = e.target.value;
        const submitBtn = document.getElementById("btn-process-checkout");
        if (submitBtn && this.paymentMethod === "NON_TUNAI") {
          submitBtn.textContent = "📱 SELESAIKAN NON-TUNAI (" + (this.nonCashChannel.trim() || "QRIS") + ")";
        }
      });
    }

    const cashInp = document.getElementById("kasir-cash-paid");
    if (cashInp) {
      cashInp.addEventListener("input", (e) => (this.cashPaidInput = e.target.value));
      cashInp.addEventListener("change", () => this.render());
    }

    document.querySelectorAll("[data-quick-cash]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.cashPaidInput = btn.getAttribute("data-quick-cash");
        this.render();
      });
    });

    const custNameInp = document.getElementById("kasir-cust-name");
    if (custNameInp) custNameInp.addEventListener("input", (e) => (this.customerName = e.target.value));

    const custPhoneInp = document.getElementById("kasir-cust-phone");
    if (custPhoneInp) custPhoneInp.addEventListener("input", (e) => (this.customerPhone = e.target.value));

    const dueDateInp = document.getElementById("kasir-due-date");
    if (dueDateInp) dueDateInp.addEventListener("change", (e) => (this.dueDate = e.target.value));

    const noteInp = document.getElementById("kasir-note");
    if (noteInp) noteInp.addEventListener("input", (e) => (this.note = e.target.value));

    const checkoutBtn = document.getElementById("btn-process-checkout");
    if (checkoutBtn) {
      checkoutBtn.addEventListener("click", async () => {
        try {
          const trx = await KasirData.processCheckout({
            cartItems: this.cart,
            globalDiscountStr: this.globalDiscountStr,
            paymentMethod: this.paymentMethod,
            nonCashChannel: this.nonCashChannel,
            cashPaid: this.cashPaidInput,
            customerName: this.customerName,
            customerPhone: this.customerPhone,
            dueDate: this.dueDate,
            note: this.note
          });

          this.lastReceipt = trx;
          this.cart = [];
          this.globalDiscountStr = "";
          this.manualGlobalDiscOverride = false;
          this.cashPaidInput = "";
          this.customerName = "";
          this.customerPhone = "";
          this.dueDate = "";
          this.note = "";
          this.paymentMethod = "TUNAI";
          this.activeSubTab = "katalog";

          Utils.showToast("Transaksi " + trx.invoiceNo + " tersimpan!");
          window.scrollTo({ top: 0, behavior: "smooth" });
          await this.render();
          await DashboardModule.render();
        } catch (err) {
          Utils.showToast(err.message, "danger");
        }
      });
    }
  },

  canIncreaseQty(prod, targetItem, desiredQty) {
    const packSize = Math.max(1, Number(prod.packSize) || 1);
    const avail = Number(prod.totalSmallestUnits) || 0;
    let totalUnitsUsed = 0;

    this.cart.forEach((c) => {
      if (c.productId === prod.id) {
        const q = c === targetItem ? desiredQty : c.qty;
        totalUnitsUsed += c.saleMode === "ECERAN" ? q : q * packSize;
      }
    });
    return totalUnitsUsed <= avail;
  },

  addToCart(prod, saleMode) {
    const packSize = Math.max(1, Number(prod.packSize) || 1);
    const existing = this.cart.find((c) => c.productId === prod.id && c.saleMode === saleMode);

    if (existing) {
      if (this.canIncreaseQty(prod, existing, existing.qty + 1)) {
        existing.qty += 1;
      } else {
        Utils.showToast("Stok " + prod.name + " tidak cukup!", "warning");
      }
      return;
    }

    const dummyItem = { productId: prod.id, saleMode: saleMode, qty: 0 };
    if (!this.canIncreaseQty(prod, dummyItem, 1)) {
      Utils.showToast("Stok " + prod.name + " habis!", "danger");
      return;
    }

    const unitPrice = saleMode === "ECERAN" ? Number(prod.sellPriceRetail) : Number(prod.sellPricePack);
    this.cart.push({
      productId: prod.id,
      name: prod.name,
      saleMode: saleMode,
      packSize: packSize,
      qty: 1,
      unitPrice: unitPrice,
      discountStr: "",
      wholesaleMinQty: Number(prod.wholesaleMinQty) || 0,
      wholesaleDiscountStr: prod.wholesaleDiscountStr || "",
      manualDiscOverride: false,
      isWholesaleApplied: false
    });
  },

  async startScanner(products) {
    const box = document.getElementById("barcode-scanner-box");
    const video = document.getElementById("barcode-video");
    const statusText = document.getElementById("scanner-status-text");
    if (!box || !video) return;

    box.classList.remove("hidden");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusText.textContent = "Kamera tidak didukung di preview ini. Ketik kode di kolom cari.";
      return;
    }

    try {
      this.scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      video.srcObject = this.scannerStream;

      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"]
        });
        this.scannerTimer = setInterval(async () => {
          if (!this.scannerStream) return;
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length > 0) {
              const rawCode = codes[0].rawValue;
              const found = products.find((p) => p.barcode && p.barcode.toLowerCase() === rawCode.toLowerCase());
              if (found) {
                const mode = Number(found.totalSmallestUnits) >= Number(found.packSize || 1) ? "BUNGKUS" : "ECERAN";
                this.addToCart(found, mode);
                Utils.showToast("Scan berhasil: " + found.name);
                this.stopScanner();
                this.render();
              } else {
                statusText.textContent = "Terbaca: " + rawCode + " (belum terdaftar)";
              }
            }
          } catch (e) {}
        }, 500);
      } else {
        statusText.textContent = "Kamera aktif, deteksi otomatis butuh Chrome/APK Capacitor.";
      }
    } catch (err) {
      statusText.textContent = "Izin kamera tidak tersedia. Gunakan kolom cari.";
    }
  },

  stopScanner() {
    if (this.scannerTimer) {
      clearInterval(this.scannerTimer);
      this.scannerTimer = null;
    }
    if (this.scannerStream) {
      this.scannerStream.getTracks().forEach((t) => t.stop());
      this.scannerStream = null;
    }
    const box = document.getElementById("barcode-scanner-box");
    if (box) box.classList.add("hidden");
  }
};
