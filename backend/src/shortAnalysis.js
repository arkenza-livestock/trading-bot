/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   SHORT ANALYSIS ENGINE - SHORT (AÇIK/SATIS) İŞLEMLERİ
 *   
 *   📊 Özellikler:
 *   - 8 SHORT odaklı kural
 *   - Market rejimi otomatik adaptasyonu
 *   - Geri bildirimle ağırlık güncelleme
 *   - Volatilite kontrolü
 * ═══════════════════════════════════════════════════════════════════════════
 */

class ShortAnalysisEngine {
  constructor(db) {
    this.db = db;

    // 8 SHORT KURALI
    this.allRules = [
      { key: 'rsiOverbought', name: 'RSI Aşırı Alım (>70)' },
      { key: 'resistanceNear', name: 'Direnç Yakınlığı' },
      { key: 'macdCrossDown', name: 'MACD Sat Sinyali' },
      { key: 'volumeSelling', name: 'Satış Hacim Patlaması' },
      { key: 'priceBelowEMA21', name: 'Fiyat EMA21 Altı' },
      { key: 'adxTrendDown', name: 'ADX Düşüş Gücü' },
      { key: 'bearishDivergence', name: 'RSI Bearish Diverjans' },
      { key: 'bollingerUpperBounce', name: 'Bollinger Üst Bant' }
    ];

    // Kural ağırlıkları
    this.weights = {};
    this.allRules.forEach(r => this.weights[r.key] = 1.0);

    // Kural performans takibi
    this.performance = {};
    this.allRules.forEach(r => this.performance[r.key] = { wins: 0, losses: 0, accuracy: 0.5 });

    // Market Rejimi Konfigürasyonları (SHORT için)
    this.regimeConfig = {
      RALLY: {
        description: 'Güçlü Yükseliş - SHORT RISKI YÜKSEK',
        active: [],
        minPass: 99,
        minScore: 999
      },
      RANGING: {
        description: 'Yatay Hareket - SHORT İdeal',
        active: ['resistanceNear', 'rsiOverbought', 'bollingerUpperBounce', 'bearishDivergence', 'macdCrossDown'],
        minPass: 3,
        minScore: 60
      },
      DOWNTREND: {
        description: 'Düşüş Trendi - SHORT BEST',
        active: ['rsiOverbought', 'resistanceNear', 'macdCrossDown', 'volumeSelling', 'adxTrendDown', 'priceBelowEMA21'],
        minPass: 4,
        minScore: 65
      },
      VOLATILE: {
        description: 'Yüksek Volatilite - SHORT UYGUN DEĞİL',
        active: [],
        minPass: 99,
        minScore: 999
      }
    };

    this.loadSettingsFromDB();
    console.log('[SHORT-ANALYSIS] ✅ Engine başlatıldı - 8 SHORT kural');
  }

  /**
   * Database'den ayarları yükle
   */
  loadSettingsFromDB() {
    try {
      if (!this.db) return;
      const row = this.db.prepare("SELECT value FROM settings WHERE key='short_analysis_weights'").get();
      if (row && row.value) {
        const saved = JSON.parse(row.value);
        if (saved.weights) Object.assign(this.weights, saved.weights);
        if (saved.performance) Object.assign(this.performance, saved.performance);
      }
    } catch (e) {
      // Settings yok, varsayılanları kullan
    }
  }

  /**
   * Ayarları database'e kaydet
   */
  saveSettingsToDB() {
    try {
      if (!this.db) return;
      const data = JSON.stringify({
        weights: this.weights,
        performance: this.performance,
        timestamp: Date.now()
      });
      this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('short_analysis_weights', ?)")
        .run(data);
    } catch (e) {
      console.warn('[SHORT-ANALYSIS] Settings kaydedilemedi');
    }
  }

