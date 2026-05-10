/**
 * ═══════════════════════════════════════════════════════════════════════
 *   ANA TİCARET MOTORU (PROFESYONELİZE EDİLMİŞ)
 *   
 *   📊 Özellikler:
 *   - Sürekli market taraması
 *   - Real-time fiyat güncellemeleri
 *   - BTC trend analizi
 *   - Sinyal filtrelemesi ve kabul/reddedilme yönetimi
 *   - Simülasyon + Real trading desteği
 *   - Telegram bildirimleri
 *   - Performans takibi ve raporlama
 * ═══════════════════════════════════════════════════════════════════════
 */

const analysis = require('./analysis_engine');
const db = require('./database');
const simulation = require('./simulation_engine');
const binance = require('./binance');
const TelegramService = require('./telegram');

class ProfessionalTradingEngine {
  
  constructor() {
    // Bot durumu
    this.running = false;
    this.interval = null;
    this.priceInterval = null;

    // BTC Trend
    this.btcTrend = {
      trend: 'BELIRSIZ',
      rsi: 50,
      fiyat: 0,
      strength: 0,
      regime: 'RANGING',
      lastUpdate: 0
    };

    // Tarama sayaçları
    this.scanCount = 0;
    this.startTime = Date.now();

    // Piyasa verileri
    this.prices = {};
    this.candlesData = {};

    // Performans metrikleri
    this.performance = {
      scans: [],
      signalsGenerated: 0,
      signalsAccepted: 0,
      signalsRejected: 0,
      rejectionReasons: {}
    };

    // Real trading
    this.realPositions = {};
  }

