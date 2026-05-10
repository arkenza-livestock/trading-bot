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
      rejectedCount: 0,
      avgScanTime: 0
    };

    console.log('[ENGINE] ✅ Trading Engine başlatıldı');
  }

  /**
   * Ayarları database'den al
   */
  getSettings() {
    try {
      return this.db.settings || {};
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
      if (!this.binance || !this.binance.getKlines) {
        console.warn('[BTC] Binance API not available');
        return;
      }
      
      const candles = await this.binance.getKlines('BTCUSDT', '4h', 200);
      if (!candles || candles.length === 0) {
        console.warn('[BTC] Yeterli veri yok');
        return;
      }

      const closes = candles.map(c => parseFloat(c[4]));
      const rsi = this.calcRSI(closes);
      const ema21 = this.calcEMA(closes, 21);
      const ema50 = this.calcEMA(closes, 50);
      const price = closes[closes.length - 1];

      this.btcTrend = {
        trend: price > ema21 && ema21 > ema50 ? 'RALLY' : price < ema21 && ema21 < ema50 ? 'DOWNTREND' : 'NOTR',
        rsi: parseFloat(rsi.toFixed(2)),
        fiyat: parseFloat(price.toFixed(2)),
        strength: parseFloat((Math.abs(ema21 - ema50) / price * 100).toFixed(2)),
        regime: rsi > 70 || rsi < 30 ? 'VOLATILE' : 'RANGING',
        lastUpdate: Date.now()
      };

      console.log(`[BTC] Trend: ${this.btcTrend.trend} | RSI: ${rsi.toFixed(2)} | Regime: ${this.btcTrend.regime}`);
    } catch (e) {
      console.error('[BTC] Trend güncelleme hatası:', e.message);
    }
  }

  /**
   * Açık pozisyonlar için fiyat al (her 3 saniye)
   */
  async fetchPricesForOpenPositions() {
    try {
      const openPositions = this.db.getOpenPositions() || [];
      
      if (openPositions.length === 0) return;

      if (!this.binance || !this.binance.get24hrTicker) return;

      const tickers = await this.binance.get24hrTicker();
      if (!tickers || tickers.length === 0) return;

      const symbolSet = new Set(openPositions.map(p => p.symbol));

      for (const ticker of tickers) {
        if (symbolSet.has(ticker.symbol)) {
          this.prices[ticker.symbol] = parseFloat(ticker.price);
        }
      }
    } catch (e) {
      console.error('[ENGINE] Fiyat çekme hatası:', e.message);
    }
  }

  /**
   * Açık pozisyonları kontrol et (SL/TP)
   */
  async checkPositionsQuick() {
    try {
      const openPositions = this.db.getOpenPositions() || [];
      
      for (const pos of openPositions) {
        const currentPrice = this.prices[pos.symbol] || pos.current_price;
        
        if (!currentPrice) continue;

        // SL Hit (LONG için)
        if (pos.side === 'LONG' && currentPrice <= pos.stop_loss) {
          const pnl = (currentPrice - pos.entry_price) / pos.entry_price * 100 - 0.3;
          this.db.updatePosition(pos.id, {
            status: 'CLOSED',
            exit_price: currentPrice,
            pnl: pnl,
            close_reason: 'STOP_LOSS'
          });
          console.log(`[CLOSE] ${pos.symbol} STOP_LOSS: ${pnl.toFixed(2)}%`);
        }

        // TP Hit (LONG için)
        if (pos.side === 'LONG' && currentPrice >= pos.take_profit) {
          const pnl = (currentPrice - pos.entry_price) / pos.entry_price * 100 - 0.3;
          this.db.updatePosition(pos.id, {
            status: 'CLOSED',
            exit_price: currentPrice,
            pnl: pnl,
            close_reason: 'TAKE_PROFIT'
          });
          console.log(`[CLOSE] ${pos.symbol} TAKE_PROFIT: ${pnl.toFixed(2)}%`);
        }
      }
    } catch (e) {
      console.error('[CHECK] Pozisyon kontrol hatası:', e.message);
    }
  }

  /**
   * Ana Tarama
   */
  async scan() {
    const startTime = Date.now();
    let signalCount = 0;
    let rejectedCount = 0;

    try {
      if (!this.binance || !this.binance.get24hrTicker) {
        console.warn('[SCAN] Binance API not available');
        return;
      }

      // 1. Tüm coin'leri al
      const allTickers = await this.binance.get24hrTicker();
      if (!allTickers || allTickers.length === 0) {
        console.warn('[SCAN] Ticker verisi yok');
        return;
      }

      // 2. Filtrele (USDT, hacim > 100K, fiyat > 0.00001)
      const filtered = allTickers.filter(t => {
        const volume = parseFloat(t.quoteAssetVolume || t.volume || 0);
        const price = parseFloat(t.price || 0);
        return t.symbol.endsWith('USDT') && volume > 100000 && price > 0.00001;
      });

      console.log(`[SCAN] ${filtered.length} coin taranıyor...`);

      // 3. Analiz ve sinyal üret
      const signals = [];
      
      for (let i = 0; i < Math.min(filtered.length, 100); i++) {
        const ticker = filtered[i];
        try {
          if (!this.binance.getKlines) continue;
          
          const candles = await this.binance.getKlines(ticker.symbol, '4h', 100);
          if (!candles || candles.length < 50) continue;

          const result = this.analysis.analyze(candles, ticker);
          
          if (result && result.signal === 'ALIM') {
            signals.push(result);
            signalCount++;
          } else {
            rejectedCount++;
          }
        } catch (e) {
          // Skip bu coin
        }
      }

      // 4. En iyi 3'ünü seç (puana göre)
      const selectedSignals = signals
        .sort((a, b) => (b.puan || 0) - (a.puan || 0))
        .slice(0, 3);

      // 5. Pozisyon aç
      const settings = this.getSettings();
      const maxOpen = parseInt(settings.max_open_positions) || 3;
      const currentOpen = (this.db.getOpenPositions() || []).length;

      for (const sig of selectedSignals) {
        if (currentOpen >= maxOpen) break;

        try {
          // Sinyal kaydet
          this.db.addSignal({
            symbol: sig.symbol,
            signal: sig.signal,
            puan: sig.puan,
            price: sig.price,
            fiyat: sig.fiyat
          });

          // Pozisyon aç
          this.db.addPosition({
            symbol: sig.symbol,
            side: 'LONG',
            quantity: 1,
            entry_price: sig.price,
            current_price: sig.price,
            stop_loss: sig.stop_loss,
            take_profit: sig.take_profit
          });

          console.log(`[SIGNAL] 🟢 ${sig.symbol} Puan: ${sig.puan}`);
        } catch (e) {
          console.error(`[SIGNAL] ${sig.symbol} kaydedilemedi:`, e.message);
        }
      }

      // 6. Performance log
      const duration = Date.now() - startTime;
      this.scanCount++;

      console.log(`
╔═══════════════════════════════════╗
║ ✅ SCAN TAMAMLANDI               ║
║ Coin: ${String(filtered.length).padEnd(3)} | Signal: ${String(signalCount).padEnd(3)} | Seçildi: ${selectedSignals.length}  ║
║ Süre: ${duration}ms                 ║
╚═══════════════════════════════════╝
      `);
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

      const settings = this.getSettings();
      const scanInterval = (parseInt(settings.scan_interval) || 20) * 60 * 1000;

      console.log(`[BOT] ✅ Her ${scanInterval / 60000} dakikada tarama | Rejim: ${this.btcTrend.regime}`);

      // Her 3 saniye fiyat kontrol
      this.priceCheckInterval = setInterval(() => {
        this.fetchPricesForOpenPositions();
        this.checkPositionsQuick();
      }, 3000);

      // Tarama interval
      this.scanInterval = setInterval(async () => {
        await this.updateBTCTrend();
        await this.scan();
      }, scanInterval);

    } catch (e) {
      console.error('[BOT] Start hatası:', e.message);
      this.running = false;
    }
  }

  /**
   * Bot'u durdur
   */
  stop() {
    this.running = false;
    if (this.priceCheckInterval) clearInterval(this.priceCheckInterval);
    if (this.scanInterval) clearInterval(this.scanInterval);
    console.log('[ENGINE] Bot durduruldu');
  }

  /**
   * Rapor al
   */
  getReport() {
    return {
      running: this.running,
      scanCount: this.scanCount,
      btcTrend: this.btcTrend,
      performance: this.performance,
      wallet: this.db.getWallet(),
      openPositions: this.db.getOpenPositions(),
      stats: this.db.getStats()
    };
  }

  // ─────────────────────────────────────────────────────────
  // YARDIMCI FONKSİYONLAR
  // ─────────────────────────────────────────────────────────

  calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    
    let gains = 0, losses = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calcEMA(closes, period) {
    if (closes.length < period) return closes[closes.length - 1];
    
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    
    return ema;
  }

  calcATR(candles, period = 14) {
    const trValues = [];
    
    for (let i = 1; i < candles.length; i++) {
      const h = parseFloat(candles[i][2]);
      const l = parseFloat(candles[i][3]);
      const pc = parseFloat(candles[i - 1][4]);
      
      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      trValues.push(tr);
    }
    
    if (trValues.length < period) {
      return trValues.reduce((a, b) => a + b, 0) / trValues.length;
    }
    
    return trValues.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
}

module.exports = TradingEngine;