  /**
   * Kapalı işlemlerden feedback
   */
  updateFromFeedback(passedRules, wasProfitable, profitLoss = 0) {
    if (!Array.isArray(passedRules)) return;

    passedRules.forEach(key => {
      if (!this.performance[key]) return;

      if (wasProfitable) {
        this.performance[key].wins++;
      } else {
        this.performance[key].losses++;
      }

      const total = this.performance[key].wins + this.performance[key].losses;
      if (total >= 5) {
        const accuracy = this.performance[key].wins / total;
        this.performance[key].accuracy = accuracy;
        this.weights[key] = Math.max(0.3, Math.min(2.0, 0.5 + accuracy));
      }
    });

    this.saveSettingsToDB();
  }

  /**
   * ANA ANALİZ FONKSİYONU (SHORT için)
   */
  analyze(candles, ticker, options = {}) {
    if (!candles || candles.length < 100) return null;

    const closes = candles.map(c => parseFloat(c[4]));
    const highs = candles.map(c => parseFloat(c[2]));
    const lows = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const opens = candles.map(c => parseFloat(c[1]));
    const currentPrice = closes[closes.length - 1];

    // Market rejimi
    const regime = options.btcRegime || 'RANGING';
    const regimeCfg = this.regimeConfig[regime] || this.regimeConfig.RANGING;

    // ─────────────────────────────────────
    // ADIM 1: TÜM KURALLARI ÇALIŞTIR
    // ─────────────────────────────────────
    const ruleResults = {};
    for (const rule of this.allRules) {
      try {
        const methodName = `rule_${rule.key}`;
        ruleResults[rule.key] = this[methodName] 
          ? this[methodName](closes, highs, lows, volumes, opens)
          : false;
      } catch (e) {
        ruleResults[rule.key] = false;
      }
    }

    // ─────────────────────────────────────
    // ADIM 2: AKTIF KURALLARI PUANLA
    // ─────────────────────────────────────
    let totalWeight = 0;
    let earnedWeight = 0;
    let passedCount = 0;
    const ruleDetails = [];

    for (const key of regimeCfg.active) {
      const passed = ruleResults[key];
      const weight = this.weights[key] || 1.0;
      totalWeight += weight;

      if (passed) {
        earnedWeight += weight;
        passedCount++;
        ruleDetails.push(`✅ ${key}`);
      } else {
        ruleDetails.push(`❌ ${key}`);
      }
    }

    let score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

    // ─────────────────────────────────────
    // ADIM 3: RED FİLTERLERİ (SHORT)
    // ─────────────────────────────────────
    const rsi = this.calcRSI(closes, 14);
    const stochK = this.calcStochK(closes, 14);
    const bollinger = this.calcBollinger(closes, 20);
    const atr = this.calcATR(highs, lows, closes, 14);
    const atrPercent = (atr / currentPrice) * 100;

    const rejectionReasons = [];

    // SHORT için: RSI < 30 (çok düşük) = RED
    if (rsi < 30) rejectionReasons.push(`RSI<30 (${rsi.toFixed(1)})`);

    // StochRSI < 15 = RED
    if (stochK < 15) rejectionReasons.push(`StochRSI<15`);

    // Bollinger alt bandına yakın = RED (yükseliş ihtimali)
    if (bollinger && currentPrice <= bollinger.lower * 1.02) {
      rejectionReasons.push('BOLLINGER_BOTTOM');
    }

    // Aşırı volatilite
    if (atrPercent > 8) rejectionReasons.push(`EXTREME_VOL(${atrPercent.toFixed(1)}%)`);

    // Red Filter Logic
    if (rejectionReasons.length >= 3) {
      score = Math.min(score, 35);
    } else if (rejectionReasons.length === 2) {
      score = Math.min(score, 50);
    } else if (rejectionReasons.length === 1) {
      score = Math.min(score, 65);
    }

    // ─────────────────────────────────────
    // ADIM 4: SINYAL KARAR
    // ─────────────────────────────────────
    let signal = 'BEKLE';
    let risk = 'YUKSEK';

    if (rejectionReasons.length >= 3) {
      signal = 'BEKLE';
      risk = 'YUKSEK';
    } else if (passedCount >= regimeCfg.minPass && score >= 55) {
      signal = 'SATIS'; // SHORT sinyali
      risk = passedCount >= regimeCfg.minPass + 1 ? 'DUSUK' : 'ORTA';
    } else {
      signal = 'BEKLE';
    }

    // ─────────────────────────────────────
    // ADIM 5: STOP/HEDEF (SHORT için ters)
    // ─────────────────────────────────────
    const stopLoss = currentPrice + (atr * 1.5);      // YUKARIDA stop
    const takeProfit = currentPrice - (atr * 3);      // AŞAĞIDA hedef
    const slPercent = ((stopLoss - currentPrice) / currentPrice) * 100;
    const tpPercent = ((currentPrice - takeProfit) / currentPrice) * 100;

    // ─────────────────────────────────────
    // ADIM 6: SONUÇ
    // ─────────────────────────────────────
    return {
      symbol: ticker.symbol,
      price: parseFloat(currentPrice.toFixed(8)),
      fiyat: parseFloat(currentPrice.toFixed(8)),
      score: score,
      puan: score,
      signal: signal,
      signal_type: signal,
      side: signal === 'SATIS' ? 'SHORT' : null,
      regime: regime,
      regimeDescription: regimeCfg.description,
      
      // Kural detayları
      passedCount: passedCount,
      totalRules: regimeCfg.active.length,
      ruleDetails: ruleDetails.join(' '),
      rejectionReasons: rejectionReasons,
      
      // Teknik göstergeler
      rsi: parseFloat(rsi.toFixed(2)),
      stochRsi: parseFloat(stochK.toFixed(2)),
      
      // Bollinger
      bollinger: {
        upper: bollinger ? parseFloat(bollinger.upper.toFixed(8)) : 0,
        middle: bollinger ? parseFloat(bollinger.middle.toFixed(8)) : 0,
        lower: bollinger ? parseFloat(bollinger.lower.toFixed(8)) : 0
      },
      
      // ATR
      atr: parseFloat(atr.toFixed(8)),
      atrPercent: parseFloat(atrPercent.toFixed(2)),
      
      // Hedefler (SHORT için ters)
      stopLoss: parseFloat(stopLoss.toFixed(8)),
      stop_loss: parseFloat(stopLoss.toFixed(8)),
      takeProfit: parseFloat(takeProfit.toFixed(8)),
      target: parseFloat(takeProfit.toFixed(8)),
      hedef: parseFloat(takeProfit.toFixed(8)),
      riskRewardRatio: parseFloat((tpPercent / slPercent).toFixed(2)),
      
      // Risk
      risk: risk,
      confidence: parseFloat((score / 100).toFixed(2)),
      
      // Trend
      trend: currentPrice > this.calcEMA(closes, 21) ? 'YUKARI' : 'ASAGI',
      
      // Meta
      pozitif: ruleDetails.filter(d => d.startsWith('✅')),
      negatif: ruleDetails.filter(d => d.startsWith('❌')),
      timestamp: Date.now(),
      analyzedAt: new Date().toISOString()
    };
  }

