const binance    = require('./binance');
const analysis   = require('./analysis');
const db         = require('./database');
const simulation = require('./simulation');
const MachineDecisionEngine = require('./MachineDecisionEngine');
const TelegramService = require('./telegram');

class TradingEngine {
  constructor() {
    this.running   = false;
    this.interval  = null;
    this.priceInterval = null;
    this.btcTrend  = { trend:'BELIRSIZ', rsi:50, lastUpdate:0 };
    this.scanCount = 0;
    this.prices    = {};
    this.machine = new MachineDecisionEngine();
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

  async updateBTCTrend() {
    try {
      const candles = await binance.getKlines('BTCUSDT', '4h', 200);
      if (!candles || candles.length < 100) return;
      this.candlesData['BTCUSDT'] = candles;
      const closes = candles.map(c => parseFloat(c[4]));
      const highs  = candles.map(c => parseFloat(c[2]));
      const lows   = candles.map(c => parseFloat(c[3]));
      const rsi   = analysis.hesaplaRSI(closes, 14);
      const ema21 = analysis.hesaplaEMA(closes, 21);
      const ema50 = analysis.hesaplaEMA(closes, 50);
      const fiyat = closes[closes.length - 1];
      let trend = 'NOTR';
      if (fiyat > ema21 && ema21 > ema50) trend = 'YUKARI';
      else if (fiyat > ema21) trend = 'HAFIF_YUKARI';
      else if (fiyat < ema21 && ema21 < ema50) trend = 'ASAGI';
      else if (fiyat < ema21) trend = 'HAFIF_ASAGI';
      const adx = analysis.hesaplaADX ? analysis.hesaplaADX(highs, lows, closes, 14) : { adx: 0 };
      this.btcTrend = { trend, rsi, fiyat, strength: adx.adx || 0, lastUpdate: Date.now() };
      console.log(`[BTC] ${trend} | RSI:${rsi.toFixed(1)} | ADX:${(adx.adx||0).toFixed(1)} | $${fiyat.toFixed(0)}`);
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
        if (buyReason) await this.executeRealBuy(pos, currentPrice, buyReason, telegram);
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
        const pnlIsaret = netPnl >= 0 ? '+' : '';
        telegram.sendMessage(`${emoji} — ${pos.symbol}\n━━━━━━━━━━━━━━━━━━\n💰 Giris: ${pos.entryPrice.toFixed(6)}\n💰 Cikis: ${currentPrice.toFixed(6)}\n${netPnl >= 0 ? '📈 Kar' : '📉 Zarar'}: ${pnlIsaret}%${netPnlPct.toFixed(2)} (${pnlIsaret}${netPnl.toFixed(4)} USDT)\n🛑 Neden: ${reason}\n🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`).catch(() => {});
      }
      this.deleteRealPositionFromDB(pos.symbol);
      delete this.realPositions[pos.symbol];
    } catch(e) { console.error(`[GERCEK] ${pos.symbol} satis hatasi:`, e.message); }
  }

  async executeRealBuy(pos, currentPrice, reason, telegram) {
    try {
      await binance.realBuy(pos.symbol, pos.quantity * pos.entryPrice, currentPrice);
      if (telegram) {
        const netPnl = (pos.entryPrice - currentPrice) * pos.quantity;
        const netPnlPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
        const emoji = netPnl >= 0 ? '✅ KAR' : '❌ ZARAR';
        const pnlIsaret = netPnl >= 0 ? '+' : '';
        telegram.sendMessage(`${emoji} — ${pos.symbol}\n━━━━━━━━━━━━━━━━━━\n💰 Giris: ${pos.entryPrice.toFixed(6)}\n💰 Cikis: ${currentPrice.toFixed(6)}\n${netPnl >= 0 ? '📈 Kar' : '📉 Zarar'}: ${pnlIsaret}%${netPnlPct.toFixed(2)} (${pnlIsaret}${netPnl.toFixed(4)} USDT)\n🛑 Neden: ${reason}\n🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`).catch(() => {});
      }
      this.deleteRealPositionFromDB(pos.symbol);
      delete this.realPositions[pos.symbol];
    } catch(e) { console.error(`[GERCEK] ${pos.symbol} alis hatasi:`, e.message); }
  }

