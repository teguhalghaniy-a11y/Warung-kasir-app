const HutangData = {
  async getAllDebtsWithPayments() {
    const [debts, payments, transactions] = await Promise.all([
      WarungDB.getAll("debts"),
      WarungDB.getAll("debt_payments"),
      WarungDB.getAll("transactions")
    ]);

    const trxMap = new Map(transactions.map((t) => [t.id, t]));
    const payByDebt = {};

    payments.forEach((p) => {
      if (!payByDebt[p.debtId]) payByDebt[p.debtId] = [];
      payByDebt[p.debtId].push(p);
    });

    const enriched = debts.map((d) => {
      const listPay = (payByDebt[d.id] || []).sort((a, b) =>
        (b.date + " " + b.time).localeCompare(a.date + " " + a.time)
      );
      return Object.assign({}, d, {
        payments: listPay,
        transaction: trxMap.get(d.transactionId) || null
      });
    });

    enriched.sort((a, b) => {
      if (a.status !== b.status) return a.status === "BELUM_LUNAS" ? -1 : 1;
      return (b.date || "").localeCompare(a.date || "");
    });

    return enriched;
  },

  async recordInstallment(debtId, payAmount, payDate, note) {
    const debt = await WarungDB.get("debts", debtId);
    if (!debt) throw new Error("Data hutang tidak ditemukan.");

    const remaining = Math.max(0, Number(debt.remainingAmount) || 0);
    if (remaining <= 0) throw new Error("Hutang ini sudah lunas.");

    const amount = Math.round(Number(payAmount) || 0);
    if (amount <= 0) throw new Error("Nominal pembayaran harus lebih dari Rp0.");
    if (amount > remaining) {
      throw new Error("Nominal bayar melebihi sisa hutang (" + Utils.formatRupiah(remaining) + ").");
    }

    const totalDebt = Math.max(1, Number(debt.totalDebt) || 1);
    const totalProfit = Number(debt.totalProfit) || 0;
    const prevPaid = Number(debt.paidAmount) || 0;
    const newPaid = prevPaid + amount;
    const newRemaining = Math.max(0, totalDebt - newPaid);
    const isNowLunas = newRemaining === 0;

    // Hitung realisasi omzet & laba bersih secara proporsional terhadap total hutang
    const prevRealizedProfit = Number(debt.realizedProfit) || 0;
    const targetCumulativeProfit = isNowLunas
      ? totalProfit
      : Math.round((newPaid / totalDebt) * totalProfit);
    const realizedProfitDelta = targetCumulativeProfit - prevRealizedProfit;

    const dateStr = payDate || Utils.getTodayISO();
    const timeStr = Utils.getCurrentTimeStr();

    // 1. Simpan catatan cicilan ke store debt_payments
    const paymentRecord = {
      id: Utils.generateId("PAY"),
      debtId: debt.id,
      transactionId: debt.transactionId,
      invoiceNo: debt.invoiceNo,
      customerName: debt.customerName,
      date: dateStr,
      time: timeStr,
      amount: amount,
      realizedProfitDelta: realizedProfitDelta,
      remainingAfter: newRemaining,
      isFullSettlement: isNowLunas,
      note: String(note || "").trim() || (isNowLunas ? "Pelunasan hutang" : "Pembayaran cicilan")
    };
    await WarungDB.put("debt_payments", paymentRecord);

    // 2. Perbarui record di store debts
    debt.paidAmount = newPaid;
    debt.remainingAmount = newRemaining;
    debt.realizedRevenue = newPaid;
    debt.realizedProfit = targetCumulativeProfit;
    debt.status = isNowLunas ? "LUNAS" : "BELUM_LUNAS";
    debt.lastPaymentDate = dateStr;
    await WarungDB.put("debts", debt);

    // 3. Sinkronkan ke record transaksi asal agar Dashboard & Laporan otomatis ter-update
    const trx = await WarungDB.get("transactions", debt.transactionId);
    if (trx) {
      trx.paidAmount = newPaid;
      trx.remainingDebt = newRemaining;
      trx.realizedRevenue = newPaid;
      trx.realizedProfit = targetCumulativeProfit;
      trx.status = isNowLunas ? "LUNAS" : "BELUM_LUNAS";
      await WarungDB.put("transactions", trx);
    }

    return paymentRecord;
  }
};