  /**
   * Bot ayarlarını database'den al
   */
  getSettings() {
    try {
      const rows = db.prepare('SELECT key, value FROM settings').all() || [];
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
   * Telegram servisini başlat
   */
  getTelegramService() {
    const settings = this.getSettings();
    if (!settings.telegram_token || !settings.telegram_chat_id) {
      return null;
    }
    return new TelegramService(settings.telegram_token, settings.telegram_chat_id);
  }

  /**
   * Database'den real pozisyonları yükle
   */
  loadRealPositionsFromDB() {
    try {
      const rows = db.prepare('SELECT * FROM real_positions').all() || [];
      for (const row of rows) {
        this.realPositions[row.symbol] = {
          symbol: row.symbol,
          side: row.side || 'LONG',
          entryPrice: parseFloat(row.entry_price),
          quantity: parseFloat(row.quantity),
          highestPrice: parseFloat(row.highest_price || row.entry_price),
          lowestPrice: parseFloat(row.lowest_price || row.entry_price),
          stopLoss: parseFloat(row.stop_loss),
          entryTime: row.entry_time,
          machineConfidence: parseFloat(row.machine_confidence || 0)
        };
      }

      if (rows.length > 0) {
        console.log(`[REAL] ✅ ${rows.length} pozisyon yüklendi`);
      }
    } catch (e) {
      console.warn('[REAL] Pozisyon yükleme hatası:', e.message);
    }
  }

  /**
   * Real pozisyonu database'e kaydet
   */
  saveRealPositionToDB(symbol, position) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO real_positions 
        (symbol, side, quantity, entry_price, highest_price, lowest_price, stop_loss, entry_time, machine_confidence) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        symbol,
        position.side,
        position.quantity,
        position.entryPrice,
        position.highestPrice,
        position.lowestPrice,
        position.stopLoss,
        position.entryTime,
        position.machineConfidence || 0
      );
    } catch (e) {
      console.warn('[REAL] Pozisyon kaydetme hatası:', e.message);
    }
  }

  /**
   * Real pozisyonu database'den sil
   */
  deleteRealPositionFromDB(symbol) {
    try {
      db.prepare('DELETE FROM real_positions WHERE symbol=?').run(symbol);
    } catch (e) {
      console.warn('[REAL] Pozisyon silme hatası:', e.message);
    }
  }

  /**
   * Açık pozisyonlar için fiyat al
   */
  async fetchPricesForOpenPositions() {
    try {
      const symbolsToCheck = new Set();

      // Simülasyon açık pozisyonları
      const simOpen = db.prepare("SELECT DISTINCT symbol FROM sim_positions WHERE status='OPEN'").all() || [];
      simOpen.forEach(p => symbolsToCheck.add(p.symbol));

      // Real pozisyonlar
      Object.keys(this.realPositions).forEach(s => symbolsToCheck.add(s));

      if (symbolsToCheck.size === 0) return;

      // Binance'den al
      const tickers = await binance.getAllTickers();
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
   * Hızlı pozisyon kontrol (3 saniyede bir)
   */
  async checkPositionsQuick() {
    try {
      await this.fetchPricesForOpenPositions();
      
      // Simülasyon güncelle
      simulation.updatePositions(this.prices, this.getSettings(), this.candlesData);

      // Real pozisyonlar güncelle
      if (Object.keys(this.realPositions).length > 0) {
        await this.updateRealPositions();
      }
    } catch (e) {
      console.error('[ENGINE] Hızlı kontrol hatası:', e.message);
    }
  }

  /**
   * BTC trend analizini güncelle
   */
  async updateBTCTrend() {
    try {
      const settings = this.getSettings();
      const timeframe = settings.analysis_timeframe || '4h';

      // Mumları al
      const candles = await binance.getKlines('BTCUSDT', timeframe, 200);
      if (!candles || candles.length < 100) {
        console.warn('[BTC] Yeterli veri yok');
        return;
      }

      this.candlesData['BTCUSDT'] = candles;

      const closes = candles.map(c => parseFloat(c[4]));
      const highs = candles.map(c => parseFloat(c[2]));
      const lows = candles.map(c => parseFloat(c[3]));
      const volumes = candles.map(c => parseFloat(c[5]));
      const currentPrice = closes[closes.length - 1];

      // Göstergeler
      const rsi = analysis.calculateRSI(closes, 14);
      const ema21 = analysis.calculateEMA(closes, 21);
      const ema50 = analysis.calculateEMA(closes, 50);
      const adx = analysis.calculateADX(highs, lows, closes, 14);
      const atr = analysis.calculateATR(highs, lows, closes, 14);

      // Trend belirle
      let trend = 'NOTR';
      if (currentPrice > ema21 && ema21 > ema50) {
        trend = 'YUKARI';
      } else if (currentPrice > ema21) {
        trend = 'HAFIF_YUKARI';
      } else if (currentPrice < ema21 && ema21 < ema50) {
        trend = 'ASAGI';
      } else if (currentPrice < ema21) {
        trend = 'HAFIF_ASAGI';
      }

      // Rejim belirle
      let regime = 'RANGING';
      if (trend === 'YUKARI' && adx.adx > 25 && adx.diPlus > adx.diMinus) {
        regime = 'RALLY';
      } else if ((trend === 'ASAGI' || trend === 'HAFIF_ASAGI') && adx.adx > 25 && adx.diMinus > adx.diPlus) {
        regime = 'DOWNTREND';
      }

      // Volatilite kontrolü
      const atrPercent = (atr / currentPrice) * 100;
      if (atrPercent > 8) {
        regime = 'VOLATILE';
      }

      this.btcTrend = {
        trend: trend,
        rsi: parseFloat(rsi.toFixed(2)),
        fiyat: parseFloat(currentPrice.toFixed(2)),
        strength: parseFloat(adx.adx.toFixed(2)),
        regime: regime,
        lastUpdate: Date.now()
      };

      console.log(`
╔═══════════════════════════════════════╗
║ BTC TREPi: ${this.btcTrend.trend.padEnd(24)} ║
║ RSI: ${String(this.btcTrend.rsi).padEnd(28)} ║
║ ADX: ${String(this.btcTrend.strength).padEnd(28)} ║
║ Rejim: ${this.btcTrend.regime.padEnd(26)} ║
║ Fiyat: $${String(this.btcTrend.fiyat).padEnd(25)} ║
╚═══════════════════════════════════════╝
      `);
    } catch (e) {
      console.error('[BTC] Trend analizi hatası:', e.message);
    }
  }

  /**
   * Real pozisyonları güncelle ve yönet
   */
  async updateRealPositions() {
    try {
      const settings = this.getSettings();
      const trailingStopPercent = parseFloat(settings.trailing_stop_percent || 0.5) / 100;
      const minProfitPercent = parseFloat(settings.min_profit_percent || 1.5) / 100;
      const hardStopPercent = parseFloat(settings.stop_loss_percent || 2.0) / 100;
      const telegram = this.getTelegramService();

      for (const symbol of Object.keys(this.realPositions)) {
        const position = this.realPositions[symbol];
        const currentPrice = this.prices[symbol];
        if (!currentPrice) continue;

        if (position.side === 'LONG') {
          // En yüksek fiyatı güncelle
          if (currentPrice > position.highestPrice) {
            position.highestPrice = currentPrice;
            this.saveRealPositionToDB(symbol, position);
          }

          const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          const hardStop = position.entryPrice * (1 - hardStopPercent);
          const trailingStop = position.highestPrice * (1 - trailingStopPercent);

          if (currentPrice <= hardStop) {
            await this.executeRealSell(position, currentPrice, 'STOP_LOSS', telegram);
          } else if (pnlPercent >= minProfitPercent * 100 && currentPrice <= trailingStop) {
            await this.executeRealSell(position, currentPrice, 'TRAILING_STOP', telegram);
          }
        } else if (position.side === 'SHORT') {
          // En düşük fiyatı güncelle
          if (currentPrice < position.lowestPrice) {
            position.lowestPrice = currentPrice;
            this.saveRealPositionToDB(symbol, position);
          }

          const pnlPercent = ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
          const hardStop = position.entryPrice * (1 + hardStopPercent);
          const trailingStop = position.lowestPrice * (1 + trailingStopPercent);

          if (currentPrice >= hardStop) {
            await this.executeRealBuyToClose(position, currentPrice, 'STOP_LOSS', telegram);
          } else if (pnlPercent >= minProfitPercent * 100 && currentPrice >= trailingStop) {
            await this.executeRealBuyToClose(position, currentPrice, 'TRAILING_STOP', telegram);
          }
        }
      }
    } catch (e) {
      console.error('[REAL] Pozisyon güncelleme hatası:', e.message);
    }
  }

  /**
   * Real LONG satış (kapalı)
   */
  async executeRealSell(position, currentPrice, reason, telegram) {
    try {
      console.log(`[REAL] SATILIYOR: ${position.symbol} @ ${currentPrice} (${reason})`);

      const result = await binance.realSell(position.symbol, position.quantity);
      if (!result) {
        console.error('[REAL] Satış başarısız');
        return;
      }

      const pnl = (currentPrice - position.entryPrice) * position.quantity;
      const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      if (telegram) {
        telegram.sendMessage(`
🔴 SATILDI: ${position.symbol}
Fiyat: $${currentPrice.toFixed(8)}
PnL: ${pnl.toFixed(4)} USDT (${pnlPercent.toFixed(2)}%)
Neden: ${reason}
        `).catch(() => {});
      }

      delete this.realPositions[position.symbol];
      this.deleteRealPositionFromDB(position.symbol);

      console.log(`[REAL] ✅ SATILDI: ${position.symbol} | PnL: ${pnlPercent.toFixed(2)}%`);
    } catch (e) {
      console.error('[REAL] Satış hatası:', e.message);
    }
  }

  /**
   * Real SHORT kapanış (alım)
   */
  async executeRealBuyToClose(position, currentPrice, reason, telegram) {
    try {
      console.log(`[REAL] KAPANIYOR: ${position.symbol} @ ${currentPrice} (${reason})`);

      const result = await binance.realBuy(position.symbol, position.quantity);
      if (!result) {
        console.error('[REAL] Kapanış başarısız');
        return;
      }

      const pnl = (position.entryPrice - currentPrice) * position.quantity;
      const pnlPercent = ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

      if (telegram) {
        telegram.sendMessage(`
🟢 KAPANDI: ${position.symbol}
Fiyat: $${currentPrice.toFixed(8)}
PnL: ${pnl.toFixed(4)} USDT (${pnlPercent.toFixed(2)}%)
Neden: ${reason}
        `).catch(() => {});
      }

      delete this.realPositions[position.symbol];
      this.deleteRealPositionFromDB(position.symbol);

      console.log(`[REAL] ✅ KAPANDI: ${position.symbol} | PnL: ${pnlPercent.toFixed(2)}%`);
    } catch (e) {
      console.error('[REAL] Kapanış hatası:', e.message);
    }
  }

  /**
   * Ana tarama fonksiyonu - Sinyaller üret ve yönet
   */
  async scan() {
    try {
      const startTime = Date.now();
      this.scanCount++;

      const settings = this.getSettings();
      const maxOpenPositions = parseInt(settings.max_open_positions || 3);
      const realTrading = settings.real_trading === 'true' || settings.real_trading === true;

      // ──────────────────────────────
      // 1. TAKİBİ YAPILACAK COİNLERİ AL
      // ──────────────────────────────
      const tickers = await binance.getAllTickers();
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

      console.log(`[SCAN #${this.scanCount}] ${filtered.length} coin taranacak...`);

      // ──────────────────────────────
      // 2. HER COİN İÇİN ANALİZ
      // ──────────────────────────────
      const allSignals = [];

      for (const ticker of filtered) {
        try {
          // Mumları al
          const timeframe = settings.analysis_timeframe || '4h';
          const candles = await binance.getKlines(ticker.symbol, timeframe, 100);

          if (!candles || candles.length < 100) continue;

          this.candlesData[ticker.symbol] = candles;

          // ── LONG Analizi ──
          const longSignal = analysis.analyze(candles, ticker, {
            btcRegime: this.btcTrend.regime
          });

          if (longSignal && longSignal.signal_type === 'ALIM') {
            allSignals.push({
              symbol: ticker.symbol,
              side: 'LONG',
              signal_type: longSignal.signal_type,
              price: longSignal.price,
              fiyat: longSignal.price,
              score: longSignal.score,
              puan: longSignal.score,
              trend: longSignal.trend,
              rsi: longSignal.rsi,
              stop_loss: longSignal.stopLoss,
              stopLoss: longSignal.stopLoss,
              target: longSignal.takeProfit,
              hedef: longSignal.takeProfit,
              machineConfidence: longSignal.confidence,
              passedCount: longSignal.passedCount,
              totalRules: longSignal.totalRules,
              risk: longSignal.risk,
              pozitif: longSignal.pozitif,
              negatif: longSignal.negatif,
              ruleDetails: longSignal.ruleDetails,
              rejectionReasons: longSignal.rejectionReasons
            });
          }

          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          // Coin hatası, devam et
        }
      }

      // ──────────────────────────────
      // 3. SİNYALLERİ PUANLA VE SIRALA
      // ──────────────────────────────
      const acceptedSignals = allSignals.filter(s => s.signal_type === 'ALIM');
      const rejectedSignals = allSignals.filter(s => s.signal_type === 'BEKLE');

      acceptedSignals.sort((a, b) => b.score - a.score);

      // En iyi sinyalleri seç
      const selectedSignals = acceptedSignals.slice(0, maxOpenPositions);
      let longCount = 0, shortCount = 0;

      // ──────────────────────────────
      // 4. SİNYALLERİ DATABASE'E KAYDET
      // ──────────────────────────────
      for (const sig of allSignals) {
        const isSelected = selectedSignals.some(s => s.symbol === sig.symbol && s.side === sig.side);
        let comment;

        if (isSelected) {
          comment = `✅ AÇILDI | ${sig.passedCount}/${sig.totalRules} Kural`;
        } else if (sig.rejectionReasons && sig.rejectionReasons.length > 0) {
          comment = `⛔ RED: ${sig.rejectionReasons.join(' | ')}`;
        } else {
          comment = `📊 ${sig.passedCount}/${sig.totalRules} Kural`;
        }

        try {
          db.prepare(`
            INSERT INTO signals 
            (symbol, signal_type, score, risk, price, fiyat, rsi, trend, 
             positive_signals, negative_signals, ai_comment) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            sig.symbol,
            sig.signal_type,
            sig.score,
            sig.risk,
            sig.fiyat,
            sig.fiyat,
            parseFloat(sig.rsi.toFixed(2)),
            sig.trend,
            JSON.stringify(sig.pozitif || []),
            JSON.stringify(sig.negatif || []),
            comment
          );
        } catch (e) {
          // Database hatası, devam et
        }
      }

      // ──────────────────────────────
      // 5. SEÇİLEN SİNYALLERİ İŞLE
      // ──────────────────────────────
      const telegram = this.getTelegramService();

      for (const sig of selectedSignals) {
        if (sig.side === 'LONG') longCount++;
        else shortCount++;

        console.log(`🟢 AL: ${sig.symbol} | Puan:${sig.score} | RSI:${sig.rsi.toFixed(1)} | ${sig.passedCount}/${sig.totalRules}`);

        // Simülasyon
        simulation.openPosition({
          symbol: sig.symbol,
          side: sig.side,
          signal_type: sig.signal_type,
          price: sig.fiyat,
          fiyat: sig.fiyat,
          score: sig.score,
          trend: sig.trend,
          stop_loss: sig.stop_loss,
          stopLoss: sig.stop_loss,
          target: sig.target,
          machineConfidence: sig.machineConfidence,
          passedCount: sig.passedCount,
          totalRules: sig.totalRules
        }, settings, this.btcTrend, this.candlesData);

        // Real trading
        if (realTrading && !this.realPositions[sig.symbol]) {
          const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);

          if (sig.side === 'LONG') {
            const buyResult = await binance.realBuy(sig.symbol, tradeAmount, sig.fiyat);
            if (buyResult) {
              const qty = parseFloat(buyResult.executedQty) || (tradeAmount / sig.fiyat);
              const pos = {
                symbol: sig.symbol,
                side: 'LONG',
                entryPrice: sig.fiyat,
                quantity: qty,
                highestPrice: sig.fiyat,
                lowestPrice: sig.fiyat,
                stopLoss: sig.stop_loss,
                entryTime: new Date().toISOString(),
                machineConfidence: sig.machineConfidence
              };
              this.realPositions[sig.symbol] = pos;
              this.saveRealPositionToDB(sig.symbol, pos);

              if (telegram) {
                telegram.sendMessage(`🟢 ALINAN: ${sig.symbol}\n💰 Fiyat: $${sig.fiyat.toFixed(8)}\n📊 ${sig.passedCount}/${sig.totalRules} Kural`)
                  .catch(() => {});
              }
            }
          }
        }
      }

      // ──────────────────────────────
      // 6. POZİSYONLARI GÜNCELLE
      // ──────────────────────────────
      simulation.updatePositions(this.prices, settings, this.candlesData);
      if (Object.keys(this.realPositions).length > 0) {
        await this.updateRealPositions();
      }

      // ──────────────────────────────
      // 7. PERFORMANS LOG
      // ──────────────────────────────
      const duration = Date.now() - startTime;
      const simStats = simulation.getStats();

      this.performance.scans.push({
        timestamp: Date.now(),
        coinsScanned: filtered.length,
        signalsFound: selectedSignals.length,
        machineAccepted: selectedSignals.length,
        machineRejected: rejectedSignals.length,
        duration: duration
      });

      this.performance.signalsGenerated += acceptedSignals.length;
      this.performance.signalsAccepted += selectedSignals.length;
      this.performance.signalsRejected += rejectedSignals.length;

      console.log(`
╔═════════════════════════════════════════╗
║ 📊 TARAMA TAMAMLANDI                   ║
╠═════════════════════════════════════════╣
║ Taradı: ${String(filtered.length).padEnd(29)} ║
║ Sinyal: ${String(selectedSignals.length).padEnd(29)} ║
║ Kabul: ${String(`${longCount}L/${shortCount}S`).padEnd(29)} ║
║ Reddedilen: ${String(rejectedSignals.length).padEnd(25)} ║
║ Bakiye: ${String(`${simStats.wallet.current} USDT`).padEnd(25)} ║
║ Win Rate: ${String(`${simStats.trades.winRate}%`).padEnd(25)} ║
║ Süre: ${String(`${duration}ms`).padEnd(29)} ║
╚═════════════════════════════════════════╝
      `);

      try {
        db.prepare(`
          INSERT INTO scan_logs 
          (coin_count, signal_count, duration_ms, signals_found, machine_accepted, machine_rejected) 
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          filtered.length,
          selectedSignals.length,
          duration,
          JSON.stringify(selectedSignals.map(s => s.symbol)),
          selectedSignals.length,
          rejectedSignals.length
        );
      } catch (e) {
        // Log hatası, devam et
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
╔══════════════════════════════════════════╗
║   🤖 PROFESYONEL TİCARET BOTU BAŞLATILDI ║
║   Adaptif Çift Motor Sistemi              ║
║   v1.0.0 Professional Edition             ║
╚══════════════════════════════════════════╝
    `);

    try {
      // İlk BTC trend
      await this.updateBTCTrend();

      // Real pozisyonları yükle
      this.loadRealPositionsFromDB();

      // Hızlı fiyat updatesi (3s)
      const self = this;
      this.priceInterval = setInterval(async () => {
        await self.checkPositionsQuick();
      }, 3000);

      // İlk tarama
      await this.scan();

      // Periyodik tarama
      const settings = this.getSettings();
      const scanIntervalMinutes = parseInt(settings.scan_interval || 20);
      this.interval = setInterval(async () => {
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
    if (this.interval) clearInterval(this.interval);
    if (this.priceInterval) clearInterval(this.priceInterval);
    this.running = false;
    console.log('[BOT] ⏸️  Durduruldu');
  }

  /**
   * Bot raporunu al
   */
  getReport() {
    const simStats = simulation.getStats();
    const uptime = Date.now() - this.startTime;
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);

    return {
      status: {
        running: this.running,
        uptime: `${hours}h ${minutes}m`,
        scanCount: this.scanCount,
        btcTrend: this.btcTrend
      },
      performance: this.performance,
      simulation: simStats,
      realPositions: Object.keys(this.realPositions).length
    };
  }
}

module.exports = new ProfessionalTradingEngine();
