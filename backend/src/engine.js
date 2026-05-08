const binance    = require('./binance');
const analysis   = require('./analysis');          // LONG motoru
const shortAnalysis = require('./shortAnalysis');  // SHORT motoru
const db         = require('./database');
const simulation = require('./simulation');
const TelegramService = require('./telegram');

class TradingEngine {
  constructor() {
    this.running   = false;
    this.interval  = null;
    this.priceInterval = null;
    this.btcTrend  = { trend:'BELIRSIZ', rsi:50, lastUpdate:0, regime:'RANGING' };
    this.scanCount = 0;
    this.prices    = {};
    this.candlesData = {};
    this.learningManager = null;
    this.performance = { scans: [], signalsGenerated: 0, signalsAccepted: 0, signalsRejected: 0, rejectionReasons: {} };
    this.realPositions = {};
  }

  getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return settings;
  }

  getTelegram() {
    const s = this.getSettings();
    if (!s.telegram_token || !s.telegram_chat_id) return null;
    return new TelegramService(s.telegram_token, s.telegram_chat_id);
  }

  loadRealPositionsFromDB() {
    try {
      const rows = db.prepare('SELECT * FROM real_positions').all();
      for (const row of rows) {
        this.realPositions[row.symbol] = {
          symbol: row.symbol, side: row.side || 'LONG',
          entryPrice: row.entry_price, quantity: row.quantity,
          highestPrice: row.highest_price || row.entry_price,
          lowestPrice: row.lowest_price || row.entry_price,
          stopLoss: row.stop_loss, entryTime: row.entry_time,
          machineConfidence: row.machine_confidence || 0
        };
      }
      if (rows.length > 0) console.log(`[GERCEK] ✅ ${rows.length} pozisyon yuklendi`);
    } catch(e) {}
  }

  saveRealPositionToDB(symbol, pos) {
    try {
      db.prepare(`INSERT OR REPLACE INTO real_positions (symbol, side, quantity, entry_price, highest_price, lowest_price, stop_loss, entry_time, machine_confidence) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(symbol, pos.side, pos.quantity, pos.entryPrice, pos.highestPrice, pos.lowestPrice, pos.stopLoss, pos.entryTime, pos.machineConfidence || 0);
    } catch(e) {}
  }

  deleteRealPositionFromDB(symbol) {
    try { db.prepare('DELETE FROM real_positions WHERE symbol=?').run(symbol); } catch(e) {}
  }

  async fetchPricesForOpenPositions() {
    const symbolsToCheck = new Set();
    const simOpen = db.prepare("SELECT DISTINCT symbol FROM sim_positions WHERE status='OPEN'").all();
    simOpen.forEach(p => symbolsToCheck.add(p.symbol));
    Object.keys(this.realPositions).forEach(s => symbolsToCheck.add(s));
    if (symbolsToCheck.size === 0) return;
    try {
      const tickers = await binance.getAllTickers();
      if (!tickers) return;
      for (const t of tickers) {
        if (symbolsToCheck.has(t.symbol)) this.prices[t.symbol] = parseFloat(t.lastPrice);
      }
    } catch(e) {}
  }

  async checkPositionsQuick() {
    await this.fetchPricesForOpenPositions();
    simulation.updatePositions(this.prices, this.getSettings(), this.candlesData);
    if (Object.keys(this.realPositions).length > 0) await this.updateRealPositions();
  }

  // ═══════════════════════════════════════════
  // BTC TREND + PİYASA REJİMİ DEDEKTÖRÜ
  // ═══════════════════════════════════════════
  async updateBTCTrend() {
    try {
      const candles = await binance.getKlines('BTCUSDT', '4h', 200);
      if (!candles || candles.length < 100) return;
      this.candlesData['BTCUSDT'] = candles;
      const closes = candles.map(c => parseFloat(c[4]));
      const highs  = candles.map(c => parseFloat(c[2]));
      const lows   = candles.map(c => parseFloat(c[3]));
      const volumes = candles.map(c => parseFloat(c[5]));
      const fiyat = closes[closes.length - 1];

      const rsi   = analysis.calcRSI ? analysis.calcRSI(closes, 14) : 50;
      const ema21 = analysis.calcEMA ? analysis.calcEMA(closes, 21) : fiyat;
      const ema50 = analysis.calcEMA ? analysis.calcEMA(closes, 50) : fiyat;
      const adx = analysis.calcADX ? analysis.calcADX(highs, lows, closes, 14) : { adx: 0, diPlus: 0, diMinus: 0 };
      const atr14 = analysis.calcATR ? analysis.calcATR(highs, lows, closes, 14) : 0;
      const avgATR = atr14 > 0 && closes.length >= 14
        ? closes.slice(-14).map((_, i) => {
            const h = highs.slice(-14)[i], l = lows.slice(-14)[i], c = closes.slice(-14)[i];
            return Math.max(h-l, Math.abs(h-c), Math.abs(l-c));
          }).reduce((a,b) => a+b, 0) / 14
        : atr14;

      // Trend tespiti
      let trend = 'NOTR';
      if (fiyat > ema21 && ema21 > ema50) trend = 'YUKARI';
      else if (fiyat > ema21) trend = 'HAFIF_YUKARI';
      else if (fiyat < ema21 && ema21 < ema50) trend = 'ASAGI';
      else if (fiyat < ema21) trend = 'HAFIF_ASAGI';

      // Rejim tespiti (RALLY, RANGING, DOWNTREND, VOLATILE)
      let regime = 'RANGING';
      if (trend === 'YUKARI' && adx.adx > 25 && adx.diPlus > adx.diMinus && fiyat > ema50) {
        regime = 'RALLY';
      } else if ((trend === 'ASAGI' || trend === 'HAFIF_ASAGI') && adx.adx > 25 && adx.diMinus > adx.diPlus && fiyat < ema50) {
        regime = 'DOWNTREND';
      } else if (adx.adx < 20) {
        regime = 'RANGING';
      }

      // Volatilite kontrolü (haber filtresi)
      const volumeSpike = volumes.length >= 20
        ? volumes[volumes.length-1] > (volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20) * 3
        : false;
      if (atr14 > avgATR * 2 || volumeSpike) {
        regime = 'VOLATILE';
      }

      this.btcTrend = { trend, rsi, fiyat, strength: adx.adx, regime, lastUpdate: Date.now() };
      console.log(`[BTC] ${trend} | RSI:${rsi.toFixed(1)} | ADX:${adx.adx.toFixed(1)} | Rejim:${regime} | $${fiyat.toFixed(0)}`);
    } catch(e) { console.error('[BTC] Trend hatasi:', e.message); }
  }

  async updateRealPositions() {
    const settings = this.getSettings();
    const trailingPct = parseFloat(settings.trailing_stop_percent || 0.5) / 100;
    const minProfitPct = parseFloat(settings.min_profit_percent || 1.5) / 100;
    const hardStopPct = parseFloat(settings.stop_loss_percent || 2.0) / 100;
    const telegram = this.getTelegram();

    for (const symbol of Object.keys(this.realPositions)) {
      const pos = this.realPositions[symbol];
      const currentPrice = this.prices[symbol];
      if (!currentPrice) continue;

      if (pos.side === 'LONG') {
        if (currentPrice > pos.highestPrice) { pos.highestPrice = currentPrice; this.saveRealPositionToDB(symbol, pos); }
        const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const hardStop = pos.entryPrice * (1 - hardStopPct);
        const trailingStop = pos.highestPrice * (1 - trailingPct);
        let sellReason = null;
        if (currentPrice <= hardStop) sellReason = 'STOP_LOSS';
        else if (pnlPct >= minProfitPct * 100 && currentPrice <= trailingStop) sellReason = 'TRAILING_STOP';
        if (sellReason) await this.executeRealSell(pos, currentPrice, sellReason, telegram);
      } else if (pos.side === 'SHORT') {
        if (currentPrice < pos.lowestPrice) { pos.lowestPrice = currentPrice; this.saveRealPositionToDB(symbol, pos); }
        const pnlPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
        const hardStop = pos.entryPrice * (1 + hardStopPct);
        const trailingStop = pos.lowestPrice * (1 + trailingPct);
        let buyReason = null;
        if (currentPrice >= hardStop) buyReason = 'STOP_LOSS';
        else if (pnlPct >= minProfitPct * 100 && currentPrice >= trailingStop) buyReason = 'TRAILING_STOP';
        if (buyReason) await this.executeRealBuyToClose(pos, currentPrice, buyReason, telegram);
      }
    }
  }

  async executeRealSell(pos, currentPrice, reason, telegram) {
    try {
      await binance.realSell(pos.symbol, pos.quantity);
      if (telegram) {
        const netPnl = (currentPrice - pos.entryPrice) * pos.quantity;
        const netPnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const emoji = netPnl >= 0 ? '✅ KAR' : '❌ ZARAR';
        telegram.sendMessage(`${emoji} — ${pos.symbol}\n💰 G:${pos.entryPrice.toFixed(6)} C:${currentPrice.toFixed(6)}\n${netPnl >= 0 ? '+' : ''}${netPnlPct.toFixed(2)}% | ${reason}`).catch(() => {});
      }
      this.deleteRealPositionFromDB(pos.symbol);
      delete this.realPositions[pos.symbol];
    } catch(e) {}
  }

  async executeRealBuyToClose(pos, currentPrice, reason, telegram) {
    try {
      await binance.realBuy(pos.symbol, pos.quantity * pos.entryPrice, currentPrice);
      if (telegram) {
        const netPnl = (pos.entryPrice - currentPrice) * pos.quantity;
        const netPnlPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
        const emoji = netPnl >= 0 ? '✅ KAR' : '❌ ZARAR';
        telegram.sendMessage(`${emoji} — ${pos.symbol}\n💰 G:${pos.entryPrice.toFixed(6)} C:${currentPrice.toFixed(6)}\n${netPnl >= 0 ? '+' : ''}${netPnlPct.toFixed(2)}% | ${reason}`).catch(() => {});
      }
      this.deleteRealPositionFromDB(pos.symbol);
      delete this.realPositions[pos.symbol];
    } catch(e) {}
  }

  // ═══════════════════════════════════════════
  // ANA TARAMA (ÇİFT MOTORLU)
  // ═══════════════════════════════════════════
  async scan() {
    const baslangic = Date.now();
    const settings  = this.getSettings();
    this.scanCount++;

    const minHacim = parseFloat(settings.min_volume || 5000000);
    const maxCoin  = parseInt(settings.max_coins || 120);
    const realTrading = settings.real_trading === 'true' || settings.real_trading === '1';
    const longEnabled = settings.long_enabled !== 'false';
    const shortEnabled = settings.short_enabled === 'true' || settings.short_enabled === '1';
    const btcRegime = this.btcTrend.regime || 'RANGING';

    console.log('\n' + '='.repeat(50));
    console.log(`[${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}] TARAMA #${this.scanCount}`);
    console.log(`[BTC] Rejim:${btcRegime} | RSI:${(this.btcTrend.rsi||50).toFixed(1)}`);
    console.log(`[ISLEM] LONG ${longEnabled?'✅':'❌'} | SHORT ${shortEnabled?'✅':'❌'} | ADAPTIF CIFT MOTOR`);
    console.log('='.repeat(50));

    const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT']);
    let tickers;
    try { tickers = await binance.getAllTickers(); } catch(e) { return; }
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
    db.prepare("DELETE FROM signals").run();

    let longCount = 0, shortCount = 0, machineAccepted = 0, machineRejected = 0;
    const signalsFound = [], rejectionReasons = {};
    const telegram = this.getTelegram();

    for (const ticker of filtreli) {
      try {
        const candles4H = await binance.getKlines(ticker.symbol, '4h', 200);
        if (!candles4H || candles4H.length < 100) continue;
        this.candlesData[ticker.symbol] = candles4H;

        // ── LONG ANALİZİ ──
        let longSignal = null;
        if (longEnabled) {
          longSignal = analysis.analyze(candles4H, ticker, { btcRegime });
        }

        // ── SHORT ANALİZİ ──
        let shortSignal = null;
        if (shortEnabled) {
          shortSignal = shortAnalysis.analyze(candles4H, ticker, { btcRegime });
        }

        // ── Karar ve birleştirme ──
        let selectedSignal = null;
        let side = null;

        // İkisi de varsa puanı yüksek olanı seç
        if (longSignal && longSignal.sinyal === 'ALIM' && shortSignal && shortSignal.sinyal === 'SATIS') {
          if (longSignal.puan >= shortSignal.puan) {
            selectedSignal = longSignal; side = 'LONG';
          } else {
            selectedSignal = shortSignal; side = 'SHORT';
          }
        } else if (longSignal && longSignal.sinyal === 'ALIM') {
          selectedSignal = longSignal; side = 'LONG';
        } else if (shortSignal && shortSignal.sinyal === 'SATIS') {
          selectedSignal = shortSignal; side = 'SHORT';
        }

        if (selectedSignal && side) {
          machineAccepted++;
          if (side === 'LONG') longCount++; else shortCount++;
          signalsFound.push(ticker.symbol);

          const emoji = side === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
          console.log(`[✅ ${emoji}] ${ticker.symbol.padEnd(10)} | ${selectedSignal.passedCount}/${selectedSignal.totalRules} Kural | Puan:${String(selectedSignal.puan).padStart(3)} | Rejim:${btcRegime}`);

          // ── Simülasyona gönder ──
          simulation.openPosition({
            symbol: ticker.symbol, side,
            signal_type: side === 'LONG' ? 'ALIM' : 'SATIS',
            price: selectedSignal.fiyat, fiyat: selectedSignal.fiyat,
            score: selectedSignal.puan, trend: selectedSignal.trend,
            stop_loss: selectedSignal.stop_loss, stopLoss: selectedSignal.stop_loss,
            target: selectedSignal.hedef || 0,
            machineConfidence: selectedSignal.puan / 100,
            machineReasoning: `${selectedSignal.passedCount}/${selectedSignal.totalRules} Kural | ${selectedSignal.ruleDetails}`,
            passedCount: selectedSignal.passedCount,
            totalRules: selectedSignal.totalRules
          }, settings, this.btcTrend, this.candlesData);

          // ── Gerçek alım ──
          if (realTrading && !this.realPositions[ticker.symbol]) {
            const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);
            if (side === 'LONG') {
              const buyResult = await binance.realBuy(ticker.symbol, tradeAmount, selectedSignal.fiyat);
              if (buyResult) {
                const qty = parseFloat(buyResult.executedQty) || (tradeAmount / selectedSignal.fiyat);
                const pos = { symbol: ticker.symbol, side: 'LONG', entryPrice: selectedSignal.fiyat, quantity: qty, highestPrice: selectedSignal.fiyat, lowestPrice: selectedSignal.fiyat, stopLoss: selectedSignal.stop_loss, entryTime: new Date().toISOString(), machineConfidence: selectedSignal.puan / 100 };
                this.realPositions[ticker.symbol] = pos;
                this.saveRealPositionToDB(ticker.symbol, pos);
              }
            } else if (side === 'SHORT') {
              const sellResult = await binance.realSell(ticker.symbol, tradeAmount / selectedSignal.fiyat);
              if (sellResult) {
                const qty = parseFloat(sellResult.executedQty) || (tradeAmount / selectedSignal.fiyat);
                const pos = { symbol: ticker.symbol, side: 'SHORT', entryPrice: selectedSignal.fiyat, quantity: qty, highestPrice: selectedSignal.fiyat, lowestPrice: selectedSignal.fiyat, stopLoss: selectedSignal.stop_loss, entryTime: new Date().toISOString(), machineConfidence: selectedSignal.puan / 100 };
                this.realPositions[ticker.symbol] = pos;
                this.saveRealPositionToDB(ticker.symbol, pos);
              }
            }
          }

          if (telegram) {
            telegram.sendMessage(`${emoji} — ${ticker.symbol}\n💰 G:${selectedSignal.fiyat}\n📊 ${selectedSignal.passedCount}/${selectedSignal.totalRules} Kural | ${selectedSignal.ruleDetails}`).catch(() => {});
          }

          // Sinyali DB'ye kaydet
          const finalScore = selectedSignal.puan;
          const sinyalTipi = side === 'LONG' ? 'ALIM' : 'SATIS';
          const risk = selectedSignal.risk || 'ORTA';
          db.prepare('INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(ticker.symbol, sinyalTipi, finalScore, risk, selectedSignal.fiyat, selectedSignal.fiyat,
              selectedSignal.rsi, selectedSignal.macdBullish || 0, selectedSignal.trend,
              JSON.stringify(selectedSignal.pozitif || []), JSON.stringify(selectedSignal.negatif || []),
              `✅ ${selectedSignal.passedCount}/${selectedSignal.totalRules} Kural | ${selectedSignal.ruleDetails}`);
        } else {
          machineRejected++;
          // Reddedilme nedenini kaydet
          if (longSignal && longSignal.sinyal !== 'ALIM' && shortSignal && shortSignal.sinyal !== 'SATIS') {
            rejectionReasons['KURAL_YETERSIZ'] = (rejectionReasons['KURAL_YETERSIZ'] || 0) + 1;
          }
        }
        await new Promise(r => setTimeout(r, 150));
      } catch(e) {}
    }

    simulation.updatePositions(this.prices, settings, this.candlesData);
    await this.updateRealPositions();
    const sure = Date.now() - baslangic;
    const simStats = simulation.getStats();
    this.performance.scans.push({ timestamp: Date.now(), coinsScanned: filtreli.length, signalsFound: signalsFound.length, machineAccepted, machineRejected, duration: sure });
    this.performance.signalsGenerated += signalsFound.length;
    this.performance.signalsAccepted += machineAccepted;
    this.performance.signalsRejected += machineRejected;

    console.log('\n' + '-'.repeat(50));
    console.log(`[TARAMA] ${signalsFound.length} sinyal (${longCount}L/${shortCount}S) | ✅${machineAccepted} ❌${machineRejected} | Rejim:${btcRegime}`);
    console.log(`[SIM] Bakiye: ${simStats.balance?.toFixed(2)} | Basari: %${simStats.winRate}`);

    db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found,machine_accepted,machine_rejected) VALUES (?,?,?,?,?,?)')
      .run(filtreli.length, signalsFound.length, sure, JSON.stringify(signalsFound), machineAccepted, machineRejected);

    // Ağırlıkları kaydet
    if (typeof analysis.saveToDB === 'function') analysis.saveToDB();
    if (typeof shortAnalysis.saveToDB === 'function') shortAnalysis.saveToDB();
  }

  // ═══════════════════════════════════════════
  // BAŞLAT
  // ═══════════════════════════════════════════
  async start() {
    if (this.running) return;
    this.running = true;
    console.log('╔══════════════════════════════════════╗');
    console.log('║   TRADING BOT – ADAPTIF CIFT MOTOR  ║');
    console.log('╚══════════════════════════════════════╝');
    await this.updateBTCTrend();
    this.loadRealPositionsFromDB();

    const self = this;
    this.priceInterval = setInterval(async () => { await self.checkPositionsQuick(); }, 3000);
    await this.scan();
    const intervalMin = parseInt(this.getSettings().scan_interval || 20);
    this.interval = setInterval(async () => { await self.updateBTCTrend(); await self.scan(); }, intervalMin * 60 * 1000);

    console.log(`[BOT] Her ${intervalMin}dk tarama | Adaptif Cift Motor | Rejim:${this.btcTrend.regime}`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.priceInterval) clearInterval(this.priceInterval);
    this.running = false;
  }

  getMachineReport() {
    const simStats = simulation.getStats();
    return { bot: { running: this.running, scanCount: this.scanCount, btcTrend: this.btcTrend }, simulation: { balance: simStats.balance, winRate: simStats.winRate } };
  }
}

module.exports = new TradingEngine();