  // ═════════════════════════════════════════════════════════
  // 8 SHORT KURALI
  // ═════════════════════════════════════════════════════════

  rule_rsiOverbought(closes) {
    const rsi = this.calcRSI(closes, 14);
    return rsi > 70;
  }

  rule_resistanceNear(closes, highs) {
    const high50 = Math.max(...highs.slice(-50));
    const distancePercent = ((high50 - closes[closes.length - 1]) / closes[closes.length - 1]) * 100;
    return distancePercent < 2;
  }

  rule_macdCrossDown(closes) {
    if (closes.length < 35) return false;
    const ema12 = this.calcEMA(closes, 12);
    const ema26 = this.calcEMA(closes, 26);
    const macd = ema12 - ema26;
    const prevCloses = closes.slice(-10, -1);
    if (prevCloses.length > 0) {
      const prevMACD = (this.calcEMA(prevCloses, 12) - this.calcEMA(prevCloses, 26));
      if (prevMACD >= 0 && macd < 0) return true;
    }
    return false;
  }

  rule_volumeSelling(closes, highs, lows, volumes, opens) {
    if (volumes.length < 21) return false;
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const currentClose = closes[closes.length - 1];
    const currentOpen = opens[opens.length - 1];
    const volumeAbove = currentVolume > avgVolume * 1.4;
    const priceDown = currentClose < currentOpen; // Kırmızı mum
    return volumeAbove && priceDown;
  }

