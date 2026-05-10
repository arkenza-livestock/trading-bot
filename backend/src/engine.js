/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   ENGINE.JS - ANA TİCARET BOT MOTORU
 *   
 *   📊 Koordinasyon:
 *   - Market taraması
 *   - BTC trend analizi
 *   - Sinyal üretimi ve filtrelemesi
 *   - Pozisyon yönetimi
 *   - Real-time monitoring
 * ═══════════════════════════════════════════════════════════════════════════
 */

const AnalysisEngine = require('./analysis');
const SimulationEngine = require('./simulation');

class TradingEngine {
  constructor(db, binanceAPI, telegram = null) {
    this.db = db;
    this.binance = binanceAPI;
    this.telegram = telegram;

    // Motorlar
    this.analysis = AnalysisEngine;
    this.simulation = new SimulationEngine(db);

    // Durum
    this.running = false;
    this.scanCount = 0;
    this.lastScanTime = 0;

    // BTC Trend
    this.btcTrend = {
      trend: 'BELIRSIZ',
      rsi: 50,
      fiyat: 0,
      strength: 0,
      regime: 'RANGING',
      lastUpdate: 0
    };

    // Piyasa verileri
    this.prices = {};
    this.candlesData = {};

    // Performans
    this.performance = {
      scans: [],
      signalsGenerated: 0,
      signalsAccepted: 0,
      signalsRejected: 0
    };

    console.log('[ENGINE] ✅ Trading Engine başlatıldı');
  }

  /**
   * Ayarları database'den al
   */
  getSettings() {
    try {
      const rows = this.db.prepare('SELECT key, value FROM settings').all() || [];
      const settings = {};
      rows.forEach(r => {
        settings[r.key] = r.value;
      });
      return settings;
    } catch (e) {
      console.warn('[ENGINE] Settings yüklenemedi');
      return {};
    }
  }

  /**
   * BTC Trend'i güncelle
   */
  async updateBTCTrend() {
    try {
      const candles = await this.binance.getKlines('BTCUSDT', '4h', 200);
      if (!candles || candles.length < 100) {
        console.warn('[BTC] Yeterli veri yok');
        return;
      }

      this.candlesData['BTCUSDT'] = candles;

      const closes = candles.map(c => parseFloat(c[4]));
      const highs = candles.map(c => parseFloat(c[2]));
      const lows = candles.map(c => parseFloat(c[3]));
      const fiyat = closes[closes.length - 1];

      // Göstergeler
      const rsi = this.analysis.calcRSI(closes, 14);
      const ema21 = this.analysis.calcEMA(closes, 21);
      const ema50 = this.analysis.calcEMA(closes, 50);
      const adx = this.analysis.calcADX(highs, lows, closes, 14);

      // Trend belirle
      let trend = 'NOTR';
      if (fiyat > ema21 && ema21 > ema50) {
        trend = 'YUKARI';
      } else if (fiyat > ema21) {
        trend = 'HAFIF_YUKARI';
      } else if (fiyat < ema21 && ema21 < ema50) {
        trend = 'ASAGI';
      } else if (fiyat < ema21) {
        trend = 'HAFIF_ASAGI';
      }

      // Rejim belirle
      let regime = 'RANGING';
      if (trend === 'YUKARI' && adx.adx > 25 && adx.diPlus > adx.diMinus) {
        regime = 'RALLY';
      } else if ((trend === 'ASAGI' || trend === 'HAFIF_ASAGI') && adx.adx > 25 && adx.diMinus > adx.diPlus) {
        regime = 'DOWNTREND';
      }

      this.btcTrend = {
        trend: trend,
        rsi: parseFloat(rsi.toFixed(2)),
        fiyat: parseFloat(fiyat.toFixed(2)),
        strength: parseFloat(adx.adx.toFixed(2)),
        regime: regime,
        lastUpdate: Date.now()
      };

      console.log(`
╔═══════════════════════════════════╗
║ 📊 BTC TREPi: ${this.btcTrend.trend.padEnd(20)} ║
║ RSI: ${String(this.btcTrend.rsi).padEnd(25)} ║
║ ADX: ${String(this.btcTrend.strength).padEnd(25)} ║
║ Rejim: ${this.btcTrend.regime.padEnd(24)} ║
╚═══════════════════════════════════╝
      `);
    } catch (e) {
      console.error('[BTC] Trend analizi hatası:', e.message);
    }
  }

