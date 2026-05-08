/**
 * ═══════════════════════════════════════════════════════════
 *   HİBRİT ANALİZ MOTORU - 6 KURAL + MAKİNE OPTİMİZASYONU
 *   - 6 klasik teknik analiz kuralı
 *   - En az 4/6 kural → AL sinyali
 *   - Makine geri bildirimle kural ağırlıklarını optimize eder
 * ═══════════════════════════════════════════════════════════
 */

class HybridAnalysis {
  
  constructor() {
    // Kural ağırlıkları (geri bildirimle güncellenir)
    this.ruleWeights = {
      supportTrend: 1.0,    // Kural 1: Destek/Trend Yakınlığı
      rsiOversold: 1.0,     // Kural 2: RSI Aşırı Satım
      ichimokuCloud: 1.0,   // Kural 3: Bulut Altında Olma
      rsiDivergence: 1.0,   // Kural 4: RSI Bullish Uyumsuzluğu
      volumeSpike: 1.0,     // Kural 5: Hacim Artışı
      macdCrossover: 1.0    // Kural 6: MACD Alım Sinyali
    };
    
    // Kural başarı takibi
    this.rulePerformance = {
      supportTrend: { wins: 0, losses: 0 },
      rsiOversold: { wins: 0, losses: 0 },
      ichimokuCloud: { wins: 0, losses: 0 },
      rsiDivergence: { wins: 0, losses: 0 },
      volumeSpike: { wins: 0, losses: 0 },
      macdCrossover: { wins: 0, losses: 0 }
    };
    
    // Minimum kural sayısı (en az 4/6)
    this.minRulesRequired = 4;
    
    // Veritabanından ağırlıkları yükle
    this.loadWeightsFromDB();
  }
  
  // ═══════════════════════════════════════════
  // VERİTABANINDAN AĞIRLIKLARI YÜKLE
  // ═══════════════════════════════════════════
  loadWeightsFromDB() {
    try {
      const db = require('./database');
      const row = db.prepare("SELECT value FROM settings WHERE key='hybrid_weights'").get();
      if (row && row.value) {
        const saved = JSON.parse(row.value);
        if (saved.weights) this.ruleWeights = saved.weights;
        if (saved.performance) this.rulePerformance = saved.performance;
        console.log('[HYBRID] ✅ Ağırlıklar yüklendi');
      }
    } catch(e) {}
  }
  
  // ═══════════════════════════════════════════
  // AĞIRLIKLARI VERİTABANINA KAYDET
  // ═══════════════════════════════════════════
  saveWeightsToDB() {
    try {
      const db = require('./database');
      const data = JSON.stringify({
        weights: this.ruleWeights,
        performance: this.rulePerformance,
        updatedAt: new Date().toISOString()
      });
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hybrid_weights', ?)").run(data);
    } catch(e) {}
  }
  
  // ═══════════════════════════════════════════
  // GERİ BİLDİRİM - KURAL AĞIRLIKLARINI GÜNCELLE
  // ═══════════════════════════════════════════
  feedback(ruleResults, wasProfitable) {
    for (const [ruleName, passed] of Object.entries(ruleResults)) {
      if (passed && this.rulePerformance[ruleName]) {
        if (wasProfitable) {
          this.rulePerformance[ruleName].wins++;
        } else {
          this.rulePerformance[ruleName].losses++;
        }
        
        // Ağırlığı güncelle (başarı oranına göre)
        const total = this.rulePerformance[ruleName].wins + this.rulePerformance[ruleName].losses;
        if (total > 5) {
          const winRate = this.rulePerformance[ruleName].wins / total;
          this.ruleWeights[ruleName] = 0.5 + winRate; // 0.5 - 1.5 arası
        }
      }
    }
    this.saveWeightsToDB();
  }
  
