// ============================================================
// PROFESYONEL ENGINE
// Kurumsal botların kullandığı filtreleme:
// - BTC trend filtresi
// - Çoklu zaman dilimi uyumu (4H + 1H)
// - Market cap kategorisi
// - Dinamik eşik sistemi
// - Rate limiting & hata yönetimi
// ============================================================

const binance  = require('./binance');
const analysis = require('./analysis');
const db       = require('./database');
const TelegramService = require('./telegram');

class ProfessionalEngine {
  constructor() {
    this.running   = false;
    this.interval  = null;
    this.btcTrend  = { trend:'BELIRSIZ', rsi:50, lastUpdate:0 };
    this.ethTrend  = { trend:'BELIRSIZ', rsi:50, lastUpdate:0 };
    this.scanCount = 0;
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

  // ── BTC & ETH TREND ANALİZİ ──────────────────────────────
  async updateMarketTrend() {
    try {
      const [btc4H, btc1H, eth4H] = await Promise.all([
        binance.getKlines('BTCUSDT', '4h', 100),
        binance.getKlines('BTCUSDT', '1h', 100),
        binance.getKlines('ETHUSDT', '4h', 100),
      ]);

      const btcResult4H = analysis.analyze(btc4H, { symbol:'BTCUSDT', priceChangePercent:0, quoteVolume:999999999 });
      const ethResult4H = analysis.analyze(eth4H, { symbol:'ETHUSDT', priceChangePercent:0, quoteVolume:999999999 });

      // BTC 1H RSI
      const btcCloses1H = btc1H.map(c => parseFloat(c[4]));
      const btcRsi1H    = analysis.hesaplaRSI(btcCloses1H, 14);

      this.btcTrend = {
        trend:       btcResult4H?.trend || 'BELIRSIZ',
        rsi:         btcResult4H?.rsi || 50,
        rsi1H:       btcRsi1H,
        adx:         btcResult4H?.adx || 0,
        macdBullish: btcResult4H?.macdBullish || false,
        fiyat:       btcResult4H?.fiyat || 0,
        lastUpdate:  Date.now()
      };

      this.ethTrend = {
        trend:      ethResult4H?.trend || 'BELIRSIZ',
        rsi:        ethResult4H?.rsi || 50,
        lastUpdate: Date.now()
      };

      console.log(`📊 BTC: ${this.btcTrend.trend} | RSI:${this.btcTrend.rsi} | ETH: ${this.ethTrend.trend}`);
    } catch(e) {
      console.error('Market trend hatası:', e.message);
    }
  }

  // ── BTC FİLTRE KONTROLÜ ──────────────────────────────────
  btcFiltrePas(settings) {
    const btcFilter = settings.btc_filter_enabled !== 'false';
    if (!btcFilter) return false;

    // BTC güçlü düşüş → tüm alımları engelle
    if (this.btcTrend.trend === 'GUCLU_ASAGI') {
      console.log('🚫 BTC güçlü düşüş — tüm alımlar engellendi');
      return true;
    }
    // BTC RSI aşırı alım bölgesinde → dikkatli ol
    if (this.btcTrend.rsi > 78) {
      console.log(`⚠️ BTC RSI ${this.btcTrend.rsi} — aşırı alım, minimum puan +15`);
    }
    return false;
  }

  // ── DİNAMİK MİN PUAN ────────────────────────────────────
  getDinamikMinPuan(settings) {
    let minPuan = parseInt(settings.min_puan || 50);

    // BTC durumuna göre ayarla
    if (this.btcTrend.trend === 'GUCLU_YUKARI') {
      minPuan = Math.max(45, minPuan - 5); // Boğa piyasası → biraz gevşet
    } else if (this.btcTrend.trend === 'ASAGI') {
      minPuan = Math.min(70, minPuan + 15); // Düşüş → daha sıkı
    } else if (this.btcTrend.trend === 'NOTR') {
      minPuan = Math.min(65, minPuan + 10); // Kararsız → sıkı
    }
    if (this.btcTrend.rsi > 75) minPuan += 10; // BTC aşırı alım
    if (this.btcTrend.rsi < 30) minPuan -= 5;  // BTC aşırı satım

    return minPuan;
  }

  // ── 1H KONFIRMASYON ─────────────────────────────────────
  async get1HKonfirmasyon(symbol) {
    try {
      const candles1H = await binance.getKlines(symbol, '1h', 100);
      if (!candles1H || candles1H.length < 50) return null;

      const closes = candles1H.map(c => parseFloat(c[4]));
      const highs  = candles1H.map(c => parseFloat(c[2]));
      const lows   = candles1H.map(c => parseFloat(c[3]));
      const vols   = candles1H.map(c => parseFloat(c[5]));

      const rsi1H   = analysis.hesaplaRSI(closes, 14);
      const macd1H  = analysis.hesaplaMACD(closes, 12, 26, 9);
      const ema21_1H = analysis.hesaplaEMA(closes, 21);
      const ema50_1H = analysis.hesaplaEMA(closes, 50);
      const fiyat    = closes[closes.length-1];

      const trend1H = fiyat > ema21_1H && ema21_1H > ema50_1H ? 'YUKARI' :
                      fiyat < ema21_1H && ema21_1H < ema50_1H ? 'ASAGI' : 'YATAY';

      return {
        rsi:      rsi1H,
        trend:    trend1H,
        macdBull: macd1H.bullishCross,
        macdPos:  macd1H.macdLine > macd1H.signalLine,
        uyumlu:   trend1H === 'YUKARI' && rsi1H < 65
      };
    } catch(e) {
      return null;
    }
  }

  // ── COIN KALİTE SKORU ────────────────────────────────────
  coinKaliteSkor(ticker) {
    const hacim = parseFloat(ticker.quoteVolume) || 0;
    const degisim = Math.abs(parseFloat(ticker.priceChangePercent)) || 0;

    let skor = 0;

    // Hacim skoru
    if      (hacim > 500000000) skor += 30; // $500M+ = Top tier
    else if (hacim > 100000000) skor += 20; // $100M+
    else if (hacim > 50000000)  skor += 15; // $50M+
    else if (hacim > 10000000)  skor += 10; // $10M+
    else                        skor += 5;

    // Değişim skoru (çok yüksek değişim = pump riski)
    if      (degisim > 20) skor -= 10; // Pump riski
    else if (degisim > 10) skor -= 5;
    else if (degisim > 3)  skor += 5;

    return skor;
  }

  // ── ANA TARAMA ───────────────────────────────────────────
  async scan() {
    const baslangic = Date.now();
    const settings  = this.getSettings();
    this.scanCount++;

    const minHacim = parseFloat(settings.min_volume  || 10000000); // 10M default
    const maxCoin  = parseInt(settings.max_coins      || 100);
    const kapilar  = settings.scan_interval           || '4h';

    console.log(`\n[${new Date().toLocaleTimeString('tr-TR')}] ═══ TARAMA #${this.scanCount} ═══`);
    console.log(`BTC: ${this.btcTrend.trend} | RSI:${this.btcTrend.rsi} | ETH:${this.ethTrend.trend}`);

    // BTC filtresi
    if (this.btcFiltrePas(settings)) {
      this.saveScanLog(0, 0, Date.now()-baslangic, []);
      return;
    }

    const dinamikMinPuan = this.getDinamikMinPuan(settings);
    console.log(`🎯 Dinamik min puan: ${dinamikMinPuan}`);

    // Stables listesi
    const STABLES = new Set([
      'BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT',
      'FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT',
      'USTCUSDT','FRAXUSDT'
    ]);

    // Tüm tickerları çek
    let tickers;
    try {
      tickers = await binance.getAllTickers();
    } catch(e) {
      console.error('Ticker hatası:', e.message);
      return;
    }

    // Filtrele ve sırala
    const filtreli = tickers
      .filter(t => {
        if (!t.symbol.endsWith('USDT')) return false;
        if (STABLES.has(t.symbol))      return false;
        const hacim   = parseFloat(t.quoteVolume)       || 0;
        const degisim = parseFloat(t.priceChangePercent) || 0;
        const fiyat   = parseFloat(t.lastPrice)          || 0;
        if (fiyat <= 0)   return false;
        if (hacim < minHacim) return false;
        if (degisim > 25) return false;  // Pump filtresi
        if (degisim < -20) return false; // Aşırı dump filtresi
        return true;
      })
      .sort((a, b) => {
        // Kalite skoru + hacim kombinasyonu
        const sA = this.coinKaliteSkor(a) * 1000 + (parseFloat(a.quoteVolume)||0) / 1e9;
        const sB = this.coinKaliteSkor(b) * 1000 + (parseFloat(b.quoteVolume)||0) / 1e9;
        return sB - sA;
      })
      .slice(0, maxCoin);

    console.log(`${filtreli.length} coin taranacak`);

    // Eski sinyalleri temizle
    db.prepare("DELETE FROM signals").run();

    let signalCount = 0;
    const signalsFound = [];
    const telegram = this.getTelegram();
    let errorCount = 0;

    for (const ticker of filtreli) {
      try {
        // 4H mumları çek
        const candles4H = await binance.getKlines(ticker.symbol, '4h', 150);
        if (!candles4H || candles4H.length < 100) continue;

        // Analiz yap
        const result = analysis.analyze(candles4H, ticker);
        if (!result) continue;

        // 1H konfirmasyon (sadece güçlü adaylar için)
        let konfirmasyon = null;
        let konfirmasyonPuani = 0;

        if (result.puan >= dinamikMinPuan - 15) {
          konfirmasyon = await this.get1HKonfirmasyon(ticker.symbol);
          await new Promise(r => setTimeout(r, 80));

          if (konfirmasyon) {
            if (konfirmasyon.uyumlu)  konfirmasyonPuani += 15;
            if (konfirmasyon.macdBull) konfirmasyonPuani += 10;
            if (konfirmasyon.rsi < 45) konfirmasyonPuani += 8;
          }
        }

        const finalPuan = result.puan + konfirmasyonPuani;

        // DB'ye kaydet
        db.prepare(`
          INSERT INTO signals
          (symbol, fiyat, puan, risk, sinyal, rsi, trend, macd_bullish,
           bollinger_pct, obv_trend, vol_oran, destek, direnc, hedef,
           stop_loss, atr_oran, pozitif, negatif, degisim24h, hacim24h)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          result.symbol,
          result.fiyat,
          finalPuan,
          finalPuan >= 80 ? 'DUSUK' : finalPuan >= 60 ? 'ORTA' : 'YUKSEK',
          finalPuan >= dinamikMinPuan ? 'ALIM' : finalPuan <= -20 ? 'SATIS' : 'BEKLE',
          result.rsi,
          result.trend,
          result.macdBullish ? 1 : 0,
          result.bPct,
          result.obvTrend,
          result.volOran,
          result.destek,
          result.direnc,
          result.hedef,
          result.stop_loss,
          result.atrOran,
          JSON.stringify([
            ...result.pozitif,
            ...(konfirmasyon?.uyumlu ? ['1H Trend Uyumlu'] : []),
            ...(konfirmasyon?.macdBull ? ['1H MACD Bullish'] : [])
          ]),
          JSON.stringify(result.negatif)
        );

        // ALIM sinyali
        if (finalPuan >= dinamikMinPuan) {
          signalCount++;
          signalsFound.push(result.symbol);
          console.log(`🚀 ALIM: ${result.symbol} | 4H:${result.puan} + 1H:${konfirmasyonPuani} = ${finalPuan} | RSI:${result.rsi} | ${result.trend}`);

          // Telegram
          if (telegram) {
            const telegramMinPuan = parseInt(settings.telegram_min_puan || 65);
            if (finalPuan >= telegramMinPuan) {
              const enrichedResult = { ...result, puan: finalPuan };
              await telegram.sendSignal(enrichedResult);
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 120));
        errorCount = 0;

      } catch(e) {
        errorCount++;
        console.error(`${ticker.symbol} hatası:`, e.message);
        if (errorCount > 5) {
          console.log('⚠️ Çok fazla hata — 30s bekleniyor');
          await new Promise(r => setTimeout(r, 30000));
          errorCount = 0;
        }
      }
    }

    const sure = Date.now() - baslangic;
    console.log(`\n✅ Tarama tamamlandı (${(sure/1000).toFixed(1)}s)`);
    console.log(`   ${signalCount} ALIM sinyali | ${filtreli.length} coin tarandı`);
    console.log(`   Dinamik min puan: ${dinamikMinPuan} | BTC: ${this.btcTrend.trend}\n`);

    this.saveScanLog(filtreli.length, signalCount, sure, signalsFound);
  }

  saveScanLog(coinCount, signalCount, durationMs, signalsFound) {
    db.prepare(`
      INSERT INTO scan_logs (coin_count, signal_count, duration_ms, signals_found)
      VALUES (?, ?, ?, ?)
    `).run(coinCount, signalCount, durationMs, JSON.stringify(signalsFound));
  }

  async start() {
    if (this.running) return;
    this.running = true;

    console.log('\n════════════════════════════════════════');
    console.log('  PROFESYONEL SİNYAL BOTU BAŞLADI');
    console.log('  RSI+StochRSI+Williams+CCI+ADX+MACD');
    console.log('  BB+OBV+CMF+VWAP+Fib+Mum+4H+1H');
    console.log('════════════════════════════════════════\n');

    // BTC/ETH trend güncelle
    await this.updateMarketTrend();

    // İlk tarama
    await this.scan();

    const settings    = this.getSettings();
    const intervalMin = parseInt(settings.scan_interval || 20);
    const intervalMs  = intervalMin * 60 * 1000;

    // Periyodik tarama
    this.interval = setInterval(async () => {
      // Her taramada BTC/ETH güncelle
      await this.updateMarketTrend();
      await this.scan();
    }, intervalMs);

    console.log(`⏰ Her ${intervalMin} dakikada bir tarama`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running  = false;
    this.interval = null;
    console.log('Engine durduruldu.');
  }
}

module.exports = new ProfessionalEngine();