  /**
   * Açık pozisyonlar için fiyat al (her 3 saniye)
   */
  async fetchPricesForOpenPositions() {
    try {
      const symbolsToCheck = new Set();
      const simOpen = this.db.prepare("SELECT DISTINCT symbol FROM sim_positions WHERE status='OPEN'").all() || [];
      simOpen.forEach(p => symbolsToCheck.add(p.symbol));

      if (symbolsToCheck.size === 0) return;

      const tickers = await this.binance.getAllTickers();
      if (!tickers || tickers.length === 0) return;

      for (const ticker of tickers) {
        if (symbolsToCheck.has(ticker.symbol)) {
          this.prices[ticker.symbol] = parseFloat(ticker.lastPrice);
        }
      }
    } catch (e) {
      console.error('[ENGINE] Fiyat çekme hatası:', e.message);
    }
  }

  /**
   * Açık pozisyonları kontrol et ve güncelle (Her 3 saniyede)
   */
  async checkPositionsQuick() {
    try {
      await this.fetchPricesForOpenPositions();
      this.simulation.updatePositions(this.prices, this.getSettings());
    } catch (e) {
      console.error('[ENGINE] Pozisyon kontrol hatası:', e.message);
    }
  }

  /**
   * ANA TARAMA FONKSİYONU
   */
  async scan() {
    try {
      const startTime = Date.now();
      this.scanCount++;

      const settings = this.getSettings();
      const maxOpenPos = parseInt(settings.max_open_positions || 3);
      const realTrading = settings.real_trading === 'true';

      // ──────────────────────────────
      // 1. TAKİBİ YAPILACAK COİNLERİ AL
      // ──────────────────────────────
      const tickers = await this.binance.getAllTickers();
      if (!tickers || tickers.length === 0) {
        console.warn('[SCAN] Ticker verileri alınamadı');
        return;
      }

      // Filtreleme
      const filtered = tickers.filter(t => {
        return t.symbol.endsWith('USDT') &&
               (parseFloat(t.quoteVolume || 0) > 100000) &&
               (parseFloat(t.lastPrice) > 0.00001);
      });

      console.log(`[SCAN #${this.scanCount}] 📊 ${filtered.length} coin taranacak...`);

      // ──────────────────────────────
      // 2. HER COİN İÇİN ANALİZ
      // ──────────────────────────────
      const allSignals = [];

      for (const ticker of filtered) {
        try {
          const timeframe = settings.analysis_timeframe || '4h';
          const candles = await this.binance.getKlines(ticker.symbol, timeframe, 100);

          if (!candles || candles.length < 100) continue;

          this.candlesData[ticker.symbol] = candles;

          // Analiz yap
          const signal = this.analysis.analyze(candles, ticker, {
            btcRegime: this.btcTrend.regime
          });

          if (signal && signal.signal_type === 'ALIM') {
            allSignals.push({
              symbol: ticker.symbol,
              side: 'LONG',
              signal_type: signal.signal_type,
              price: signal.fiyat,
              fiyat: signal.fiyat,
              score: signal.puan,
              puan: signal.puan,
              trend: signal.trend,
              rsi: signal.rsi,
              stop_loss: signal.stop_loss,
              stopLoss: signal.stop_loss,
              target: signal.target,
              hedef: signal.hedef,
              atr: signal.atr,
              machineConfidence: signal.confidence,
              passedCount: signal.passedCount,
              totalRules: signal.totalRules,
              risk: signal.risk,
              ruleDetails: signal.ruleDetails,
              rejectionReasons: signal.rejectionReasons
            });
          }

          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          // Coin hatası, devam et
        }
      }

      // ──────────────────────────────
      // 3. SİNYALLERİ SIRALA
      // ──────────────────────────────
      const acceptedSignals = allSignals.filter(s => s.signal_type === 'ALIM');
      const rejectedSignals = allSignals.length - acceptedSignals.length;

      acceptedSignals.sort((a, b) => b.puan - a.puan);

      // En iyi sinyalleri seç
      const selectedSignals = acceptedSignals.slice(0, maxOpenPos);

      // ──────────────────────────────
      // 4. SEÇİLEN SİNYALLERİ İŞLE
      // ──────────────────────────────
      for (const sig of selectedSignals) {
        console.log(`🟢 AL: ${sig.symbol} | Puan:${sig.puan} | ${sig.passedCount}/${sig.totalRules} Kural`);

        // Simülasyona ekle
        this.simulation.openPosition(sig, settings);

        // Real trading
        if (realTrading) {
          // TODO: Gerçek order aç
        }

        // Telegram
        if (this.telegram) {
          this.telegram.sendMessage(`
🟢 SINYAL: ${sig.symbol}
💰 Fiyat: $${sig.fiyat.toFixed(8)}
📊 ${sig.passedCount}/${sig.totalRules} Kural
📈 Puan: ${sig.puan}
          `).catch(() => {});
        }
      }

      // ──────────────────────────────
      // 5. POZİSYONLARI GÜNCELLE
      // ──────────────────────────────
      await this.checkPositionsQuick();

      // ──────────────────────────────
      // 6. LOG ve RAPOR
      // ──────────────────────────────
      const duration = Date.now() - startTime;
      const stats = this.simulation.getStats();

      this.performance.scans.push({
        timestamp: Date.now(),
        coinsScanned: filtered.length,
        signalsFound: selectedSignals.length,
        duration: duration
      });

      this.performance.signalsGenerated += acceptedSignals.length;
      this.performance.signalsAccepted += selectedSignals.length;
      this.performance.signalsRejected += rejectedSignals;

      console.log(`
╔═════════════════════════════════╗
║ 📊 TARAMA TAMAMLANDI            ║
╠═════════════════════════════════╣
║ Taradı: ${String(filtered.length).padEnd(20)} ║
║ Sinyal: ${String(selectedSignals.length).padEnd(20)} ║
║ Red: ${String(rejectedSignals).padEnd(21)} ║
║ Bakiye: ${String(`${stats.balance} USDT`).padEnd(18)} ║
║ Win Rate: ${String(`${stats.winRate}%`).padEnd(17)} ║
║ Süre: ${String(`${duration}ms`).padEnd(20)} ║
╚═════════════════════════════════╝
      `);

      // Database'e kaydet
      try {
        this.db.prepare(`
          INSERT INTO scan_logs 
          (coin_count, signal_count, duration_ms, machine_accepted, machine_rejected) 
          VALUES (?, ?, ?, ?, ?)
        `).run(
          filtered.length,
          selectedSignals.length,
          duration,
          selectedSignals.length,
          rejectedSignals
        );
      } catch (e) {
        // Log hatası
      }
    } catch (e) {
      console.error('[SCAN] Tarama hatası:', e.message);
    }
  }

