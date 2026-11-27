const LaporanModule = {
  period: "30D", // TODAY, 7D, 30D, ALL
  activeSection: "terlaris", // terlaris, profit, tidak_laku

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  async render() {
    const viewLaporan = document.getElementById("view-laporan");
    if (!viewLaporan) return;

    const rep = await LaporanData.buildReport(this.period);
    const totalModeRev = rep.packStats.revenue + rep.retailStats.revenue;
    const packPct = totalModeRev > 0 ? Math.round((rep.packStats.revenue / totalModeRev) * 100) : 0;
    const retailPct = totalModeRev > 0 ? 100 - packPct : 0;

    let html =
      '<div class="card"><div class="card-header"><div><h2 class="card-title">Laporan &amp; Analisis Warung</h2>' +
      '<p class="card-subtitle">Omzet &amp; laba dihitung dari uang masuk terealisasi</p></div></div>' +
      '<div class="filter-chips">' +
      '<button type="button" class="chip-btn ' + (this.period === "TODAY" ? "active" : "") + '" data-rep-period="TODAY">Hari Ini</button>' +
      '<button type="button" class="chip-btn ' + (this.period === "7D" ? "active" : "") + '" data-rep-period="7D">7 Hari</button>' +
      '<button type="button" class="chip-btn ' + (this.period === "30D" ? "active" : "") + '" data-rep-period="30D">30 Hari</button>' +
      '<button type="button" class="chip-btn ' + (this.period === "ALL" ? "active" : "") + '" data-rep-period="ALL">Semua</button>' +
      '</div></div>';

    // RINGKASAN KEUANGAN & ASET
    html +=
      '<div class="stats-grid">' +
      '<div class="stat-card primary"><div class="stat-header"><span class="stat-label">Omzet Terealisasi</span><span>💵</span></div>' +
      '<div class="stat-value">' + Utils.formatRupiah(rep.totalOmzetRealized) + '</div>' +
      '<div class="stat-meta">' + rep.trxCount + ' transaksi (Bruto: ' + Utils.formatRupiah(rep.totalOmzetBruto) + ')</div></div>' +
      '<div class="stat-card success"><div class="stat-header"><span class="stat-label">Laba Bersih Masuk</span><span>📈</span></div>' +
      '<div class="stat-value">' + Utils.formatRupiah(rep.totalProfitRealized) + '</div>' +
      '<div class="stat-meta">Margin: ' + (rep.totalOmzetRealized > 0 ? Math.round((rep.totalProfitRealized / rep.totalOmzetRealized) * 100) : 0) + '%</div></div>' +
      '</div>';

    html +=
      '<div class="mini-stats-bar">' +
      '<div class="pill-stat">Modal Stok Gudang: <strong>' + Utils.formatRupiah(rep.totalAssetStockValue) + '</strong></div>' +
      '<div class="pill-stat warning">Piutang Tertahan: <strong>' + Utils.formatRupiah(rep.totalPendingReceivables) + '</strong></div>' +
      '</div>';

    // PERBANDINGAN BUNGKUS VS ECERAN
    html +=
      '<div class="card"><div class="card-header"><div><h3 class="card-title">Perbandingan Bungkus vs Eceran</h3>' +
      '<p class="card-subtitle">Kontribusi penjualan berdasarkan satuan</p></div></div>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">' +
      '<div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:10px;">' +
      '<div style="font-size:11px; color:#94a3b8;">Bungkus / Satuan (' + packPct + '%)</div>' +
      '<div style="font-size:15px; font-weight:700; color:#f8fafc; margin:2px 0;">' + Utils.formatRupiah(rep.packStats.revenue) + '</div>' +
      '<div style="font-size:11px; color:#34d399;">Laba: ' + Utils.formatRupiah(rep.packStats.profit) + ' (' + rep.packStats.qty + ' bks)</div>' +
      '</div>' +
      '<div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:10px;">' +
      '<div style="font-size:11px; color:#94a3b8;">Penjualan Eceran (' + retailPct + '%)</div>' +
      '<div style="font-size:15px; font-weight:700; color:#f8fafc; margin:2px 0;">' + Utils.formatRupiah(rep.retailStats.revenue) + '</div>' +
      '<div style="font-size:11px; color:#f59e0b;">Laba: ' + Utils.formatRupiah(rep.retailStats.profit) + ' (' + rep.retailStats.qty + ' ecer)</div>' +
      '</div></div></div>';

    // SUB-TAB ANALISIS PRODUK
    html +=
      '<div class="card"><div class="card-header"><div><h3 class="card-title">Analisis Performa Barang</h3></div></div>' +
      '<div class="filter-chips" style="margin-bottom:10px;">' +
      '<button type="button" class="chip-btn ' + (this.activeSection === "terlaris" ? "active" : "") + '" data-rep-sec="terlaris">🔥 Terlaris (' + rep.topSelling.length + ')</button>' +
      '<button type="button" class="chip-btn ' + (this.activeSection === "profit" ? "active" : "") + '" data-rep-sec="profit">💎 Profit Tertinggi (' + rep.topProfit.length + ')</button>' +
      '<button type="button" class="chip-btn ' + (this.activeSection === "tidak_laku" ? "active" : "") + '" data-rep-sec="tidak_laku">🐢 Tidak Laku (' + rep.slowMoving.length + ')</button>' +
      '</div>';

    if (this.activeSection === "terlaris") {
      if (rep.topSelling.length === 0) {
        html += '<p style="color:#94a3b8; font-size:13px; text-align:center; padding:10px 0;">Belum ada penjualan pada periode ini.</p>';
      } else {
        html += '<div style="display:flex; flex-direction:column; gap:8px;">';
        rep.topSelling.forEach((item, idx) => {
          html +=
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#0f172a; border:1px solid #334155; border-radius:10px;">' +
            '<div><strong style="font-size:13px; color:#f8fafc;">#' + (idx + 1) + ' ' + this.esc(item.name) + '</strong>' +
            '<div style="font-size:11px; color:#94a3b8;">Terjual: ' + item.soldPacks + ' bks + ' + item.soldRetail + ' ecer</div></div>' +
            '<div style="text-align:right;"><strong style="color:#10b981; font-size:14px;">' + item.soldSmallestUnits + ' unit</strong>' +
            '<div style="font-size:11px; color:#94a3b8;">Omzet: ' + Utils.formatRupiah(item.realizedRevenue) + '</div></div>' +
            '</div>';
        });
        html += '</div>';
      }
    } else if (this.activeSection === "profit") {
      if (rep.topProfit.length === 0) {
        html += '<p style="color:#94a3b8; font-size:13px; text-align:center; padding:10px 0;">Belum ada keuntungan terealisasi pada periode ini.</p>';
      } else {
        html += '<div style="display:flex; flex-direction:column; gap:8px;">';
        rep.topProfit.forEach((item, idx) => {
          html +=
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#0f172a; border:1px solid #334155; border-radius:10px;">' +
            '<div><strong style="font-size:13px; color:#f8fafc;">#' + (idx + 1) + ' ' + this.esc(item.name) + '</strong>' +
            '<div style="font-size:11px; color:#94a3b8;">Total terjual: ' + item.soldSmallestUnits + ' unit</div></div>' +
            '<div style="text-align:right;"><strong style="color:#34d399; font-size:14px;">+' + Utils.formatRupiah(item.realizedProfit) + '</strong>' +
            '<div style="font-size:11px; color:#94a3b8;">Omzet: ' + Utils.formatRupiah(item.realizedRevenue) + '</div></div>' +
            '</div>';
        });
        html += '</div>';
      }
    } else if (this.activeSection === "tidak_laku") {
      if (rep.slowMoving.length === 0) {
        html += '<p style="color:#34d399; font-size:13px; text-align:center; padding:10px 0;">Semua barang berstok memiliki pergerakan penjualan!</p>';
      } else {
        html += '<div style="display:flex; flex-direction:column; gap:8px;">';
        rep.slowMoving.forEach((item) => {
          const packs = Math.floor(item.stockUnits / item.packSize);
          const loose = item.stockUnits % item.packSize;
          html +=
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#0f172a; border:1px solid #334155; border-radius:10px;">' +
            '<div><strong style="font-size:13px; color:#f8fafc;">' + this.esc(item.name) + '</strong>' +
            '<div style="font-size:11px; color:#f59e0b;">Sisa Stok: ' + packs + ' bks' + (loose > 0 ? ' + ' + loose + ' ecer' : '') + ' (' + item.stockUnits + ' unit)</div></div>' +
            '<div style="text-align:right;"><span style="font-size:11px; color:#94a3b8;">Modal Tertahan</span><br/>' +
            '<strong style="color:#f87171; font-size:13px;">' + Utils.formatRupiah(item.stockCapitalValue) + '</strong></div>' +
            '</div>';
        });
        html += '</div>';
      }
    }

    html += '</div>';
    viewLaporan.innerHTML = html;
    this.bindEvents();
  },

  bindEvents() {
    document.querySelectorAll("[data-rep-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.period = btn.getAttribute("data-rep-period");
        this.render();
      });
    });

    document.querySelectorAll("[data-rep-sec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeSection = btn.getAttribute("data-rep-sec");
        this.render();
      });
    });
  }
};