  // ═══════════════════════════════════════════
  // ANA ANALİZ FONKSİYONU
  // ═══════════════════════════════════════════
  analyze(candles, ticker) {
    if (!candles || candles.length < 100) return null;
    
    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const opens   = candles.map(c => parseFloat(c[1]));
    const fiyat   = closes[closes.length - 1];
    
    // ═══ 6 KURAL KONTROLÜ ═══
    const ruleResults = {
      supportTrend: this.checkSupportTrend(closes, highs, lows),
      rsiOversold: this.checkRSIOversold(closes),
      ichimokuCloud: this.checkIchimokuCloud(highs, lows, closes),
      rsiDivergence: this.checkRSIDivergence(closes),
      volumeSpike: this.checkVolumeSpike(volumes),
      macdCrossover: this.checkMACDCrossover(closes)
    };
    
    // Kaç kural sağlandı?
    const passedCount = Object.values(ruleResults).filter(v => v === true).length;
    
    // Ağırlıklı puan hesapla
    let weightedScore = 0;
    let totalWeight = 0;
    for (const [ruleName, passed] of Object.entries(ruleResults)) {
      if (passed) {
        weightedScore += this.ruleWeights[ruleName] || 1.0;
      }
      totalWeight += (this.ruleWeights[ruleName] || 1.0);
    }
    
    // Normalize edilmiş puan (0-100)
    const finalScore = totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;
    
    // Sinyal kararı: en az 4/6 kural
    const signal = passedCount >= this.minRulesRequired ? 'ALIM' : 'BEKLE';
    
    // Risk seviyesi
    const risk = passedCount >= 5 ? 'DUSUK' : passedCount >= 4 ? 'ORTA' : 'YUKSEK';
    
    // Kuralların açıklamaları
    const ruleDescriptions = {
      supportTrend: 'Destek/Trend Yakınlığı',
      rsiOversold: 'RSI Aşırı Satım',
      ichimokuCloud: 'Ichimoku Bulutu Altı',
      rsiDivergence: 'RSI Bullish Uyumsuzluğu',
      volumeSpike: 'Hacim Artışı',
      macdCrossover: 'MACD Alım Sinyali'
    };
    
    const positiveRules = [];
    const negativeRules = [];
    for (const [ruleName, passed] of Object.entries(ruleResults)) {
      if (passed) {
        positiveRules.push(ruleDescriptions[ruleName]);
      } else {
        negativeRules.push(ruleDescriptions[ruleName]);
      }
    }
    
    // Stop-loss ve hedef (ATR tabanlı)
    const atr14 = this.calculateATR(highs, lows, closes, 14);
    const stopLoss = fiyat - atr14 * 1.5;
    const target = fiyat + atr14 * 3;
    
    return {
      symbol: ticker.symbol,
      fiyat: parseFloat(fiyat.toFixed(8)),
      puan: Math.round(finalScore),
      risk,
      sinyal: signal,
      signal_type: signal,
      ruleResults,
      passedCount,
      totalRules: 6,
      rsi: this.calculateRSI(closes, 14),
      trend: fiyat > this.calculateEMA(closes, 21) ? 'YUKARI' : 'ASAGI',
      pozitif: positiveRules,
      negatif: negativeRules,
      atr14: parseFloat(atr14.toFixed(8)),
      atrOran: parseFloat((atr14 / fiyat * 100).toFixed(2)),
      stop_loss: parseFloat(stopLoss.toFixed(8)),
      hedef: parseFloat(target.toFixed(8)),
      macdBullish: ruleResults.macdCrossover ? 1 : 0,
      macdLine: 0,
      signalLine: 0,
      macdHist: 0,
      bPct: 0,
      degisim24h: parseFloat(ticker.priceChangePercent || 0),
      hacim24h: parseFloat(ticker.quoteVolume || 0)
    };
  }
  
  // ═══════════════════════════════════════════
  // KURAL 1: Destek/Trend Çizgisi Yakınlığı
  // Fiyat son 50 mumun en düşüğüne %2 yakın
  // ═══════════════════════════════════════════
  checkSupportTrend(closes, highs, lows) {
    const son50Low = Math.min(...lows.slice(-50));
    const fiyat = closes[closes.length - 1];
    const distancePercent = ((fiyat - son50Low) / fiyat) * 100;
    return distancePercent < 2.0; // %2'den az uzaklık
  }
  
  // ═══════════════════════════════════════════
  // KURAL 2: RSI Aşırı Satım (25-35 arası)
  // ═══════════════════════════════════════════
  checkRSIOversold(closes) {
    const rsi = this.calculateRSI(closes, 14);
    return rsi > 25 && rsi < 35;
  }
  
  // ═══════════════════════════════════════════
  // KURAL 3: Ichimoku Bulutu Altında Olma
  // Fiyat < Senkou Span B (basitleştirilmiş)
  // ═══════════════════════════════════════════
  checkIchimokuCloud(highs, lows, closes) {
    // Basitleştirilmiş Ichimoku: Son 52 mumun en yüksek + en düşük / 2'si
    const period = 52;
    if (highs.length < period) return false;
    
    const highest52 = Math.max(...highs.slice(-period));
    const lowest52 = Math.min(...lows.slice(-period));
    const senkouSpanB = (highest52 + lowest52) / 2;
    const fiyat = closes[closes.length - 1];
    
    return fiyat < senkouSpanB;
  }
  
