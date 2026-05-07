const binance = require('./binance');
const db = require('./database');
const simulation = require('./simulation');
const TelegramService = require('./telegram');
const fs = require('fs');
const path = require('path');

class MachineDecisionEngine {
  constructor() {
    this.modelPath = path.join(__dirname, 'ml_models');
    if (!fs.existsSync(this.modelPath)) fs.mkdirSync(this.modelPath, { recursive: true });
    this.coinProfitability = {};
    this.volatilityModel = { highVol: { winRate: 0, avgPnl: 0, bestStopLoss: 1.5 }, mediumVol: { winRate: 0, avgPnl: 0, bestStopLoss: 1.0 }, lowVol: { winRate: 0, avgPnl: 0, bestStopLoss: 0.8 } };
    this.loadFromDB();
  }

  learnFromCompletedTrades() {
    const trades = db.prepare(`SELECT symbol, side, pnl FROM completed_trades WHERE pnl IS NOT NULL ORDER BY timestamp DESC LIMIT 1000`).all();
    if (trades.length === 0) return;
    const coinAnalysis = {};
    trades.forEach(trade => {
      if (!coinAnalysis[trade.symbol]) coinAnalysis[trade.symbol] = { wins: 0, losses: 0, totalPnl: 0 };
      if (trade.pnl > 0) coinAnalysis[trade.symbol].wins++;
      else coinAnalysis[trade.symbol].losses++;
      coinAnalysis[trade.symbol].totalPnl += trade.pnl;
    });
    Object.entries(coinAnalysis).forEach(([symbol, data]) => {
      const totalTrades = data.wins + data.losses;
      this.coinProfitability[symbol] = {
        winRate: totalTrades > 0 ? data.wins / totalTrades : 0,
        wins: data.wins,
        losses: data.losses,
        avgPnl: totalTrades > 0 ? data.totalPnl / totalTrades : 0,
        totalPnl: data.totalPnl,
        trades: totalTrades,
        confidence: Math.min(1, totalTrades / 20),
        lastUpdated: Date.now()
      };
    });
  }

