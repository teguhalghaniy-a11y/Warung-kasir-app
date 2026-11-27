const RiwayatModule = {
  searchQuery: "",
  typeFilter: "ALL", // ALL, TUNAI, HUTANG_BELUM, HUTANG_LUNAS
  dateFilter: "",
  expandedTrxId: null,

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  async render() {
    const viewRiwayat = document.getElementById("view-riwayat");
    if (!viewRiwayat) return;

    const allTrx = await WarungDB.getAll("transactions");
    allTrx.sort((a, b) => (b.timestamp || b.date + " " + b.time).localeCompare(a.timestamp || a.date + " " + a.time));

    const q = this.searchQuery.toLowerCase().trim();
    const filtered = allTrx.filter((t) => {
      if (this.dateFilter && t.date !== this.dateFilter) return false;
      if (this.typeFilter === "TUNAI" && t.paymentMethod !== "TUNAI") return false;
      if (this.typeFilter === "HUTANG_BELUM" && !(t.paymentMethod === "HUTANG" && t.status === "BELUM_LUNAS")) return false;
      if (this.typeFilter === "HUTANG_LUNAS" && !(t.paymentMethod === "HUTANG" && t.status === "LUNAS")) return false;

      if (!q) return true;
      const inItems = Array.isArray(t.items) && t.items.some((it) => it.name.toLowerCase().includes(q));
      return (
        (t.invoiceNo && t.invoiceNo.toLowerCase().includes(q)) ||
        (t.customerName && t.customerName.toLowerCase().includes(q)) ||
        inItems
      );
    });

    const totalOmzetRealized = filtered.reduce((s, t) => s + (Number(t.realizedRevenue) || 0), 0);
    const totalProfitRealized = filtered.reduce((s, t) => s + (Number(t.realizedProfit) || 0), 0);

    let html =
      '<div class="mini-stats-bar">' +
      '<div class="pill-stat">Nota: <strong>' + filtered.length + '</strong></div>' +
      '<div class="pill-stat">Omzet Masuk: <strong>' + Utils.formatRupiah(totalOmzetRealized) + '</strong></div>' +
      '<div class="pill-stat">Laba Masuk: <strong>' + Utils.formatRupiah(totalProfitRealized) + '</strong></div>' +
      '</div>';

    html +=
      '<div class="card"><div class="form-stack">' +
      '<div class="form-row">' +
      '<div class="form-group"><label>Cari Nota / Pelanggan / Barang</label>' +
      '<input type="text" id="riwayat-search-input" class="form-control" placeholder="INV-... / Nama..." value="' + this.esc(this.searchQuery) + '" /></div>' +
      '<div class="form-group"><label>Filter Tanggal</label>' +
      '<input type="date" id="riwayat-date-input" class="form-control" value="' + this.esc(this.dateFilter) + '" /></div>' +
      '</div>' +
      '<div class="filter-chips">' +
      '<button type="button" class="chip-btn ' + (this.typeFilter === "ALL" ? "active" : "") + '" data-riwayat-filter="ALL">Semua</button>' +
      '<button type="button" class="chip-btn ' + (this.typeFilter === "TUNAI" ? "active" : "") + '" data-riwayat-filter="TUNAI">Tunai</button>' +
      '<button type="button" class="chip-btn ' + (this.typeFilter === "HUTANG_BELUM" ? "active" : "") + '" data-riwayat-filter="HUTANG_BELUM">Hutang Aktif</button>' +
      '<button type="button" class="chip-btn ' + (this.typeFilter === "HUTANG_LUNAS" ? "active" : "") + '" data-riwayat-filter="HUTANG_LUNAS">Hutang Lunas</button>' +
      (this.dateFilter ? '<button type="button" class="chip-btn" id="btn-reset-riwayat-date" style="color:#f87171;">Reset Tgl</button>' : '') +
      '</div></div></div>';

    if (filtered.length === 0) {
      html +=
        '<div class="card empty-module-card">' +
        '<h3>Belum Ada Riwayat Transaksi</h3>' +
        '<p>Belum ada transaksi yang sesuai dengan filter saat ini.</p>' +
        '</div>';
    } else {
      filtered.forEach((t) => {
        const isLunas = t.status === "LUNAS";
        const isExpanded = this.expandedTrxId === t.id;
        const itemCount = Array.isArray(t.items) ? t.items.length : 0;

        let detailHtml = "";
        if (isExpanded && Array.isArray(t.items)) {
          const rows = t.items
            .map(
              (it) =>
                '<div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0; border-bottom:1px solid #1e293b;">' +
                '<div><strong>' + this.esc(it.name) + '</strong> (' + it.qty + ' ' + (it.saleMode === "ECERAN" ? "ecer" : "bks") + ')' +
                (it.discountStr ? ' <span style="color:#f59e0b;">[Disc ' + this.esc(it.discountStr) + '%]</span>' : '') +
                '<br/><small style="color:#94a3b8;">Modal: ' + Utils.formatRupiah(it.cogs) + ' • Laba: ' + Utils.formatRupiah(it.profit) + '</small></div>' +
                '<div style="text-align:right;"><strong>' + Utils.formatRupiah(it.lineNet) + '</strong></div>' +
                '</div>'
            )
            .join("");

          detailHtml =
            '<div style="margin-top:8px; padding:10px; background:#0f172a; border-radius:8px; border:1px solid #334155;">' +
            '<div style="font-size:11px; font-weight:600; color:#94a3b8; margin-bottom:4px;">Rincian Barang Terjual:</div>' +
            rows +
            '<div style="margin-top:6px; font-size:12px; display:flex; justify-content:space-between; color:#34d399;">' +
            '<span>Omzet Terealisasi: ' + Utils.formatRupiah(t.realizedRevenue) + '</span>' +
            '<span>Laba Terealisasi: ' + Utils.formatRupiah(t.realizedProfit) + '</span>' +
            '</div>' +
            (t.note ? '<div style="font-size:11px; color:#94a3b8; margin-top:4px;">Catatan: ' + this.esc(t.note) + '</div>' : '') +
            '</div>';
        }

        html +=
          '<div class="card product-card">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">' +
          '<div><strong style="font-size:14px; color:#f8fafc;">' + t.invoiceNo + '</strong>' +
          '<div class="product-meta">' + t.date + ' ' + (t.time || "") + ' • ' + this.esc(t.customerName || "Umum") + '</div></div>' +
          '<span class="tag-badge ' + (isLunas ? "safe" : "warning") + '">' + t.paymentMethod + ' • ' + (isLunas ? "LUNAS" : "CICILAN") + '</span>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">' +
          '<span style="font-size:12px; color:#94a3b8;">' + itemCount + ' jenis barang • Total Nota: <strong style="color:#f8fafc;">' + Utils.formatRupiah(t.totalAmount) + '</strong></span>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-toggle-trx="' + t.id + '">' + (isExpanded ? "Tutup" : "Detail") + '</button>' +
          '</div>' +
          detailHtml +
          '</div>';
      });
    }

    viewRiwayat.innerHTML = html;
    this.bindEvents();
  },

  bindEvents() {
    const searchInp = document.getElementById("riwayat-search-input");
    if (searchInp) {
      searchInp.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        this.render();
      });
    }

    const dateInp = document.getElementById("riwayat-date-input");
    if (dateInp) {
      dateInp.addEventListener("change", (e) => {
        this.dateFilter = e.target.value;
        this.render();
      });
    }

    const resetDate = document.getElementById("btn-reset-riwayat-date");
    if (resetDate) {
      resetDate.addEventListener("click", () => {
        this.dateFilter = "";
        this.render();
      });
    }

    document.querySelectorAll("[data-riwayat-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.typeFilter = btn.getAttribute("data-riwayat-filter");
        this.render();
      });
    });

    document.querySelectorAll("[data-toggle-trx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-toggle-trx");
        this.expandedTrxId = this.expandedTrxId === id ? null : id;
        this.render();
      });
    });
  }
};
