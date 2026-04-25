// v3
class TechnicalAnalysis {

  static calculateRSI(closes, period = 7) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const ag = gains / period, al = losses / period;
    if (al === 0) return 100;
    return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
  }

  static calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return parseFloat(ema.toFixed(8));
  }

  static calculateMomentum(closes, volumes, highs, lows) {
    const len = closes.length;
    if (len < 6) return { puan: 0, desc: 'Yetersiz veri' };

    const roc1 = ((closes[len-1] - closes[len-2]) / closes[len-2]) * 100;
    const roc3 = ((closes[len-1] - closes[len-4]) / closes[len-4]) * 100;
    const roc5 = ((closes[len-1] - closes[len-6]) / closes[len-6]) * 100;
    const ivme = roc1 - (roc3 / 3);

    let ardisikYesil = 0, ardisikKirmizi = 0;
    for (let i = len-1; i >= Math.max(1, len-5); i--) {
      if (closes[i] > closes[i-1]) ardisikYesil++; else break;
    }
    for (let i = len-1; i >= Math.max(1, len-5); i--) {
      if (closes[i] < closes[i-1]) ardisikKirmizi++; else break;
    }

    const sonMum = closes[len-1] - closes[len-2];
    const sonRange = highs[len-1] - lows[len-1];
    const govdeOran = sonRange > 0 ? Math.abs(sonMum) / sonRange : 0;
    const ema5 = this.calculateEMA(closes, 5);
    const ema10 = this.calculateEMA(closes, 10);
    const emaTrend = ema5 > ema10 ? 'YUKARI' : 'ASAGI';
    const emaFark = ((ema5 - ema10) / ema10) * 100;
    const volRoc = len > 4 ? ((volumes[len-1] - volumes[len-4]) / (volumes[len-4] || 1)) * 100 : 0;

    let puan = 0;
    const desc = [];

    if      (roc1 > 0.5)  { puan += 25; desc.push(`1M:+${roc1.toFixed(2)}%`); }
    else if (roc1 > 0.2)  { puan += 15; }
    else if (roc1 > 0)    { puan +=  8; }
    else if (roc1 < -0.5) { puan -= 25; desc.push(`1M:${roc1.toFixed(2)}%`); }
    else if (roc1 < -0.2) { puan -= 15; }
    else                  { puan -=  5; }

    if      (roc3 > 1.0)  { puan += 30; desc.push(`3M:+${roc3.toFixed(2)}%`); }
    else if (roc3 > 0.5)  { puan += 20; }
    else if (roc3 > 0)    { puan += 10; }
    else if (roc3 < -1.0) { puan -= 30; desc.push(`3M:${roc3.toFixed(2)}%`); }
    else if (roc3 < -0.5) { puan -= 20; }
    else                  { puan -= 10; }

    if      (roc5 > 2.0)  { puan += 25; desc.push(`5M:+${roc5.toFixed(2)}%`); }
    else if (roc5 > 1.0)  { puan += 15; }
    else if (roc5 < -2.0) { puan -= 25; }
    else if (roc5 < -1.0) { puan -= 15; }

    if      (ivme > 0.2)  { puan += 20; desc.push('İvme artıyor'); }
    else if (ivme < -0.2) { puan -= 20; }

    if      (ardisikYesil >= 4)   { puan += 30; desc.push(`${ardisikYesil} ardışık yeşil`); }
    else if (ardisikYesil === 3)  { puan += 20; desc.push('3 ardışık yeşil'); }
    else if (ardisikYesil === 2)  { puan += 10; }
    if      (ardisikKirmizi >= 3) { puan -= 30; desc.push(`${ardisikKirmizi} ardışık kırmızı`); }

    if (govdeOran > 0.7 && sonMum > 0) { puan += 15; desc.push('Güçlü yeşil mum'); }
    else if (govdeOran > 0.7 && sonMum < 0) { puan -= 15; }

    if      (emaTrend === 'YUKARI' && emaFark > 0.1) { puan += 20; desc.push('EMA5>EMA10'); }
    else if (emaTrend === 'ASAGI'  && emaFark < -0.1) { puan -= 20; }

    if (volRoc > 50 && roc1 > 0) { puan += 15; desc.push('Hacim+fiyat artıyor'); }
    else if (volRoc > 50 && roc1 < 0) { puan -= 10; }

    return { puan, desc: desc.join(' | '), roc1, roc3, roc5, ivme, ardisikYesil, emaTrend };
  }

  static calculateVolume(closes, volumes) {
    const len = volumes.length;
    if (len < 20) return { puan: -100, desc: 'Yetersiz veri', gecerli: false };

    const sonVol = volumes[len - 1];
    const avg20  = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const avg5   = volumes.slice(-6,  -1).reduce((a, b) => a + b, 0) / 5;

    if (avg20 === 0) return { puan: -100, desc: 'Hacim sıfır', gecerli: false, oran: 0 };

    const oran20    = parseFloat((sonVol / avg20).toFixed(2));
    const vol5Trend = avg5 > avg20 * 1.2;

    let alimVol = 0, satisVol = 0;
    for (let i = len - 5; i < len; i++) {
      if (i > 0 && closes[i] >= closes[i-1]) alimVol  += volumes[i];
      else if (i > 0)                         satisVol += volumes[i];
    }
    const toplamVol = alimVol + satisVol;
    const alimOran  = toplamVol > 0 ? (alimVol / toplamVol) * 100 : 50;

    let puan = 0;
    const desc = [];

    if      (oran20 > 5)   { puan += 60; desc.push(`🔥${oran20}x spike`); }
    else if (oran20 > 3)   { puan += 45; desc.push(`⚡${oran20}x`); }
    else if (oran20 > 2)   { puan += 30; desc.push(`📈${oran20}x`); }
    else if (oran20 > 1.5) { puan += 20; desc.push(`${oran20}x`); }
    else if (oran20 > 1)   { puan += 10; }
    else if (oran20 > 0.7) { puan +=  5; }
    else if (oran20 > 0.4) { puan -=  5; }
    else if (oran20 > 0.2) { puan -= 15; }
    else                   { puan -= 25; desc.push('Hacim çok düşük'); }

    if (vol5Trend) { puan += 15; desc.push('Hacim trendi yukarı'); }

    if      (alimOran > 75) { puan += 30; desc.push(`💪Alım %${alimOran.toFixed(0)}`); }
    else if (alimOran > 60) { puan += 20; desc.push(`Alım %${alimOran.toFixed(0)}`); }
    else if (alimOran < 35) { puan -= 25; desc.push(`Satış %${(100-alimOran).toFixed(0)}`); }
    else if (alimOran < 45) { puan -= 10; }

    return { puan, desc: desc.join(' | '), oran: oran20, alimOran, vol5Trend, gecerli: true, spike: oran20 > 2 };
  }

  static calculateRSIScore(rsi, settings = {}) {
    const oversold   = parseFloat(settings.rsi_oversold   || 35);
    const overbought = parseFloat(settings.rsi_overbought || 65);
    let puan = 0;
    const desc = [];

    if      (rsi < 20)         { puan += 60; desc.push(`🔥RSI(${rsi})`); }
    else if (rsi < 25)         { puan += 45; desc.push(`RSI(${rsi})`); }
    else if (rsi < oversold)   { puan += 30; desc.push(`RSI(${rsi})`); }
    else if (rsi < 45)         { puan += 15; desc.push(`RSI(${rsi})`); }
    else if (rsi > 80)         { puan -= 50; desc.push(`⚠️RSI(${rsi})`); }
    else if (rsi > 75)         { puan -= 35; desc.push(`RSI(${rsi})`); }
    else if (rsi > overbought) { puan -= 20; desc.push(`RSI(${rsi})`); }
    else                       { puan +=  5; }

    return { puan, desc: desc.join(' | ') };
  }

  static calculateSR(closes, highs, lows, settings = {}) {
    const lookback   = parseInt(settings.sr_lookback || 20);
    const price      = closes[closes.length - 1];
    const resistance = Math.max(...highs.slice(-lookback));
    const support    = Math.min(...lows.slice(-lookback));
    const range      = resistance - support;

    if (range === 0) return { puan: 0, desc: 'Range yok', pozisyon: 50, riskOdul: 1 };

    const pozisyon = (price - support) / range * 100;
    const riskOdul = (resistance - price) / (price - support || 1);

    let puan = 0;
    const desc = [];

    if      (pozisyon < 8)  { puan += 55; desc.push(`🔥Destek(%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 20) { puan += 40; desc.push(`Alt(%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 35) { puan += 20; desc.push(`Orta-alt(%${pozisyon.toFixed(0)})`); }
    else if (pozisyon > 92) { puan -= 50; desc.push(`⚠️Direnç(%${pozisyon.toFixed(0)})`); }
    else if (pozisyon > 80) { puan -= 30; }
    else if (pozisyon > 65) { puan -= 10; }

    if      (riskOdul > 2)   { puan += 20; desc.push(`R/R:${riskOdul.toFixed(1)}`); }
    else if (riskOdul > 1)   { puan += 10; }
    else if (riskOdul < 0.5) { puan -= 20; }

    return { puan, desc: desc.join(' | '), pozisyon, resistance, support, riskOdul };
  }

  static analyze(candles, ticker, settings = {}) {
    if (!candles || candles.length < 20) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const price   = closes[closes.length - 1];

    const momentum = this.calculateMomentum(closes, volumes, highs, lows);
    const rsi      = this.calculateRSI(closes, parseInt(settings.rsi_period || 7));
    const rsiSkor  = this.calculateRSIScore(rsi, settings);
    const hacim    = this.calculateVolume(closes, volumes);
    const sr       = this.calculateSR(closes, highs, lows, settings);

    if (!hacim.gecerli) return null;

    const vol24h = parseFloat(ticker.quoteVolume || 0);
    const minVol = parseFloat(settings.min_volume || 1000000);
    if (vol24h < minVol) return null;

    const toplamSkor = Math.round(
      momentum.puan * 0.30 +
      rsiSkor.puan  * 0.25 +
      hacim.puan    * 0.30 +
      sr.puan       * 0.15
    );

    const minScore = parseFloat(settings.min_score || 10);
    const signal   = toplamSkor >= minScore ? 'ALIM' : toplamSkor <= -15 ? 'SATIS' : 'BEKLE';
    const risk     = toplamSkor >= 60 ? 'DUSUK' : toplamSkor >= 35 ? 'ORTA' : 'YUKSEK';

    const komisyon  = parseFloat(settings.commission_rate || 0.1);
    const slippage  = parseFloat(settings.slippage_rate   || 0.05);
    const minNetKar = (komisyon + slippage) * 2 + parseFloat(settings.min_profit_percent || 1.0);

    const atrDegerleri = [];
    for (let i = 1; i < candles.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i-1];
      atrDegerleri.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    const atr    = atrDegerleri.slice(-14).reduce((a,b) => a+b, 0) / 14;
    const atrPct = (atr / price) * 100;

    const hedefFiyat = parseFloat((price * (1 + minNetKar / 100)).toFixed(8));
    const stopFiyat  = parseFloat((price * (1 - parseFloat(settings.stop_loss_percent || 0.75) / 100)).toFixed(8));
    const riskOdul   = (hedefFiyat - price) / (price - stopFiyat || 1);

    const positive = [], negative = [];
    if (momentum.puan > 0) positive.push('Momentum: ' + momentum.desc);
    else if (momentum.puan < 0) negative.push('Momentum: ' + momentum.desc);
    if (rsiSkor.puan > 0) positive.push(rsiSkor.desc);
    else if (rsiSkor.puan < 0) negative.push(rsiSkor.desc);
    if (hacim.puan > 0) positive.push('Hacim: ' + hacim.desc);
    else if (hacim.puan < 0) negative.push('Hacim: ' + hacim.desc);
    if (sr.puan > 0) positive.push('S/R: ' + sr.desc);
    else if (sr.puan < 0) negative.push('S/R: ' + sr.desc);

    return {
      symbol: ticker.symbol, price,
      change24h: parseFloat(ticker.priceChangePercent),
      volume24h: vol24h,
      signal, score: toplamSkor, risk, rsi,
      momentum: momentum.puan,
      hacimOran: hacim.oran, alimOran: hacim.alimOran,
      srPozisyon: sr.pozisyon,
      riskOdul: parseFloat(riskOdul.toFixed(2)),
      atr: parseFloat(atr.toFixed(8)),
      atrPct: parseFloat(atrPct.toFixed(3)),
      target: hedefFiyat, stopLoss: stopFiyat,
      minNetKar, positive, negative
    };
  }
}

module.exports = TechnicalAnalysis;