  calculateVolatility(closes) {
    if (closes.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2)) / returns.length;
    return Math.sqrt(variance);
  }

  getVolatilityLevel(volatility) {
    if (volatility > 0.04) return 'highVol';
    if (volatility > 0.02) return 'mediumVol';
    return 'lowVol';
  }

  calculateOptimalStopAndTarget(symbol, entryPrice, closes) {
    const coinData = this.coinProfitability[symbol];
    if (coinData && coinData.trades > 10) {
      return {
        stopLoss: entryPrice * (1 - (0.015 * (1 - coinData.winRate))),
        target: entryPrice * (1 + (0.03 * coinData.winRate)),
        confidence: coinData.confidence,
        source: 'HISTORICAL'
      };
    }
    const volatility = this.calculateVolatility(closes);
    const volLevel = this.getVolatilityLevel(volatility);
    const volStats = this.volatilityModel[volLevel];
    return {
      stopLoss: entryPrice * (1 - volStats.bestStopLoss / 100),
      target: entryPrice * (1 + (volStats.bestStopLoss * 2) / 100),
      volatility: volatility,
      confidence: 0.65,
      source: volLevel
    };
  }

  calculateSMA(closes, period) {
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b) / slice.length;
  }

  calculateEMA(closes, period) {
    const multiplier = 2 / (period + 1);
    let ema = closes[0];
    for (let i = 1; i < closes.length; i++) ema = closes[i] * multiplier + ema * (1 - multiplier);
    return ema;
  }

  calculateRSI(closes, period) {
    const deltas = [];
    for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i - 1]);
    const gains = deltas.map(d => d > 0 ? d : 0);
    const losses = deltas.map(d => d < 0 ? -d : 0);
    const avgGain = gains.slice(-period).reduce((a, b) => a + b) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateMACD(closes) {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;
    const signalLine = this.calculateEMA([macdLine], 9);
    return { macd: macdLine, signal: signalLine, histogram: macdLine - signalLine };
  }

  analyze(candles, ticker) {
    if (!candles || candles.length < 100) return null;
    const closes = candles.map(c => parseFloat(c[4]));
    const highs = candles.map(c => parseFloat(c[2]));
    const lows = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[7]));
    const symbol = ticker.symbol;
    const currentPrice = closes[closes.length - 1];
    const volatility = this.calculateVolatility(closes);
    const volLevel = this.getVolatilityLevel(volatility);
    
    const coinProfit = this.coinProfitability[symbol];
    if (coinProfit && coinProfit.losses > coinProfit.wins) {
      return { action: 'WAIT', confidence: 0, reasoning: `${symbol} tarihçesi kötü`, shouldWait: true };
    }

    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const ema200 = this.calculateEMA(closes, 200);
    
    let trendStrength = 'weak';
    let isBullish = false;
    if (currentPrice > sma20 && sma20 > sma50 && sma50 > ema200) { trendStrength = 'strong'; isBullish = true; }
    else if (currentPrice > sma20 && sma20 > sma50) { trendStrength = 'medium'; isBullish = true; }
    else if (currentPrice < sma20 && sma20 < sma50 && sma50 < ema200) { trendStrength = 'strong'; isBullish = false; }
    else if (currentPrice < sma20 && sma20 < sma50) { trendStrength = 'medium'; isBullish = false; }

    const rsi = this.calculateRSI(closes, 14);
    let rsiSignal = 0;
    if (rsi < 30 && coinProfit && coinProfit.winRate > 0.60) rsiSignal = 1.0;
    else if (rsi > 70) rsiSignal = 0.8;
    else if ((rsi < 50 && isBullish) || (rsi > 50 && !isBullish)) rsiSignal = 0.5;

    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b) / 20;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / avgVolume;
    let volumeSignal = 0.5;
    if (volumeRatio > 1.5 && isBullish) volumeSignal = 1.0;
    if (volumeRatio < 0.8) volumeSignal = 0.2;

    const macd = this.calculateMACD(closes);
    let macdSignal = 0.5;
    if (macd.histogram > 0 && isBullish) macdSignal = 0.9;
    if (macd.histogram < 0 && !isBullish) macdSignal = 0.8;

    const scores = [
      { weight: 0.30, value: trendStrength === 'strong' ? 0.9 : trendStrength === 'medium' ? 0.6 : 0.2 },
      { weight: 0.25, value: rsiSignal },
      { weight: 0.25, value: macdSignal },
      { weight: 0.15, value: volumeSignal },
      { weight: 0.05, value: coinProfit ? coinProfit.confidence * coinProfit.winRate : 0.5 }
    ];
    const confidence = scores.reduce((sum, s) => sum + (s.weight * s.value), 0);

    const optimalRR = this.calculateOptimalStopAndTarget(symbol, currentPrice, closes);
    let action = 'WAIT';
    if (isBullish && confidence >= 0.70 && trendStrength !== 'weak') action = 'BUY';
    else if (!isBullish && confidence >= 0.75 && trendStrength !== 'weak') action = 'SELL';

    return {
      action: action,
      confidence: confidence,
      stopLoss: optimalRR.stopLoss,
      target: optimalRR.target,
      volatility: volatility,
      volatilityLevel: volLevel,
      trend: isBullish ? 'BULLISH' : 'BEARISH',
      trendStrength: trendStrength,
      rsi: rsi,
      reasoning: `Trend:${trendStrength}(${trendStrength==='strong'?0.9:0.6}) RSI:${rsi.toFixed(0)}(${rsiSignal.toFixed(1)}) Vol:${volumeSignal.toFixed(1)}`,
      coinProfitability: coinProfit,
      similarPatternsFound: coinProfit ? coinProfit.trades : 0,
      shouldWait: confidence < 0.65
    };
  }

  saveToDB() {
    try {
      const data = { coinProfitability: this.coinProfitability, volatilityModel: this.volatilityModel, lastUpdate: Date.now() };
      const filePath = path.join(this.modelPath, 'machine_learning_model.json');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log('[ML] 💾 Model kaydedildi');
    } catch(e) {
      console.error('[ML] Kaydetme hatası:', e.message);
    }
  }

  loadFromDB() {
    try {
      const filePath = path.join(this.modelPath, 'machine_learning_model.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.coinProfitability = data.coinProfitability || {};
        this.volatilityModel = data.volatilityModel || this.volatilityModel;
        return true;
      }
      return false;
    } catch(e) {
      console.error('[ML] Model yükleme hatası:', e.message);
      return false;
    }
  }

  periodicLearning() {
    this.learnFromCompletedTrades();
    this.saveToDB();
  }
}

