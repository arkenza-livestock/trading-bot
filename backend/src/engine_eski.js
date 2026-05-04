const binance    = require('./binance');
const analysis   = require('./analysis');
const db         = require('./database');
const simulation = require('./simulation');
const TelegramService = require('./telegram');

class TradingEngine {
  constructor() {
    this.running   = false;
    this.interval  = null;
    this.btcTrend  = { trend:'BELIRSIZ', rsi:50, lastUpdate:0 };
    this.scanCount = 0;
    this.prices    = {};
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
      const candles = await binance.getKlines('BTCUSDT', '4h', 150);
      if (!candles || candles.length < 100) return;
      const closes = candles.map(c => parseFloat(c[4]));
      const rsi    = analysis.hesaplaRSI(closes, 14);
      const ema21  = analysis.hesaplaEMA(closes, 21);
      const ema50  = analysis.hesaplaEMA(closes, 50);
      const fiyat  = closes[closes.length - 1];
      let trend = 'NOTR';
      if (fiyat > ema21 && ema21 > ema50) trend = 'YUKARI';
      else if (fiyat > ema21) trend = 'HAFIF_YUKARI';
      else if (fiyat < ema21 && ema21 < ema50) trend = 'ASAGI';
      else if (fiyat < ema21) trend = 'HAFIF_ASAGI';
      this.btcTrend = { trend, rsi, fiyat, lastUpdate: Date.now() };
      console.log('BTC: ' + trend + ' | RSI:' + rsi.toFixed(1) + ' | $' + fiyat.toFixed(0));
    } catch(e) {
      console.error('BTC trend hatası:', e.message);
    }
  }

  async scan() {
    const baslangic = Date.now();
    const settings  = this.getSettings();
    this.scanCount++;

    const minHacim = parseFloat(settings.min_volume || 10000000);
    const maxCoin  = parseInt(settings.max_coins || 50);
    const minScore = parseInt(settings.min_score || 40);

    console.log('\n[' + new Date().toLocaleTimeString('tr-TR') + '] TARAMA #' + this.scanCount);
    console.log('BTC: ' + this.btcTrend.trend + ' | RSI:' + (this.btcTrend.rsi || 50).toFixed(1));

    const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT','USTCUSDT']);

    let tickers;
    try {
      tickers = await binance.getAllTickers();
    } catch(e) {
      console.error('Ticker hatası:', e.message);
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

    tumFiltreli.sort(function(a, b) {
      return parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume);
    });

    const filtreli = tumFiltreli.slice(0, maxCoin);

    console.log(filtreli.length + ' coin taranacak');

    db.prepare("DELETE FROM signals").run();

    let signalCount  = 0;
    const signalsFound = [];
    const telegram   = this.getTelegram();
    let errorCount   = 0;

    for (let i = 0; i < filtreli.length; i++) {
      const ticker = filtreli[i];
      try {
        const candles4H = await binance.getKlines(ticker.symbol, '4h', 200);
        if (!candles4H || candles4H.length < 100) continue;

        const result = analysis.analyze(candles4H, ticker);
        if (!result) continue;

        this.prices[ticker.symbol] = result.fiyat;

        const sinyal = result.puan >= minScore ? 'ALIM' : result.puan <= -20 ? 'SATIS' : 'BEKLE';
        const risk   = result.puan >= 80 ? 'DUSUK' : result.puan >= 60 ? 'ORTA' : 'YUKSEK';

        db.prepare('INSERT INTO signals (symbol,signal_type,score,risk,price,fiyat,rsi,macd,trend,positive_signals,negative_signals,ai_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
          result.symbol,
          sinyal,
          result.puan,
          risk,
          result.fiyat,
          result.fiyat,
          result.rsi,
          result.macdBullish ? 1 : 0,
          result.trend,
          JSON.stringify(result.pozitif || []),
          JSON.stringify(result.negatif || []),
          'Puan:' + result.puan + ' | BTC:' + this.btcTrend.trend
        );

        if (sinyal === 'ALIM') {
          signalCount++;
          signalsFound.push(result.symbol);
          console.log('ALIM: ' + result.symbol + ' | Puan:' + result.puan + ' | RSI:' + result.rsi + ' | ' + result.trend);

          simulation.openPosition({
            symbol:      result.symbol,
            signal_type: 'ALIM',
            price:       result.fiyat,
            fiyat:       result.fiyat,
            score:       result.puan,
            trend:       result.trend,
            stop_loss:   result.stop_loss,
            stopLoss:    result.stop_loss,
          }, settings);

          if (telegram) {
            const telMin = parseInt(settings.telegram_min_score || 60);
            if (result.puan >= telMin) {
              await telegram.sendMessage(
                'ALIM — ' + result.symbol + '\n' +
                'Fiyat: ' + result.fiyat + ' USDT\n' +
                'Puan: ' + result.puan + ' | RSI: ' + result.rsi + '\n' +
                'Trend: ' + result.trend + '\n' +
                'Hedef: ' + result.hedef + ' | Stop: ' + result.stop_loss
              );
              await new Promise(function(r) { setTimeout(r, 500); });
            }
          }
        }

        await new Promise(function(r) { setTimeout(r, 150); });
        errorCount = 0;

      } catch(e) {
        errorCount++;
        console.error(ticker.symbol + ' hatası:', e.message);
        if (errorCount > 5) {
          await new Promise(function(r) { setTimeout(r, 30000); });
          errorCount = 0;
        }
      }
    }

    simulation.updatePositions(this.prices, settings);

    const sure = Date.now() - baslangic;
    console.log('\nTarama tamamlandı (' + (sure/1000).toFixed(1) + 's) — ' + signalCount + ' sinyal\n');

    db.prepare('INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found) VALUES (?,?,?,?)').run(
      filtreli.length, signalCount, sure, JSON.stringify(signalsFound)
    );
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('TRADING BOT v20 BASLADI');
    await this.updateBTCTrend();
    await this.scan();
    const settings    = this.getSettings();
    const intervalMin = parseInt(settings.scan_interval || 20);
    const self        = this;
    this.interval     = setInterval(async function() {
      await self.updateBTCTrend();
      await self.scan();
    }, intervalMin * 60 * 1000);
    console.log('Her ' + intervalMin + ' dakikada bir tarama');
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running  = false;
    this.interval = null;
    console.log('Engine durduruldu.');
  }
}

module.exports = new TradingEngine();
