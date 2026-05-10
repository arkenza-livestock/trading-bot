/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   ANALYSIS.JS - TEKNİK ANALİZ MOTORU
 *   
 *   📊 Sinyal Üretim Sistemi:
 *   - 12 Teknik Kural
 *   - 5 Red Filter (Zayıf Sinyalleri Eleme)
 *   - Market Rejimi Algılama
 *   - Dinamik Ağırlık Sistemi
 * ═══════════════════════════════════════════════════════════════════════════
 */

class AnalysisEngine {
  constructor() {
    // 12 Teknik Analiz Kuralı
    this.allRules = [
      { key: 'supportNear', name: 'Destek Yakınlığı', priority: 7 },
      { key: 'rsiOversold', name: 'RSI Aşırı Satım', priority: 8 },
      { key: 'ichimokuBelow', name: 'Ichimoku Bulutu Altı', priority: 6 },
      { key: 'rsiDivergence', name: 'RSI Bullish Diverjans', priority: 9 },
      { key: 'volumeBuying', name: 'Hacim Artışı (Alım)', priority: 8 },
      { key: 'macdCross', name: 'MACD Al Sinyali', priority: 9 },
      { key: 'goldenCross', name: 'Golden Cross (EMA)', priority: 10 },
      { key: 'adxTrendUp', name: 'ADX Yükseliş Gücü', priority: 8 },
      { key: 'bollingerBounce', name: 'Bollinger Alt Bant', priority: 7 },
      { key: 'priceAboveEMA21', name: 'Fiyat EMA21 Üstü', priority: 7 },
      { key: 'cmfPositive', name: 'CMF Pozitif', priority: 6 },
      { key: 'stochRsiOversold', name: 'StochRSI Aşırı Satım', priority: 8 }
    ];

    // Kural ağırlıkları (başlangıç)
    this.weights = {};
    this.allRules.forEach(r => this.weights[r.key] = 1.0);

    // Market Rejimi Konfigürasyonları
    this.regimeConfig = {
      RALLY: {
        description: 'Güçlü Yükseliş',
        active: ['goldenCross', 'adxTrendUp', 'priceAboveEMA21', 'macdCross', 'volumeBuying', 'cmfPositive'],
        minPass: 4,
        minScore: 65
      },
      RANGING: {
        description: 'Yatay / Belirsiz',
        active: ['supportNear', 'rsiOversold', 'bollingerBounce', 'rsiDivergence', 'stochRsiOversold', 'ichimokuBelow'],
        minPass: 3,
        minScore: 60
      },
      DOWNTREND: {
        description: 'Düşüş Trendi',
        active: ['rsiOversold', 'supportNear', 'rsiDivergence', 'stochRsiOversold', 'bollingerBounce'],
        minPass: 4,
        minScore: 70
      },
      VOLATILE: {
        description: 'Yüksek Volatilite - RISKLI',
        active: [],
        minPass: 99,
        minScore: 999
      }
    };

    console.log('[ANALYSIS] ✅ Engine başlatıldı - 12 kural, 5 filter');
  }