  async scan() {
    const baslangic = Date.now();
    const settings  = this.getSettings();
    this.scanCount++;

    // 🔥 AGRESIF MOD: Daha düşük eşikler
    const minHacim = parseFloat(settings.min_volume || 5000000);
    const maxCoin  = parseInt(settings.max_coins || 100);
    const realTrading = settings.real_trading === 'true' || settings.real_trading === '1';
    const longEnabled = settings.long_enabled === 'true' || settings.long_enabled === '1' || settings.long_enabled === undefined;
    const shortEnabled = settings.short_enabled === 'true' || settings.short_enabled === '1';
    const shortConfMin = parseFloat(settings.short_confidence_min || 0.80);
    const btcDown = this.btcTrend.trend === 'ASAGI' || this.btcTrend.trend === 'HAFIF_ASAGI';

    console.log('\n' + '='.repeat(50));
    console.log(`[${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}] TARAMA #${this.scanCount}`);
    console.log(`[BTC] ${this.btcTrend.trend} | RSI:${(this.btcTrend.rsi||50).toFixed(1)} | Guc:${(this.btcTrend.strength||0).toFixed(1)}`);
    console.log(`[ISLEM] LONG ${longEnabled?'✅':'❌'} | SHORT ${shortEnabled&&btcDown?'✅':'❌'}${realTrading ? ' | GERCEK ✅' : ''} | AGRESIF MOD`);
    console.log('='.repeat(50));

    const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT']);

    let tickers;
    try { tickers = await binance.getAllTickers(); } catch(e) { console.error('[TARAMA] Ticker hatasi:', e.message); return; }
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
    let errorCount = 0;

    for (const ticker of filtreli) {
      try {
        const candles4H = await binance.getKlines(ticker.symbol, '4h', 200);
        if (!candles4H || candles4H.length < 100) continue;
        this.candlesData[ticker.symbol] = candles4H;
        const result = analysis.analyze(candles4H, ticker);
        if (!result) continue;
        const machineAnalysis = this.machine.analyze(candles4H, { symbol: ticker.symbol, priceChangePercent: ticker.priceChangePercent || 0, quoteVolume: ticker.quoteVolume || 0 });

        let sinyalTipi = 'BEKLE', side = null, finalScore = result.puan || 0, machineOnay = false, rejectReason = '';

        // AGRESIF ESIKLER: %50 güven, 15 puan
        if (machineAnalysis.action === 'BUY' && machineAnalysis.confidence >= 0.50 && longEnabled) {
          if (finalScore >= 15) { sinyalTipi = 'ALIM'; side = 'LONG'; machineOnay = true; }
          else { rejectReason = 'DUSUK_PUAN'; }
        } else if (machineAnalysis.action === 'SELL' && shortEnabled && machineAnalysis.confidence >= shortConfMin && btcDown) {
          if (finalScore >= 15) { sinyalTipi = 'SATIS'; side = 'SHORT'; machineOnay = true; }
          else { rejectReason = 'DUSUK_PUAN'; }
        } else if (machineAnalysis.confidence < 0.50) {
          rejectReason = 'DUSUK_GUVEN';
        } else if (machineAnalysis.action === 'WAIT') {
          rejectReason = 'MAKINE_BEKLE_DEDI';
        }

        if (machineOnay) { machineAccepted++; if (side === 'LONG') longCount++; else shortCount++; }
        else if (rejectReason) { machineRejected++; rejectionReasons[rejectReason] = (rejectionReasons[rejectReason] || 0) + 1; }

        const risk = machineOnay ? (machineAnalysis.confidence >= 0.70 ? 'DUSUK' : machineAnalysis.confidence >= 0.60 ? 'ORTA' : 'YUKSEK') : 'YUKSEK';

        db.prepare('INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(ticker.symbol, sinyalTipi, finalScore, risk, result.fiyat, result.fiyat, result.rsi, result.macdBullish ? 1 : 0, result.trend,
            JSON.stringify(result.pozitif || []), JSON.stringify(result.negatif || []),
            machineOnay ? `✅ Makine ONAYLI (${side}) | %${(machineAnalysis.confidence*100).toFixed(1)} | ${machineAnalysis.reasoning}` : `❌ ${rejectReason}`);

        if (machineOnay && side) {
          signalsFound.push(ticker.symbol);
          const emoji = side === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
          console.log(`[✅ ${emoji}] ${ticker.symbol.padEnd(10)} | Puan:${String(finalScore).padStart(3)} | RSI:${result.rsi.toFixed(1)} | AI:%${(machineAnalysis.confidence*100).toFixed(0)} | Desen:${machineAnalysis.similarPatternsFound || 0} | ${result.trend}`);

          simulation.openPosition({
            symbol: ticker.symbol, side, signal_type: sinyalTipi,
            price: result.fiyat, fiyat: result.fiyat, score: finalScore, trend: result.trend,
            stop_loss: machineAnalysis.stopLoss || result.stop_loss,
            stopLoss: machineAnalysis.stopLoss || result.stop_loss, target: 0,
            machineConfidence: machineAnalysis.confidence, machineReasoning: machineAnalysis.reasoning,
            similarPatternsFound: machineAnalysis.similarPatternsFound
          }, settings, this.btcTrend, this.candlesData);

          if (realTrading && !this.realPositions[ticker.symbol]) {
            const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);
            if (side === 'LONG') {
              const buyResult = await binance.realBuy(ticker.symbol, tradeAmount, result.fiyat);
              if (buyResult) {
                const qty = parseFloat(buyResult.executedQty) || (tradeAmount / result.fiyat);
                const pos = { symbol: ticker.symbol, side: 'LONG', entryPrice: result.fiyat, quantity: qty, highestPrice: result.fiyat, lowestPrice: result.fiyat, stopLoss: machineAnalysis.stopLoss || result.stop_loss || result.fiyat * 0.975, entryTime: new Date().toISOString(), machineConfidence: machineAnalysis.confidence };
                this.realPositions[ticker.symbol] = pos;
                this.saveRealPositionToDB(ticker.symbol, pos);
              }
            } else if (side === 'SHORT') {
              const sellResult = await binance.realSell(ticker.symbol, tradeAmount / result.fiyat);
              if (sellResult) {
                const qty = parseFloat(sellResult.executedQty) || (tradeAmount / result.fiyat);
                const pos = { symbol: ticker.symbol, side: 'SHORT', entryPrice: result.fiyat, quantity: qty, highestPrice: result.fiyat, lowestPrice: result.fiyat, stopLoss: result.fiyat * 1.025, entryTime: new Date().toISOString(), machineConfidence: machineAnalysis.confidence };
                this.realPositions[ticker.symbol] = pos;
                this.saveRealPositionToDB(ticker.symbol, pos);
              }
            }
          }

          if (telegram) {
            telegram.sendMessage(`${emoji} — ${ticker.symbol}\n━━━━━━━━━━━━━━━━━━\n💰 Giris: ${result.fiyat} USDT\n🧠 AI Guven: %${(machineAnalysis.confidence*100).toFixed(1)} | Puan: ${finalScore}\n📈 Trend: ${result.trend}\n🛑 Stop: ${(machineAnalysis.stopLoss || result.stop_loss)?.toFixed(6)}\n🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`).catch(() => {});
            await new Promise(r => setTimeout(r, 500));
          }
        }
        await new Promise(r => setTimeout(r, 150));
        errorCount = 0;
      } catch(e) { errorCount++; if (errorCount > 5) { await new Promise(r => setTimeout(r, 30000)); errorCount = 0; } }
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
    console.log(`[TARAMA] ${(sure/1000).toFixed(1)}s — ${signalsFound.length} sinyal (${longCount} LONG, ${shortCount} SHORT)`);
    console.log(`[MAKINE] ✅ ${machineAccepted} kabul | ❌ ${machineRejected} red`);
    console.log(`[SIM] Bakiye: ${simStats.balance?.toFixed(2)} | Islem: ${simStats.totalTrades} | Basari: %${simStats.winRate}`);

    db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found,machine_accepted,machine_rejected) VALUES (?,?,?,?,?,?)')
      .run(filtreli.length, signalsFound.length, sure, JSON.stringify(signalsFound), machineAccepted, machineRejected);

