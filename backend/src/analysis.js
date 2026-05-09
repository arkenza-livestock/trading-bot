();
/**
 * ═══════════════════════════════════════════════════════════
 *   ADAPTİF ÇOK FAKTÖRLÜ ANALİZ MOTORU – LONG (A1)
 *   - 12 teknik kural + Akıllı Red Filtreleri
 *   - RSI / StochRSI aşırı alım koruması
 *   - Bollinger üst bant reddi
 *   - Hacim kalitesi kontrolü
 *   - Geri bildirimle ağırlık güncelleme
 * ═══════════════════════════════════════════════════════════
 */

class AdaptiveHybridAnalysis {
  
  constructor() {
    this.allRules = [
      { key: 'supportNear',       name: 'Destek Yakınlığı' },
      { key: 'rsiOversold',       name: 'RSI Aşırı Satım' },
      { key: 'ichimokuBelow',     name: 'Ichimoku Bulutu Altı' },
      { key: 'rsiDivergence',     name: 'RSI Bullish Diverjans' },
      { key: 'volumeBuying',      name: 'Hacim Artışı (Alım)' },
      { key: 'macdCross',         name: 'MACD Al Sinyali' },
      { key: 'goldenCross',       name: 'Golden Cross (EMA)' },
      { key: 'adxTrendUp',        name: 'ADX Yükseliş Gücü' },
      { key: 'bollingerBounce',   name: 'Bollinger Alt Bant Sıçraması' },
      { key: 'priceAboveEMA21',   name: 'Fiyat EMA21 Üstü' },
      { key: 'cmfPositive',       name: 'CMF Pozitif' },
      { key: 'stochRsiOversold',  name: 'StochRSI Aşırı Satım' }
    ];

    this.weights = {};
    this.allRules.forEach(r => this.weights[r.key] = 1.0);

    this.perf = {};
    this.allRules.forEach(r => this.perf[r.key] = { wins: 0, losses: 0 });

    this.regimeRules = {
      RALLY: {
        active: ['goldenCross','adxTrendUp','priceAboveEMA21','macdCross','volumeBuying','cmfPositive'],
        minPass: 4
      },
      RANGING: {
        active: ['supportNear','rsiOversold','bollingerBounce','rsiDivergence','stochRsiOversold','ichimokuBelow'],
        minPass: 3
      },
      DOWNTREND: {
        active: ['rsiOversold','supportNear','rsiDivergence','stochRsiOversold','bollingerBounce','volumeBuying'],
        minPass: 4
      },
      VOLATILE: {
        active: [],
        minPass: 99
      }
    };

    this.loadFromDB();
  }

  loadFromDB() {
    try {
      const db = require('./database');
      const row = db.prepare("SELECT value FROM settings WHERE key='adapt_weights'").get();
      if (row && row.value) {
        const saved = JSON.parse(row.value);
        if (saved.weights) Object.assign(this.weights, saved.weights);
        if (saved.perf)   Object.assign(this.perf, saved.perf);
      }
    } catch(e) {}
  }

  saveToDB() {
    try {
      const db = require('./database');
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('adapt_weights',?)")
        .run(JSON.stringify({ weights: this.weights, perf: this.perf }));
    } catch(e) {}
  }

  feedback(passedRules, wasProfitable) {
    passedRules.forEach(key => {
      if (this.perf[key]) {
        if (wasProfitable) this.perf[key].wins++;
        else this.perf[key].losses++;
        const total = this.perf[key].wins + this.perf[key].losses;
        if (total > 5) {
          const wr = this.perf[key].wins / total;
          this.weights[key] = Math.max(0.3, Math.min(2.0, 0.5 + wr));
        }
      }
    });
    this.saveToDB();
  }

