const RiwayatModule = {
  searchQuery: "",
  typeFilter: "ALL", // ALL, TUNAI, NON_TUNAI, HUTANG_BELUM, HUTANG_LUNAS
  dateFilter: "",
  expandedTrxId: null,
  cachedTransactions: [],

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  getFilteredTransactions() {
    const allTrx = this.cachedTransactions || [];
    const q = this.searchQuery.toLowerCase().trim();

    return allTrx.filter((t) => {
      if (this.dateFilter && t.date !== this.dateFilter) return false;
      if (this.typeFilter === "TUNAI" && t.paymentMethod !== "TUNAI") return false;
      if (this.typeFilter === "NON_TUNAI" && t.paymentMethod !== "NON_TUNAI") return false;
      if (this.typeFilter === "HUTANG_BELUM" && !(t.paymentMethod === "HUTANG" && t.status === "BELUM_LUNAS")) return false;
      if (this.typeFilter === "HUTANG_LUNAS" && !(t.paymentMethod === "HUTANG" && t.status === "LUNAS")) return false;

      if (!q) return true;
      const inItems = Array.isArray(t.items) && t.items.some((it) => it.name.toLowerCase().includes(q));
      return (
        (t.invoiceNo && t.invoiceNo.toLowerCase().includes(q)) ||
        (t.customerName && t.customerName.toLowerCase().includes(q)) ||
        (t.nonCashChannel && t.nonCashChannel.toLowerCase().includes(q)) ||
        inItems
      );
    });
  },

  buildStatsHtml(filtered) {
    const totalOmzetRealized = filtered.reduce((s, t) => s + (Number(t.realizedRevenue) || 0), 0);
    const totalProfitRealized = filtered.reduce((s, t) => s + (Number(t.realizedProfit) || 0), 0);

    return (
      '<div class="pill-stat">Nota: <strong>' + filtered.length + '</strong></div>' +
      '<div class="pill-stat">Omzet Masuk: <strong>' + Utils.formatRupiah(totalOmzetRealized) + '</strong></div>' +
      '<div class="pill-stat">Laba Masuk: <strong>' + Utils.formatRupiah(totalProfitRealized) + '</strong></div>'
    );
  },

  buildListHtml(filtered) {
    if (filtered.length === 0) {
      return (
        '<div class="card empty-module-card">' +
        '<h3>Belum Ada Riwayat Transaksi</h3>' +
        '<p>Belum ada transaksi yang sesuai dengan filter saat ini.</p>' +
        '</div>'
      );
    }

    let html = "";
    filtered.forEach((t) => {
      const isLunas = t.status === "LUNAS";
      const isExpanded = this.expandedTrxId === t.id;
      const itemCount = Array.isArray(t.items) ? t.items.length : 0;

      let badgeLabel = "";
      let badgeClass = isLunas ? "safe" : "warning";
      if (t.paymentMethod === "NON_TUNAI") {
        badgeLabel = "NON-TUNAI" + (t.nonCashChannel ? " (" + this.esc(t.nonCashChannel) + ")" : "") + " • LUNAS";
        badgeClass = "safe";
      } else if (t.paymentMethod === "TUNAI") {
        badgeLabel = "TUNAI • LUNAS";
      } else {
        badgeLabel = "HUTANG • " + (isLunas ? "LUNAS" : "CICILAN");
      }

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
          '<div style="margin-top:10px; padding-top:8px; border-top:1px dashed #334155; display:flex; justify-content:flex-end;">' +
          '<button type="button" class="btn btn-secondary btn-sm" style="color:#f87171; border-color:#7f1d1d;" data-void-trx="' + t.id + '">🗑️ Batalkan / Retur Nota</button>' +
          '</div></div>';
      }

      html +=
        '<div class="card product-card">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">' +
        '<div><strong style="font-size:14px; color:#0f172a;">' + t.invoiceNo + '</strong>' +
        '<div class="product-meta">' + t.date + ' ' + (t.time || "") + ' • ' + this.esc(t.customerName || "Umum") + '</div></div>' +
        '<span class="tag-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">' +
        '<span style="font-size:12.5px; color:#475569;">' + itemCount + ' jenis barang • Total Nota: <strong style="color:#0f172a;">' + Utils.formatRupiah(t.totalAmount) + '</strong></span>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-toggle-trx="' + t.id + '">' + (isExpanded ? "Tutup" : "Detail") + '</button>' +
        '</div>' +
        detailHtml +
        '</div>';
    });

    return html;
  },

  refreshResultsOnly() {
    const filtered = this.getFilteredTransactions();
    const statsBar = document.getElementById("riwayat-stats-bar");
    const listBox = document.getElementById("riwayat-list-results");
    if (statsBar) statsBar.innerHTML = this.buildStatsHtml(filtered);
    if (listBox) {
      listBox.innerHTML = this.buildListHtml(filtered);
      this.bindListEvents();
    }
  },

  async render() {
    const viewRiwayat = document.getElementById("view-riwayat");
    if (!viewRiwayat) return;

    const allTrx = await WarungDB.getAll("transactions");
    allTrx.sort((a, b) => (b.timestamp || b.date + " " + b.time).localeCompare(a.timestamp || a.date + " " + a.time));
    this.cachedTransactions = allTrx;

    const filtered = this.getFilteredTransactions();

    let html =
      '<div id="riwayat-stats-bar" class="mini-stats-bar">' +
      this.buildStatsHtml(filtered) +
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
      '<button type="button" class="chip-btn ' + (this.typeFilter === "NON_TUNAI" ? "active" : "") + '" data-riwayat-filter="NON_TUNAI">Non-Tunai</button>' +
      '<button type="button" class="chip-btn ' + (this.typeFilter === "HUTANG_BELUM" ? "active" : "") + '" data-riwayat-filter="HUTANG_BELUM">Hutang Aktif</button>' +
      '<button type="button" class="chip-btn ' + (this.typeFilter === "HUTANG_LUNAS" ? "active" : "") + '" data-riwayat-filter="HUTANG_LUNAS">Hutang Lunas</button>' +
      (this.dateFilter ? '<button type="button" class="chip-btn" id="btn-reset-riwayat-date" style="color:#dc2626;">Reset Tgl</button>' : '') +
      '</div></div></div>';

    html += '<div id="riwayat-list-results">' + this.buildListHtml(filtered) + '</div>';

    viewRiwayat.innerHTML = html;
    this.bindFilterEvents();
    this.bindListEvents();
  },

  bindFilterEvents() {
    const searchInp = document.getElementById("riwayat-search-input");
    if (searchInp) {
      searchInp.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        this.refreshResultsOnly();
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
        document.querySelectorAll("[data-riwayat-filter]").forEach((el) => {
          el.classList.toggle("active", el.getAttribute("data-riwayat-filter") === this.typeFilter);
        });
        this.refreshResultsOnly();
      });
    });
  },

  bindListEvents() {
    document.querySelectorAll("[data-toggle-trx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-toggle-trx");
        this.expandedTrxId = this.expandedTrxId === id ? null : id;
        this.refreshResultsOnly();
      });
    });

    document.querySelectorAll("[data-void-trx]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const trxId = btn.getAttribute("data-void-trx");
        const trx = await WarungDB.get("transactions", trxId);
        if (!trx) return;

        const ok = confirm(
          "Batalkan & Retur nota " + trx.invoiceNo + "?\n\n" +
          "Stok barang dari transaksi ini akan dikembalikan otomatis dan omzet nota akan dihapus."
        );
        if (!ok) return;

        await this.voidTransaction(trx);
      });
    });
  },

  async voidTransaction(trx) {
    const todayStr = Utils.getTodayISO();
    const timeStr = Utils.getCurrentTimeStr();

    // 1. Kembalikan stok ke masing-masing produk & batch
    if (Array.isArray(trx.items)) {
      for (let i = 0; i < trx.items.length; i++) {
        const it = trx.items[i];
        const unitsToRestore = Number(it.smallestUnitsDeducted) || 0;
        if (unitsToRestore <= 0) continue;

        const prod = await WarungDB.get("products", it.productId);
        if (prod) {
          prod.totalSmallestUnits = (Number(prod.totalSmallestUnits) || 0) + unitsToRestore;
          prod.updatedAt = new Date().toISOString();
          await WarungDB.put("products", prod);

          await WarungDB.put("stock_logs", {
            id: Utils.generateId("LOG"),
            productId: prod.id,
            productName: prod.name,
            date: todayStr,
            time: timeStr,
            type: "RETUR_JUAL",
            changeSmallestUnits: unitsToRestore,
            balanceSmallestUnits: prod.totalSmallestUnits,
            packSize: Number(prod.packSize) || 1,
            note: "Batal Nota " + trx.invoiceNo
          });
        }

        // Kembalikan ke alokasi batch asalnya jika masih ada
        if (Array.isArray(it.batchAllocations)) {
          for (let b = 0; b < it.batchAllocations.length; b++) {
            const alloc = it.batchAllocations[b];
            const batch = await WarungDB.get("batches", alloc.batchId);
            if (batch) {
              batch.remainingSmallestUnits = (Number(batch.remainingSmallestUnits) || 0) + (Number(alloc.unitsTaken) || 0);
              await WarungDB.put("batches", batch);
            }
          }
        }
      }
    }

    // 2. Jika transaksi hutang, hapus catatan hutang & cicilan terkait
    if (trx.paymentMethod === "HUTANG") {
      const [allDebts, allPayments] = await Promise.all([
        WarungDB.getAll("debts"),
        WarungDB.getAll("debt_payments")
      ]);
      const relatedDebts = allDebts.filter((d) => d.transactionId === trx.id);
      for (let d = 0; d < relatedDebts.length; d++) {
        const debtId = relatedDebts[d].id;
        await WarungDB.delete("debts", debtId);
        const relPays = allPayments.filter((p) => p.debtId === debtId);
        for (let p = 0; p < relPays.length; p++) {
          await WarungDB.delete("debt_payments", relPays[p].id);
        }
      }
    }

    // 3. Hapus transaksi dari database
    await WarungDB.delete("transactions", trx.id);
    this.expandedTrxId = null;

    Utils.showToast("Nota " + trx.invoiceNo + " dibatalkan & stok dikembalikan!");
    await this.render();
    if (typeof DashboardModule !== "undefined") await DashboardModule.render();
  }
};
