/**
 * ═══════════════════════════════════════════════════════════
 *   ADAPTİF ÇOK FAKTÖRLÜ ANALİZ MOTORU – SHORT (A2)
 *   - 8 SHORT odaklı kural
 *   - Piyasa rejimine göre otomatik kural seçimi
 *   - Geri bildirimle ağırlık güncelleme
 *   - Volatilite / haber filtresi
 * ═══════════════════════════════════════════════════════════
 */

class AdaptiveShortAnalysis {
  
  constructor() {
    // 8 SHORT KURALI
    this.allRules = [
      { key: 'rsiOverbought',      name: 'RSI Aşırı Alım' },
      { key: 'resistanceNear',     name: 'Direnç Yakınlığı' },
      { key: 'macdCrossDown',      name: 'MACD Sat Sinyali' },
      { key: 'volumeSelling',      name: 'Hacim Patlaması (Satış)' },
      { key: 'priceBelowEMA21',   name: 'Fiyat EMA21 Altı' },
      { key: 'adxTrendDown',      name: 'ADX Düşüş Gücü' },
      { key: 'bearishDivergence',  name: 'RSI Bearish Diverjans' },
      { key: 'bollingerUpperBounce', name: 'Bollinger Üst Bant Sıçraması' }
    ];

    // Kural ağırlıkları (geri bildirimle güncellenir)
    this.weights = {};
    this.allRules.forEach(r => this.weights[r.key] = 1.0);

    // Kural başarı takibi
    this.perf = {};
    this.allRules.forEach(r => this.perf[r.key] = { wins: 0, losses: 0 });

    // Rejim – Kural eşleştirmesi ve minimum geçiş sayısı
    this.regimeRules = {
      RALLY: {
        active: [],                // Rally'de SHORT açma
        minPass: 99
      },
      RANGING: {
        active: ['resistanceNear','rsiOverbought','bollingerUpperBounce','bearishDivergence','macdCrossDown'],
        minPass: 3
      },
      DOWNTREND: {
        active: ['rsiOverbought','resistanceNear','macdCrossDown','volumeSelling','adxTrendDown','priceBelowEMA21'],
        minPass: 4
      },
      VOLATILE: {
        active: [],
        minPass: 99
      }
    };

    this.loadFromDB();
  }

  // ──────────────── VERİTABANI ────────────────
  loadFromDB() {
    try {
      const db = require('./database');
      const row = db.prepare("SELECT value FROM settings WHERE key='adapt_short_weights'").get();
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
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('adapt_short_weights',?)")
        .run(JSON.stringify({ weights: this.weights, perf: this.perf }));
    } catch(e) {}
  }

  // Geri bildirim
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

  // ──────────────── ANA ANALİZ ────────────────
  analyze(candles, ticker, options = {}) {
    if (!candles || candles.length < 100) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const opens   = candles.map(c => parseFloat(c[1]));
    const fiyat   = closes[closes.length - 1];

    // rejim
    const regime = options.btcRegime || 'RANGING';
    const regimeCfg = this.regimeRules[regime] || this.regimeRules['DOWNTREND'];

    // tüm kuralları çalıştır
    const results = {};
    for (const rule of this.allRules) {
      results[rule.key] = this['check_' + rule.key](closes, highs, lows, volumes, opens);
    }

    // aktif kuralları puanla
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

    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    const signal = passedCount >= regimeCfg.minPass ? 'SATIS' : 'BEKLE';
    const risk   = passedCount >= regimeCfg.minPass + 1 ? 'DUSUK' : 'ORTA';

    // stop / hedef (ATR tabanlı – SHORT için ters)
    const atr14 = this.calcATR(highs, lows, closes, 14);
    const stopLoss = fiyat + atr14 * 1.5;    // yukarıda stop
    const target   = fiyat - atr14 * 3;      // aşağıda hedef

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
      ruleDetails: details.join(' '),
      rsi: this.calcRSI(closes, 14),
      trend: fiyat > this.calcEMA(closes, 21) ? 'YUKARI' : 'ASAGI',
      pozitif: details.filter(d => d.startsWith('✅')),
      negatif: details.filter(d => d.startsWith('❌')),
      atr14: parseFloat(atr14.toFixed(8)),
      atrOran: parseFloat((atr14 / fiyat * 100).toFixed(2)),
      stop_loss: parseFloat(stopLoss.toFixed(8)),
      hedef: parseFloat(target.toFixed(8)),
      macdBullish: 0,
      macdLine: 0, signalLine: 0, macdHist: 0, bPct: 0,
      degisim24h: parseFloat(ticker.priceChangePercent || 0),
      hacim24h: parseFloat(ticker.quoteVolume || 0)
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 8 SHORT KURALI
  // ═══════════════════════════════════════════════════════════

  check_rsiOverbought(c) {
    const r = this.calcRSI(c, 14);
    return r > 70;
  }
  check_resistanceNear(c, h) {
    const high50 = Math.max(...h.slice(-50));
    return ((high50 - c[c.length-1]) / c[c.length-1]) * 100 < 2;
  }
  check_macdCrossDown(c) {
    if (c.length < 35) return false;
    const ema12 = this.calcEMA(c, 12);
    const ema26 = this.calcEMA(c, 26);
    const macd = ema12 - ema26;
    const vals = [];
    for (let i = c.length - 9; i < c.length; i++) {
      const s12 = c.slice(0, i+1), s26 = c.slice(0, i+1);
      vals.push(this.calcEMA(s12, 12) - this.calcEMA(s26, 26));
    }
    const signal = vals.reduce((a,b) => a + b, 0) / 9;
    return macd < signal;
  }
  check_volumeSelling(c, h, l, v, o) {
    if (v.length < 21) return false;
    const curV = v[v.length-1];
    const avgV = v.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
    const curC = c[c.length-1], curO = o[o.length-1];
    return curV > avgV * 1.5 && curC < curO;   // kırmızı mum
  }
  check_priceBelowEMA21(c) {
    return c[c.length - 1] < this.calcEMA(c, 21);
  }
  check_adxTrendDown(c, h, l) {
    const adx = this.calcADX(h, l, c, 14);
    return adx.adx > 25 && adx.diMinus > adx.diPlus;
  }
  check_bearishDivergence(c) {
    if (c.length < 20) return false;
    const recent = c.slice(-10), prev = c.slice(-20, -10);
    const rHigh = Math.max(...recent), pHigh = Math.max(...prev);
    if (rHigh <= pHigh) return false;
    return this.calcRSI(recent, 14) < this.calcRSI(prev, 14);
  }
  check_bollingerUpperBounce(c) {
    if (c.length < 20) return false;
    const slice = c.slice(-20);
    const mean = slice.reduce((a,b) => a + b, 0) / 20;
    const std = Math.sqrt(slice.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / 20);
    const upper = mean + 2 * std;
    const price = c[c.length - 1];
    return price >= upper * 0.995;
  }

  // ═══════════════════════════════════════════════════════════
  // YARDIMCI TEKNİK GÖSTERGELER
  // ═══════════════════════════════════════════════════════════

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

module.exports = new AdaptiveShortAnalysis();