  analyze(candles, ticker, options = {}) {
    if (!candles || candles.length < 100) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const opens   = candles.map(c => parseFloat(c[1]));
    const fiyat   = closes[closes.length - 1];

    const regime = options.btcRegime || 'RANGING';
    const regimeCfg = this.regimeRules[regime] || this.regimeRules['RANGING'];

    // Tüm kuralları çalıştır
    const results = {};
    for (const rule of this.allRules) {
      results[rule.key] = this['check_' + rule.key](closes, highs, lows, volumes, opens);
    }

    // Aktif kuralları puanla
    let totalWeight = 0, earnedWeight = 0, passedCount = 0;
    const details = [];
    for (const key of regimeCfg.active) {
      const passed = results[key];
      const w = this.weights[key] || 1.0;
      totalWeight += w;
      if (passed) {
        earnedWeight += w;
        passedCount++;
        details.push('✅' + key);
      } else {
        details.push('❌' + key);
      }
    }

    let score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

    // ──────────────── AKILLI RED FİLTRELERİ (YUMUŞATILMIŞ) ────────────────
    const rsi = this.calcRSI(closes, 14);
    const stochK = this.calcStochK(closes, 14);
    const bollinger = this.calcBollinger(closes, 20);
    const avgVolume20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const lastVolume = volumes[volumes.length - 1];
    const volumeQuality = lastVolume > avgVolume20 * 0.7;   // %70 yeterli

    const redReasons = [];

    // 1. RSI aşırı alım (eşik 75)
    if (rsi > 75) {
      redReasons.push(`RSI AŞIRI ALIM (${rsi.toFixed(1)})`);
    }

    // 2. StochRSI aşırı alım (eşik 85)
    if (stochK > 85) {
      redReasons.push(`StochRSI AŞIRI ALIM (K:${stochK.toFixed(1)})`);
    }

    // 3. Fiyat üst bollinger bandına %3'ten yakınsa
    if (bollinger && fiyat >= bollinger.upper * 0.97) {
      redReasons.push(`FİYAT ÜST BANTTA`);
    }

    // 4. Düşük hacim
    if (!volumeQuality) {
      redReasons.push('DÜŞÜK HACİM');
    }

    // Red sebepleri 3 veya daha fazlaysa sinyali BEKLE yap, yoksa sadece puan kır
    if (redReasons.length >= 3) {
      score = Math.min(score, 40);
    } else if (redReasons.length === 2) {
      score = Math.min(score, 55);
    } else if (redReasons.length === 1) {
      score = Math.min(score, 65);
    }
    const signal = (passedCount >= regimeCfg.minPass && redReasons.length < 3) ? 'ALIM' : 'BEKLE';
    const risk = (passedCount >= regimeCfg.minPass + 1 && redReasons.length === 0) ? 'DUSUK' : 'ORTA';

    // Stop / hedef
    const atr14 = this.calcATR(highs, lows, closes, 14);
    const stopLoss = fiyat - atr14 * 1.5;
    const target   = fiyat + atr14 * 3;

    return {
      symbol: ticker.symbol,
      fiyat: parseFloat(fiyat.toFixed(8)),
      puan: score,
      risk,
      sinyal: signal,
      signal_type: signal,
      regime,
      passedCount,
      totalRules: regimeCfg.active.length,
      ruleDetails: details.join(' ') + (redReasons.length > 0 ? ' ⛔ RED: ' + redReasons.join(', ') : ''),
      rsi,
      trend: fiyat > this.calcEMA(closes, 21) ? 'YUKARI' : 'ASAGI',
      pozitif: details.filter(d => d.startsWith('✅')),
      negatif: details.filter(d => d.startsWith('❌')),
      atr14: parseFloat(atr14.toFixed(8)),
      atrOran: parseFloat((atr14 / fiyat * 100).toFixed(2)),
      stop_loss: parseFloat(stopLoss.toFixed(8)),
      hedef: parseFloat(target.toFixed(8)),
      macdBullish: results.macdCross ? 1 : 0,
      macdLine: 0, signalLine: 0, macdHist: 0, bPct: 0,
      degisim24h: parseFloat(ticker.priceChangePercent || 0),
      hacim24h: parseFloat(ticker.quoteVolume || 0)
    };
  }

