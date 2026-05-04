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
    this.btcTrend  = { trend:'BELIRSIZ', rsi:50, lastUpdate:0 };
    this.scanCount = 0;
    this.prices    = {};
    this.machine = new MachineDecisionEngine();
    this.candlesData = {};
    this.learningManager = null;
    this.performance = {
      scans: [],
      signalsGenerated: 0,
      signalsAccepted: 0,
      signalsRejected: 0,
      rejectionReasons: {}
    };
    this.realPositions = {};
  }

  getSettings() {
    var rows = db.prepare('SELECT key, value FROM settings').all();
    var settings = {};
    rows.forEach(function(r) { settings[r.key] = r.value; });
    return settings;
  }

  getTelegram() {
    var s = this.getSettings();
    if (!s.telegram_token || !s.telegram_chat_id) return null;
    return new TelegramService(s.telegram_token, s.telegram_chat_id);
  }

  async updateBTCTrend() {
    try {
      var candles = await binance.getKlines('BTCUSDT', '4h', 200);
      if (!candles || candles.length < 100) return;
      this.candlesData['BTCUSDT'] = candles;
      var closes = candles.map(function(c) { return parseFloat(c[4]); });
      var highs  = candles.map(function(c) { return parseFloat(c[2]); });
      var lows   = candles.map(function(c) { return parseFloat(c[3]); });
      var rsi   = analysis.hesaplaRSI(closes, 14);
      var ema21 = analysis.hesaplaEMA(closes, 21);
      var ema50 = analysis.hesaplaEMA(closes, 50);
      var fiyat = closes[closes.length - 1];
      var trend = 'NOTR';
      if (fiyat > ema21 && ema21 > ema50) trend = 'YUKARI';
      else if (fiyat > ema21) trend = 'HAFIF_YUKARI';
      else if (fiyat < ema21 && ema21 < ema50) trend = 'ASAGI';
      else if (fiyat < ema21) trend = 'HAFIF_ASAGI';
      var adx = analysis.hesaplaADX ? analysis.hesaplaADX(highs, lows, closes, 14) : { adx: 0 };
      this.btcTrend = { trend: trend, rsi: rsi, fiyat: fiyat, strength: adx.adx || 0, lastUpdate: Date.now() };
      console.log('[BTC] ' + trend + ' | RSI:' + rsi.toFixed(1) + ' | ADX:' + (adx.adx||0).toFixed(1) + ' | $' + fiyat.toFixed(0));
    } catch(e) {
      console.error('[BTC] Trend hatasi:', e.message);
    }
  }

  async scan() {
    var baslangic = Date.now();
    var settings  = this.getSettings();
    this.scanCount++;

    var minHacim = parseFloat(settings.min_volume || 10000000);
    var maxCoin  = parseInt(settings.max_coins || 50);
    var minScore = parseInt(settings.min_score || 40);
    var realTrading = settings.real_trading === 'true' || settings.real_trading === '1';

    console.log('\n' + '='.repeat(50));
    console.log('[' + new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) + '] TARAMA #' + this.scanCount);
    console.log('[BTC] ' + this.btcTrend.trend + ' | RSI:' + (this.btcTrend.rsi||50).toFixed(1) + ' | Guc:' + (this.btcTrend.strength||0).toFixed(1));
    console.log('[GERCEK ALIM] ' + (realTrading ? '✅ ACIK' : '❌ KAPALI'));
    console.log('='.repeat(50));

    var STABLES = ['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT'];
    var stableSet = {};
    STABLES.forEach(function(s) { stableSet[s] = true; });

    var tickers;
    try {
      tickers = await binance.getAllTickers();
    } catch(e) {
      console.error('[TARAMA] Ticker hatasi:', e.message);
      return;
    }

    var tumFiltreli = [];
    for (var i = 0; i < tickers.length; i++) {
      var t = tickers[i];
      if (!t.symbol.endsWith('USDT')) continue;
      if (stableSet[t.symbol]) continue;
      var hacim = parseFloat(t.quoteVolume) || 0;
      var degisim = parseFloat(t.priceChangePercent) || 0;
      var fiyat = parseFloat(t.lastPrice) || 0;
      if (fiyat <= 0 || hacim < minHacim || degisim <= -15 || degisim >= 15) continue;
      tumFiltreli.push(t);
    }

    tumFiltreli.sort(function(a, b) { return parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume); });
    var filtreli = tumFiltreli.slice(0, maxCoin);
    console.log(filtreli.length + ' coin taranacak\n' + '-'.repeat(50));

    db.prepare("DELETE FROM signals").run();

    var signalCount = 0, machineAccepted = 0, machineRejected = 0;
    var signalsFound = [], rejectionReasons = {};
    var telegram = this.getTelegram();
    var errorCount = 0;

    for (var i = 0; i < filtreli.length; i++) {
      var ticker = filtreli[i];
      try {
        var candles4H = await binance.getKlines(ticker.symbol, '4h', 200);
        if (!candles4H || candles4H.length < 100) continue;
        this.candlesData[ticker.symbol] = candles4H;
        var result = analysis.analyze(candles4H, ticker);
        if (!result) continue;
        this.prices[ticker.symbol] = result.fiyat;

        var machineAnalysis = this.machine.analyze(candles4H, {
          symbol: ticker.symbol,
          priceChangePercent: ticker.priceChangePercent || 0,
          quoteVolume: ticker.quoteVolume || 0
        });

        var sinyalTipi = 'BEKLE', finalScore = result.puan || 0, machineOnay = false, rejectReason = '';

        if (machineAnalysis.action === 'BUY' && machineAnalysis.confidence >= 0.70) {
          sinyalTipi = 'ALIM'; machineOnay = true; machineAccepted++;
        } else if (machineAnalysis.action === 'WAIT' && result.puan >= minScore) {
          rejectReason = 'MAKINE_BEKLE_DEDI';
        } else if (machineAnalysis.action === 'SELL') {
          sinyalTipi = 'SATIS'; rejectReason = 'MAKINE_SAT_DEDI';
        } else if (machineAnalysis.confidence < 0.70) {
          rejectReason = 'DUSUK_GUVEN';
        }

        if (!machineOnay && rejectReason) {
          machineRejected++;
          rejectionReasons[rejectReason] = (rejectionReasons[rejectReason] || 0) + 1;
        }

        var risk = machineOnay ? (machineAnalysis.confidence >= 0.85 ? 'DUSUK' : machineAnalysis.confidence >= 0.75 ? 'ORTA' : 'YUKSEK') : 'YUKSEK';

        db.prepare(
          'INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(result.symbol, sinyalTipi, finalScore, risk, result.fiyat, result.fiyat, result.rsi, result.macdBullish ? 1 : 0, result.trend,
          JSON.stringify(result.pozitif || []), JSON.stringify(result.negatif || []),
          machineOnay ? '✅ Makine ONAYLI | Guven:%' + (machineAnalysis.confidence*100).toFixed(1) + ' | ' + machineAnalysis.reasoning : '❌ Makine RED: ' + rejectReason
        );

        if (sinyalTipi === 'ALIM' && machineOnay) {
          signalCount++;
          signalsFound.push(result.symbol);
          console.log('[✅ ALIM] ' + result.symbol.padEnd(10) + ' | Puan:' + String(finalScore).padStart(3) + ' | RSI:' + result.rsi.toFixed(1) + ' | AI:%' + (machineAnalysis.confidence*100).toFixed(0) + ' | Desen:' + (machineAnalysis.similarPatternsFound || 0) + ' | ' + result.trend);

          // HER ZAMAN SİMÜLASYONA GÖNDER
          simulation.openPosition({
            symbol: result.symbol, signal_type: 'ALIM', price: result.fiyat, fiyat: result.fiyat,
            score: finalScore, trend: result.trend,
            stop_loss: machineAnalysis.stopLoss || result.stop_loss,
            stopLoss: machineAnalysis.stopLoss || result.stop_loss,
            target: machineAnalysis.takeProfit || result.hedef,
            machineConfidence: machineAnalysis.confidence,
            machineReasoning: machineAnalysis.reasoning,
            similarPatternsFound: machineAnalysis.similarPatternsFound
          }, settings, this.btcTrend, this.candlesData);

          // ═══════════════════════════════════════
          // GERÇEK ALIM (Ayarlarda açıksa)
          // ═══════════════════════════════════════
          if (realTrading) {
            var tradeAmount = parseFloat(settings.trade_amount_usdt || 100);
            var buyResult = await binance.realBuy(result.symbol, tradeAmount, result.fiyat);
            
            if (buyResult) {
              console.log('[GERCEK] ✅ ' + result.symbol + ' gercek alim yapildi');
              this.realPositions[result.symbol] = {
                symbol: result.symbol,
                entryPrice: result.fiyat,
                quantity: parseFloat(buyResult.executedQty) || (tradeAmount / result.fiyat),
                stopLoss: machineAnalysis.stopLoss || result.stop_loss,
                takeProfit: machineAnalysis.takeProfit || result.hedef,
                entryTime: new Date().toISOString(),
                machineConfidence: machineAnalysis.confidence
              };
            } else {
              console.log('[GERCEK] ❌ ' + result.symbol + ' alim BASARISIZ');
            }
          }

          // TELEGRAM
          if (telegram) {
            await telegram.sendMessage(
              '🟢 ALIM — ' + result.symbol + '\n' +
              '━━━━━━━━━━━━━━━━━━\n' +
              '💰 Giriş: ' + result.fiyat + ' USDT\n' +
              '🧠 AI Guven: %' + (machineAnalysis.confidence*100).toFixed(1) + ' | Puan: ' + finalScore + '\n' +
              '📈 Trend: ' + result.trend + '\n' +
              '🎯 Hedef: ' + (machineAnalysis.takeProfit || result.hedef)?.toFixed(6) + '\n' +
              '🛑 Stop: ' + (machineAnalysis.stopLoss || result.stop_loss)?.toFixed(6) + '\n' +
              '🕐 ' + new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
            );
            await new Promise(function(r) { setTimeout(r, 500); });
          }
        }

        await new Promise(function(r) { setTimeout(r, 150); });
        errorCount = 0;
      } catch(e) {
        errorCount++;
        console.error(ticker.symbol + ' hatasi:', e.message);
        if (errorCount > 5) { await new Promise(function(r) { setTimeout(r, 30000); }); errorCount = 0; }
      }
    }

    simulation.updatePositions(this.prices, settings, this.candlesData);
    var sure = Date.now() - baslangic;
    var simStats = simulation.getStats();

    this.performance.scans.push({ timestamp: Date.now(), coinsScanned: filtreli.length, signalsFound: signalCount, machineAccepted: machineAccepted, machineRejected: machineRejected, duration: sure });
    this.performance.signalsGenerated += signalCount;
    this.performance.signalsAccepted += machineAccepted;
    this.performance.signalsRejected += machineRejected;

    console.log('\n' + '-'.repeat(50));
    console.log('[TARAMA] Tamamlandi (' + (sure/1000).toFixed(1) + 's) — ' + signalCount + ' ALIM sinyali');
    console.log('[MAKINE] ✅ ' + machineAccepted + ' kabul | ❌ ' + machineRejected + ' red');
    console.log('[SIM] Bakiye: ' + simStats.balance?.toFixed(2) + ' | Islem: ' + simStats.totalTrades + ' | Basari: %' + simStats.winRate);

    db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found,machine_accepted,machine_rejected) VALUES (?,?,?,?,?,?)').run(filtreli.length, signalCount, sure, JSON.stringify(signalsFound), machineAccepted, machineRejected);

    if (this.learningManager && this.scanCount % 3 === 0) {
      try { await this.learningManager.saveAndSync('Tarama #' + this.scanCount); } catch(e) {}
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('╔══════════════════════════════════════╗');
    console.log('║   TRADING BOT v21 - MAKİNE ZEKASI   ║');
    console.log('╚══════════════════════════════════════╝');
    await this.updateBTCTrend();

    var settings = this.getSettings();
    var githubEnabled = settings.github_sync_enabled === 'true';
    var githubToken = process.env.GITHUB_TOKEN;

    if (githubEnabled && githubToken) {
      try {
        var GLM = require('./github_learning_sync').IntegratedLearningManager;
        this.learningManager = new GLM({ repoUrl: process.env.GITHUB_LEARNING_REPO || '', token: githubToken, autoSync: false, syncInterval: 30 });
        var initResult = await this.learningManager.initialize(this.machine, simulation);
        console.log('[GITHUB] ✅ Ogrenme sync AKTIF');
      } catch(e) { console.error('[GITHUB] Sync hatasi:', e.message); }
    }

    await this.scan();
    var intervalMin = parseInt(settings.scan_interval || 20);
    var self = this;
    this.interval = setInterval(async function() { await self.updateBTCTrend(); await self.scan(); }, intervalMin * 60 * 1000);
    console.log('[BOT] Her ' + intervalMin + ' dakikada bir tarama');
    console.log('[BOT] Makine guven esigi: %' + (this.machine.settings.confidenceRequired * 100).toFixed(0));
    console.log('[BOT] Gercek Alim: ' + (settings.real_trading === 'true' ? '✅ ACIK' : '❌ KAPALI'));
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running = false; this.interval = null;
    if (this.learningManager) { this.learningManager.stop(); }
    console.log('[BOT] Durduruldu.');
  }

  getMachineReport() {
    var simStats = simulation.getStats();
    return {
      bot: { running: this.running, scanCount: this.scanCount, btcTrend: this.btcTrend },
      machine: { adaptiveThreshold: simulation.getAdaptiveThreshold(), consecutiveLosses: simStats.consecutiveLosses || 0 },
      performance: {
        signalsGenerated: this.performance.signalsGenerated,
        signalsAccepted: this.performance.signalsAccepted,
        signalsRejected: this.performance.signalsRejected,
        acceptanceRate: this.performance.signalsGenerated > 0 ? (this.performance.signalsAccepted / this.performance.signalsGenerated * 100).toFixed(1) : 0
      },
      simulation: { balance: simStats.balance, totalPnl: simStats.totalPnl, winRate: simStats.winRate, profitFactor: simStats.profitFactor }
    };
  }
}

module.exports = new TradingEngine();