class TradingEngine {
  constructor() {
    this.running = false;
    this.interval = null;
    this.priceInterval = null;
    this.btcTrend = { trend: 'BELIRSIZ', rsi: 50, lastUpdate: 0 };
    this.scanCount = 0;
    this.prices = {};
    this.machine = new MachineDecisionEngine();
    this.candlesData = {};
    this.realPositions = {};
    this.dailyStartBalance = 0;
    this.lastResetTime = Date.now();
    this.dailyStats = { winCount: 0, lossCount: 0, totalProfit: 0, totalTrades: 0 };
    this.performance = { scans: [], signalsGenerated: 0, signalsAccepted: 0, signalsRejected: 0, rejectionReasons: {} };
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
          symbol: row.symbol,
          side: row.side || 'LONG',
          entryPrice: row.entry_price,
          quantity: row.quantity,
          highestPrice: row.highest_price || row.entry_price,
          lowestPrice: row.lowest_price || row.entry_price,
          stopLoss: row.stop_loss,
          entryTime: row.entry_time,
          machineConfidence: row.machine_confidence || 0
        };
      }
      if (rows.length > 0) console.log(`[GERCEK] ✅ ${rows.length} pozisyon yuklendi`);
    } catch(e) {
      console.error('[GERCEK] Pozisyon yukleme hatasi:', e.message);
    }
  }

  saveRealPositionToDB(symbol, pos) {
    try {
      db.prepare(`INSERT OR REPLACE INTO real_positions (symbol, side, quantity, entry_price, highest_price, lowest_price, stop_loss, entry_time, machine_confidence) VALUES (?,?,?,?,?,?,?,?,?)`).run(symbol, pos.side || 'LONG', pos.quantity, pos.entryPrice, pos.highestPrice, pos.lowestPrice, pos.stopLoss, pos.entryTime, pos.machineConfidence || 0);
    } catch(e) {}
  }

  deleteRealPositionFromDB(symbol) {
    try {
      db.prepare('DELETE FROM real_positions WHERE symbol=?').run(symbol);
    } catch(e) {}
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

  async updateBTCTrend() {
    try {
      const candles = await binance.getKlines('BTCUSDT', '4h', 200);
      if (!candles || candles.length < 100) return;
      this.candlesData['BTCUSDT'] = candles;
      const closes = candles.map(c => parseFloat(c[4]));
      const rsi = this.machine.calculateRSI(closes, 14);
      const ema21 = this.machine.calculateEMA(closes, 21);
      const ema50 = this.machine.calculateEMA(closes, 50);
      const fiyat = closes[closes.length - 1];
      let trend = 'NOTR';
      if (fiyat > ema21 && ema21 > ema50) trend = 'YUKARI';
      else if (fiyat > ema21) trend = 'HAFIF_YUKARI';
      else if (fiyat < ema21 && ema21 < ema50) trend = 'ASAGI';
      else if (fiyat < ema21) trend = 'HAFIF_ASAGI';
      this.btcTrend = { trend, rsi, fiyat, lastUpdate: Date.now() };
      console.log(`[BTC] ${trend} | RSI:${rsi.toFixed(1)} | $${fiyat.toFixed(0)}`);
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
        if (currentPrice > pos.highestPrice) {
          pos.highestPrice = currentPrice;
          this.saveRealPositionToDB(symbol, pos);
        }
        const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const hardStop = pos.entryPrice * (1 - hardStopPct);
        const trailingStop = pos.highestPrice * (1 - trailingPct);
        let sellReason = null;
        if (currentPrice <= hardStop) sellReason = 'STOP_LOSS';
        else if (pnlPct >= minProfitPct * 100 && currentPrice <= trailingStop) sellReason = 'TRAILING_STOP';
        if (sellReason) await this.executeRealSell(pos, currentPrice, sellReason, telegram);
      } else if (pos.side === 'SHORT') {
        if (currentPrice < pos.lowestPrice) {
          pos.lowestPrice = currentPrice;
          this.saveRealPositionToDB(symbol, pos);
        }
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
      const netPnl = (currentPrice - pos.entryPrice) * pos.quantity;
      const netPnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      
      if (netPnl >= 0) {
        this.dailyStats.winCount++;
        this.dailyStats.totalProfit += netPnl;
      } else {
        this.dailyStats.lossCount++;
      }
      this.dailyStats.totalTrades++;

      db.prepare(`INSERT INTO completed_trades (symbol, side, entry_price, exit_price, quantity, pnl, pnl_percent, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(pos.symbol, 'LONG', pos.entryPrice, currentPrice, pos.quantity, netPnl, netPnlPct, reason);
      
      this.machine.learnFromCompletedTrades();
      console.log(`[ML] 📚 ${pos.symbol} kaydedildi`);

      if (telegram) {
        const emoji = netPnl >= 0 ? '✅ KAR' : '❌ ZARAR';
        telegram.sendMessage(`${emoji} — ${pos.symbol}\n💰 G:${pos.entryPrice.toFixed(6)} C:${currentPrice.toFixed(6)}\n${netPnl >= 0 ? '+' : ''}${netPnlPct.toFixed(2)}%`).catch(() => {});
      }
      
      this.deleteRealPositionFromDB(pos.symbol);
      delete this.realPositions[pos.symbol];
    } catch(e) { console.error(`[GERCEK] ${pos.symbol} satis hatasi:`, e.message); }
  }

  async executeRealBuy(pos, currentPrice, reason, telegram) {
    try {
      await binance.realBuy(pos.symbol, pos.quantity * pos.entryPrice, currentPrice);
      const netPnl = (pos.entryPrice - currentPrice) * pos.quantity;
      const netPnlPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
      
      if (netPnl >= 0) {
        this.dailyStats.winCount++;
        this.dailyStats.totalProfit += netPnl;
      } else {
        this.dailyStats.lossCount++;
      }
      this.dailyStats.totalTrades++;

      db.prepare(`INSERT INTO completed_trades (symbol, side, entry_price, exit_price, quantity, pnl, pnl_percent, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(pos.symbol, 'SHORT', pos.entryPrice, currentPrice, pos.quantity, netPnl, netPnlPct, reason);
      
      this.machine.learnFromCompletedTrades();
      console.log(`[ML] 📚 ${pos.symbol} kaydedildi`);

      if (telegram) {
        const emoji = netPnl >= 0 ? '✅ KAR' : '❌ ZARAR';
        telegram.sendMessage(`${emoji} — ${pos.symbol}\n💰 G:${pos.entryPrice.toFixed(6)} C:${currentPrice.toFixed(6)}\n${netPnl >= 0 ? '+' : ''}${netPnlPct.toFixed(2)}%`).catch(() => {});
      }
      
      this.deleteRealPositionFromDB(pos.symbol);
      delete this.realPositions[pos.symbol];
    } catch(e) { console.error(`[GERCEK] ${pos.symbol} alis hatasi:`, e.message); }
  }

  checkAndResetDaily() {
    const now = Date.now();
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    if (now - this.lastResetTime >= millisecondsPerDay) {
      const simStats = simulation.getStats();
      const dailyChange = ((simStats.balance - this.dailyStartBalance) / this.dailyStartBalance) * 100;
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║   GÜN SONU                          ║');
      console.log('╚══════════════════════════════════════╝');
      console.log(`📊 Başı: $${this.dailyStartBalance.toFixed(2)} | Sonu: $${simStats.balance.toFixed(2)}`);
      console.log(`📈 Değişim: ${dailyChange >= 0 ? '✅' : '❌'} ${dailyChange.toFixed(3)}%`);
      console.log(`🏆 W:${this.dailyStats.winCount} L:${this.dailyStats.lossCount}`);
      console.log(`[ML] 🧠 Gün sonu makina güncellemesi...`);
      this.machine.periodicLearning();
      console.log(`[ML] ✅ ${Object.keys(this.machine.coinProfitability).length} coin öğrendi`);
      db.prepare(`INSERT INTO daily_reports (date, start_balance, end_balance, daily_change, win_count, loss_count, total_trades) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)`).run(this.dailyStartBalance, simStats.balance, dailyChange, this.dailyStats.winCount, this.dailyStats.lossCount, this.dailyStats.totalTrades);
      this.dailyStartBalance = simStats.balance;
      this.lastResetTime = now;
      this.dailyStats = { winCount: 0, lossCount: 0, totalProfit: 0, totalTrades: 0 };
    }
  }

  async scan() {
    const baslangic = Date.now();
    const settings = this.getSettings();
    this.scanCount++;
    const minHacim = parseFloat(settings.min_volume || 10000000);
    const maxCoin = parseInt(settings.max_coins || 50);
    const realTrading = settings.real_trading === 'true' || settings.real_trading === '1';
    const longEnabled = settings.long_enabled === 'true' || settings.long_enabled === '1' || settings.long_enabled === undefined;
    const shortEnabled = settings.short_enabled === 'true' || settings.short_enabled === '1';
    const btcDown = this.btcTrend.trend === 'ASAGI' || this.btcTrend.trend === 'HAFIF_ASAGI';

    console.log('\n' + '='.repeat(50));
    console.log(`[${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}] TARAMA #${this.scanCount}`);
    console.log(`[BTC] ${this.btcTrend.trend} | RSI:${(this.btcTrend.rsi||50).toFixed(1)}`);
    console.log(`[ISLEM] LONG ${longEnabled?'✅':'❌'} | SHORT ${shortEnabled&&btcDown?'✅':'❌'}${realTrading ? ' | GERCEK ✅' : ''}`);
    console.log('='.repeat(50));

    if (this.scanCount % 5 === 0) {
      console.log('[ML] 🧠 Makina öğrenme güncellemesi...');
      this.machine.periodicLearning();
    }

    const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT']);
    let tickers;
    try { tickers = await binance.getAllTickers(); } catch(e) { console.error('[TARAMA] Ticker hatasi:', e.message); return; }
    for (const t of tickers) { this.prices[t.symbol] = parseFloat(t.lastPrice); }

    const tumFiltreli = [];
    for (const t of tickers) {
      if (!t.symbol.endsWith('USDT')) continue;
      if (STABLES.has(t.symbol)) continue;
      const hacim = parseFloat(t.quoteVolume) || 0, degisim = parseFloat(t.priceChangePercent) || 0;
      if (hacim < minHacim || degisim <= -15 || degisim >= 15) continue;
      tumFiltreli.push(t);
    }
    tumFiltreli.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    const filtreli = tumFiltreli.slice(0, maxCoin);
    console.log(filtreli.length + ' coin taranacak\n' + '-'.repeat(50));
    db.prepare("DELETE FROM signals").run();

    let longCount = 0, shortCount = 0, machineAccepted = 0, machineRejected = 0;
    const signalsFound = [];
    const rejectionReasons = {};
    const telegram = this.getTelegram();

    for (const ticker of filtreli) {
      try {
        const candles4H = await binance.getKlines(ticker.symbol, '4h', 200);
        if (!candles4H || candles4H.length < 100) continue;
        this.candlesData[ticker.symbol] = candles4H;
        const machineAnalysis = this.machine.analyze(candles4H, { symbol: ticker.symbol, priceChangePercent: ticker.priceChangePercent || 0, quoteVolume: ticker.quoteVolume || 0 });

        if (machineAnalysis.shouldWait) {
          rejectionReasons['ML_BEKLEME'] = (rejectionReasons['ML_BEKLEME'] || 0) + 1;
          machineRejected++;
          continue;
        }

        let sinyalTipi = 'BEKLE', side = null, finalScore = machineAnalysis.confidence * 100, machineOnay = false, rejectReason = '';

        if (machineAnalysis.action === 'BUY' && machineAnalysis.confidence >= 0.70 && longEnabled) { sinyalTipi = 'ALIM'; side = 'LONG'; machineOnay = true; longCount++; }
        else if (machineAnalysis.action === 'SELL' && shortEnabled && machineAnalysis.confidence >= 0.75 && btcDown) { sinyalTipi = 'SATIS'; side = 'SHORT'; machineOnay = true; shortCount++; }
        else if (machineAnalysis.confidence < 0.65) { rejectReason = 'DUSUK_GUVEN'; }
        else if (!longEnabled && machineAnalysis.action === 'BUY') { rejectReason = 'LONG_KAPALI'; }
        else if (!shortEnabled && machineAnalysis.action === 'SELL') { rejectReason = 'SHORT_KAPALI'; }

        if (machineOnay) { machineAccepted++; }
        else if (rejectReason) { machineRejected++; rejectionReasons[rejectReason] = (rejectionReasons[rejectReason] || 0) + 1; }

        const risk = machineOnay ? (machineAnalysis.confidence >= 0.85 ? 'DUSUK' : machineAnalysis.confidence >= 0.75 ? 'ORTA' : 'YUKSEK') : 'YUKSEK';

        db.prepare('INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(ticker.symbol, sinyalTipi, finalScore, risk, ticker.lastPrice, ticker.lastPrice, machineAnalysis.rsi.toFixed(1), machineAnalysis.volatility > 0.03 ? 1 : 0, machineAnalysis.trend, JSON.stringify([machineAnalysis.trendStrength]), JSON.stringify([]), machineOnay ? `✅ ML ONAYLI (${side}) | %${(machineAnalysis.confidence*100).toFixed(0)}` : `❌ RED: ${rejectReason}`);

        if (machineOnay && side) {
          signalsFound.push(ticker.symbol);
          const openPositions = db.prepare("SELECT COUNT(*) as cnt FROM sim_positions WHERE status='OPEN'").get();
          const maxPositions = parseInt(settings.max_concurrent_positions || 5);
          if (openPositions.cnt >= maxPositions) { console.log(`⚠️ Max ${maxPositions} açık`); continue; }

          const stopLoss = machineAnalysis.stopLoss || ticker.lastPrice * 0.985;
          const target = machineAnalysis.target || ticker.lastPrice * 1.03;
          const emoji = side === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
          console.log(`[✅ ${emoji}] ${ticker.symbol.padEnd(10)} | Score:${String(finalScore.toFixed(0)).padStart(3)} | RSI:${machineAnalysis.rsi.toFixed(1)} | ML:%${(machineAnalysis.confidence*100).toFixed(0)}`);

          simulation.openPosition({
            symbol: ticker.symbol, side, signal_type: sinyalTipi, price: parseFloat(ticker.lastPrice), fiyat: parseFloat(ticker.lastPrice), score: finalScore, trend: machineAnalysis.trend,
            stop_loss: stopLoss, stopLoss: stopLoss, target: target, machineConfidence: machineAnalysis.confidence, machineReasoning: machineAnalysis.reasoning
          }, settings, this.btcTrend, this.candlesData);

          if (realTrading && !this.realPositions[ticker.symbol]) {
            const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);
            if (side === 'LONG') {
              const buyResult = await binance.realBuy(ticker.symbol, tradeAmount, parseFloat(ticker.lastPrice));
              if (buyResult) {
                const qty = parseFloat(buyResult.executedQty) || (tradeAmount / parseFloat(ticker.lastPrice));
                const pos = { symbol: ticker.symbol, side: 'LONG', entryPrice: parseFloat(ticker.lastPrice), quantity: qty, highestPrice: parseFloat(ticker.lastPrice), lowestPrice: parseFloat(ticker.lastPrice), stopLoss: stopLoss, entryTime: new Date().toISOString(), machineConfidence: machineAnalysis.confidence };
                this.realPositions[ticker.symbol] = pos;
                this.saveRealPositionToDB(ticker.symbol, pos);
              }
            } else if (side === 'SHORT') {
              const sellResult = await binance.realSell(ticker.symbol, tradeAmount / parseFloat(ticker.lastPrice));
              if (sellResult) {
                const qty = parseFloat(sellResult.executedQty) || (tradeAmount / parseFloat(ticker.lastPrice));
                const pos = { symbol: ticker.symbol, side: 'SHORT', entryPrice: parseFloat(ticker.lastPrice), quantity: qty, highestPrice: parseFloat(ticker.lastPrice), lowestPrice: parseFloat(ticker.lastPrice), stopLoss: stopLoss, entryTime: new Date().toISOString(), machineConfidence: machineAnalysis.confidence };
                this.realPositions[ticker.symbol] = pos;
                this.saveRealPositionToDB(ticker.symbol, pos);
              }
            }
          }

          if (telegram) {
            telegram.sendMessage(`${emoji} — ${ticker.symbol}\n💰 G:${parseFloat(ticker.lastPrice).toFixed(6)} USDT\n🧠 ML:%${(machineAnalysis.confidence*100).toFixed(1)}\n📊 Trend:${machineAnalysis.trend}\n🛑 Stop:${stopLoss.toFixed(6)}\n🎯 Target:${target.toFixed(6)}`).catch(() => {});
            await new Promise(r => setTimeout(r, 500));
          }
        }
        await new Promise(r => setTimeout(r, 150));
      } catch(e) { console.error(ticker.symbol + ' hatasi:', e.message); }
    }

    await this.fetchPricesForOpenPositions();
    simulation.updatePositions(this.prices, settings, this.candlesData);
    await this.updateRealPositions();
    this.checkAndResetDaily();

    const sure = Date.now() - baslangic;
    const simStats = simulation.getStats();
    this.performance.scans.push({ timestamp: Date.now(), coinsScanned: filtreli.length, signalsFound: signalsFound.length, machineAccepted, machineRejected, duration: sure });
    this.performance.signalsGenerated += signalsFound.length;
    this.performance.signalsAccepted += machineAccepted;
    this.performance.signalsRejected += machineRejected;

    console.log('\n' + '-'.repeat(50));
    console.log(`[TARAMA] Tamamlandi (${(sure/1000).toFixed(1)}s) — ${signalsFound.length} sinyal (${longCount} LONG, ${shortCount} SHORT)`);
    console.log(`[ML] ✅ ${machineAccepted} ONAYLI | ❌ ${machineRejected} RED | 📚 ${Object.keys(this.machine.coinProfitability).length} coin`);
    console.log(`[SIM] Bakiye: $${simStats.balance?.toFixed(2)} | Basari: %${simStats.winRate}`);

    db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found,machine_accepted,machine_rejected) VALUES (?,?,?,?,?,?)').run(filtreli.length, signalsFound.length, sure, JSON.stringify(signalsFound), machineAccepted, machineRejected);
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('╔══════════════════════════════════════╗');
    console.log('║   TRADING BOT - ML KAR ODAKLI       ║');
    console.log('╚══════════════════════════════════════╝');
    await this.updateBTCTrend();
    this.loadRealPositionsFromDB();
    const simStats = simulation.getStats();
    this.dailyStartBalance = simStats.balance;
    this.lastResetTime = Date.now();
    console.log(`💰 Başlangıç bakiyesi: $${this.dailyStartBalance.toFixed(2)}`);

    const settings = this.getSettings();
    const scanInterval = parseInt(settings.scan_interval_seconds || 300) * 1000;
    const priceInterval = parseInt(settings.price_check_interval_seconds || 30) * 1000;

    this.interval = setInterval(async () => {
      try {
        await this.scan();
      } catch(e) {
        console.error('[SCAN] Hata:', e.message);
      }
    }, scanInterval);

    this.priceInterval = setInterval(async () => {
      try {
        await this.fetchPricesForOpenPositions();
        simulation.updatePositions(this.prices, settings, this.candlesData);
        await this.updateRealPositions();
      } catch(e) {
        console.error('[PRICE] Hata:', e.message);
      }
    }, priceInterval);

    await this.scan();
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.priceInterval) clearInterval(this.priceInterval);
    this.running = false;
    console.log('[BOT] Durduruldu');
  }
}

module.exports = TradingEngine;