  // ═══════════════ 12 KURAL ═══════════════
  check_supportNear(c) { const low50 = Math.min(...c.slice(-50)); return ((c[c.length-1] - low50) / c[c.length-1]) * 100 < 2; }
  check_rsiOversold(c) { const r = this.calcRSI(c, 14); return r > 25 && r < 35; }
  check_ichimokuBelow(c, h, l) { const h52 = Math.max(...h.slice(-52)); const l52 = Math.min(...l.slice(-52)); const senkouB = (h52 + l52) / 2; return c[c.length-1] < senkouB; }
  check_rsiDivergence(c) { if (c.length < 20) return false; const recent = c.slice(-10), prev = c.slice(-20, -10); const rLow = Math.min(...recent), pLow = Math.min(...prev); if (rLow >= pLow) return false; return this.calcRSI(recent, 14) > this.calcRSI(prev, 14); }
  check_volumeBuying(c, h, l, v, o) { if (v.length < 21) return false; const curV = v[v.length-1]; const avgV = v.slice(-21, -1).reduce((a,b) => a+b, 0) / 20; const curC = c[c.length-1], curO = o[o.length-1]; return curV > avgV * 1.5 && curC > curO; }
  check_macdCross(c) { if (c.length < 35) return false; const ema12 = this.calcEMA(c, 12); const ema26 = this.calcEMA(c, 26); const macd = ema12 - ema26; const vals = []; for (let i = c.length - 9; i < c.length; i++) { const s12 = c.slice(0, i+1), s26 = c.slice(0, i+1); vals.push(this.calcEMA(s12, 12) - this.calcEMA(s26, 26)); } const signal = vals.reduce((a,b) => a + b, 0) / 9; return macd > signal; }
  check_goldenCross(c) { if (c.length < 51) return false; const ema21 = this.calcEMA(c, 21); const ema50 = this.calcEMA(c, 50); const prev21 = this.calcEMA(c.slice(0, -1), 21); const prev50 = this.calcEMA(c.slice(0, -1), 50); return prev21 <= prev50 && ema21 > ema50; }
  check_adxTrendUp(c, h, l) { const adx = this.calcADX(h, l, c, 14); return adx.adx > 25 && adx.diPlus > adx.diMinus; }
  check_bollingerBounce(c) { if (c.length < 20) return false; const slice = c.slice(-20); const mean = slice.reduce((a,b) => a + b, 0) / 20; const std = Math.sqrt(slice.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / 20); const lower = mean - 2 * std; return c[c.length-1] <= lower * 1.005; }
  check_priceAboveEMA21(c) { return c[c.length-1] > this.calcEMA(c, 21); }
  check_cmfPositive(c, h, l, v) { const period = 20; if (c.length < period) return false; let mfv = 0, volSum = 0; for (let i = c.length - period; i < c.length; i++) { const hi = h[i], lo = l[i], cl = c[i], vo = v[i]; if (hi === lo) continue; mfv += ((cl - lo) - (hi - cl)) / (hi - lo) * vo; volSum += vo; } return volSum > 0 && (mfv / volSum) > 0.1; }
  check_stochRsiOversold(c) { const k = this.calcStochK(c, 14); return k < 20; }

  // ═══════════════ YARDIMCI FONKSİYONLAR ═══════════════
  calcStochK(closes, rsiPeriod = 14) {
    const rsiVals = [];
    for (let i = rsiPeriod; i <= closes.length; i++) {
      rsiVals.push(this.calcRSI(closes.slice(0, i), rsiPeriod));
    }
    if (rsiVals.length < 14) return 50;
    const stochK = [];
    for (let i = 13; i < rsiVals.length; i++) {
      const win = rsiVals.slice(i - 13, i + 1);
      const max = Math.max(...win), min = Math.min(...win);
      stochK.push(max === min ? 50 : ((rsiVals[i] - min) / (max - min)) * 100);
    }
    return stochK[stochK.length - 1];
  }

  calcBollinger(closes, period = 20) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const mean = slice.reduce((a,b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / period);
    return { upper: mean + 2 * std, lower: mean - 2 * std };
  }

  calcRSI(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  calcEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a,b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
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
    if (tr.length < period) return tr.reduce((a,b) => a + b, 0) / tr.length;
    return tr.slice(-period).reduce((a,b) => a + b, 0) / period;
  }

  calcADX(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return { adx: 0, diPlus: 0, diMinus: 0 };
    const tr = [], dp = [], dm = [];
    for (let i = 1; i < highs.length; i++) {
      const h = highs[i], l = lows[i], ph = highs[i - 1], pl = lows[i - 1], pc = closes[i - 1];
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      dp.push(h - ph > pl - l && h - ph > 0 ? h - ph : 0);
      dm.push(pl - l > h - ph && pl - l > 0 ? pl - l : 0);
    }
    const atr = tr.slice(-period).reduce((a,b) => a + b, 0) / period;
    const diP = (dp.slice(-period).reduce((a,b) => a + b, 0) / period) / atr * 100;
    const diM = (dm.slice(-period).reduce((a,b) => a + b, 0) / period) / atr * 100;
    const dx = Math.abs(diP - diM) / (diP + diM) * 100;
    return { adx: dx, diPlus: diP, diMinus: diM };
  }
}

// Geriye dönük uyumluluk sınıfı
class ProfessionalAnalysis extends AdaptiveHybridAnalysis {
  constructor() { super(); }
  hesaplaRSI(d,p) { return this.calcRSI(d,p); }
  hesaplaEMA(d,p) { return this.calcEMA(d,p); }
  hesaplaATR(h,l,c,p) { return this.calcATR(h,l,c,p); }
  hesaplaADX(h,l,c,p) { return this.calcADX(h,l,c,p); }
}

module.exports = new ProfessionalAnalysis();