  // ═══════════════════════════════════════════
  // KURAL 4: RSI Bullish Divergence
  // Fiyat düşük dip, RSI yüksek dip
  // ═══════════════════════════════════════════
  checkRSIDivergence(closes) {
    if (closes.length < 20) return false;
    
    // Son 10 ve önceki 10 mum
    const recentHalf = closes.slice(-10);
    const prevHalf = closes.slice(-20, -10);
    
    const recentLow = Math.min(...recentHalf);
    const prevLow = Math.min(...prevHalf);
    
    // Fiyat daha düşük dip yapmış mı?
    if (recentLow >= prevLow) return false;
    
    // RSI karşılaştırması
    const recentRSI = this.calculateRSI(recentHalf, 14);
    const prevRSI = this.calculateRSI(prevHalf, 14);
    
    // RSI daha yüksek dip yapmış mı? (Bullish Divergence)
    return recentRSI > prevRSI;
  }
  
  // ═══════════════════════════════════════════
  // KURAL 5: Hacim Artışı
  // Güncel hacim > 20 ortalamanın 1.5 katı
  // ═══════════════════════════════════════════
  checkVolumeSpike(volumes) {
    if (volumes.length < 21) return false;
    
    const sonVol = volumes[volumes.length - 1];
    const ortVol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    
    return sonVol > ortVol * 1.5;
  }
  
  // ═══════════════════════════════════════════
  // KURAL 6: MACD Alım Sinyali
  // MACD çizgisi sinyal çizgisini yukarı kesti
  // ═══════════════════════════════════════════
  checkMACDCrossover(closes) {
    if (closes.length < 35) return false;
    
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;
    
    // Sinyal çizgisi için son 9 MACD değeri
    const macdValues = [];
    for (let i = closes.length - 9; i < closes.length; i++) {
      const slice12 = closes.slice(0, i + 1);
      const slice26 = closes.slice(0, i + 1);
      const ema12Val = this.calculateEMA(slice12, 12);
      const ema26Val = this.calculateEMA(slice26, 26);
      macdValues.push(ema12Val - ema26Val);
    }
    const signalLine = macdValues.reduce((a, b) => a + b, 0) / 9;
    
    return macdLine > signalLine;
  }
  
  // ═══════════════════════════════════════════
  // TEKNİK GÖSTERGE YARDIMCILARI
  // ═══════════════════════════════════════════
  
  calculateRSI(closes, period = 14) {
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
    return 100 - (100 / (1 + avgGain / avgLoss));
  }
  
  calculateEMA(closes, period) {
    if (closes.length < period) return closes[closes.length - 1];
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }
  
  calculateATR(highs, lows, closes, period = 14) {
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
}

// ═══════════════════════════════════════════
// ProfessionalAnalysis Sınıfı (Geriye dönük uyumluluk için)
// ═══════════════════════════════════════════
class ProfessionalAnalysis extends HybridAnalysis {
  constructor() {
    super();
  }
  
  // Eski metotları koru (backtest uyumluluğu için)
  hesaplaRSI(data, period = 14) { return this.calculateRSI(data, period); }
  hesaplaEMA(data, period) { return this.calculateEMA(data, period); }
  hesaplaATR(highs, lows, closes, period) { return this.calculateATR(highs, lows, closes, period); }
  
  // ADX (basitleştirilmiş)
  hesaplaADX(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return { adx: 0, diPlus: 0, diMinus: 0 };
    const tr = [], dp = [], dm = [];
    for (let i = 1; i < highs.length; i++) {
      const h = highs[i], l = lows[i], ph = highs[i - 1], pl = lows[i - 1], pc = closes[i - 1];
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      dp.push(h - ph > pl - l && h - ph > 0 ? h - ph : 0);
      dm.push(pl - l > h - ph && pl - l > 0 ? pl - l : 0);
    }
    const atr = tr.slice(-period).reduce((a, b) => a + b, 0) / period;
    const diP = (dp.slice(-period).reduce((a, b) => a + b, 0) / period) / atr * 100;
    const diM = (dm.slice(-period).reduce((a, b) => a + b, 0) / period) / atr * 100;
    const dx = Math.abs(diP - diM) / (diP + diM) * 100;
    return { adx: dx, diPlus: diP, diMinus: diM };
  }
}

module.exports = new ProfessionalAnalysis();