    this.machine.saveToDB();
    if (this.learningManager && this.scanCount % 3 === 0) { try { await this.learningManager.saveAndSync('Tarama #' + this.scanCount); } catch(e) {} }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('╔══════════════════════════════════════╗');
    console.log('║   TRADING BOT v21 - AGRESIF MOD     ║');
    console.log('╚══════════════════════════════════════╝');
    await this.updateBTCTrend();

    this.loadRealPositionsFromDB();

    console.log('[BELLEK] Veritabanindan ogrenmeler yukleniyor...');
    const loaded = this.machine.loadFromDB();
    console.log(`[BELLEK] ${loaded ? '✅ Makine kaldigi yerden devam ediyor' : '📝 Sifirdan basliyor'}`);

    const settings = this.getSettings();
    const githubEnabled = settings.github_sync_enabled === 'true' || settings.github_sync_enabled === '1';
    const githubToken = process.env.GITHUB_TOKEN;

    if (githubEnabled && githubToken) {
      try {
        const { IntegratedLearningManager } = require('./github_learning_sync');
        this.learningManager = new IntegratedLearningManager({ repoUrl: process.env.GITHUB_LEARNING_REPO || '', token: githubToken, branch: 'main', autoSync: false, syncInterval: 30 });
        await this.learningManager.initialize(this.machine, simulation);
        console.log('[GITHUB] ✅ Yedek sync AKTIF');
      } catch(e) { console.error('[GITHUB] ❌ Yedek sync hatasi:', e.message); }
    } else { console.log('[GITHUB] ⏸️ Yedek sync kapali (veritabani aktif)'); }

