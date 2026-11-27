const HutangModule = {
  searchQuery: "",
  statusFilter: "BELUM_LUNAS",
  activePayDebtId: null,
  debtsCache: [],
  storeNameCache: "WARUNG MADURA",

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  formatWaPhone(rawPhone) {
    if (!rawPhone) return "";
    let digits = String(rawPhone).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("0")) {
      digits = "62" + digits.slice(1);
    } else if (digits.startsWith("8")) {
      digits = "62" + digits;
    }
    return digits;
  },

  buildWhatsAppBillingMessage(debt) {
    const storeName = this.storeNameCache || "WARUNG MADURA";
    let itemsLines = "";

    if (debt.transaction && Array.isArray(debt.transaction.items) && debt.transaction.items.length > 0) {
      itemsLines =
        "\n*Rincian Belanja:*\n" +
        debt.transaction.items
          .map(
            (it, idx) =>
              (idx + 1) +
              ". " +
              it.name +
              " (" +
              it.qty +
              " " +
              (it.saleMode === "ECERAN" ? "ecer" : "bks") +
              ") = " +
              Utils.formatRupiah(it.lineNet)
          )
          .join("\n") +
        "\n";
    }

    const dueLine = debt.dueDate ? "\nJatuh Tempo: *" + debt.dueDate + "*" : "";

    return (
      "Halo Kak *" +
      debt.customerName +
      "*,\n" +
      "Kami dari *" +
      storeName +
      "* ingin menginformasikan rincian catatan belanja/hutang Anda:\n\n" +
      "No. Nota: *" +
      debt.invoiceNo +
      "*\n" +
      "Tanggal: " +
      debt.date +
      dueLine +
      itemsLines +
      "\nTotal Belanja: " +
      Utils.formatRupiah(debt.totalDebt) +
      "\nSudah Dibayar: " +
      Utils.formatRupiah(debt.paidAmount) +
      "\n*Sisa Tagihan: " +
      Utils.formatRupiah(debt.remainingAmount) +
      "*\n\n" +
      "Mohon konfirmasinya apabila sudah melakukan pembayaran. Terima kasih banyak 🙏"
    );
  },

  openWhatsAppBilling(debtId) {
    const debt = this.debtsCache.find((d) => d.id === debtId);
    if (!debt) return;

    const message = this.buildWhatsAppBillingMessage(debt);
    const encodedMsg = encodeURIComponent(message);
    const waPhone = this.formatWaPhone(debt.customerPhone);

    let waUrl = "";
    if (waPhone) {
      waUrl = "https://wa.me/" + waPhone + "?text=" + encodedMsg;
    } else {
      const manualPhone = prompt(
        "Nomor HP pelanggan belum diisi. Masukkan nomor WA pelanggan (contoh: 08123456789) atau kosongkan untuk pilih kontak di WA:"
      );
      if (manualPhone === null) return; // Dibatalkan user
      const cleanedManual = this.formatWaPhone(manualPhone);
      if (cleanedManual) {
        // Simpan nomor HP baru ke data hutang agar ke depannya tidak perlu ketik lagi
        WarungDB.get("debts", debt.id).then((rec) => {
          if (rec) {
            rec.customerPhone = manualPhone.trim();
            WarungDB.put("debts", rec);
          }
        });
        waUrl = "https://wa.me/" + cleanedManual + "?text=" + encodedMsg;
      } else {
        waUrl = "https://wa.me/?text=" + encodedMsg;
      }
    }

    window.open(waUrl, "_blank");
  },

  async render() {
    const viewHutang = document.getElementById("view-hutang");
    if (!viewHutang) return;

    const [allDebts, storeConfig] = await Promise.all([
      HutangData.getAllDebtsWithPayments(),
      WarungDB.get("settings", "store_config")
    ]);

    this.debtsCache = allDebts;
    this.storeNameCache = storeConfig && storeConfig.storeName ? storeConfig.storeName : "WARUNG MADURA";

    const unpaidDebts = allDebts.filter((d) => d.status === "BELUM_LUNAS");
    const paidDebts = allDebts.filter((d) => d.status === "LUNAS");

    const totalPiutangAktif = unpaidDebts.reduce((sum, d) => sum + (Number(d.remainingAmount) || 0), 0);
    const totalTerkumpul = allDebts.reduce((sum, d) => sum + (Number(d.paidAmount) || 0), 0);

    const q = this.searchQuery.toLowerCase().trim();
    const filtered = allDebts.filter((d) => {
      const matchStatus = this.statusFilter === "ALL" || d.status === this.statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      return (
        (d.customerName && d.customerName.toLowerCase().includes(q)) ||
        (d.customerPhone && d.customerPhone.toLowerCase().includes(q)) ||
        (d.invoiceNo && d.invoiceNo.toLowerCase().includes(q))
      );
    });

    let html =
      '<div class="stats-grid">' +
      '<div class="stat-card primary"><div class="stat-header"><span class="stat-label">Sisa Piutang Aktif</span><span>📒</span></div>' +
      '<div class="stat-value text-warning">' + Utils.formatRupiah(totalPiutangAktif) + '</div>' +
      '<div class="stat-meta">' + unpaidDebts.length + ' nota belum lunas</div></div>' +
      '<div class="stat-card success"><div class="stat-header"><span class="stat-label">Sudah Dibayar</span><span>✅</span></div>' +
      '<div class="stat-value">' + Utils.formatRupiah(totalTerkumpul) + '</div>' +
      '<div class="stat-meta">' + paidDebts.length + ' nota lunas</div></div>' +
      '</div>';

    html +=
      '<div class="card"><div class="form-stack">' +
      '<input type="text" id="hutang-search-input" class="form-control" placeholder="Cari nama pelanggan, HP, atau no. nota..." value="' + this.esc(this.searchQuery) + '" />' +
      '<div class="filter-chips">' +
      '<button type="button" class="chip-btn ' + (this.statusFilter === "BELUM_LUNAS" ? "active" : "") + '" data-hutang-filter="BELUM_LUNAS">Belum Lunas (' + unpaidDebts.length + ')</button>' +
      '<button type="button" class="chip-btn ' + (this.statusFilter === "LUNAS" ? "active" : "") + '" data-hutang-filter="LUNAS">Sudah Lunas (' + paidDebts.length + ')</button>' +
      '<button type="button" class="chip-btn ' + (this.statusFilter === "ALL" ? "active" : "") + '" data-hutang-filter="ALL">Semua (' + allDebts.length + ')</button>' +
      '</div></div></div>';

    if (filtered.length === 0) {
      html +=
        '<div class="card empty-module-card">' +
        '<h3>Tidak Ada Data Piutang</h3>' +
        '<p>Transaksi hutang yang dicatat dari menu Kasir akan otomatis muncul di sini.</p>' +
        '</div>';
    } else {
      filtered.forEach((d) => {
        const isLunas = d.status === "LUNAS";
        const pctPaid = d.totalDebt > 0 ? Math.min(100, Math.round((d.paidAmount / d.totalDebt) * 100)) : 100;
        const isFormOpen = this.activePayDebtId === d.id && !isLunas;

        let payHistoryHtml = "";
        if (d.payments && d.payments.length > 0) {
          payHistoryHtml = '<div class="batch-section"><div class="batch-section-title">Riwayat Cicilan (' + d.payments.length + 'x):</div>';
          d.payments.forEach((p) => {
            payHistoryHtml +=
              '<div class="batch-item safe">' +
              '<div><strong>' + p.date + '</strong> ' + (p.time || "") + '<br/><span>' + this.esc(p.note) + '</span></div>' +
              '<div class="batch-qty"><strong class="text-accent">+' + Utils.formatRupiah(p.amount) + '</strong><br/><small>Sisa: ' + Utils.formatRupiah(p.remainingAfter) + '</small></div>' +
              '</div>';
          });
          payHistoryHtml += '</div>';
        }

        let payFormHtml = "";
        if (isFormOpen) {
          payFormHtml =
            '<form class="form-stack form-pay-debt" data-debt-id="' + d.id + '" style="margin-top:10px; padding:10px; background:#0f172a; border:1px solid #10b981; border-radius:10px;">' +
            '<div style="font-size:13px; font-weight:600; color:#34d399;">Input Pembayaran Cicilan / Pelunasan</div>' +
            '<div class="form-row">' +
            '<div class="form-group"><label>Nominal Bayar (Rp) *</label>' +
            '<input type="number" name="payAmount" class="form-control" min="1" max="' + d.remainingAmount + '" value="' + d.remainingAmount + '" required /></div>' +
            '<div class="form-group"><label>Tanggal Bayar *</label>' +
            '<input type="date" name="payDate" class="form-control" value="' + Utils.getTodayISO() + '" required /></div>' +
            '</div>' +
            '<div class="form-group"><label>Catatan (Opsional)</label>' +
            '<input type="text" name="payNote" class="form-control" placeholder="Contoh: Cicilan ke-1 / Lunas tunai" /></div>' +
            '<div style="display:flex; gap:8px;">' +
            '<button type="submit" class="btn btn-primary btn-sm" style="flex:1;">Simpan Pembayaran</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" data-cancel-pay="1">Batal</button>' +
            '</div></form>';
        }

        let actionButtonsHtml = "";
        if (!isLunas && !isFormOpen) {
          actionButtonsHtml =
            '<div style="display:flex; gap:8px; margin-top:10px;">' +
            '<button type="button" class="btn btn-primary btn-sm" style="flex:1;" data-open-pay="' + d.id + '">💵 Bayar / Cicil</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" style="flex:1; border-color:#22c55e; color:#4ade80;" data-wa-bill="' + d.id + '">📲 Tagih WA</button>' +
            '</div>';
        }

        html +=
          '<div class="card product-card">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">' +
          '<div><h3 class="product-name">' + this.esc(d.customerName) + '</h3>' +
          '<div class="product-meta">' + d.invoiceNo + ' • Tgl: ' + d.date + (d.customerPhone ? ' • HP: ' + this.esc(d.customerPhone) : '') + '</div>' +
          (d.dueDate && !isLunas ? '<div style="font-size:11px; color:#f59e0b; margin-top:2px;">Jatuh Tempo: ' + d.dueDate + '</div>' : '') +
          '</div>' +
          '<span class="tag-badge ' + (isLunas ? "safe" : "danger") + '">' + (isLunas ? "LUNAS" : "BELUM LUNAS") + '</span>' +
          '</div>' +
          '<div class="stock-summary-box">' +
          '<div style="display:flex; justify-content:space-between; font-size:12px; color:#94a3b8;"><span>Total Hutang:</span><strong>' + Utils.formatRupiah(d.totalDebt) + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; font-size:12px; color:#34d399;"><span>Sudah Dibayar (' + pctPaid + '%):</span><strong>' + Utils.formatRupiah(d.paidAmount) + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; font-size:14px; color:' + (isLunas ? "#10b981" : "#f59e0b") + '; border-top:1px solid #334155; padding-top:6px; margin-top:4px;">' +
          '<span>Sisa Hutang:</span><strong>' + Utils.formatRupiah(d.remainingAmount) + '</strong></div>' +
          '</div>' +
          payHistoryHtml +
          payFormHtml +
          actionButtonsHtml +
          '</div>';
      });
    }

    viewHutang.innerHTML = html;
    this.bindEvents();
  },

  bindEvents() {
    const searchInp = document.getElementById("hutang-search-input");
    if (searchInp) {
      searchInp.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        this.render();
      });
    }

    document.querySelectorAll("[data-hutang-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.statusFilter = btn.getAttribute("data-hutang-filter");
        this.render();
      });
    });

    document.querySelectorAll("[data-open-pay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activePayDebtId = btn.getAttribute("data-open-pay");
        this.render();
      });
    });

    document.querySelectorAll("[data-wa-bill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.openWhatsAppBilling(btn.getAttribute("data-wa-bill"));
      });
    });

    document.querySelectorAll("[data-cancel-pay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activePayDebtId = null;
        this.render();
      });
    });

    document.querySelectorAll(".form-pay-debt").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const debtId = form.getAttribute("data-debt-id");
        const payAmount = form.querySelector('[name="payAmount"]').value;
        const payDate = form.querySelector('[name="payDate"]').value;
        const payNote = form.querySelector('[name="payNote"]').value;

        try {
          const res = await HutangData.recordInstallment(debtId, payAmount, payDate, payNote);
          this.activePayDebtId = null;
          Utils.showToast(res.isFullSettlement ? "Hutang berhasil dilunasi!" : "Cicilan berhasil dicatat!");
          await this.render();
          await DashboardModule.render();
        } catch (err) {
          Utils.showToast(err.message, "danger");
        }
      });
    });
  }
};
