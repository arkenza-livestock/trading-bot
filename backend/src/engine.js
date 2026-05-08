async scan() {
  const baslangic = Date.now();
  const settings = this.getSettings();
  this.scanCount++;

  const tf = settings.analysis_timeframe || '4h';
  const minHacim = parseFloat(settings.min_volume || 5000000);
  const maxCoin = parseInt(settings.max_coins || 120);
  const maxPos = parseInt(settings.max_open_positions || 3);
  const realTrading = settings.real_trading === 'true' || settings.real_trading === '1';
  const longEnabled = settings.long_enabled !== 'false';
  const shortEnabled = settings.short_enabled === 'true' || settings.short_enabled === '1';
  const btcRegime = this.btcTrend.regime || 'RANGING';

  console.log('\n' + '='.repeat(50));
  console.log(`[${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}] TARAMA #${this.scanCount}`);
  console.log(`[BTC] Rejim:${btcRegime} | RSI:${(this.btcTrend.rsi||50).toFixed(1)} | TF:${tf}`);
  console.log(`[ISLEM] LONG ${longEnabled?'✅':'❌'} | SHORT ${shortEnabled?'✅':'❌'} | ADAPTIF`);
  console.log('='.repeat(50));

  const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT']);
  let tickers;
  try { tickers = await binance.getAllTickers(); } catch (e) { return; }
  for (const t of tickers) { this.prices[t.symbol] = parseFloat(t.lastPrice); }

  const tumFiltreli = [];
  for (const t of tickers) {
    if (!t.symbol.endsWith('USDT')) continue;
    if (STABLES.has(t.symbol)) continue;
    const hacim = parseFloat(t.quoteVolume) || 0, degisim = parseFloat(t.priceChangePercent) || 0, fiyat = parseFloat(t.lastPrice) || 0;
    if (fiyat <= 0 || hacim < minHacim || degisim <= -15 || degisim >= 15) continue;
    tumFiltreli.push(t);
  }
  tumFiltreli.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
  const filtreli = tumFiltreli.slice(0, maxCoin);
  console.log(filtreli.length + ' coin taranacak\n' + '-'.repeat(50));
  
  // Önceki sinyalleri temizle
  db.prepare("DELETE FROM signals").run();

  // ── TÜM SİNYALLERİ TOPLA ──────────────────────
  const allSignals = [];
  
  for (const ticker of filtreli) {
    try {
      const candles = await binance.getKlines(ticker.symbol, tf, 200);
      if (!candles || candles.length < 100) continue;
      this.candlesData[ticker.symbol] = candles;

      const longSignal = longEnabled ? analysis.analyze(candles, ticker, { btcRegime }) : null;
      const shortSignal = shortEnabled ? shortAnalysis.analyze(candles, ticker, { btcRegime }) : null;

      // LONG sinyali varsa ekle
      if (longSignal && longSignal.sinyal === 'ALIM') {
        allSignals.push({
          symbol: ticker.symbol,
          side: 'LONG',
          signal_type: 'ALIM',
          price: longSignal.fiyat,
          fiyat: longSignal.fiyat,
          score: longSignal.puan,
          trend: longSignal.trend,
          rsi: longSignal.rsi,
          stop_loss: longSignal.stop_loss,
          hedef: longSignal.hedef || 0,
          machineConfidence: longSignal.puan / 100,
          machineReasoning: `${longSignal.passedCount}/${longSignal.totalRules} Kural | ${longSignal.ruleDetails}`,
          passedCount: longSignal.passedCount,
          totalRules: longSignal.totalRules,
          risk: longSignal.risk || 'ORTA',
          pozitif: longSignal.pozitif || [],
          negatif: longSignal.negatif || [],
          ruleDetails: longSignal.ruleDetails || '',
          macdBullish: longSignal.macdBullish || 0
        });
      }

      // SHORT sinyali varsa ekle
      if (shortSignal && shortSignal.sinyal === 'SATIS') {
        allSignals.push({
          symbol: ticker.symbol,
          side: 'SHORT',
          signal_type: 'SATIS',
          price: shortSignal.fiyat,
          fiyat: shortSignal.fiyat,
          score: shortSignal.puan,
          trend: shortSignal.trend,
          rsi: shortSignal.rsi,
          stop_loss: shortSignal.stop_loss,
          hedef: shortSignal.hedef || 0,
          machineConfidence: shortSignal.puan / 100,
          machineReasoning: `${shortSignal.passedCount}/${shortSignal.totalRules} Kural | ${shortSignal.ruleDetails}`,
          passedCount: shortSignal.passedCount,
          totalRules: shortSignal.totalRules,
          risk: shortSignal.risk || 'ORTA',
          pozitif: shortSignal.pozitif || [],
          negatif: shortSignal.negatif || [],
          ruleDetails: shortSignal.ruleDetails || '',
          macdBullish: shortSignal.macdBullish || 0
        });
      }
      
      await new Promise(r => setTimeout(r, 150));
    } catch(e) {}
  }

  // ── PUANA GÖRE SIRALA ──────────────────────────
  allSignals.sort((a, b) => b.score - a.score);

  // ── EN İYİLERİ SEÇ (maxPos kadar) ──────────────
  const selectedSignals = allSignals.slice(0, maxPos);
  let longCount = 0, shortCount = 0;

  // ── TÜM SİNYALLERİ DB'YE KAYDET ────────────────
  for (const sig of allSignals) {
    const isSelected = selectedSignals.some(s => s.symbol === sig.symbol && s.side === sig.side);
    db.prepare('INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(sig.symbol, sig.signal_type, sig.score, sig.risk, sig.fiyat, sig.fiyat,
        sig.rsi, sig.macdBullish || 0, sig.trend,
        JSON.stringify(sig.pozitif || []), JSON.stringify(sig.negatif || []),
        isSelected ? `✅ SECILDI ${sig.passedCount}/${sig.totalRules} Kural | ${sig.ruleDetails}` : `${sig.passedCount}/${sig.totalRules} Kural | ${sig.ruleDetails}`);
  }

  // ── SEÇİLENLERİ SİMÜLASYONA VE GERÇEK ALIMA GÖNDER ──
  const telegram = this.getTelegram();
  
  for (const sig of selectedSignals) {
    if (sig.side === 'LONG') longCount++; else shortCount++;

    const emoji = sig.side === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
    console.log(`[✅ ${emoji}] ${sig.symbol.padEnd(10)} | Puan:${String(sig.score).padStart(3)} | RSI:${sig.rsi.toFixed(1)} | ${sig.passedCount}/${sig.totalRules} Kural`);

    // Simülasyona gönder
    simulation.openPosition(sig, settings, this.btcTrend, this.candlesData);

    // Gerçek alım
    if (realTrading && !this.realPositions[sig.symbol]) {
      const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);
      if (sig.side === 'LONG') {
        const buyResult = await binance.realBuy(sig.symbol, tradeAmount, sig.fiyat);
        if (buyResult) {
          const qty = parseFloat(buyResult.executedQty) || (tradeAmount / sig.fiyat);
          const pos = { symbol: sig.symbol, side: 'LONG', entryPrice: sig.fiyat, quantity: qty, highestPrice: sig.fiyat, lowestPrice: sig.fiyat, stopLoss: sig.stop_loss, entryTime: new Date().toISOString(), machineConfidence: sig.machineConfidence };
          this.realPositions[sig.symbol] = pos;
          this.saveRealPositionToDB(sig.symbol, pos);
        }
      } else if (sig.side === 'SHORT') {
        const sellResult = await binance.realSell(sig.symbol, tradeAmount / sig.fiyat);
        if (sellResult) {
          const qty = parseFloat(sellResult.executedQty) || (tradeAmount / sig.fiyat);
          const pos = { symbol: sig.symbol, side: 'SHORT', entryPrice: sig.fiyat, quantity: qty, highestPrice: sig.fiyat, lowestPrice: sig.fiyat, stopLoss: sig.stop_loss, entryTime: new Date().toISOString(), machineConfidence: sig.machineConfidence };
          this.realPositions[sig.symbol] = pos;
          this.saveRealPositionToDB(sig.symbol, pos);
        }
      }
    }

    if (telegram) {
      telegram.sendMessage(`${emoji} — ${sig.symbol}\n💰 G:${sig.fiyat}\n📊 ${sig.passedCount}/${sig.totalRules} Kural | ${sig.ruleDetails}`).catch(() => {});
    }
  }

  simulation.updatePositions(this.prices, settings, this.candlesData);
  await this.updateRealPositions();
  
  const sure = Date.now() - baslangic;
  const simStats = simulation.getStats();
  this.performance.scans.push({ timestamp: Date.now(), coinsScanned: filtreli.length, signalsFound: selectedSignals.length, machineAccepted: selectedSignals.length, machineRejected: allSignals.length - selectedSignals.length, duration: sure });
  this.performance.signalsGenerated += selectedSignals.length;
  this.performance.signalsAccepted += selectedSignals.length;
  this.performance.signalsRejected += allSignals.length - selectedSignals.length;

  console.log('\n' + '-'.repeat(50));
  console.log(`[TARAMA] ${selectedSignals.length} secildi (${longCount}L/${shortCount}S) | Toplam:${allSignals.length} sinyal | Rejim:${btcRegime}`);
  console.log(`[SIM] Bakiye: ${simStats.balance?.toFixed(2)} | Basari: %${simStats.winRate}`);

  db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found,machine_accepted,machine_rejected) VALUES (?,?,?,?,?,?)')
    .run(filtreli.length, selectedSignals.length, sure, JSON.stringify(selectedSignals.map(s => s.symbol)), selectedSignals.length, allSignals.length - selectedSignals.length);

  if (typeof analysis.saveToDB === 'function') analysis.saveToDB();
  if (typeof shortAnalysis.saveToDB === 'function') shortAnalysis.saveToDB();
}