    const self = this;
    this.priceInterval = setInterval(async () => { await self.checkPositionsQuick(); }, 3000);
    console.log('[KONTROL] Fiyat kontrol dongusu basladi (her 3 sn)');

    await this.scan();
    const intervalMin = parseInt(settings.scan_interval || 20);
    this.interval = setInterval(async () => { await self.updateBTCTrend(); await self.scan(); }, intervalMin * 60 * 1000);

    console.log(`[BOT] Her ${intervalMin} dakikada bir tarama`);
    console.log(`[BOT] Makine guven esigi: %50 (agresif)`);
    console.log(`[BOT] Minimum puan: 15 (agresif)`);
    console.log(`[BOT] 🧠 Kalici bellek: ${loaded ? '✅ AKTIF' : '📝 Yeni'}`);
    console.log(`[BOT] 💰 Gercek pozisyon: ${Object.keys(this.realPositions).length} adet (veritabaninda)`);
    console.log(`[BOT] LONG ${settings.long_enabled !== 'false' ? '✅' : '❌'} | SHORT ${shortEnabled ? '✅' : '❌'}${settings.real_trading==='true'?' | GERCEK ✅':''}`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.priceInterval) clearInterval(this.priceInterval);
    this.running = false; this.interval = null; this.priceInterval = null;
    if (this.learningManager) { this.learningManager.stop(); }
    console.log('[BOT] Durduruldu.');
  }

  getMachineReport() {
    const simStats = simulation.getStats();
    return {
      bot: { running: this.running, scanCount: this.scanCount, btcTrend: this.btcTrend },
      machine: { adaptiveThreshold: simulation.getAdaptiveThreshold(), consecutiveLosses: simStats.consecutiveLosses || 0 },
      performance: { signalsGenerated: this.performance.signalsGenerated, signalsAccepted: this.performance.signalsAccepted, signalsRejected: this.performance.signalsRejected, acceptanceRate: this.performance.signalsGenerated > 0 ? (this.performance.signalsAccepted / this.performance.signalsGenerated * 100).toFixed(1) : 0 },
      simulation: { balance: simStats.balance, totalPnl: simStats.totalPnl, winRate: simStats.winRate, profitFactor: simStats.profitFactor }
    };
  }
}

module.exports = new TradingEngine();