  /**
   * ANA ANALİZ FONKSİYONU
   * @param {Array} candles - Mum verileri
   * @param {Object} ticker - Coin bilgileri
   * @param {Object} options - Seçenekler (btcRegime, etc)
   * @returns {Object|null} Sinyal
   */
  analyze(candles, ticker, options = {}) {
    try {
      // Girdi validasyonu
      if (!candles || candles.length < 100) return null;

      // Verileri çıkar
      const closes = candles.map(c => parseFloat(c[4]));
      const highs = candles.map(c => parseFloat(c[2]));
      const lows = candles.map(c => parseFloat(c[3]));
      const volumes = candles.map(c => parseFloat(c[5]));
      const opens = candles.map(c => parseFloat(c[1]));
      const currentPrice = closes[closes.length - 1];

      // Market rejimi belirle
      const regime = options.btcRegime || this.detectRegime(closes, highs, lows, volumes);
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
      // ADIM 3: RED FİLTERLERİ (5 seviye)
      // ─────────────────────────────────────
      const rsi = this.calcRSI(closes, 14);
      const stochK = this.calcStochK(closes, 14);
      const bollinger = this.calcBollinger(closes, 20);
      const avgVolume20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      const lastVolume = volumes[volumes.length - 1];
      const atr = this.calcATR(highs, lows, closes, 14);
      const atrPercent = (atr / currentPrice) * 100;

      const rejectionReasons = [];

      // Filter 1: RSI aşırı alım
      if (rsi > 75) rejectionReasons.push(`RSI>75 (${rsi.toFixed(1)})`);

      // Filter 2: StochRSI aşırı alım
      if (stochK > 85) rejectionReasons.push(`StochRSI>${85} (${stochK.toFixed(1)})`);

      // Filter 3: Bollinger üst band
      if (bollinger && currentPrice >= bollinger.upper * 0.96) {
        rejectionReasons.push('BOLLINGER_TOP');
      }

      // Filter 4: Düşük hacim
      if (lastVolume < avgVolume20 * 0.65) rejectionReasons.push('LOW_VOL');

      // Filter 5: Aşırı volatilite
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
      // ADIM 4: SINYAL KARAR LOGJĞI
      // ─────────────────────────────────────
      let signal = 'BEKLE'; // Varsayılan
      let risk = 'YUKSEK';

      if (rejectionReasons.length >= 3) {
        signal = 'BEKLE';
        risk = 'YUKSEK';
      } else if (passedCount >= regimeCfg.minPass && rejectionReasons.length < 3) {
        signal = 'ALIM';
        risk = passedCount >= regimeCfg.minPass + 1 ? 'DUSUK' : 'ORTA';
      } else {
        signal = 'BEKLE';
      }

      if (score < 55) signal = 'BEKLE';

      // ─────────────────────────────────────
      // ADIM 5: SL/TP HESAPLA
      // ─────────────────────────────────────
      const stopLoss = currentPrice - (atr * 1.5);
      const takeProfit = currentPrice + (atr * 3);
      const slPercent = ((currentPrice - stopLoss) / currentPrice) * 100;
      const tpPercent = ((takeProfit - currentPrice) / currentPrice) * 100;

      // ─────────────────────────────────────
      // ADIM 6: SONUÇ OLUŞTUR
      // ─────────────────────────────────────
      return {
        symbol: ticker.symbol,
        price: parseFloat(currentPrice.toFixed(8)),
        fiyat: parseFloat(currentPrice.toFixed(8)),
        score: score,
        puan: score,
        signal: signal,
        signal_type: signal,
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
        
        // Bollinger Bands
        bollinger: {
          upper: bollinger ? parseFloat(bollinger.upper.toFixed(8)) : 0,
          middle: bollinger ? parseFloat(bollinger.middle.toFixed(8)) : 0,
          lower: bollinger ? parseFloat(bollinger.lower.toFixed(8)) : 0
        },
        
        // ATR
        atr: parseFloat(atr.toFixed(8)),
        atrPercent: parseFloat(atrPercent.toFixed(2)),
        
        // Hacim
        volume: {
          current: parseFloat(lastVolume.toFixed(2)),
          average20: parseFloat(avgVolume20.toFixed(2)),
          ratio: parseFloat((lastVolume / avgVolume20).toFixed(2))
        },
        
        // Hedefler
        stopLoss: parseFloat(stopLoss.toFixed(8)),
        stop_loss: parseFloat(stopLoss.toFixed(8)),
        takeProfit: parseFloat(takeProfit.toFixed(8)),
        target: parseFloat(takeProfit.toFixed(8)),
        hedef: parseFloat(takeProfit.toFixed(8)),
        riskRewardRatio: parseFloat((tpPercent / slPercent).toFixed(2)),
        
        // Risk
        risk: risk,
        confidence: parseFloat((score / 100).toFixed(2)),
        machineConfidence: parseFloat((score / 100).toFixed(2)),
        
        // Trend
        trend: currentPrice > this.calcEMA(closes, 21) ? 'YUKARI' : 'ASAGI',
        
        // Meta
        timestamp: Date.now(),
        analyzedAt: new Date().toISOString()
      };
    } catch (e) {
      console.error(`[ANALYSIS] Hata ${ticker.symbol}:`, e.message);
      return null;
    }
  }

  /**
   * Market Rejimini Otomatik Algıla
   */
  detectRegime(closes, highs, lows, volumes) {
    const rsi = this.calcRSI(closes, 14);
    const adx = this.calcADX(highs, lows, closes, 14);
    const atr = this.calcATR(highs, lows, closes, 14);
    const ema21 = this.calcEMA(closes, 21);
    const currentPrice = closes[closes.length - 1];

    const atrPercent = (atr / currentPrice) * 100;

    // Volatilite kontrolü
    if (atrPercent > 8 || adx.adx < 15) {
      return 'VOLATILE';
    }

    // Trend gücü ve yönü
    if (adx.adx > 30) {
      if (adx.diPlus > adx.diMinus && currentPrice > ema21) {
        return 'RALLY';
      } else if (adx.diMinus > adx.diPlus && currentPrice < ema21) {
        return 'DOWNTREND';
      }
    }

    return 'RANGING';
  }

  // ═════════════════════════════════════════════════════════
  // 12 TEKNİK KURAL
  // ═════════════════════════════════════════════════════════

  rule_supportNear(closes) {
    const low50 = Math.min(...closes.slice(-50));
    const distancePercent = ((closes[closes.length - 1] - low50) / closes[closes.length - 1]) * 100;
    return distancePercent < 2.5;
  }

  rule_rsiOversold(closes) {
    const rsi = this.calcRSI(closes, 14);
    return rsi > 25 && rsi < 38;
  }

  rule_ichimokuBelow(closes, highs, lows) {
    if (highs.length < 52) return false;
    const h52 = Math.max(...highs.slice(-52));
    const l52 = Math.min(...lows.slice(-52));
    const senkouSpan = (h52 + l52) / 2;
    return closes[closes.length - 1] < senkouSpan;
  }

