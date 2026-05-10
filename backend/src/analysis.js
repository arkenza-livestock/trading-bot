/**
 * ═══════════════════════════════════════════════════════════════════════
 *   ADAPTİF ÇOK FAKTÖRLÜ ANALİZ MOTORU (PROFESYONELİZE EDİLMİŞ)
 *   
 *   📊 Özellikler:
 *   - 12 teknik analiz kuralı + İleri red filtreleri
 *   - Market rejimi algılama (RALLY, RANGING, DOWNTREND, VOLATILE)
 *   - Dinamik ağırlık sistemi (performance feedback)
 *   - Sağlıklı sinyal kalitesi kontrolü
 *   - RSI/StochRSI aşırı alım koruması
 *   - Bollinger Bands çoklu seviye kontrolü
 *   - MACD momentum doğrulaması
 *   - ADX trend gücü analizi
 * ═══════════════════════════════════════════════════════════════════════
 */

const db = require('./database');

class ProfessionalAnalysisEngine {
  
  constructor() {
    // Tüm teknik analiz kuralları
    this.allRules = [
      { key: 'supportNear',       name: 'Destek Yakınlığı',          priority: 7 },
      { key: 'rsiOversold',       name: 'RSI Aşırı Satım',           priority: 8 },
      { key: 'ichimokuBelow',     name: 'Ichimoku Bulutu Altı',      priority: 6 },
      { key: 'rsiDivergence',     name: 'RSI Bullish Diverjans',     priority: 9 },
      { key: 'volumeBuying',      name: 'Hacim Artışı (Alım)',       priority: 8 },
      { key: 'macdCross',         name: 'MACD Al Sinyali',           priority: 9 },
      { key: 'goldenCross',       name: 'Golden Cross (EMA)',        priority: 10 },
      { key: 'adxTrendUp',        name: 'ADX Yükseliş Gücü',         priority: 8 },
      { key: 'bollingerBounce',   name: 'Bollinger Alt Bant',        priority: 7 },
      { key: 'priceAboveEMA21',   name: 'Fiyat EMA21 Üstü',          priority: 7 },
      { key: 'cmfPositive',       name: 'CMF Pozitif',               priority: 6 },
      { key: 'stochRsiOversold',  name: 'StochRSI Aşırı Satım',      priority: 8 }
    ];

    // Kural ağırlıkları (feedback ile dinamik)
    this.weights = {};
    this.allRules.forEach(r => this.weights[r.key] = 1.0);

    // Kural performans verileri
    this.performance = {};
    this.allRules.forEach(r => this.performance[r.key] = { wins: 0, losses: 0, accuracy: 0.5 });

    // Market rejim bazlı kural kombinasyonları
    this.regimeConfiguration = {
      RALLY: {
        description: 'Güçlü Yükseliş Trendi',
        active: ['goldenCross', 'adxTrendUp', 'priceAboveEMA21', 'macdCross', 'volumeBuying', 'cmfPositive'],
        minPass: 4,
        minScore: 65,
        maxRsiOversoldIgnore: 70
      },
      RANGING: {
        description: 'Yatay Hareket / Belirsiz',
        active: ['supportNear', 'rsiOversold', 'bollingerBounce', 'rsiDivergence', 'stochRsiOversold', 'ichimokuBelow'],
        minPass: 3,
        minScore: 60,
        maxRsiOversoldIgnore: 75
      },
      DOWNTREND: {
        description: 'Düşüş Trendi',
        active: ['rsiOversold', 'supportNear', 'rsiDivergence', 'stochRsiOversold', 'bollingerBounce'],
        minPass: 4,
        minScore: 70,
        maxRsiOversoldIgnore: 65
      },
      VOLATILE: {
        description: 'Yüksek Volatilite / Riskli',
        active: [],
        minPass: 99,
        minScore: 999,
        maxRsiOversoldIgnore: 50
      }
    };

    this.loadSettingsFromDB();
  }

