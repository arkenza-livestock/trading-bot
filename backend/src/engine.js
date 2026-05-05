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
        if (symbolsToCheck.has(t.symbol)) {
          this.prices[t.symbol] = parseFloat(t.lastPrice);
        }
      }
    } catch(e) {}
  }

  async checkPositionsQuick() {
    const settings = this.getSettings();
    const realTrading = settings.real_trading === 'true' || settings.real_trading === '1';
    await this.fetchPricesForOpenPositions();
    simulation.updatePositions(this.prices, settings, this.candlesData);
    if (realTrading && Object.keys(this.realPositions).length > 0) {
      await this.updateRealPositions();
    }
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
    } catch(e) {
      console.error('[BTC] Trend hatasi:', e.message);
    }
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
      if (currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;

      const entryPrice = pos.entryPrice;
      const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      const hardStop = entryPrice * (1 - hardStopPct);
      const trailingStop = pos.highestPrice * (1 - trailingPct);
      let sellReason = null;

      if (currentPrice <= hardStop) sellReason = 'STOP_LOSS';
      else if (pnlPct >= minProfitPct * 100 && currentPrice <= trailingStop) sellReason = 'TRAILING_STOP';
      else if (pos.takeProfit && currentPrice >= pos.takeProfit) sellReason = 'TAKE_PROFIT';

      if (sellReason) {
        console.log(`[GERCEK] ${symbol} satis sinyali: ${sellReason} @ ${currentPrice}`);
        try {
          const sellResult = await binance.realSell(symbol, pos.quantity);
          if (sellResult) {
            if (telegram) {
              const netPnl = (currentPrice - entryPrice) * pos.quantity;
              const netPnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
              const emoji = netPnl >= 0 ? '✅ KAR' : '❌ ZARAR';
              const pnlIsaret = netPnl >= 0 ? '+' : '';
              const message = `${emoji} — ${symbol}\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `💰 Giris: ${entryPrice.toFixed(6)}\n` +
                `💰 Cikis: ${currentPrice.toFixed(6)}\n` +
                `${netPnl >= 0 ? '📈 Kar' : '📉 Zarar'}: ${pnlIsaret}%${netPnlPct.toFixed(2)} (${pnlIsaret}${netPnl.toFixed(4)} USDT)\n` +
                `🛑 Neden: ${sellReason}\n` +
                `🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`;
              telegram.sendMessage(message).catch(() => {});
            }
            delete this.realPositions[symbol];
          }
        } catch(e) { console.error(`[GERCEK] ${symbol} satis hatasi:`, e.message); }
      }
    }
  }

  async scan() {
    const baslangic = Date.now();
    const settings  = this.getSettings();
    this.scanCount++;

    const minHacim = parseFloat(settings.min_volume || 10000000);
    const maxCoin  = parseInt(settings.max_coins || 50);
    const realTrading = settings.real_trading === 'true' || settings.real_trading === '1';

    console.log('\n' + '='.repeat(50));
    console.log(`[${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}] TARAMA #${this.scanCount}`);
    console.log(`[BTC] ${this.btcTrend.trend} | RSI:${(this.btcTrend.rsi||50).toFixed(1)} | Guc:${(this.btcTrend.strength||0).toFixed(1)}`);
    console.log(`[GERCEK ALIM] ${realTrading ? '✅ ACIK' : '❌ KAPALI'}`);
    console.log('='.repeat(50));

    const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT']);

    let tickers;
    try {
      tickers = await binance.getAllTickers();
    } catch(e) {
      console.error('[TARAMA] Ticker hatasi:', e.message);
      return;
    }

    for (const t of tickers) {
      this.prices[t.symbol] = parseFloat(t.lastPrice);
    }

    const tumFiltreli = [];
    for (const t of tickers) {
      if (!t.symbol.endsWith('USDT')) continue;
      if (STABLES.has(t.symbol)) continue;
      const hacim   = parseFloat(t.quoteVolume) || 0;
      const degisim = parseFloat(t.priceChangePercent) || 0;
      const fiyat   = parseFloat(t.lastPrice) || 0;
      if (fiyat <= 0 || hacim < minHacim || degisim <= -15 || degisim >= 15) continue;
      tumFiltreli.push(t);
    }

    tumFiltreli.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    const filtreli = tumFiltreli.slice(0, maxCoin);
    console.log(filtreli.length + ' coin taranacak\n' + '-'.repeat(50));

    db.prepare("DELETE FROM signals").run();

    let signalCount = 0, machineAccepted = 0, machineRejected = 0;
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

        const machineAnalysis = this.machine.analyze(candles4H, {
          symbol: ticker.symbol,
          priceChangePercent: ticker.priceChangePercent || 0,
          quoteVolume: ticker.quoteVolume || 0
        });

        let sinyalTipi = 'BEKLE', finalScore = result.puan || 0, machineOnay = false, rejectReason = '';

        if (machineAnalysis.action === 'BUY' && machineAnalysis.confidence >= 0.70) {
          sinyalTipi = 'ALIM'; machineOnay = true; machineAccepted++;
        } else if (machineAnalysis.action === 'WAIT' && result.puan >= (parseInt(settings.min_score) || 40)) {
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

        const risk = machineOnay ? (machineAnalysis.confidence >= 0.85 ? 'DUSUK' : machineAnalysis.confidence >= 0.75 ? 'ORTA' : 'YUKSEK') : 'YUKSEK';

        db.prepare(
          'INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(result.symbol, sinyalTipi, finalScore, risk, result.fiyat, result.fiyat, result.rsi, result.macdBullish ? 1 : 0, result.trend,
          JSON.stringify(result.pozitif || []), JSON.stringify(result.negatif || []),
          machineOnay ? `✅ Makine ONAYLI | Guven:%${(machineAnalysis.confidence*100).toFixed(1)} | ${machineAnalysis.reasoning}` : `❌ Makine RED: ${rejectReason}`
        );

        if (sinyalTipi === 'ALIM' && machineOnay) {
          signalCount++;
          signalsFound.push(result.symbol);
          console.log(`[✅ ALIM] ${result.symbol.padEnd(10)} | Puan:${String(finalScore).padStart(3)} | RSI:${result.rsi.toFixed(1)} | AI:%${(machineAnalysis.confidence*100).toFixed(0)} | Desen:${machineAnalysis.similarPatternsFound || 0} | ${result.trend}`);

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

          if (realTrading && !this.realPositions[result.symbol]) {
            const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);
            const buyResult = await binance.realBuy(result.symbol, tradeAmount, result.fiyat);
            if (buyResult) {
              const executedQty = parseFloat(buyResult.executedQty) || (tradeAmount / result.fiyat);
              this.realPositions[result.symbol] = {
                symbol: result.symbol,
                entryPrice: result.fiyat,
                quantity: executedQty,
                highestPrice: result.fiyat,
                stopLoss: machineAnalysis.stopLoss || result.stop_loss || result.fiyat * 0.98,
                takeProfit: machineAnalysis.takeProfit || result.hedef,
                entryTime: new Date().toISOString(),
                machineConfidence: machineAnalysis.confidence
              };
            }
          }

          if (telegram) {
            const message = `🟢 ALIM — ${result.symbol}\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `💰 Giris: ${result.fiyat} USDT\n` +
              `🧠 AI Guven: %${(machineAnalysis.confidence*100).toFixed(1)} | Puan: ${finalScore}\n` +
              `📈 Trend: ${result.trend}\n` +
              `🎯 Hedef: ${(machineAnalysis.takeProfit || result.hedef)?.toFixed(6)}\n` +
              `🛑 Stop: ${(machineAnalysis.stopLoss || result.stop_loss)?.toFixed(6)}\n` +
              `🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`;
            telegram.sendMessage(message).catch(() => {});
            await new Promise(r => setTimeout(r, 500));
          }
        }

        await new Promise(r => setTimeout(r, 150));
        errorCount = 0;
      } catch(e) {
        errorCount++;
        console.error(ticker.symbol + ' hatasi:', e.message);
        if (errorCount > 5) {
          await new Promise(r => setTimeout(r, 30000));
          errorCount = 0;
        }
      }
    }

    simulation.updatePositions(this.prices, settings, this.candlesData);
    await this.updateRealPositions();

    const sure = Date.now() - baslangic;
    const simStats = simulation.getStats();

    this.performance.scans.push({
      timestamp: Date.now(), coinsScanned: filtreli.length,
      signalsFound: signalCount, machineAccepted, machineRejected, duration: sure
    });
    this.performance.signalsGenerated += signalCount;
    this.performance.signalsAccepted += machineAccepted;
    this.performance.signalsRejected += machineRejected;

    console.log('\n' + '-'.repeat(50));
    console.log(`[TARAMA] Tamamlandi (${(sure/1000).toFixed(1)}s) — ${signalCount} ALIM sinyali`);
    console.log(`[MAKINE] ✅ ${machineAccepted} kabul | ❌ ${machineRejected} red`);
    console.log(`[SIM] Bakiye: ${simStats.balance?.toFixed(2)} | Islem: ${simStats.totalTrades} | Basari: %${simStats.winRate}`);
    if (realTrading) console.log(`[GERCEK] Acik pozisyon: ${Object.keys(this.realPositions).length}`);

    db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found,machine_accepted,machine_rejected) VALUES (?,?,?,?,?,?)').run(
      filtreli.length, signalCount, sure, JSON.stringify(signalsFound), machineAccepted, machineRejected
    );

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

    const settings = this.getSettings();

    // DEBUG: Tüm ayarları logla
    console.log('[GITHUB] DEBUG TUM AYARLAR:', JSON.stringify(settings));
    const githubEnabled = (settings.github_sync_enabled === 'true' || settings.github_sync_enabled === true || settings.github_sync_enabled === 1 || settings.github_sync_enabled === '1');
    console.log('[GITHUB] DEBUG github_sync_enabled ham deger:', settings.github_sync_enabled, 'tip:', typeof settings.github_sync_enabled, 'sonuc:', githubEnabled);
    const githubToken = process.env.GITHUB_TOKEN;

    if (githubEnabled && githubToken) {
      try {
        console.log('[GITHUB] Sync başlatiliyor...');
        const { IntegratedLearningManager } = require('./github_learning_sync');
        this.learningManager = new IntegratedLearningManager({
          repoUrl: process.env.GITHUB_LEARNING_REPO || 'https://github.com/arkenza-livestock/machine-learning-data',
          token: githubToken,
          branch: 'main',
          autoSync: false,
          syncInterval: 30
        });
        const initResult = await this.learningManager.initialize(this.machine, simulation);
        console.log('[GITHUB] ✅ Öğrenme sync AKTIF');
        if (initResult && initResult.loaded) {
          console.log('[GITHUB] 📂 Önceki öğrenmeler yüklendi');
        }
      } catch(e) {
        console.error('[GITHUB] ❌ Sync başlatma hatasi:', e.message);
      }
    } else {
      if (githubEnabled && !githubToken) {
        console.log('[GITHUB] ⚠️ Sync ACIK ama GITHUB_TOKEN bulunamadi!');
      } else {
        console.log('[GITHUB] ⏸️ Öğrenme sync kapali (ayar: ' + settings.github_sync_enabled + ')');
      }
    }

    const self = this;
    this.priceInterval = setInterval(async () => {
      await self.checkPositionsQuick();
    }, 30000);
    console.log('[KONTROL] Fiyat kontrol dongusu basladi (her 30 sn)');

    await this.scan();
    const intervalMin = parseInt(settings.scan_interval || 20);
    this.interval = setInterval(async () => {
      await self.updateBTCTrend();
      await self.scan();
    }, intervalMin * 60 * 1000);
    console.log(`[BOT] Her ${intervalMin} dakikada bir tarama`);
    console.log(`[BOT] Makine guven esigi: %${(this.machine.settings.confidenceRequired * 100).toFixed(0)}`);
    console.log(`[BOT] Gercek Alim: ${settings.real_trading === 'true' ? '✅ ACIK' : '❌ KAPALI'}`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.priceInterval) clearInterval(this.priceInterval);
    this.running = false;
    this.interval = null;
    this.priceInterval = null;
    if (this.learningManager) { this.learningManager.stop(); }
    console.log('[BOT] Durduruldu.');
  }

  getMachineReport() {
    const simStats = simulation.getStats();
    return {
      bot: { running: this.running, scanCount: this.scanCount, btcTrend: this.btcTrend },
      machine: {
        adaptiveThreshold: simulation.getAdaptiveThreshold(),
        consecutiveLosses: simStats.consecutiveLosses || 0
      },
      performance: {
        signalsGenerated: this.performance.signalsGenerated,
        signalsAccepted: this.performance.signalsAccepted,
        signalsRejected: this.performance.signalsRejected,
        acceptanceRate: this.performance.signalsGenerated > 0 ? (this.performance.signalsAccepted / this.performance.signalsGenerated * 100).toFixed(1) : 0
      },
      simulation: {
        balance: simStats.balance,
        totalPnl: simStats.totalPnl,
        winRate: simStats.winRate,
        profitFactor: simStats.profitFactor
      }
    };
  }
}

module.exports = new TradingEngine();
