const StokModule = {
  currentSubTab: "daftar",
  searchQuery: "",
  filterCondition: "all",
  tempPhotoBase64: "",

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  async render() {
    document.querySelectorAll(".stok-subtab").forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-stok-tab") === this.currentSubTab);
    });

    const container = document.getElementById("stok-dynamic-container");
    if (!container) return;

    if (this.currentSubTab === "daftar") {
      await this.renderProductList(container);
    } else if (this.currentSubTab === "tambah") {
      await this.renderProductForm(container, null);
    } else if (this.currentSubTab === "opname") {
      await this.renderOpnameAndMutation(container);
    } else if (this.currentSubTab === "riwayat") {
      await this.renderStockLogs(container);
    }
  },

  async renderProductList(container) {
    const data = await StokData.getEnrichedProducts();
    const products = data.products;
    const showPhotos = !data.settings || data.settings.enablePhotos !== false;

    const q = this.searchQuery.toLowerCase().trim();
    const filtered = products.filter((p) => {
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));
      if (!matchQ) return false;
      if (this.filterCondition === "low") return p.isLowStock;
      if (this.filterCondition === "near_exp") return p.hasNearExp;
      if (this.filterCondition === "expired") return p.hasExpired;
      return true;
    });

    const totalJenis = products.length;
    const totalLow = products.filter((p) => p.isLowStock).length;
    const totalNear = products.filter((p) => p.hasNearExp).length;
    const totalExp = products.filter((p) => p.hasExpired).length;

    let html = '<div class="mini-stats-bar">' +
      '<div class="pill-stat">Total: <strong>' + totalJenis + '</strong></div>' +
      '<div class="pill-stat warning">Menipis: <strong>' + totalLow + '</strong></div>' +
      '<div class="pill-stat warning">Hampir Exp: <strong>' + totalNear + '</strong></div>' +
      '<div class="pill-stat danger">Expired: <strong>' + totalExp + '</strong></div>' +
      '</div>';

    html += '<div class="card"><div class="form-stack">' +
      '<input type="text" id="stok-search-input" class="form-control" placeholder="Cari nama barang, kategori, barcode..." value="' + this.esc(this.searchQuery) + '" />' +
      '<div class="filter-chips">' +
      '<button type="button" class="chip-btn ' + (this.filterCondition === "all" ? "active" : "") + '" data-stok-filter="all">Semua (' + totalJenis + ')</button>' +
      '<button type="button" class="chip-btn ' + (this.filterCondition === "low" ? "active" : "") + '" data-stok-filter="low">Menipis (' + totalLow + ')</button>' +
      '<button type="button" class="chip-btn ' + (this.filterCondition === "near_exp" ? "active" : "") + '" data-stok-filter="near_exp">Hampir Exp (' + totalNear + ')</button>' +
      '<button type="button" class="chip-btn ' + (this.filterCondition === "expired" ? "active" : "") + '" data-stok-filter="expired">Kedaluwarsa (' + totalExp + ')</button>' +
      '</div></div></div>';

    if (filtered.length === 0) {
      html += '<div class="card empty-module-card">' +
        '<h3>Belum Ada Data Barang</h3>' +
        '<p>Klik tombol di bawah untuk menambahkan barang pertama Anda.</p>' +
        '<button type="button" class="btn btn-primary" data-stok-tab="tambah">+ Tambah Barang Baru</button>' +
        '</div>';
    } else {
      filtered.forEach((p) => {
        const fullPacks = Math.floor(p.totalUnits / p.packSize);
        const looseUnits = p.totalUnits % p.packSize;
        const stockText = p.packSize > 1
          ? fullPacks + " bungkus" + (looseUnits > 0 ? " + " + looseUnits + " eceran" : "") + " (" + p.totalUnits + " unit)"
          : p.totalUnits + " satuan";

        const photoHtml = showPhotos && p.photo
          ? '<img src="' + p.photo + '" alt="" class="product-thumb" />'
          : '<div class="product-thumb placeholder">' + this.esc(p.name.charAt(0).toUpperCase()) + '</div>';

        let badges = "";
        if (p.totalUnits <= 0) badges += '<span class="tag-badge danger">HABIS</span>';
        else if (p.isLowStock) badges += '<span class="tag-badge warning">MENIPIS</span>';
        if (p.hasExpired) badges += '<span class="tag-badge danger">ADA EXPIRED</span>';
        else if (p.hasNearExp) badges += '<span class="tag-badge warning">HAMPIR EXP</span>';

        let batchRows = "";
        if (p.batches.length === 0) {
          batchRows = '<div class="batch-item muted">Stok kosong (0 unit)</div>';
        } else {
          p.batches.forEach((b, idx) => {
            const bPacks = (b.remainingSmallestUnits / p.packSize).toFixed(p.packSize > 1 ? 1 : 0).replace(/\.0$/, "");
            let stLabel = "Aman";
            let stClass = "safe";
            if (b.expStatus === "expired") {
              stLabel = "KEDALUWARSA (" + Math.abs(b.daysLeft) + " hr lalu)";
              stClass = "danger";
            } else if (b.expStatus === "near_exp") {
              stLabel = "Sisa " + b.daysLeft + " hari";
              stClass = "warning";
            } else if (!b.expiryDate) {
              stLabel = "Tanpa Exp";
            }
            batchRows += '<div class="batch-item ' + stClass + '">' +
              '<div><strong>Batch #' + (idx + 1) + '</strong> • Input: ' + (b.inputDate || "-") + '<br/><span>Exp: ' + (b.expiryDate || "-") + ' (' + stLabel + ')</span></div>' +
              '<div class="batch-qty"><strong>' + bPacks + ' bks</strong><br/><small>(' + b.remainingSmallestUnits + ' unit)</small></div>' +
              '</div>';
          });
        }

        const priceDetail = p.packSize > 1
          ? '<div>Eceran (isi ' + p.packSize + '): <strong>' + Utils.formatRupiah(p.sellPriceRetail) + '</strong> <small>(Modal ' + Utils.formatRupiah(p.buyPriceRetail) + ')</small></div>'
          : '<div>Satuan Tunggal (1 bungkus = 1 unit)</div>';

        html += '<div class="card product-card">' +
          '<div class="product-header">' + photoHtml +
          '<div class="product-main-info"><h3 class="product-name">' + this.esc(p.name) + '</h3>' +
          '<div class="product-meta">' + this.esc(p.category || "Umum") + (p.barcode ? " • Kode: " + this.esc(p.barcode) : "") + '</div>' +
          '<div class="badge-row">' + badges + '</div></div></div>' +
          '<div class="stock-summary-box"><span class="sub-lbl">Stok Tersedia:</span>' +
          '<strong class="stock-val ' + (p.isLowStock ? "text-warning" : "text-accent") + '">' + stockText + '</strong>' +
          '<div class="price-grid-mini"><div>Bungkus: <strong>' + Utils.formatRupiah(p.sellPricePack) + '</strong> <small>(Modal ' + Utils.formatRupiah(p.buyPricePack) + ')</small></div>' + priceDetail + '</div></div>' +
          '<div class="sales-recap-mini"><span>Terjual Bks: <strong>' + p.soldStats.soldPacks + '</strong></span><span>Terjual Ecer: <strong>' + p.soldStats.soldRetail + '</strong></span><span>Total Unit: <strong>' + p.soldStats.totalSmallestSold + '</strong></span></div>' +
          '<div class="batch-section"><div class="batch-section-title">Rincian Batch Stok Fisik:</div>' + batchRows + '</div>' +
          (p.notes ? '<div class="product-notes">Catatan: ' + this.esc(p.notes) + '</div>' : '') +
          '<div class="product-actions-row">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-edit-product="' + p.id + '">Edit Harga/Info</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-quick-restock="' + p.id + '">+ Tambah Batch</button>' +
          '</div></div>';
      });
    }

    container.innerHTML = html;

    const searchInput = document.getElementById("stok-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        this.render();
      });
    }

    document.querySelectorAll("[data-stok-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.filterCondition = btn.getAttribute("data-stok-filter");
        this.render();
      });
    });

    document.querySelectorAll("[data-edit-product]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const prod = await WarungDB.get("products", btn.getAttribute("data-edit-product"));
        if (prod) await this.renderProductForm(container, prod);
      });
    });

    document.querySelectorAll("[data-quick-restock]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-quick-restock");
        this.currentSubTab = "opname";
        await this.render();
        const sel = document.getElementById("mut-product-id");
        if (sel) {
          sel.value = id;
          sel.dispatchEvent(new Event("change"));
        }
      });
    });
  },

  async renderProductForm(container, editProd) {
    const settings = await WarungDB.get("settings", "store_config");
    const allowPhotos = !settings || settings.enablePhotos !== false;
    const todayStr = Utils.getTodayISO();
    const isEdit = Boolean(editProd);
    this.tempPhotoBase64 = isEdit && editProd.photo ? editProd.photo : "";

    let photoSection = "";
    if (allowPhotos) {
      photoSection = '<div class="form-group"><label>Foto Barang (Opsional)</label><div class="photo-upload-box">' +
        '<div id="photo-preview-area" class="photo-preview-area">' + (this.tempPhotoBase64 ? '<img src="' + this.tempPhotoBase64 + '" />' : '<span>Tanpa foto</span>') + '</div>' +
        '<div class="photo-buttons"><label class="btn btn-secondary btn-sm">📷 Pilih / Kamera<input type="file" id="prod-photo-input" accept="image/*" hidden /></label>' +
        '<button type="button" id="btn-remove-photo" class="btn btn-secondary btn-sm">Hapus Foto</button></div></div></div>';
    }

    let initStockSection = "";
    if (!isEdit) {
      initStockSection = '<div class="divider-label">Stok Awal &amp; Kedaluwarsa</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label>Stok Awal (Bungkus) *</label><input type="number" id="prod-init-packs" class="form-control" min="0" value="0" required /></div>' +
        '<div class="form-group"><label>Tambahan Eceran (Unit)</label><input type="number" id="prod-init-retail" class="form-control" min="0" value="0" /></div>' +
        '</div><div class="form-row">' +
        '<div class="form-group"><label>Tanggal Input *</label><input type="date" id="prod-input-date" class="form-control" value="' + todayStr + '" required /></div>' +
        '<div class="form-group"><label>Tanggal Kedaluwarsa</label><input type="date" id="prod-expiry-date" class="form-control" /></div>' +
        '</div>';
    }

    container.innerHTML = '<div class="card"><div class="card-header"><div>' +
      '<h2 class="card-title">' + (isEdit ? "Edit Data Barang" : "Input Barang Baru") + '</h2>' +
      '<p class="card-subtitle">Mendukung penjualan bungkus &amp; eceran otomatis</p></div>' +
      (isEdit ? '<button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-edit">Batal</button>' : '') +
      '</div><form id="form-product-master" class="form-stack">' +
      '<input type="hidden" id="prod-id" value="' + (isEdit ? editProd.id : "") + '" />' +
      '<div class="form-group"><label>Nama Barang *</label><input type="text" id="prod-name" class="form-control" placeholder="Contoh: Rokok Surya 12" value="' + (isEdit ? this.esc(editProd.name) : "") + '" required /></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label>Kategori</label><input type="text" id="prod-category" class="form-control" placeholder="Sembako / Rokok" value="' + (isEdit ? this.esc(editProd.category || "") : "") + '" /></div>' +
      '<div class="form-group"><label>Barcode</label><input type="text" id="prod-barcode" class="form-control" placeholder="Opsional" value="' + (isEdit ? this.esc(editProd.barcode || "") : "") + '" /></div>' +
      '</div>' + photoSection +
      '<div class="divider-label">Kemasan &amp; Harga</div>' +
      '<div class="form-group"><label>Isi dalam 1 Bungkus / Satuan *</label>' +
      '<input type="number" id="prod-pack-size" class="form-control" min="1" value="' + (isEdit ? editProd.packSize : 1) + '" ' + (isEdit ? "readonly" : "") + ' required />' +
      '<small class="field-hint">Isi <strong>1</strong> jika tidak diecer. Isi misal <strong>10</strong> atau <strong>12</strong> jika dijual eceran.</small></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label>Harga Beli / Bungkus *</label><input type="number" id="prod-buy-pack" class="form-control" min="0" value="' + (isEdit ? editProd.buyPricePack : "") + '" required /></div>' +
      '<div class="form-group"><label>Harga Jual / Bungkus *</label><input type="number" id="prod-sell-pack" class="form-control" min="0" value="' + (isEdit ? editProd.sellPricePack : "") + '" required /></div>' +
      '</div>' +
      '<div id="retail-price-section" class="form-row ' + (isEdit && editProd.packSize <= 1 ? "hidden" : "") + '">' +
      '<div class="form-group"><label>Harga Beli Eceran</label><input type="number" id="prod-buy-retail" class="form-control" min="0" step="0.01" value="' + (isEdit ? editProd.buyPriceRetail : "") + '" /></div>' +
      '<div class="form-group"><label>Harga Jual Eceran</label><input type="number" id="prod-sell-retail" class="form-control" min="0" value="' + (isEdit ? editProd.sellPriceRetail : "") + '" /></div>' +
      '</div>' + initStockSection +
      '<div class="form-group"><label>Catatan Tambahan</label><input type="text" id="prod-notes" class="form-control" placeholder="Opsional" value="' + (isEdit ? this.esc(editProd.notes || "") : "") + '" /></div>' +
      '<button type="submit" class="btn btn-primary btn-block">' + (isEdit ? "Simpan Perubahan" : "Simpan Barang") + '</button>' +
      '</form></div>';

    const packInput = document.getElementById("prod-pack-size");
    const buyPackInput = document.getElementById("prod-buy-pack");
    const buyRetInput = document.getElementById("prod-buy-retail");
    const retSec = document.getElementById("retail-price-section");

    const syncRetail = () => {
      const sz = Math.max(1, parseInt(packInput.value, 10) || 1);
      if (sz > 1) {
        retSec.classList.remove("hidden");
        const bp = parseFloat(buyPackInput.value) || 0;
        if (!isEdit || !buyRetInput.value) buyRetInput.value = Math.round((bp / sz) * 100) / 100;
      } else {
        retSec.classList.add("hidden");
        buyRetInput.value = buyPackInput.value || 0;
      }
    };
    packInput.addEventListener("input", syncRetail);
    buyPackInput.addEventListener("input", syncRetail);
    if (!isEdit) syncRetail();

    const photoInput = document.getElementById("prod-photo-input");
    if (photoInput) {
      photoInput.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          this.tempPhotoBase64 = await Utils.compressImageFile(file, 360, 0.72);
          document.getElementById("photo-preview-area").innerHTML = '<img src="' + this.tempPhotoBase64 + '" />';
        } catch (err) {
          Utils.showToast("Gagal memproses foto", "danger");
        }
      });
    }

    const rmPhoto = document.getElementById("btn-remove-photo");
    if (rmPhoto) {
      rmPhoto.addEventListener("click", () => {
        this.tempPhotoBase64 = "";
        document.getElementById("photo-preview-area").innerHTML = "<span>Tanpa foto</span>";
      });
    }

    const cancelBtn = document.getElementById("btn-cancel-edit");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        this.currentSubTab = "daftar";
        this.render();
      });
    }

    document.getElementById("form-product-master").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("prod-name").value.trim();
      const category = document.getElementById("prod-category").value.trim() || "Umum";
      const barcode = document.getElementById("prod-barcode").value.trim();
      const packSize = Math.max(1, parseInt(packInput.value, 10) || 1);
      const buyPricePack = Math.max(0, parseFloat(buyPackInput.value) || 0);
      const sellPricePack = Math.max(0, parseFloat(document.getElementById("prod-sell-pack").value) || 0);

      let buyPriceRetail = buyPricePack;
      let sellPriceRetail = sellPricePack;
      if (packSize > 1) {
        const bRet = parseFloat(buyRetInput.value);
        const sRet = parseFloat(document.getElementById("prod-sell-retail").value);
        buyPriceRetail = !isNaN(bRet) && bRet >= 0 ? bRet : Math.round((buyPricePack / packSize) * 100) / 100;
        sellPriceRetail = !isNaN(sRet) && sRet > 0 ? sRet : Math.ceil(sellPricePack / packSize);
      }
      const notes = document.getElementById("prod-notes").value.trim();
    const currentId = typeof editId !== "undefined" ? editId : (this.editingId || null);
    const duplicate = await StokData.findDuplicateName(name, currentId);

    if (duplicate) {
      Utils.showToast(`Gagal: Nama "${duplicate.name}" sudah ada!`);
      alert(`Nama barang "${duplicate.name}" sudah terdaftar di sistem.\n\nTidak boleh ada 2 barang dengan nama yang sama. Gunakan tombol "+ Tambah Stok / Batch" pada barang tersebut.`);
      return;
    }

      if (isEdit) {
        const old = await WarungDB.get("products", document.getElementById("prod-id").value);
        if (!old) return;
        await WarungDB.put("products", Object.assign({}, old, {
          name: name, category: category, barcode: barcode, photo: this.tempPhotoBase64,
          buyPricePack: buyPricePack, sellPricePack: sellPricePack,
          buyPriceRetail: buyPriceRetail, sellPriceRetail: sellPriceRetail, notes: notes
        }));
        Utils.showToast("Barang diperbarui!");
      } else {
        await StokData.saveNewProduct({
          name: name, category: category, barcode: barcode, photo: this.tempPhotoBase64,
          packSize: packSize, buyPricePack: buyPricePack, sellPricePack: sellPricePack,
          buyPriceRetail: buyPriceRetail, sellPriceRetail: sellPriceRetail,
          initPacks: Math.max(0, parseInt(document.getElementById("prod-init-packs").value, 10) || 0),
          initRetail: Math.max(0, parseInt(document.getElementById("prod-init-retail").value, 10) || 0),
          inputDate: document.getElementById("prod-input-date").value || Utils.getTodayISO(),
          expiryDate: document.getElementById("prod-expiry-date").value || "",
          notes: notes
        });
        Utils.showToast("Barang baru disimpan!");
      }

      this.currentSubTab = "daftar";
      await this.render();
      await DashboardModule.render();
    });
  },

  async renderOpnameAndMutation(container) {
    const products = await WarungDB.getAll("products");
    products.sort((a, b) => a.name.localeCompare(b.name));

    if (products.length === 0) {
      container.innerHTML = '<div class="card empty-module-card"><h3>Belum Ada Barang</h3><p>Tambahkan barang terlebih dahulu sebelum melakukan Stok Opname.</p><button type="button" class="btn btn-primary" data-stok-tab="tambah">+ Tambah Barang</button></div>';
      return;
    }

    const opts = products.map((p) => '<option value="' + p.id + '">' + this.esc(p.name) + ' (Isi ' + p.packSize + ')</option>').join("");
    const todayStr = Utils.getTodayISO();

    container.innerHTML = '<div class="card"><div class="card-header"><div><h2 class="card-title">Stok Opname Fisik</h2><p class="card-subtitle">Cocokkan stok nyata di rak dengan stok sistem</p></div></div>' +
      '<form id="form-stock-opname" class="form-stack">' +
      '<div class="form-group"><label>Pilih Barang *</label><select id="opname-product-id" class="form-control">' + opts + '</select></div>' +
      '<div id="opname-system-info" class="info-callout">Memuat...</div>' +
      '<div class="form-row"><div class="form-group"><label>Stok Fisik (Bungkus)</label><input type="number" id="opname-phys-packs" class="form-control" min="0" value="0" required /></div>' +
      '<div class="form-group"><label>Sisa Eceran Fisik (Unit)</label><input type="number" id="opname-phys-retail" class="form-control" min="0" value="0" /></div></div>' +
      '<div id="opname-diff-preview" class="diff-box neutral">Selisih: 0 unit</div>' +
      '<div class="form-group"><label>Catatan Opname</label><input type="text" id="opname-note" class="form-control" placeholder="Opsional" /></div>' +
      '<button type="submit" class="btn btn-primary btn-block">Simpan Hasil Opname</button></form></div>' +
      '<div class="card"><div class="card-header"><div><h2 class="card-title">Barang Masuk / Barang Keluar</h2><p class="card-subtitle">Tambah batch kulakan baru atau catat barang rusak</p></div></div>' +
      '<form id="form-stock-mutation" class="form-stack">' +
      '<div class="form-group"><label>Pilih Barang *</label><select id="mut-product-id" class="form-control">' + opts + '</select></div>' +
      '<div class="form-row"><div class="form-group"><label>Jenis *</label><select id="mut-type" class="form-control"><option value="MASUK">Barang Masuk (Batch Baru)</option><option value="KELUAR">Barang Keluar (Rusak/Expired)</option></select></div>' +
      '<div class="form-group"><label>Satuan</label><select id="mut-unit-mode" class="form-control"><option value="PACK">Bungkus / Satuan</option><option value="RETAIL">Eceran (Unit)</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Jumlah *</label><input type="number" id="mut-qty" class="form-control" min="1" value="1" required /></div>' +
      '<div class="form-group"><label>Tanggal *</label><input type="date" id="mut-date" class="form-control" value="' + todayStr + '" required /></div></div>' +
      '<div id="mut-expiry-group" class="form-group"><label>Tanggal Kedaluwarsa Batch Baru</label><input type="date" id="mut-expiry" class="form-control" /></div>' +
      '<div class="form-group"><label>Keterangan *</label><input type="text" id="mut-note" class="form-control" placeholder="Contoh: Kulakan agen / kemasan rusak" required /></div>' +
      '<button type="submit" class="btn btn-secondary btn-block">Simpan Pergerakan Stok</button></form></div>';

    const prodMap = new Map(products.map((p) => [p.id, p]));
    const opSel = document.getElementById("opname-product-id");
    const opPacks = document.getElementById("opname-phys-packs");
    const opRet = document.getElementById("opname-phys-retail");
    const opInfo = document.getElementById("opname-system-info");
    const opDiff = document.getElementById("opname-diff-preview");

    const calcDiff = () => {
      const p = prodMap.get(opSel.value);
      if (!p) return;
      const sys = Number(p.totalSmallestUnits) || 0;
      const sz = Math.max(1, Number(p.packSize) || 1);
      opInfo.innerHTML = "Stok Sistem: <strong>" + Math.floor(sys / sz) + " bungkus + " + (sys % sz) + " eceran</strong> (" + sys + " unit)";
      const phys = (parseInt(opPacks.value, 10) || 0) * sz + (parseInt(opRet.value, 10) || 0);
      const diff = phys - sys;
      opDiff.textContent = "Selisih: " + (diff > 0 ? "+" : "") + diff + " unit";
      opDiff.className = "diff-box " + (diff === 0 ? "neutral" : diff > 0 ? "positive" : "negative");
    };

    const loadSys = () => {
      const p = prodMap.get(opSel.value);
      if (!p) return;
      const sys = Number(p.totalSmallestUnits) || 0;
      const sz = Math.max(1, Number(p.packSize) || 1);
      opPacks.value = Math.floor(sys / sz);
      opRet.value = sys % sz;
      calcDiff();
    };

    opSel.addEventListener("change", loadSys);
    opPacks.addEventListener("input", calcDiff);
    opRet.addEventListener("input", calcDiff);
    loadSys();

    document.getElementById("form-stock-opname").addEventListener("submit", async (e) => {
      e.preventDefault();
      const prod = await WarungDB.get("products", opSel.value);
      const sz = Math.max(1, Number(prod.packSize) || 1);
      const newTot = (parseInt(opPacks.value, 10) || 0) * sz + (parseInt(opRet.value, 10) || 0);
      const diff = newTot - (Number(prod.totalSmallestUnits) || 0);
      if (diff === 0) {
        Utils.showToast("Stok fisik sudah cocok.", "warning");
        return;
      }
      await StokData.adjustStock(prod, diff, "STOK_OPNAME", Utils.getTodayISO(), "", document.getElementById("opname-note").value.trim() || "Penyesuaian Stok Opname");
      Utils.showToast("Stok Opname tersimpan!");
      this.currentSubTab = "daftar";
      await this.render();
      await DashboardModule.render();
    });

    const mutType = document.getElementById("mut-type");
    mutType.addEventListener("change", () => {
      document.getElementById("mut-expiry-group").classList.toggle("hidden", mutType.value !== "MASUK");
    });

    document.getElementById("form-stock-mutation").addEventListener("submit", async (e) => {
      e.preventDefault();
      const prod = await WarungDB.get("products", document.getElementById("mut-product-id").value);
      const qty = Math.max(1, parseInt(document.getElementById("mut-qty").value, 10) || 1);
      const sz = Math.max(1, Number(prod.packSize) || 1);
      const delta = document.getElementById("mut-unit-mode").value === "PACK" ? qty * sz : qty;
      const isIn = mutType.value === "MASUK";

      if (!isIn && delta > Number(prod.totalSmallestUnits || 0)) {
        Utils.showToast("Stok tidak mencukupi!", "danger");
        return;
      }
      await StokData.adjustStock(
        prod,
        isIn ? delta : -delta,
        isIn ? "BARANG_MASUK" : "BARANG_KELUAR",
        document.getElementById("mut-date").value || Utils.getTodayISO(),
        document.getElementById("mut-expiry").value || "",
        document.getElementById("mut-note").value.trim()
      );
      Utils.showToast("Pergerakan stok dicatat!");
      this.currentSubTab = "daftar";
      await this.render();
      await DashboardModule.render();
    });
  },

  async renderStockLogs(container) {
    const logs = await WarungDB.getAll("stock_logs");
    logs.sort((a, b) => (b.date + " " + b.time).localeCompare(a.date + " " + a.time));

    if (logs.length === 0) {
      container.innerHTML = '<div class="card empty-module-card"><h3>Belum Ada Riwayat Stok</h3><p>Catatan stok masuk, keluar, dan opname akan muncul di sini.</p></div>';
      return;
    }

    const rows = logs.map((log) => {
      const pos = Number(log.changeSmallestUnits) >= 0;
      return '<div class="log-item"><div class="log-top"><strong>' + this.esc(log.productName) + '</strong>' +
        '<span class="log-delta ' + (pos ? "text-accent" : "text-danger") + '">' + (pos ? "+" : "") + log.changeSmallestUnits + ' unit</span></div>' +
        '<div class="log-mid"><span class="tag-badge ' + (pos ? "safe" : "warning") + '">' + log.type + '</span><span>' + log.date + ' ' + (log.time || "") + '</span></div>' +
        '<div class="log-bot"><span>' + this.esc(log.note || "-") + '</span><span>Sisa: <strong>' + log.balanceSmallestUnits + ' unit</strong></span></div></div>';
    }).join("");

    container.innerHTML = '<div class="card"><div class="card-header"><div><h2 class="card-title">Riwayat Perubahan Stok</h2><p class="card-subtitle">' + logs.length + ' catatan</p></div></div><div class="log-list">' + rows + '</div></div>';
  }
};