  /**
   * Bot'u başlat
   */
  async start() {
    if (this.running) {
      console.log('[ENGINE] Bot zaten çalışıyor');
      return;
    }

    this.running = true;
    console.log(`
╔═══════════════════════════════════╗
║ 🚀 BOT BAŞLATILDI                ║
║ Makine Zekası Analiz Aktif        ║
╚═══════════════════════════════════╝
    `);

    try {
      // İlk BTC trend
      await this.updateBTCTrend();

      // İlk tarama
      await this.scan();

      // Her 3 saniye pozisyon kontrol
      const self = this;
      this.priceInterval = setInterval(async () => {
        await self.checkPositionsQuick();
      }, 3000);

      // Tarama aralığı
      const settings = this.getSettings();
      const scanIntervalMinutes = parseInt(settings.scan_interval || 20);

      this.scanInterval = setInterval(async () => {
        await self.updateBTCTrend();
        await self.scan();
      }, scanIntervalMinutes * 60 * 1000);

      console.log(`[BOT] ✅ Her ${scanIntervalMinutes} dakikada tarama | Rejim: ${this.btcTrend.regime}`);
    } catch (e) {
      console.error('[BOT] Başlatma hatası:', e.message);
      this.running = false;
    }
  }

  /**
   * Bot'u durdur
   */
  stop() {
    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.priceInterval) clearInterval(this.priceInterval);
    this.running = false;
    console.log('[BOT] ⏸️  Durduruldu');
  }

  /**
   * Bot raporu
   */
  getReport() {
    const stats = this.simulation.getStats();
    return {
      status: {
        running: this.running,
        scanCount: this.scanCount,
        btcTrend: this.btcTrend
      },
      performance: this.performance,
      simulation: stats
    };
  }
}

module.exports = TradingEngine;
