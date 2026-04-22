class TechnicalAnalysis {

  static calculateRSI(closes, period = 14) {
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
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return parseFloat(ema.toFixed(8));
  }

  static calculateMACD(closes) {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = parseFloat((ema12 - ema26).toFixed(8));
    const macdSeries = [];
    for (let i = 26; i < closes.length; i++) {
      const e12 = this.calculateEMA(closes.slice(0, i + 1), 12);
      const e26 = this.calculateEMA(closes.slice(0, i + 1), 26);
      macdSeries.push(e12 - e26);
    }
    const signalLine = parseFloat(this.calculateEMA(macdSeries, 9).toFixed(8));
    const histogram = parseFloat((macdLine - signalLine).toFixed(8));
    const macdPrev = macdSeries[macdSeries.length - 2] || 0;
    const signalPrev = this.calculateEMA(macdSeries.slice(0, -1), 9);
    const fiyatY = closes[closes.length - 1] > closes[closes.length - 6];
    const macdD = macdSeries[macdSeries.length - 1] < macdSeries[macdSeries.length - 5];
    return { macdLine, signalLine, histogram, bullish: macdPrev <= signalPrev && macdLine > signalLine, bearish: macdPrev >= signalPrev && macdLine < signalLine, bearishDiv: fiyatY && macdD, bullishDiv: !fiyatY && !macdD, macdSeries };
  }

  static calculateBollinger(closes, period = 20) {
    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period);
    const upper = sma + 2 * std, lower = sma - 2 * std;
    const bPct = parseFloat(((closes[closes.length - 1] - lower) / (upper - lower) * 100).toFixed(2));
    const bWidth = parseFloat(((upper - lower) / sma * 100).toFixed(2));
    const sliceP = closes.slice(-25, -5);
    const smaP = sliceP.reduce((a, b) => a + b, 0) / 20;
    const stdP = Math.sqrt(sliceP.reduce((a, b) => a + Math.pow(b - smaP, 2), 0) / 20);
    const bWidthP = ((smaP + 2 * stdP) - (smaP - 2 * stdP)) / smaP * 100;
    return { upper: parseFloat(upper.toFixed(8)), lower: parseFloat(lower.toFixed(8)), middle: parseFloat(sma.toFixed(8)), bPct, bWidth, squeezing: bWidth < bWidthP * 0.85, expanding: bWidth > bWidthP * 1.15 };
  }

  static calculateOBV(closes, volumes) {
    let obv = 0;
    const series = [0];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) obv += volumes[i];
      else if (closes[i] < closes[i - 1]) obv -= volumes[i];
      series.push(obv);
    }
    const avg5 = series.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const avg20 = series.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const fiyatY = closes[closes.length - 1] > closes[closes.length - 6];
    const obvY = series[series.length - 1] > series[series.length - 6];
    return { obv, trend: avg5 > avg20 ? 'YUKARI' : 'ASAGI', hiddenBull: !fiyatY && obvY, hiddenBear: fiyatY && !obvY };
  }

  static calculateSR(highs, lows, closes) {
    const resistance = Math.max(...highs.slice(-50));
    const support = Math.min(...lows.slice(-50));
    const price = closes[closes.length - 1];
    return { resistance: parseFloat(resistance.toFixed(8)), support: parseFloat(support.toFixed(8)), resistanceDist: parseFloat(((resistance - price) / price * 100).toFixed(2)), supportDist: parseFloat(((price - support) / price * 100).toFixed(2)), resistanceBroken: closes.slice(-3).some(c => c > resistance * 0.998), supportBroken: closes.slice(-3).some(c => c < support * 1.002) };
  }

  static calculateTrend(closes, highs, lows) {
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const ema200 = closes.length >= 200 ? this.calculateEMA(closes, 200) : null;
    const price = closes[closes.length - 1];
    const ema20P = this.calculateEMA(closes.slice(0, -1), 20);
    const ema50P = this.calculateEMA(closes.slice(0, -1), 50);
    let direction = 'NOTR';
    if (price > ema20 && ema20 > ema50) direction = 'GUCLU_YUKARI';
    else if (price > ema20) direction = 'YUKARI';
    else if (price < ema20 && ema20 < ema50) direction = 'GUCLU_ASAGI';
    else if (price < ema20) direction = 'ASAGI';
    const h10 = highs.slice(-10), l10 = lows.slice(-10);
    return { direction, ema20, ema50, ema200, goldenCross: ema20P <= ema50P && ema20 > ema50, deathCross: ema20P >= ema50P && ema20 < ema50, uptrend: h10.filter((h, i) => i > 0 && h > h10[i-1]).length >= 5 && l10.filter((l, i) => i > 0 && l > l10[i-1]).length >= 5, downtrend: h10.filter((h, i) => i > 0 && h < h10[i-1]).length >= 5 && l10.filter((l, i) => i > 0 && l < l10[i-1]).length >= 5, aboveEMA200: ema200 ? price > ema200 : null };
  }

  static calculatePatterns(candles) {
    const last = candles[candles.length - 1], prev = candles[candles.length - 2];
    const o = parseFloat(last[1]), h = parseFloat(last[2]), l = parseFloat(last[3]), c = parseFloat(last[4]);
    const body = Math.abs(c - o), upper = h - Math.max(c, o), lower = Math.min(c, o) - l, total = h - l;
    const po = parseFloat(prev[1]), pc = parseFloat(prev[4]);
    return { hammer: lower > body * 2 && upper < body * 0.5 && c > o, shootingStar: upper > body * 2 && lower < body * 0.5 && c < o, doji: body < total * 0.1, bullishEngulfing: pc < po && c > o && o < pc && c > po, bearishEngulfing: pc > po && c < o && o > pc && c < po };
  }

  static calculateATR(candles, period = 14) {
    const tr = [];
    for (let i = 1; i < candles.length; i++) {
      const h = parseFloat(candles[i][2]), l = parseFloat(candles[i][3]), pc = parseFloat(candles[i-1][4]);
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  static calculateVolume(volumes) {
    const avg20 = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
    const last = volumes[volumes.length - 1];
    return { ratio: parseFloat((last / avg20).toFixed(2)), spike: last > avg20 * 2, low: last < avg20 * 0.5 };
  }

  static analyze(candles, ticker, settings = {}) {
    if (!candles || candles.length < 50) return null;
    const closes = candles.map(c => parseFloat(c[4]));
    const highs = candles.map(c => parseFloat(c[2]));
    const lows = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const price = closes[closes.length - 1];
    const rsiOS = parseFloat(settings.rsi_oversold || 35);
    const rsiOB = parseFloat(settings.rsi_overbought || 65);
    const rsi = this.calculateRSI(closes, 14);
    const rsiPrev = this.calculateRSI(closes.slice(0, -1), 14);
    const macd = this.calculateMACD(closes);
    const bollinger = this.calculateBollinger(closes);
    const obv = this.calculateOBV(closes, volumes);
    const sr = this.calculateSR(highs, lows, closes);
    const vol = this.calculateVolume(volumes);
    const trend = this.calculateTrend(closes, highs, lows);
    const patterns = this.calculatePatterns(candles);
    const atr = this.calculateATR(candles);
    const lastC = candles.slice(-5);
    const buyVol = lastC.filter(c => parseFloat(c[4]) > parseFloat(c[1])).reduce((a, c) => a + parseFloat(c[5]), 0);
    const sellVol = lastC.filter(c => parseFloat(c[4]) < parseFloat(c[1])).reduce((a, c) => a + parseFloat(c[5]), 0);
    let score = 0;
    const positive = [], negative = [];
    if (rsi < 25) { score += 30; positive.push(`RSI aşırı satım (${rsi})`); }
    else if (rsi < rsiOS) { score += 20; positive.push(`RSI satım bölgesi (${rsi})`); }
    else if (rsi < 50) { score += 10; positive.push(`RSI nötr-pozitif (${rsi})`); }
    else if (rsi > 75) { score -= 25; negative.push(`RSI aşırı alım (${rsi})`); }
    else if (rsi > rsiOB) { score -= 10; negative.push(`RSI alım bölgesi (${rsi})`); }
    if (rsi > rsiPrev && rsi < 50) { score += 10; positive.push('RSI yükseliyor'); }
    if (macd.bullish) { score += 25; positive.push('MACD golden cross'); }
    else if (macd.bearish) { score -= 25; negative.push('MACD death cross'); }
    else if (macd.macdLine > macd.signalLine) { score += 10; positive.push('MACD pozitif'); }
    else if (macd.macdLine < macd.signalLine) { score -= 10; negative.push('MACD negatif'); }
    if (macd.bearishDiv) { score -= 20; negative.push('MACD bearish divergence'); }
    if (macd.bullishDiv) { score += 15; positive.push('MACD bullish divergence'); }
    if (trend.goldenCross) { score += 30; positive.push('Golden Cross!'); }
    else if (trend.deathCross) { score -= 30; negative.push('Death Cross!'); }
    else if (trend.direction === 'GUCLU_YUKARI') { score += 20; positive.push('Güçlü yükseliş trendi'); }
    else if (trend.direction === 'YUKARI') { score += 10; positive.push('Yükseliş trendi'); }
    else if (trend.direction === 'GUCLU_ASAGI') { score -= 20; negative.push('Güçlü düşüş trendi'); }
    else if (trend.direction === 'ASAGI') { score -= 10; negative.push('Düşüş trendi'); }
    if (trend.aboveEMA200 === true) { score += 10; positive.push('EMA200 üstünde'); }
    if (trend.aboveEMA200 === false) { score -= 10; negative.push('EMA200 altında'); }
    if (bollinger.bPct < 5) { score += 25; positive.push('Bollinger alt bandında'); }
    else if (bollinger.bPct < 20) { score += 15; positive.push('Bollinger alt bölgede'); }
    else if (bollinger.bPct > 95) { score -= 25; negative.push('Bollinger üst bandında'); }
    else if (bollinger.bPct > 80) { score -= 15; negative.push('Bollinger üst bölgede'); }
    if (bollinger.squeezing) { score += 5; positive.push('Bant daralıyor'); }
    if (obv.trend === 'YUKARI') { score += 15; positive.push('OBV yükseliş'); }
    else { score -= 10; negative.push('OBV düşüş'); }
    if (obv.hiddenBull) { score += 20; positive.push('OBV gizli alım'); }
    if (obv.hiddenBear) { score -= 20; negative.push('OBV gizli satış'); }
    if (vol.spike) { score += 20; positive.push(`Hacim patlaması (${vol.ratio}x)`); }
    if (vol.low) { score -= 10; negative.push('Hacim çok düşük'); }
    if (buyVol > sellVol) { score += 10; positive.push('Alım hacmi baskın'); }
    else { score -= 5; negative.push('Satış hacmi baskın'); }
    if (sr.supportDist < 2) { score += 20; positive.push('Desteğe çok yakın'); }
    else if (sr.supportDist < 5) { score += 10; positive.push('Desteğe yakın'); }
    if (sr.resistanceDist < 2) { score -= 15; negative.push('Direce çok yakın'); }
    if (sr.resistanceBroken) { score += 25; positive.push('Direnç kırıldı!'); }
    if (sr.supportBroken) { score -= 25; negative.push('Destek kırıldı!'); }
    if (patterns.hammer) { score += 20; positive.push('Hammer mumu'); }
    if (patterns.shootingStar) { score -= 20; negative.push('Shooting Star'); }
    if (patterns.bullishEngulfing) { score += 25; positive.push('Bullish Engulfing'); }
    if (patterns.bearishEngulfing) { score -= 25; negative.push('Bearish Engulfing'); }
    if (trend.uptrend) { score += 15; positive.push('HH/HL yükseliş trendi'); }
    if (trend.downtrend) { score -= 15; negative.push('LH/LL düşüş trendi'); }
    const minScore = parseFloat(settings.min_score || 50);
    const signal = score >= minScore ? 'ALIM' : score <= -20 ? 'SATIS' : 'BEKLE';
    const risk = score >= 70 ? 'DUSUK' : score >= 50 ? 'ORTA' : 'YUKSEK';
    return { symbol: ticker.symbol, price, change24h: parseFloat(ticker.priceChangePercent), volume24h: parseFloat(ticker.quoteVolume), signal, score, risk, rsi, rsiRising: rsi > rsiPrev, macd, bollinger, obv, sr, volume: { ...vol, pressure: buyVol > sellVol ? 'ALIM' : 'SATIS' }, trend, patterns, atr: parseFloat(atr.toFixed(8)), atrPercent: parseFloat((atr / price * 100).toFixed(2)), target: parseFloat((price + atr * 3).toFixed(8)), stopLoss: parseFloat((price - atr * 1.5).toFixed(8)), positive, negative };
  }
}

module.exports = TechnicalAnalysis;
