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
    
    // MAKİNE ZEKASI
    this.machine = new MachineDecisionEngine();
    this.candlesData = {};
    
    this.performance = {
      scans: [],
      signalsGenerated: 0,
      signalsAccepted: 0,
      signalsRejected: 0,
      rejectionReasons: {}
    };
  }

  getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  getTelegram() {
    const s = this.getSettings();
    if (!s.telegram_token || !s.telegram_chat_id) return null;
    return new TelegramService(s.telegram_token, s.telegram_chat_id);
  }

  async updateBTCTrend() {
    try {
      const candles = await binance.getKlines('BTCUSDT', '4h', 200);
      if (!candles || candles.length < 100) return;
      
      this.candlesData['BTCUSDT'] = candles;
      
      const closes = candles.map(c => parseFloat(c[4]));
      const highs  = candles.map(c => parseFloat(c[2]));
      const lows   = candles.map(c => parseFloat(c[3]));
      
      const rsi    = analysis.hesaplaRSI(closes, 14);
      const ema21  = analysis.hesaplaEMA(closes, 21);
      const ema50  = analysis.hesaplaEMA(closes, 50);
      const fiyat  = closes[closes.length - 1];
      
      let trend = 'NOTR';
      if (fiyat > ema21 && ema21 > ema50) trend = 'YUKARI';
      else if (fiyat > ema21) trend = 'HAFIF_YUKARI';
      else if (fiyat < ema21 && ema21 < ema50) trend = 'ASAGI';
      else if (fiyat < ema21) trend = 'HAFIF_ASAGI';
      
      const adx = analysis.hesaplaADX ? analysis.hesaplaADX(highs, lows, closes, 14) : { adx: 0 };
      
      this.btcTrend = { 
        trend, rsi, fiyat, 
        strength: adx.adx || 0,
        lastUpdate: Date.now() 
      };
      
      console.log(`[BTC] ${trend} | RSI:${rsi.toFixed(1)} | ADX:${(adx.adx||0).toFixed(1)} | $${fiyat.toFixed(0)}`);
    } catch(e) {
      console.error('[BTC] Trend hatasi:', e.message);
    }
  }

  async scan() {
    const baslangic = Date.now();
    const settings  = this.getSettings();
    this.scanCount++;

    const minHacim = parseFloat(settings.min_volume || 10000000);
    const maxCoin  = parseInt(settings.max_coins || 50);
    const minScore = parseInt(settings.min_score || 40);

    console.log('\n' + '='.repeat(50));
    console.log('[' + new Date().toLocaleTimeString('tr-TR') + '] TARAMA #' + this.scanCount);
    console.log('[BTC] ' + this.btcTrend.trend + ' | RSI:' + (this.btcTrend.rsi||50).toFixed(1) + ' | Guc:' + (this.btcTrend.strength||0).toFixed(1));
    console.log('='.repeat(50));

    const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT']);

    let tickers;
    try {
      tickers = await binance.getAllTickers();
    } catch(e) {
      console.error('[TARAMA] Ticker hatasi:', e.message);
      return;
    }

    const tumFiltreli = [];
    for (let i = 0; i < tickers.length; i++) {
      const t = tickers[i];
      if (!t.symbol.endsWith('USDT')) continue;
      if (STABLES.has(t.symbol)) continue;
      const hacim   = parseFloat(t.quoteVolume) || 0;
      const degisim = parseFloat(t.priceChangePercent) || 0;
      const fiyat   = parseFloat(t.lastPrice) || 0;
      if (fiyat <= 0) continue;
      if (hacim < minHacim) continue;
      if (degisim <= -15) continue;
      if (degisim >= 15) continue;
      tumFiltreli.push(t);
    }

    tumFiltreli.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    const filtreli = tumFiltreli.slice(0, maxCoin);

    console.log(filtreli.length + ' coin taranacak\n' + '-'.repeat(50));

    db.prepare("DELETE FROM signals").run();

    let signalCount  = 0;
    let machineAccepted = 0;
    let machineRejected = 0;
    const signalsFound = [];
    const rejectionReasons = {};
    const telegram   = this.getTelegram();
    let errorCount   = 0;

    for (let i = 0; i < filtreli.length; i++) {
      const ticker = filtreli[i];
      
      try {
        const candles4H = await binance.getKlines(ticker.symbol, '4h', 200);
        if (!candles4H || candles4H.length < 100) continue;

        this.candlesData[ticker.symbol] = candles4H;

        const result = analysis.analyze(candles4H, ticker);
        if (!result) continue;

        this.prices[ticker.symbol] = result.fiyat;

        // MAKİNE ANALİZİ
        const machineAnalysis = this.machine.analyze(candles4H, {
          symbol: ticker.symbol,
          priceChangePercent: ticker.priceChangePercent || 0,
          quoteVolume: ticker.quoteVolume || 0
        });

        let sinyalTipi = 'BEKLE';
        let finalScore = result.puan || 0;
        let machineOnay = false;
        let rejectReason = '';

        if (machineAnalysis.action === 'BUY' && machineAnalysis.confidence >= 0.70) {
          sinyalTipi = 'ALIM';
          machineOnay = true;
          machineAccepted++;
        } else if (machineAnalysis.action === 'WAIT' && result.puan >= minScore) {
          sinyalTipi = 'BEKLE';
          rejectReason = 'MAKINE_BEKLE_DEDI';
        } else if (machineAnalysis.action === 'SELL') {
          sinyalTipi = 'SATIS';
          rejectReason = 'MAKINE_SAT_DEDI';
        } else if (machineAnalysis.confidence < 0.70) {
          rejectReason = 'DUSUK_GUVEN';
        }

        if (!machineOnay && rejectReason) {
          machineRejected++;
          rejectionReasons[rejectReason] = (rejectionReasons[rejectReason] || 0) + 1;
        }

        const risk = machineOnay ? 
          (machineAnalysis.confidence >= 0.85 ? 'DUSUK' : 
           machineAnalysis.confidence >= 0.75 ? 'ORTA' : 'YUKSEK') : 'YUKSEK';

        db.prepare(
          'INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(
          result.symbol, sinyalTipi, finalScore, risk,
          result.fiyat, result.fiyat,
          result.rsi, result.macdBullish ? 1 : 0,
          result.trend,
          JSON.stringify(result.pozitif || []),
          JSON.stringify(result.negatif || []),
          machineOnay ? 
            '✅ Makine ONAYLI | Guven:%' + (machineAnalysis.confidence*100).toFixed(1) + ' | ' + machineAnalysis.reasoning :
            '❌ Makine RED: ' + rejectReason
        );

        if (sinyalTipi === 'ALIM' && machineOnay) {
          signalCount++;
          signalsFound.push(result.symbol);
          
          console.log(
            '[✅ ALIM] ' + result.symbol.padEnd(10) + ' | ' +
            'Puan:' + String(finalScore).padStart(3) + ' | ' +
            'RSI:' + result.rsi.toFixed(1) + ' | ' +
            'AI:%' + (machineAnalysis.confidence*100).toFixed(0) + ' | ' +
            'Desen:' + (machineAnalysis.similarPatternsFound || 0) + ' | ' +
            result.trend
          );

          simulation.openPosition({
            symbol: result.symbol,
            signal_type: 'ALIM',
            price: result.fiyat,
            fiyat: result.fiyat,
            score: finalScore,
            trend: result.trend,
            stop_loss: machineAnalysis.stopLoss || result.stop_loss,
            stopLoss: machineAnalysis.stopLoss || result.stop_loss,
            target: machineAnalysis.takeProfit || result.hedef,
            machineConfidence: machineAnalysis.confidence,
            machineReasoning: machineAnalysis.reasoning,
            similarPatternsFound: machineAnalysis.similarPatternsFound
          }, settings, this.btcTrend, this.candlesData);

          if (telegram) {
            const telMin = parseInt(settings.telegram_min_score || 60);
            if (finalScore >= telMin) {
              await telegram.sendMessage(
                '🤖 MAKİNE ONAYLI ALIM — ' + result.symbol + '\n' +
                '💰 Fiyat: ' + result.fiyat + ' USDT\n' +
                '📊 Puan: ' + finalScore + ' | RSI: ' + result.rsi.toFixed(1) + '\n' +
                '🧠 AI Guven: %' + (machineAnalysis.confidence*100).toFixed(1) + '\n' +
                '📈 Trend: ' + result.trend + '\n' +
                '🔍 Benzer Desen: ' + (machineAnalysis.similarPatternsFound || 0) + '\n' +
                '🎯 Hedef: ' + (machineAnalysis.takeProfit || result.hedef)?.toFixed(6) + '\n' +
                '🛑 Stop: ' + (machineAnalysis.stopLoss || result.stop_loss)?.toFixed(6) + '\n' +
                '💭 ' + (machineAnalysis.reasoning || '')
              );
              await new Promise(r => setTimeout(r, 500));
            }
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

    const sure = Date.now() - baslangic;
    const simStats = simulation.getStats();
    
    this.performance.scans.push({
      timestamp: Date.now(),
      coinsScanned: filtreli.length,
      signalsFound: signalCount,
      machineAccepted,
      machineRejected,
      duration: sure
    });
    
    this.performance.signalsGenerated += signalCount;
    this.performance.signalsAccepted += machineAccepted;
    this.performance.signalsRejected += machineRejected;

    console.log('\n' + '-'.repeat(50));
    console.log('[TARAMA] Tamamlandi (' + (sure/1000).toFixed(1) + 's) — ' + signalCount + ' ALIM sinyali');
    console.log('[MAKINE] ✅ ' + machineAccepted + ' kabul | ❌ ' + machineRejected + ' red');
    console.log('[SIM] Bakiye: ' + simStats.balance?.toFixed(2) + ' | Islem: ' + simStats.totalTrades + ' | Basari: %' + simStats.winRate);

    db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found) VALUES (?,?,?,?)').run(
      filtreli.length, signalCount, sure, JSON.stringify(signalsFound)
    );
  }

  async start() {
    if (this.running) return;
    this.running = true;
    
    console.log('╔══════════════════════════════════════╗');
    console.log('║   TRADING BOT v21 - MAKİNE ZEKASI   ║');
    console.log('╚══════════════════════════════════════╝');
    
    await this.updateBTCTrend();
    await this.scan();
    
    const settings    = this.getSettings();
    const intervalMin = parseInt(settings.scan_interval || 20);
    const self        = this;
    
    this.interval = setInterval(async function() {
      await self.updateBTCTrend();
      await self.scan();
    }, intervalMin * 60 * 1000);
    
    console.log('[BOT] Her ' + intervalMin + ' dakikada bir tarama');
    console.log('[BOT] Makine guven esigi: %' + (this.machine.settings.confidenceRequired * 100).toFixed(0));
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running  = false;
    this.interval = null;
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
        acceptanceRate: this.performance.signalsGenerated > 0 ?
          (this.performance.signalsAccepted / this.performance.signalsGenerated * 100).toFixed(1) : 0
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