  /**
   * Database'den kaydedilen ağırlık ve performans verilerini yükle
   */
  loadSettingsFromDB() {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key='analysis_weights'").get();
      if (row && row.value) {
        const saved = JSON.parse(row.value);
        if (saved.weights) Object.assign(this.weights, saved.weights);
        if (saved.performance) Object.assign(this.performance, saved.performance);
      }
    } catch (e) {
      console.warn('[ANALYSIS] Settings yüklenemedi, varsayılanlar kullanılıyor');
    }
  }

  /**
   * Güncel ağırlık ve performans verilerini database'e kaydet
   */
  saveSettingsToDB() {
    try {
      const data = JSON.stringify({
        weights: this.weights,
        performance: this.performance,
        timestamp: Date.now()
      });
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('analysis_weights', ?)")
        .run(data);
    } catch (e) {
      console.error('[ANALYSIS] Settings kaydedilemedi:', e.message);
    }
  }

  /**
   * Kapalı işlemlerden geri bildirim ile kural ağırlıklarını güncelle
   * @param {Array} passedRules - Sinyalde başarılı kurallar
   * @param {boolean} wasProfitable - İşlem kar ile kapandı mı?
   * @param {number} profitLoss - Kar/Zarar yüzdesi
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
      
      // En az 5 trade sonrasında ağırlık hesapla
      if (total >= 5) {
        const accuracy = this.performance[key].wins / total;
        this.performance[key].accuracy = accuracy;
        
        // Ağırlık: 0.3 (zayıf) ile 2.0 (güçlü) arasında
        this.weights[key] = Math.max(0.3, Math.min(2.0, 0.5 + accuracy));
      }
    });

    this.saveSettingsToDB();
  }

  /**
   * Ana analiz fonksiyonu - Teknik sinyaller üret
   * @param {Array} candles - Mum verileri [timestamp, open, high, low, close, volume, ...]
   * @param {Object} ticker - Coin bilgileri
   * @param {Object} options - Seçenekler (btcRegime, customThreshold, etc.)
   * @returns {Object|null} Sinyal sonucu
   */
  analyze(candles, ticker, options = {}) {
    // ── Girdi validasyonu ──
    if (!candles || candles.length < 100) {
      return null;
    }

    // ── Verileri çıkar ──
    const closes = candles.map(c => parseFloat(c[4]));
    const highs = candles.map(c => parseFloat(c[2]));
    const lows = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const opens = candles.map(c => parseFloat(c[1]));
    const currentPrice = closes[closes.length - 1];

    // ── Market rejimini belirle ──
    const regime = options.btcRegime || this.detectRegime(closes, highs, lows, volumes);
    const regimeConfig = this.regimeConfiguration[regime] || this.regimeConfiguration['RANGING'];

    // ──────────────────────────────────────
    // ADIM 1: TÜM KURALLARI ÇALIŞTIR
    // ──────────────────────────────────────
    const ruleResults = {};
    for (const rule of this.allRules) {
      try {
        const methodName = `rule_${rule.key}`;
        ruleResults[rule.key] = this[methodName] 
          ? this[methodName](closes, highs, lows, volumes, opens)
          : false;
      } catch (e) {
        console.warn(`[ANALYSIS] Kural hatası ${rule.key}:`, e.message);
        ruleResults[rule.key] = false;
      }
    }

    // ──────────────────────────────────────
    // ADIM 2: AKTIF KURALLARI PUANLA
    // ──────────────────────────────────────
    let totalWeight = 0;
    let earnedWeight = 0;
    let passedCount = 0;
    let passedRules = [];
    const ruleDetails = [];

    for (const key of regimeConfig.active) {
      const passed = ruleResults[key];
      const weight = this.weights[key] || 1.0;
      totalWeight += weight;

      if (passed) {
        earnedWeight += weight;
        passedCount++;
        passedRules.push(key);
        ruleDetails.push(`✅ ${key}`);
      } else {
        ruleDetails.push(`❌ ${key}`);
      }
    }

    let score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

    // ──────────────────────────────────────
    // ADIM 3: AKILLI RED FİLTRELERİ
    // ──────────────────────────────────────
    const rsi = this.calculateRSI(closes, 14);
    const stochK = this.calculateStochRSI(closes, 14);
    const bollinger = this.calculateBollinger(closes, 20);
    const macd = this.calculateMACD(closes);
    const avgVolume20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const lastVolume = volumes[volumes.length - 1];
    const volumeQuality = lastVolume > avgVolume20 * 0.65;

    const rejectionReasons = [];

    // Filter 1: RSI aşırı alım (çok katı değil)
    if (rsi > regimeConfig.maxRsiOversoldIgnore) {
      rejectionReasons.push(`RSI AŞIRI ALIM (${rsi.toFixed(1)})`);
    }

    // Filter 2: StochRSI aşırı alım
    if (stochK > 85) {
      rejectionReasons.push(`StochRSI AŞIRI ALIM (${stochK.toFixed(1)})`);
    }

    // Filter 3: Fiyat üst Bollinger bandına çok yakın
    if (bollinger && currentPrice >= bollinger.upper * 0.96) {
      rejectionReasons.push(`FIYAT ÜST BANTTA (${((currentPrice - bollinger.middle) / bollinger.middle * 100).toFixed(1)}%)`);
    }

    // Filter 4: Düşük hacim kalitesi
    if (!volumeQuality) {
      rejectionReasons.push(`DÜŞÜK HACİM (${((lastVolume / avgVolume20) * 100).toFixed(0)}% ort.)`);
    }

    // Filter 5: Fiyat aşırı yüksek volatilite
    const atr = this.calculateATR(highs, lows, closes, 14);
    const atrPercent = (atr / currentPrice) * 100;
    if (atrPercent > 8) {
      rejectionReasons.push(`YÜKSEK VOLATİLİTE (ATR:${atrPercent.toFixed(2)}%)`);
    }

    // ──────────────────────────────────────
    // ADIM 4: SINYAL KARAR LOGJĞI
    // ──────────────────────────────────────
    let signal = 'BEKLE'; // Varsayılan
    let riskLevel = 'YUKSEK';

    // Red sebeplerinin sayısına göre karar ver
    if (rejectionReasons.length >= 3) {
      // 3+ red sebebi = BEKLE ve düşük puan
      signal = 'BEKLE';
      score = Math.min(score, 35);
      riskLevel = 'YUKSEK';
    } else if (rejectionReasons.length === 2) {
      // 2 red sebebi = Eğer yeterli kural varsa AL, yoksa BEKLE
      if (passedCount >= regimeConfig.minPass) {
        signal = passedCount >= regimeConfig.minPass + 1 ? 'ALIM' : 'BEKLE';
        score = Math.min(score, 50);
        riskLevel = 'ORTA';
      } else {
        signal = 'BEKLE';
        score = Math.min(score, 45);
        riskLevel = 'YUKSEK';
      }
    } else if (rejectionReasons.length === 1) {
      // 1 red sebebi = Yeterli kural varsa AL
      if (passedCount >= regimeConfig.minPass) {
        signal = 'ALIM';
        score = Math.min(score, 65);
        riskLevel = passedCount >= regimeConfig.minPass + 1 ? 'DUSUK' : 'ORTA';
      } else {
        signal = 'BEKLE';
        score = Math.min(score, 55);
        riskLevel = 'ORTA';
      }
    } else {
      // Hiç red sebebi yok
      if (passedCount >= regimeConfig.minPass) {
        signal = 'ALIM';
        score = Math.max(score, regimeConfig.minScore);
        riskLevel = passedCount >= regimeConfig.minPass + 1 ? 'DUSUK' : 'ORTA';
      } else {
        signal = 'BEKLE';
        riskLevel = 'ORTA';
      }
    }

    // Final skor kontrol
    if (score < 40) signal = 'BEKLE';
    if (signal === 'ALIM' && score < 55) signal = 'BEKLE';

    // ──────────────────────────────────────
    // ADIM 5: SL/TP HESAPLA
    // ──────────────────────────────────────
    const stopLoss = currentPrice - (atr * 1.5);
    const takeProfit = currentPrice + (atr * 3);
    const slPercent = ((currentPrice - stopLoss) / currentPrice) * 100;
    const tpPercent = ((takeProfit - currentPrice) / currentPrice) * 100;

    // ──────────────────────────────────────
    // ADIM 6: SONUÇ OLUŞTUR
    // ──────────────────────────────────────
    return {
      symbol: ticker.symbol,
      price: parseFloat(currentPrice.toFixed(8)),
      fiyat: parseFloat(currentPrice.toFixed(8)),
      score: score,
      puan: score,
      signal: signal,
      signal_type: signal,
      regime: regime,
      regimeDescription: regimeConfig.description,
      
      // Kural detayları
      passedCount: passedCount,
      passedRules: passedRules,
      totalRules: regimeConfig.active.length,
      ruleDetails: ruleDetails.join(' '),
      rejectionReasons: rejectionReasons,
      
      // Teknik göstergeler
      rsi: parseFloat(rsi.toFixed(2)),
      stochRsi: parseFloat(stochK.toFixed(2)),
      macd: {
        value: parseFloat(macd.macd.toFixed(8)),
        signal: parseFloat(macd.signal.toFixed(8)),
        histogram: parseFloat(macd.histogram.toFixed(8)),
        bullish: macd.macd > macd.signal
      },
      bollinger: {
        upper: parseFloat(bollinger.upper.toFixed(8)),
        middle: parseFloat(bollinger.middle.toFixed(8)),
        lower: parseFloat(bollinger.lower.toFixed(8)),
        position: parseFloat(((currentPrice - bollinger.lower) / (bollinger.upper - bollinger.lower) * 100).toFixed(2))
      },
      atr: {
        value: parseFloat(atr.toFixed(8)),
        percentOfPrice: parseFloat(atrPercent.toFixed(2))
      },
      volume: {
        current: parseFloat(lastVolume.toFixed(2)),
        average20: parseFloat(avgVolume20.toFixed(2)),
        ratio: parseFloat((lastVolume / avgVolume20).toFixed(2))
      },
      
      // Fiyat hedefleri
      stopLoss: parseFloat(stopLoss.toFixed(8)),
      stop_loss: parseFloat(stopLoss.toFixed(8)),
      takeProfit: parseFloat(takeProfit.toFixed(8)),
      target: parseFloat(takeProfit.toFixed(8)),
      hedef: parseFloat(takeProfit.toFixed(8)),
      riskRewardRatio: parseFloat((tpPercent / slPercent).toFixed(2)),
      
      // Risk değerlendirmesi
      risk: riskLevel,
      confidence: parseFloat((score / 100).toFixed(2)),
      machineConfidence: parseFloat((score / 100).toFixed(2)),
      
      // Trend tanımı
      trend: currentPrice > this.calculateEMA(closes, 21) ? 'YUKARI' : 'ASAGI',
      trend24h: parseFloat(ticker.priceChangePercent || 0),
      
      // Meta
      pozitif: ruleDetails.filter(d => d.startsWith('✅')).map(d => d.substring(2)),
      negatif: ruleDetails.filter(d => d.startsWith('❌')).map(d => d.substring(2)),
      timestamp: Date.now(),
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Market rejimini otomatik algıla
   */
  detectRegime(closes, highs, lows, volumes) {
    const rsi = this.calculateRSI(closes, 14);
    const adx = this.calculateADX(highs, lows, closes, 14);
    const atr = this.calculateATR(highs, lows, closes, 14);
    const ema21 = this.calculateEMA(closes, 21);
    const currentPrice = closes[closes.length - 1];

    const atrPercent = (atr / currentPrice) * 100;

    // Volatilite kontrolü
    if (atrPercent > 8 || (adx.adx < 15 && Math.abs(rsi - 50) > 20)) {
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
  // 12 TEKNIK ANALİZ KURALI
  // ═════════════════════════════════════════════════════════

  /**
   * Kural 1: Destek seviyesine yakın mı?
   */
  rule_supportNear(closes) {
    const low50 = Math.min(...closes.slice(-50));
    const distancePercent = ((closes[closes.length - 1] - low50) / closes[closes.length - 1]) * 100;
    return distancePercent < 2.5;
  }

  /**
   * Kural 2: RSI aşırı satım bölgesinde mi?
   */
  rule_rsiOversold(closes) {
    const rsi = this.calculateRSI(closes, 14);
    return rsi > 25 && rsi < 38;
  }

  /**
   * Kural 3: Ichimoku bulutu altında mı?
   */
  rule_ichimokuBelow(closes, highs, lows) {
    if (highs.length < 52) return false;
    const h52 = Math.max(...highs.slice(-52));
    const l52 = Math.min(...lows.slice(-52));
    const senkouSpan = (h52 + l52) / 2;
    return closes[closes.length - 1] < senkouSpan;
  }

  /**
   * Kural 4: RSI bullish diverjans var mı?
   */
  rule_rsiDivergence(closes) {
    if (closes.length < 25) return false;
    
    const recent = closes.slice(-10);
    const previous = closes.slice(-20, -10);
    
    const recentLow = Math.min(...recent);
    const prevLow = Math.min(...previous);
    
    if (recentLow >= prevLow) return false;
    
    const recentRSI = this.calculateRSI(recent, 14);
    const prevRSI = this.calculateRSI(previous, 14);
    
    return recentRSI > prevRSI;
  }

  /**
   * Kural 5: Hacim artışı ile birlikte fiyat yükselişi var mı?
   */
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

  /**
   * Kural 6: MACD al sinyali var mı?
   */
  rule_macdCross(closes) {
    if (closes.length < 35) return false;
    
    const macd = this.calculateMACD(closes);
    
    // Geçmiş sinyalleri kontrol et
    let crossCount = 0;
    if (macd.macd > macd.signal) {
      // Şimdi MACD signal'in üstünde
      // Geçmişte altında mıydı?
      const prevCloses = closes.slice(-10, -1);
      if (prevCloses.length > 0) {
        const prevMACD = this.calculateMACD(prevCloses);
        if (prevMACD.macd <= prevMACD.signal) {
          return true; // Cross oluştu
        }
      }
    }
    
    return false;
  }

  /**
   * Kural 7: Golden Cross (EMA21 > EMA50) oluştu mu?
   */
  rule_goldenCross(closes) {
    if (closes.length < 51) return false;
    
    const ema21 = this.calculateEMA(closes, 21);
    const ema50 = this.calculateEMA(closes, 50);
    
    const prevCloses = closes.slice(-2);
    if (prevCloses.length < 2) return false;
    
    const prevEMA21 = this.calculateEMA(prevCloses, 21);
    const prevEMA50 = this.calculateEMA(prevCloses, 50);
    
    // Geçmişte 21 <= 50, şimdi 21 > 50
    return prevEMA21 <= prevEMA50 && ema21 > ema50;
  }

  /**
   * Kural 8: ADX trend gücü yüksek mi ve yukarıya mı?
   */
  rule_adxTrendUp(closes, highs, lows) {
    const adx = this.calculateADX(highs, lows, closes, 14);
    return adx.adx > 25 && adx.diPlus > adx.diMinus;
  }

  /**
   * Kural 9: Bollinger alt bandına dokundu mu?
   */
  rule_bollingerBounce(closes) {
    if (closes.length < 20) return false;
    
    const slice = closes.slice(-20);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
    const std = Math.sqrt(variance);
    const lower = mean - 2 * std;
    
    return closes[closes.length - 1] <= lower * 1.01;
  }

  /**
   * Kural 10: Fiyat EMA21'in üstünde mi?
   */
  rule_priceAboveEMA21(closes) {
    const ema21 = this.calculateEMA(closes, 21);
    return closes[closes.length - 1] > ema21;
  }

  /**
   * Kural 11: CMF (Chaikin Money Flow) pozitif mi?
   */
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

  /**
   * Kural 12: StochRSI aşırı satım mı?
   */
  rule_stochRsiOversold(closes) {
    const k = this.calculateStochRSI(closes, 14);
    return k < 22;
  }

  // ═════════════════════════════════════════════════════════
  // YARDIMCI TEKNİK FONKSİYONLAR
  // ═════════════════════════════════════════════════════════

  /**
   * RSI Hesapla (Relative Strength Index)
   */
  calculateRSI(data, period = 14) {
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

  /**
   * EMA Hesapla (Exponential Moving Average)
   */
  calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];

    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }

    return ema;
  }

  /**
   * ATR Hesapla (Average True Range)
   */
  calculateATR(highs, lows, closes, period = 14) {
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

  /**
   * ADX Hesapla (Average Directional Index)
   */
  calculateADX(highs, lows, closes, period = 14) {
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

  /**
   * Bollinger Bands Hesapla
   */
  calculateBollinger(closes, period = 20) {
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

  /**
   * StochRSI Hesapla
   */
  calculateStochRSI(closes, rsiPeriod = 14) {
    const rsiValues = [];

    for (let i = rsiPeriod; i <= closes.length; i++) {
      rsiValues.push(this.calculateRSI(closes.slice(0, i), rsiPeriod));
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

  /**
   * MACD Hesapla (Moving Average Convergence Divergence)
   */
  calculateMACD(closes) {
    if (closes.length < 26) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;

    // Signal line (MACD'nin 9 periyotluk EMA'sı)
    const macdValues = [];
    for (let i = 26; i <= closes.length; i++) {
      const e12 = this.calculateEMA(closes.slice(0, i), 12);
      const e26 = this.calculateEMA(closes.slice(0, i), 26);
      macdValues.push(e12 - e26);
    }

    const signalLine = this.calculateEMA(macdValues, 9);
    const histogram = macdLine - signalLine;

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: histogram
    };
  }

  /**
   * Geriye dönük uyumluluk metotları (eski kod ile)
   */
  calcRSI(data, period) { return this.calculateRSI(data, period); }
  calcEMA(data, period) { return this.calculateEMA(data, period); }
  calcATR(h, l, c, p) { return this.calculateATR(h, l, c, p); }
  calcADX(h, l, c, p) { return this.calculateADX(h, l, c, p); }
  calcStochK(data, period) { return this.calculateStochRSI(data, period); }
  calcBollinger(data, period) { return this.calculateBollinger(data, period); }
}

module.exports = new ProfessionalAnalysisEngine();