  rule_priceBelowEMA21(closes) {
    const ema21 = this.calcEMA(closes, 21);
    return closes[closes.length - 1] < ema21;
  }

  rule_adxTrendDown(closes, highs, lows) {
    const adx = this.calcADX(highs, lows, closes, 14);
    return adx.adx > 25 && adx.diMinus > adx.diPlus;
  }

  rule_bearishDivergence(closes) {
    if (closes.length < 25) return false;
    const recent = closes.slice(-10);
    const previous = closes.slice(-20, -10);
    const recentHigh = Math.max(...recent);
    const prevHigh = Math.max(...previous);
    if (recentHigh <= prevHigh) return false;
    const recentRSI = this.calcRSI(recent, 14);
    const prevRSI = this.calcRSI(previous, 14);
    return recentRSI < prevRSI;
  }

  rule_bollingerUpperBounce(closes) {
    if (closes.length < 20) return false;
    const slice = closes.slice(-20);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
    const std = Math.sqrt(variance);
    const upper = mean + 2 * std;
    return closes[closes.length - 1] >= upper * 0.995;
  }

  // ═════════════════════════════════════════════════════════
  // YARDIMCI HESAPLAMA
  // ═════════════════════════════════════════════════════════

  calcRSI(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  calcEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calcATR(highs, lows, closes, period = 14) {
    const tr = [];
    for (let i = 1; i < closes.length; i++) {
      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    if (tr.length < period) return tr.reduce((a, b) => a + b, 0) / tr.length;
    return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  calcADX(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) {
      return { adx: 0, diPlus: 0, diMinus: 0 };
    }
    const tr = [], dp = [], dm = [];
    for (let i = 1; i < highs.length; i++) {
      const h = highs[i], l = lows[i], ph = highs[i - 1], pl = lows[i - 1], pc = closes[i - 1];
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      dp.push(h - ph > pl - l && h - ph > 0 ? h - ph : 0);
      dm.push(pl - l > h - ph && pl - l > 0 ? pl - l : 0);
    }
    const atr = tr.slice(-period).reduce((a, b) => a + b, 0) / period;
    const diPlus = (dp.slice(-period).reduce((a, b) => a + b, 0) / period) / atr * 100;
    const diMinus = (dm.slice(-period).reduce((a, b) => a + b, 0) / period) / atr * 100;
    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
    return { adx: isNaN(dx) ? 0 : dx, diPlus: isNaN(diPlus) ? 0 : diPlus, diMinus: isNaN(diMinus) ? 0 : diMinus };
  }

  calcBollinger(closes, period = 20) {
    if (closes.length < period) {
      const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
      return { upper: mean, middle: mean, lower: mean };
    }
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
  }

  calcStochK(closes, rsiPeriod = 14) {
    const rsiValues = [];
    for (let i = rsiPeriod; i <= closes.length; i++) {
      rsiValues.push(this.calcRSI(closes.slice(0, i), rsiPeriod));
    }
    if (rsiValues.length < 14) return 50;
    const stochK = [];
    for (let i = 13; i < rsiValues.length; i++) {
      const window = rsiValues.slice(i - 13, i + 1);
      const max = Math.max(...window), min = Math.min(...window);
      stochK.push(max === min ? 50 : ((rsiValues[i] - min) / (max - min)) * 100);
    }
    return stochK[stochK.length - 1];
  }
}

module.exports = ShortAnalysisEngine;
