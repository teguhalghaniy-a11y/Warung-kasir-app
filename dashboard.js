const DashboardModule = {
  async render() {
    try {
      const [settings, products, batches, transactions, debts, debtPayments] = await Promise.all([
        WarungDB.get("settings", "store_config"),
        WarungDB.getAll("products"),
        WarungDB.getAll("batches"),
        WarungDB.getAll("transactions"),
        WarungDB.getAll("debts"),
        WarungDB.getAll("debt_payments")
      ]);

      const todayStr = Utils.getTodayISO();
      const lowStockLimit = settings && settings.lowStockThreshold ? settings.lowStockThreshold : 5;
      const expWarningDays = settings && settings.expiryWarningDays ? settings.expiryWarningDays : 30;

      // 1. Omzet, Profit, dan Jumlah Transaksi Hari Ini
      let todayOmzet = 0;
      let todayProfit = 0;
      let todayTrxCount = 0;

      transactions.forEach((trx) => {
        if (trx.date === todayStr) {
          todayTrxCount += 1;
          if (trx.paymentType !== "HUTANG") {
            todayOmzet += Number(trx.realizedRevenue || trx.total || 0);
            todayProfit += Number(trx.realizedProfit || trx.profit || 0);
          }
        }
      });

      debtPayments.forEach((pay) => {
        if (pay.date === todayStr) {
          todayOmzet += Number(pay.amount || 0);
          todayProfit += Number(pay.realizedProfit || 0);
        }
      });

      // 2. Piutang Belum Lunas
      let totalUnpaidDebt = 0;
      debts.forEach((debt) => {
        if (debt.status !== "LUNAS") {
          totalUnpaidDebt += Number(debt.remainingAmount || 0);
        }
      });

      // 3. Barang Hampir Habis
      let lowStockCount = 0;
      products.forEach((prod) => {
        const packSize = Number(prod.packSize) || 1;
        const totalSmallestUnits = Number(prod.totalSmallestUnits) || 0;
        const availablePacks = totalSmallestUnits / packSize;
        if (availablePacks <= lowStockLimit) {
          lowStockCount += 1;
        }
      });

      // 4. Barang Mendekati Kedaluwarsa
      let nearExpiryCount = 0;
      const nowTime = new Date(todayStr).getTime();
      const warningMs = expWarningDays * 24 * 60 * 60 * 1000;

      batches.forEach((batch) => {
        if (Number(batch.remainingSmallestUnits) > 0 && batch.expiryDate) {
          const expTime = new Date(batch.expiryDate).getTime();
          if (expTime - nowTime <= warningMs) {
            nearExpiryCount += 1;
          }
        }
      });

      // Update Tampilan Angka Dashboard
      document.getElementById("dash-omzet").textContent = Utils.formatRupiah(todayOmzet);
      document.getElementById("dash-profit").textContent = Utils.formatRupiah(todayProfit);
      document.getElementById("dash-transaksi-count").textContent = `${todayTrxCount} transaksi hari ini`;
      document.getElementById("dash-piutang").textContent = Utils.formatRupiah(totalUnpaidDebt);
      document.getElementById("dash-low-stock").textContent = `${lowStockCount} Barang`;
      document.getElementById("dash-near-exp").textContent = `${nearExpiryCount} Batch`;

      // 5. Grafik 30 Hari Terakhir
      const dailySeries = this.buildLast30DaysSeries(transactions, debtPayments);
      const total30d = dailySeries.reduce((acc, item) => acc + item.revenue, 0);
      document.getElementById("chart-total-30d").textContent = Utils.formatRupiah(total30d);
      this.draw30DayChart("sales-chart-30d", dailySeries);
    } catch (error) {
      console.error("Gagal memuat dashboard:", error);
    }
  },

  buildLast30DaysSeries(transactions, debtPayments) {
    const map = new Map();
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = Utils.getTodayISO(d);
      map.set(iso, {
        date: iso,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        revenue: 0
      });
    }

    transactions.forEach((trx) => {
      if (trx.paymentType !== "HUTANG" && map.has(trx.date)) {
        map.get(trx.date).revenue += Number(trx.realizedRevenue || trx.total || 0);
      }
    });

    debtPayments.forEach((pay) => {
      if (map.has(pay.date)) {
        map.get(pay.date).revenue += Number(pay.amount || 0);
      }
    });

    return Array.from(map.values());
  },

  draw30DayChart(canvasId, series) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width || 300;
    const height = rect.height || 165;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const padTop = 14;
    const padBottom = 24;
    const padLeft = 8;
    const padRight = 8;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    ctx.clearRect(0, 0, width, height);

    // Garis bantu horizontal
    ctx.strokeStyle = "#293856";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 2; g++) {
      const y = padTop + (chartH / 2) * g;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
    }

    const maxVal = Math.max(...series.map((s) => s.revenue), 10000);
    const barSlot = chartW / series.length;
    const barWidth = Math.max(barSlot * 0.58, 3);

    series.forEach((item, index) => {
      const ratio = item.revenue / maxVal;
      const barH = item.revenue > 0 ? Math.max(ratio * chartH, 4) : 2;
      const x = padLeft + index * barSlot + (barSlot - barWidth) / 2;
      const y = padTop + chartH - barH;

      ctx.fillStyle = item.revenue > 0 ? "#10b981" : "#293856";
      ctx.fillRect(x, y, barWidth, barH);

      if (index % 6 === 0 || index === series.length - 1) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(item.label, x + barWidth / 2, height - 6);
      }
    });
  }
};