  rule_rsiDivergence(closes) {
    if (closes.length < 25) return false;
    const recent = closes.slice(-10);
    const previous = closes.slice(-20, -10);
    const recentLow = Math.min(...recent);
    const prevLow = Math.min(...previous);
    if (recentLow >= prevLow) return false;
    const recentRSI = this.calcRSI(recent, 14);
    const prevRSI = this.calcRSI(previous, 14);
    return recentRSI > prevRSI;
  }

  rule_volumeBuying(closes, highs, lows, volumes, opens) {
    if (volumes.length < 21) return false;
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const currentClose = closes[closes.length - 1];
    const currentOpen = opens[opens.length - 1];
    const volumeAbove = currentVolume > avgVolume * 1.4;
    const priceBullish = currentClose > currentOpen;
    return volumeAbove && priceBullish;
  }

  rule_macdCross(closes) {
    if (closes.length < 35) return false;
    const ema12 = this.calcEMA(closes, 12);
    const ema26 = this.calcEMA(closes, 26);
    const macd = ema12 - ema26;
    const prevCloses = closes.slice(-10, -1);
    if (prevCloses.length > 0) {
      const prevMACD = (this.calcEMA(prevCloses, 12) - this.calcEMA(prevCloses, 26));
      if (prevMACD <= 0 && macd > 0) return true;
    }
    return false;
  }

  rule_goldenCross(closes) {
    if (closes.length < 51) return false;
    const ema21 = this.calcEMA(closes, 21);
    const ema50 = this.calcEMA(closes, 50);
    const prevCloses = closes.slice(-2);
    if (prevCloses.length < 2) return false;
    const prevEMA21 = this.calcEMA(prevCloses, 21);
    const prevEMA50 = this.calcEMA(prevCloses, 50);
    return prevEMA21 <= prevEMA50 && ema21 > ema50;
  }

  rule_adxTrendUp(closes, highs, lows) {
    const adx = this.calcADX(highs, lows, closes, 14);
    return adx.adx > 25 && adx.diPlus > adx.diMinus;
  }

  rule_bollingerBounce(closes) {
    if (closes.length < 20) return false;
    const slice = closes.slice(-20);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
    const std = Math.sqrt(variance);
    const lower = mean - 2 * std;
    return closes[closes.length - 1] <= lower * 1.01;
  }

  rule_priceAboveEMA21(closes) {
    const ema21 = this.calcEMA(closes, 21);
    return closes[closes.length - 1] > ema21;
  }

  rule_cmfPositive(closes, highs, lows, volumes) {
    const period = 20;
    if (closes.length < period) return false;
    let mfv = 0;
    let volSum = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const hi = highs[i];
      const lo = lows[i];
      const cl = closes[i];
      const vo = volumes[i];
      if (hi === lo) continue;
      const mfMultiplier = ((cl - lo) - (hi - cl)) / (hi - lo);
      mfv += mfMultiplier * vo;
      volSum += vo;
    }
    return volSum > 0 && (mfv / volSum) > 0.08;
  }

  rule_stochRsiOversold(closes) {
    const k = this.calcStochK(closes, 14);
    return k < 22;
  }

  // ═════════════════════════════════════════════════════════
  // YARDIMCI HESAPLAMA FONKSİYONLARI
  // ═════════════════════════════════════════════════════════

  calcRSI(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff > 0) {
        gains += diff;
      } else {
        losses -= diff;
      }
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
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
      const trValue = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      tr.push(trValue);
    }
    if (tr.length < period) {
      return tr.reduce((a, b) => a + b, 0) / tr.length;
    }
    return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  calcADX(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) {
      return { adx: 0, diPlus: 0, diMinus: 0 };
    }
    const tr = [];
    const dpArr = [];
    const dmArr = [];

    for (let i = 1; i < highs.length; i++) {
      const h = highs[i];
      const l = lows[i];
      const ph = highs[i - 1];
      const pl = lows[i - 1];
      const pc = closes[i - 1];

      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      const hDiff = h - ph;
      const lDiff = pl - l;
      dpArr.push(hDiff > lDiff && hDiff > 0 ? hDiff : 0);
      dmArr.push(lDiff > hDiff && lDiff > 0 ? lDiff : 0);
    }

    const atr = tr.slice(-period).reduce((a, b) => a + b, 0) / period;
    const diPlus = (dpArr.slice(-period).reduce((a, b) => a + b, 0) / period) / atr * 100;
    const diMinus = (dmArr.slice(-period).reduce((a, b) => a + b, 0) / period) / atr * 100;
    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;

    return {
      adx: isNaN(dx) ? 0 : dx,
      diPlus: isNaN(diPlus) ? 0 : diPlus,
      diMinus: isNaN(diMinus) ? 0 : diMinus
    };
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

    return {
      upper: mean + 2 * std,
      middle: mean,
      lower: mean - 2 * std
    };
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
      const max = Math.max(...window);
      const min = Math.min(...window);
      if (max === min) {
        stochK.push(50);
      } else {
        stochK.push(((rsiValues[i] - min) / (max - min)) * 100);
      }
    }
    return stochK[stochK.length - 1];
  }
}

module.exports = new AnalysisEngine();
