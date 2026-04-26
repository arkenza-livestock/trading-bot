// v10 - Optimize MACD + Ağırlıklı Skor + Ichimoku + RSI Diverjans
class TechnicalAnalysis {

  // ── TEMEL HESAPLAMALAR ────────────────────────────────────

  static calculateRSI(closes, period = 14) {
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
    if (!data || data.length < period) return data ? data[data.length - 1] : 0;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return parseFloat(ema.toFixed(8));
  }

  static calculateADX(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return { adx: 0, diPlus: 0, diMinus: 0 };
    const trList = [], dmPlus = [], dmMinus = [];
    for (let i = 1; i < closes.length; i++) {
      const h = highs[i], l = lows[i], ph = highs[i-1], pl = lows[i-1], pc = closes[i-1];
      const tr = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
      const upMove = h - ph, downMove = pl - l;
      trList.push(tr);
      dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
      dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    const smoothTR      = trList.slice(-period).reduce((a,b) => a+b, 0);
    const smoothDMPlus  = dmPlus.slice(-period).reduce((a,b) => a+b, 0);
    const smoothDMMinus = dmMinus.slice(-period).reduce((a,b) => a+b, 0);
    const diPlus  = smoothTR > 0 ? (smoothDMPlus  / smoothTR) * 100 : 0;
    const diMinus = smoothTR > 0 ? (smoothDMMinus / smoothTR) * 100 : 0;
    const diSum   = diPlus + diMinus;
    const dx      = diSum > 0 ? Math.abs(diPlus - diMinus) / diSum * 100 : 0;
    return {
      adx:     parseFloat(dx.toFixed(2)),
      diPlus:  parseFloat(diPlus.toFixed(2)),
      diMinus: parseFloat(diMinus.toFixed(2))
    };
  }

  // ── OPTİMİZE MACD — tek geçişte hesapla ─────────────────
  static calculateMACD(closes, fast = 12, slow = 26, signal = 9) {
    if (closes.length < slow + signal + 1) {
      return { macd: 0, signal: 0, histogram: 0, crossover: false, bullish: false, bearish: false };
    }

    // EMA serileri tek geçişte hesapla
    const k_fast   = 2 / (fast + 1);
    const k_slow   = 2 / (slow + 1);
    const k_signal = 2 / (signal + 1);

    let ema_fast = closes.slice(0, fast).reduce((a,b) => a+b, 0) / fast;
    let ema_slow = closes.slice(0, slow).reduce((a,b) => a+b, 0) / slow;

    const macdLine = [];

    for (let i = 0; i < closes.length; i++) {
      if (i < fast)  { continue; }
      if (i === fast) { ema_fast = closes.slice(0, fast).reduce((a,b)=>a+b,0)/fast; }
      else            { ema_fast = closes[i] * k_fast + ema_fast * (1 - k_fast); }

      if (i < slow)   { continue; }
      if (i === slow)  { ema_slow = closes.slice(0, slow).reduce((a,b)=>a+b,0)/slow; }
      else             { ema_slow = closes[i] * k_slow + ema_slow * (1 - k_slow); }

      macdLine.push(ema_fast - ema_slow);
    }

    if (macdLine.length < signal + 1) {
      return { macd: 0, signal: 0, histogram: 0, crossover: false, bullish: false, bearish: false };
    }

    // Signal EMA tek geçişte
    let ema_signal = macdLine.slice(0, signal).reduce((a,b) => a+b, 0) / signal;
    const signalLine = [];
    for (let i = signal; i < macdLine.length; i++) {
      ema_signal = macdLine[i] * k_signal + ema_signal * (1 - k_signal);
      signalLine.push(ema_signal);
    }

    const curMacd   = macdLine[macdLine.length - 1];
    const curSignal = signalLine[signalLine.length - 1];
    const prevMacd  = macdLine[macdLine.length - 2];
    const prevSig   = signalLine[signalLine.length - 2];

    const crossover = prevMacd <= prevSig && curMacd > curSignal;
    const crossunder = prevMacd >= prevSig && curMacd < curSignal;

    return {
      macd:      parseFloat(curMacd.toFixed(8)),
      signal:    parseFloat(curSignal.toFixed(8)),
      histogram: parseFloat((curMacd - curSignal).toFixed(8)),
      crossover,
      crossunder,
      bullish:   curMacd > curSignal,
      bearish:   curMacd < curSignal,
      histGrowing: macdLine.length >= 3 &&
        Math.abs(curMacd - curSignal) > Math.abs(macdLine[macdLine.length-2] - (signalLine[signalLine.length-2] || 0))
    };
  }

  // ── ICHIMOKU ──────────────────────────────────────────────
  static calculateIchimoku(highs, lows, closes) {
    const len = closes.length;
    if (len < 52) return null;

    const maxOf  = (arr, n) => Math.max(...arr.slice(-n));
    const minOf  = (arr, n) => Math.min(...arr.slice(-n));

    const tenkan = (maxOf(highs, 9)  + minOf(lows, 9))  / 2;
    const kijun  = (maxOf(highs, 26) + minOf(lows, 26)) / 2;
    const spanA  = (tenkan + kijun) / 2;
    const spanB  = (maxOf(highs, 52) + minOf(lows, 52)) / 2;

    const price      = closes[len - 1];
    const kumoUpper  = Math.max(spanA, spanB);
    const kumoLower  = Math.min(spanA, spanB);
    const aboveCloud = price > kumoUpper;
    const belowCloud = price < kumoLower;
    const insideCloud= !aboveCloud && !belowCloud;

    // Chikou: fiyatın 26 periyot önceki fiyatla karşılaştırması
    const chikouPrice = closes[len - 26] || closes[0];
    const chikouBull  = price > chikouPrice;

    // TK Cross
    const tkBull = tenkan > kijun;

    // Kumo twist (spanA > spanB = bullish kumo)
    const kumoBull = spanA > spanB;

    return {
      tenkan, kijun, spanA, spanB,
      kumoUpper, kumoLower,
      aboveCloud, belowCloud, insideCloud,
      chikouBull, tkBull, kumoBull, price
    };
  }

  // ── RSI DİVERJANS — optimize ──────────────────────────────
  static calculateRSIDivergence(closes, lows, highs, period = 14, lookback = 25) {
    if (closes.length < lookback + period) return { bullish: false, bearish: false };

    const slice     = closes.slice(-lookback - period);
    const sliceLows = lows.slice(-lookback);

    // RSI serisini bir kez hesapla
    const rsiSeries = [];
    for (let i = period; i <= slice.length; i++) {
      rsiSeries.push(this.calculateRSI(slice.slice(0, i), period));
    }

    const recentRSI  = rsiSeries.slice(-lookback);
    const recentLows = sliceLows;

    // Son iki yerel dip bul
    const dips = [];
    for (let i = 1; i < recentLows.length - 1; i++) {
      if (recentLows[i] < recentLows[i-1] && recentLows[i] < recentLows[i+1]) {
        dips.push(i);
      }
    }

    let bullishDiv = false;
    if (dips.length >= 2) {
      const d1 = dips[dips.length - 1];
      const d2 = dips[dips.length - 2];
      // Fiyat düşük dip + RSI yüksek dip = bullish diverjans
      bullishDiv = recentLows[d1] < recentLows[d2] && recentRSI[d1] > recentRSI[d2];
    }

    // Bearish diverjans için yüksek tepe
    const sliceHighs = highs.slice(-lookback);
    const recentHighs = sliceHighs;
    const rsiHigh     = rsiSeries.slice(-lookback);
    const peaks = [];
    for (let i = 1; i < recentHighs.length - 1; i++) {
      if (recentHighs[i] > recentHighs[i-1] && recentHighs[i] > recentHighs[i+1]) {
        peaks.push(i);
      }
    }

    let bearishDiv = false;
    if (peaks.length >= 2) {
      const p1 = peaks[peaks.length - 1];
      const p2 = peaks[peaks.length - 2];
      bearishDiv = recentHighs[p1] > recentHighs[p2] && rsiHigh[p1] < rsiHigh[p2];
    }

    return { bullish: bullishDiv, bearish: bearishDiv };
  }

  // ── TREND ÇİZGİSİ — lineer regresyon ile ─────────────────
  static calculateTrendLine(closes, lows, lookback = 30) {
    if (lows.length < lookback) return { trendLine: lows[lows.length-1], nearLine: false, slope: 0 };

    const slice = lows.slice(-lookback);
    const n     = slice.length;

    // Lineer regresyon
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX  += i;
      sumY  += slice[i];
      sumXY += i * slice[i];
      sumX2 += i * i;
    }
    const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const trendLine = slope * (n - 1) + intercept;

    const price   = closes[closes.length - 1];
    const margin  = 0.02;
    const nearLine = price >= trendLine * (1 - margin) && price <= trendLine * (1 + margin);

    return {
      trendLine: parseFloat(trendLine.toFixed(8)),
      nearLine,
      slope:     parseFloat(slope.toFixed(8)),
      ascending: slope > 0
    };
  }

  // ── ATR ───────────────────────────────────────────────────
  static calculateATR(highs, lows, closes, period = 14) {
    const trList = [];
    for (let i = 1; i < closes.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i-1];
      trList.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    if (trList.length < period) return trList[trList.length-1] || 0;
    return trList.slice(-period).reduce((a,b) => a+b, 0) / period;
  }

  // ── HACIM ─────────────────────────────────────────────────
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

    if      (oran20 > 5)   { puan = 100; desc.push(`🔥 Hacim spike ${oran20}x`); }
    else if (oran20 > 3)   { puan = 80;  desc.push(`⚡ ${oran20}x hacim`); }
    else if (oran20 > 2)   { puan = 60;  desc.push(`📈 ${oran20}x hacim`); }
    else if (oran20 > 1.5) { puan = 40;  desc.push(`${oran20}x hacim`); }
    else if (oran20 > 1.2) { puan = 20; }
    else if (oran20 > 0.8) { puan = 0; }
    else if (oran20 > 0.5) { puan = -20; }
    else                   { puan = -50; desc.push('Hacim çok düşük'); }

    if (vol5Trend)    puan = Math.min(100, puan + 15);
    if (alimOran > 65) { puan = Math.min(100, puan + 20); desc.push(`💪 Alım %${alimOran.toFixed(0)}`); }
    else if (alimOran < 40) { puan = Math.max(-100, puan - 20); desc.push(`Satış %${(100-alimOran).toFixed(0)}`); }

    return {
      puan, desc: desc.join('\n'), oran: oran20, alimOran,
      vol5Trend, gecerli: true, spike: oran20 >= 1.5
    };
  }

  // ── MOMENTUM ──────────────────────────────────────────────
  static calculateMomentum(closes, volumes, highs, lows) {
    const len = closes.length;
    if (len < 6) return { puan: 0, desc: '' };

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

    const sonMum    = closes[len-1] - closes[len-2];
    const sonRange  = highs[len-1] - lows[len-1];
    const govdeOran = sonRange > 0 ? Math.abs(sonMum) / sonRange : 0;
    const ema5      = this.calculateEMA(closes, 5);
    const ema10     = this.calculateEMA(closes, 10);
    const ema20     = this.calculateEMA(closes, 20);
    const emaFark   = ((ema5 - ema10) / ema10) * 100;
    const volRoc    = len > 4 ? ((volumes[len-1] - volumes[len-4]) / (volumes[len-4] || 1)) * 100 : 0;

    let puan = 0;
    const desc = [];

    // ROC skorları — normalize edilmiş
    if      (roc1 > 1.0)  puan += 30;
    else if (roc1 > 0.5)  puan += 20;
    else if (roc1 > 0.2)  puan += 10;
    else if (roc1 > 0)    puan +=  5;
    else if (roc1 < -1.0) puan -= 30;
    else if (roc1 < -0.5) puan -= 20;
    else if (roc1 < -0.2) puan -= 10;
    else                  puan -=  5;

    if (roc1 > 0.3) desc.push(`ROC1:+${roc1.toFixed(2)}%`);
    if (roc1 < -0.3) desc.push(`ROC1:${roc1.toFixed(2)}%`);

    if      (roc3 > 2.0)  puan += 30;
    else if (roc3 > 1.0)  puan += 20;
    else if (roc3 > 0.5)  puan += 10;
    else if (roc3 < -2.0) puan -= 30;
    else if (roc3 < -1.0) puan -= 20;
    else if (roc3 < -0.5) puan -= 10;

    if      (ivme > 0.3)  { puan += 20; desc.push('İvme artıyor'); }
    else if (ivme < -0.3) { puan -= 20; desc.push('İvme azalıyor'); }

    if      (ardisikYesil >= 4)   { puan += 25; desc.push(`${ardisikYesil} ardışık yeşil`); }
    else if (ardisikYesil === 3)  { puan += 15; desc.push('3 ardışık yeşil'); }
    else if (ardisikYesil === 2)  { puan += 8; }
    if      (ardisikKirmizi >= 3) { puan -= 25; desc.push(`${ardisikKirmizi} ardışık kırmızı`); }

    if (govdeOran > 0.7 && sonMum > 0) { puan += 15; desc.push('Güçlü yeşil mum'); }
    else if (govdeOran > 0.7 && sonMum < 0) { puan -= 15; desc.push('Güçlü kırmızı mum'); }

    // EMA dizilimi
    if (ema5 > ema10 && ema10 > ema20) { puan += 20; desc.push('EMA5>EMA10>EMA20'); }
    else if (ema5 > ema10) { puan += 10; desc.push('EMA5>EMA10'); }
    else if (ema5 < ema10 && ema10 < ema20) { puan -= 20; }

    if (volRoc > 50 && roc1 > 0) { puan += 10; desc.push('Hacim+fiyat artıyor'); }
    else if (volRoc > 50 && roc1 < 0) { puan -= 10; }

    return { puan, desc: desc.join('\n'), roc1, roc3, roc5, ivme, ardisikYesil, ema5, ema10, ema20 };
  }

  // ── DESTEK/DİRENÇ ─────────────────────────────────────────
  static calculateSR(closes, highs, lows, settings = {}) {
    const lookback   = parseInt(settings.sr_lookback || 20);
    const price      = closes[closes.length - 1];
    const resistance = Math.max(...highs.slice(-lookback));
    const support    = Math.min(...lows.slice(-lookback));
    const range      = resistance - support;
    if (range === 0) return { puan: 0, desc: '', pozisyon: 50, riskOdul: 1 };

    const pozisyon = (price - support) / range * 100;
    const riskOdul = (resistance - price) / (price - support || 1);

    let puan = 0;
    const desc = [];

    if      (pozisyon < 8)  { puan = 80;  desc.push(`🔥 Destek(%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 20) { puan = 60;  desc.push(`Destek yakını(%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 35) { puan = 30; }
    else if (pozisyon < 65) { puan = 0; }
    else if (pozisyon < 80) { puan = -30; }
    else if (pozisyon < 92) { puan = -60; desc.push(`Direnç yakını(%${pozisyon.toFixed(0)})`); }
    else                    { puan = -80; desc.push(`⚠️ Direnç(%${pozisyon.toFixed(0)})`); }

    if      (riskOdul > 3)   { puan += 20; desc.push(`R/R:${riskOdul.toFixed(1)}`); }
    else if (riskOdul > 2)   { puan += 10; }
    else if (riskOdul < 0.5) { puan -= 20; desc.push(`R/R düşük:${riskOdul.toFixed(1)}`); }

    return { puan, desc: desc.join('\n'), pozisyon, resistance, support, riskOdul };
  }

  // ── TREND ANALİZİ (1H/4H) ─────────────────────────────────
  static analyzeTF(candles) {
    if (!candles || candles.length < 50) return { trend: 'BELIRSIZ', puan: 0, guclu: false };

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const len     = closes.length;
    const price   = closes[len-1];

    const ema10  = this.calculateEMA(closes, 10);
    const ema20  = this.calculateEMA(closes, 20);
    const ema50  = this.calculateEMA(closes, Math.min(50, len));
    const ema200 = this.calculateEMA(closes, Math.min(200, len));
    const rsi14  = this.calculateRSI(closes, 14);
    const adx    = this.calculateADX(highs, lows, closes, 14);

    const son10H = highs.slice(-10);
    const son10L = lows.slice(-10);
    const hhCount = son10H.filter((h, i) => i > 0 && h > son10H[i-1]).length;
    const hlCount = son10L.filter((l, i) => i > 0 && l > son10L[i-1]).length;
    const llCount = son10L.filter((l, i) => i > 0 && l < son10L[i-1]).length;
    const lhCount = son10H.filter((h, i) => i > 0 && h < son10H[i-1]).length;

    const avgVol = volumes.slice(-10, -1).reduce((a,b) => a+b, 0) / 9;
    const volUp  = volumes[len-1] > avgVol * 1.1;

    let puan = 0;

    // EMA dizilimi
    if      (ema10 > ema20 && ema20 > ema50) puan += 35;
    else if (ema10 > ema20)                   puan += 15;
    else if (ema10 < ema20 && ema20 < ema50) puan -= 35;
    else if (ema10 < ema20)                   puan -= 15;

    // Fiyat konumu
    if (price > ema50)  puan += 20; else puan -= 20;
    if (price > ema200) puan += 15; else puan -= 15;

    // ADX
    if      (adx.adx > 30 && adx.diPlus > adx.diMinus)  puan += 35;
    else if (adx.adx > 25 && adx.diPlus > adx.diMinus)  puan += 25;
    else if (adx.adx > 30 && adx.diMinus > adx.diPlus)  puan -= 35;
    else if (adx.adx > 25 && adx.diMinus > adx.diPlus)  puan -= 25;
    else if (adx.adx < 15)                                puan -= 30;
    else if (adx.adx < 20)                                puan -= 15;

    // HH/HL yapısı
    if      (hhCount >= 5 && hlCount >= 5) puan += 20;
    else if (hhCount >= 3)                  puan += 10;
    if      (llCount >= 5 && lhCount >= 5) puan -= 20;
    else if (llCount >= 3)                  puan -= 10;

    // RSI
    if      (rsi14 > 55 && rsi14 < 75) puan += 10;
    else if (rsi14 < 45)               puan -= 10;

    if (volUp && ema10 > ema20) puan += 10;

    let trend = 'BELIRSIZ', guclu = false;

    if      (puan >= 80)                       { trend = 'YUKARI';       guclu = true; }
    else if (puan >= 50 && adx.adx >= 20)     { trend = 'YUKARI'; }
    else if (puan >= 50)                       { trend = 'YATAY'; }
    else if (puan >= 20 && adx.adx >= 20)     { trend = 'HAFIF_YUKARI'; }
    else if (puan >= 20)                       { trend = 'YATAY'; }
    else if (puan >= -20)                      { trend = 'YATAY'; }
    else if (puan >= -50 && adx.adx >= 20)    { trend = 'HAFIF_ASAGI'; }
    else if (puan >= -50)                      { trend = 'YATAY'; }
    else if (puan >= -80 && adx.adx >= 20)    { trend = 'ASAGI'; }
    else if (puan >= -80)                      { trend = 'HAFIF_ASAGI'; }
    else                                       { trend = 'ASAGI'; guclu = true; }

    return {
      trend, puan, guclu,
      ema10, ema20, ema50,
      adx: adx.adx, diPlus: adx.diPlus, diMinus: adx.diMinus,
      rsi: rsi14, hhCount, hlCount
    };
  }

  static analyze1H(candles) { return this.analyzeTF(candles); }
  static analyze4H(candles) { return this.analyzeTF(candles); }

  // ── ANA ANALİZ — 6 KRİTER AĞIRLIKLI SKOR ────────────────
  static analyze(candles, ticker, settings = {}) {
    if (!candles || candles.length < 30) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const price   = closes[closes.length - 1];

    const vol24h = parseFloat(ticker.quoteVolume || 0);
    const minVol = parseFloat(settings.min_volume || 0);
    if (minVol > 0 && vol24h < minVol) return null;

    // ── 6 KRİTER HESAPLA ─────────────────────────────────

    // 1. RSI (14 periyot)
    const rsiPeriod = parseInt(settings.rsi_period || 14);
    const rsi       = this.calculateRSI(closes, rsiPeriod);

    // 2. MACD — optimize edilmiş tek geçiş
    const macd = this.calculateMACD(closes);

    // 3. Hacim analizi
    const hacim = this.calculateVolume(closes, volumes);
    if (!hacim.gecerli) return null;

    // 4. Destek/Direnç
    const sr = this.calculateSR(closes, highs, lows, settings);

    // 5. Ichimoku
    const ichimoku = candles.length >= 52 ? this.calculateIchimoku(highs, lows, closes) : null;

    // 6. RSI Diverjans
    const divergence = this.calculateRSIDivergence(closes, lows, highs, rsiPeriod, 25);

    // Ek: Trend çizgisi
    const trendLine = this.calculateTrendLine(closes, lows, 30);

    // Ek: Momentum
    const momentum = this.calculateMomentum(closes, volumes, highs, lows);

    // ATR
    const atr    = this.calculateATR(highs, lows, closes, 14);
    const atrPct = (atr / price) * 100;

    // ── AĞIRLIKLI SKOR SİSTEMİ ─────────────────────────────
    // Her indikatör 0-100 arası normalize edilmiş puan verir
    // Ağırlıklar: RSI %20, MACD %20, Hacim %20, SR %15, Ichimoku %15, Momentum %10

    const positive = [], negative = [];

    // RSI skoru — normalize
    let rsiPuan = 0;
    if      (rsi < 25)                              { rsiPuan = 100; positive.push(`🔥 RSI aşırı satım(${rsi})`); }
    else if (rsi >= 25 && rsi < 30)                 { rsiPuan = 90;  positive.push(`💎 RSI güçlü satım(${rsi})`); }
    else if (rsi >= 28 && rsi <= 32)                { rsiPuan = 85;  positive.push(`🎯 RSI kritik bölge(${rsi})`); }
    else if (rsi >= 30 && rsi < parseFloat(settings.rsi_oversold || 40)) { rsiPuan = 70; positive.push(`📊 RSI satım(${rsi})`); }
    else if (rsi >= 40 && rsi < 50)                 { rsiPuan = 50; }
    else if (rsi >= 50 && rsi < 60)                 { rsiPuan = 30; }
    else if (rsi >= 60 && rsi < 70)                 { rsiPuan = 10; }
    else if (rsi >= 70 && rsi < 80)                 { rsiPuan = -20; negative.push(`⚠️ RSI yüksek(${rsi})`); }
    else if (rsi >= 80)                             { rsiPuan = -60; negative.push(`🚫 RSI aşırı alım(${rsi})`); }

    // MACD skoru — normalize
    let macdPuan = 0;
    if (macd.crossover) {
      macdPuan = 100;
      positive.push('🚀 MACD Alım Crossover');
    } else if (macd.bullish && macd.histGrowing) {
      macdPuan = 70;
      positive.push('📈 MACD yükseliyor');
    } else if (macd.bullish) {
      macdPuan = 40;
      positive.push('📊 MACD pozitif');
    } else if (macd.crossunder) {
      macdPuan = -100;
      negative.push('💀 MACD Satış Crossover');
    } else if (macd.bearish) {
      macdPuan = -40;
      negative.push('📉 MACD negatif');
    }

    // Hacim skoru — zaten normalize
    const hacimPuan = hacim.puan;
    if (hacim.puan > 30) positive.push(hacim.desc);
    else if (hacim.puan < -20) negative.push(hacim.desc);

    // SR skoru — zaten normalize
    const srPuan = sr.puan;
    if (sr.puan > 20) positive.push(sr.desc);
    else if (sr.puan < -20) negative.push(sr.desc);

    // Ichimoku skoru — normalize
    let ichimokuPuan = 0;
    if (ichimoku) {
      if      (ichimoku.aboveCloud && ichimoku.tkBull && ichimoku.chikouBull && ichimoku.kumoBull) {
        ichimokuPuan = 100;
        positive.push('☁️ Ichimoku tam yükseliş');
      } else if (ichimoku.aboveCloud && ichimoku.tkBull) {
        ichimokuPuan = 70;
        positive.push('☁️ Bulut üstü + TK yükseliş');
      } else if (ichimoku.aboveCloud) {
        ichimokuPuan = 40;
        positive.push('☁️ Bulutun üstünde');
      } else if (ichimoku.insideCloud) {
        ichimokuPuan = 0;
        negative.push('☁️ Bulut içinde — belirsiz');
      } else if (ichimoku.belowCloud && !ichimoku.tkBull) {
        ichimokuPuan = -60;
        negative.push('☁️ Bulut altı — zayıf');
      } else if (ichimoku.belowCloud) {
        ichimokuPuan = -30;
        negative.push('☁️ Bulutun altında');
      }

      if (ichimoku.tkBull  && ichimokuPuan >= 0) ichimokuPuan = Math.min(100, ichimokuPuan + 15);
      if (ichimoku.chikouBull && ichimokuPuan >= 0) ichimokuPuan = Math.min(100, ichimokuPuan + 10);
    }

    // Momentum skoru — normalize
    const momentumPuan = Math.max(-100, Math.min(100, momentum.puan));
    if (momentum.desc) {
      if (momentum.puan > 20) positive.push(momentum.desc);
      else if (momentum.puan < -20) negative.push(momentum.desc);
    }

    // Bonus sinyaller
    let bonusPuan = 0;

    // RSI Bullish Diverjans — çok güçlü sinyal
    if (divergence.bullish) {
      bonusPuan += 25;
      positive.push('🔀 Bullish RSI Diverjans');
    }
    if (divergence.bearish) {
      bonusPuan -= 20;
      negative.push('🔀 Bearish RSI Diverjans');
    }

    // Trend çizgisi yakınlığı
    if (trendLine.nearLine && trendLine.ascending) {
      bonusPuan += 15;
      positive.push('📏 Yükselen trend çizgisi desteği');
    } else if (trendLine.nearLine) {
      bonusPuan += 8;
      positive.push('📏 Trend çizgisine yakın');
    }

    // Hacim spike + yükseliş = çok güçlü
    if (hacim.spike && momentum.roc1 > 0) {
      bonusPuan += 15;
      positive.push('💥 Hacim spike + fiyat yukarı');
    }

    // ── AĞIRLIKLI TOPLAM SKOR ─────────────────────────────
    const agirlikliSkor = (
      rsiPuan      * 0.20 +
      macdPuan     * 0.20 +
      hacimPuan    * 0.20 +
      srPuan       * 0.15 +
      ichimokuPuan * 0.15 +
      momentumPuan * 0.10
    ) + bonusPuan;

    // 0-100 arası normalize et
    const normalizedSkor = Math.round(Math.max(-100, Math.min(100, agirlikliSkor)));

    const minScore = parseFloat(settings.min_score || 10);
    const signal   = normalizedSkor >= minScore ? 'ALIM' : normalizedSkor <= -20 ? 'SATIS' : 'BEKLE';
    const risk     = normalizedSkor >= 70 ? 'DUSUK' : normalizedSkor >= 40 ? 'ORTA' : 'YUKSEK';

    const komisyon  = parseFloat(settings.commission_rate || 0.1);
    const slippage  = parseFloat(settings.slippage_rate   || 0.05);
    const minNetKar = (komisyon + slippage) * 2 + parseFloat(settings.min_profit_percent || 1.0);

    const hedefFiyat = parseFloat((price * (1 + minNetKar / 100)).toFixed(8));
    const stopFiyat  = parseFloat((price * (1 - parseFloat(settings.stop_loss_percent || 2.0) / 100)).toFixed(8));
    const riskOdul   = (hedefFiyat - price) / (price - stopFiyat || 1);

    return {
      symbol:          ticker.symbol,
      price,
      change24h:       parseFloat(ticker.priceChangePercent || 0),
      volume24h:       vol24h,
      signal,
      score:           normalizedSkor,
      risk,
      rsi,
      momentum:        momentum.puan,
      macdCrossover:   macd.crossover,
      macdBullish:     macd.bullish,
      ichimokuAbove:   ichimoku?.aboveCloud  || false,
      ichimokuBelow:   ichimoku?.belowCloud  || false,
      rsiDivergence:   divergence.bullish,
      nearTrendLine:   trendLine.nearLine,
      hacimOran:       hacim.oran,
      alimOran:        hacim.alimOran,
      srPozisyon:      sr.pozisyon,
      riskOdul:        parseFloat(riskOdul.toFixed(2)),
      atr:             parseFloat(atr.toFixed(8)),
      atrPct:          parseFloat(atrPct.toFixed(3)),
      target:          hedefFiyat,
      stopLoss:        stopFiyat,
      minNetKar,
      positive:        [...new Set(positive.filter(Boolean))],
      negative:        [...new Set(negative.filter(Boolean))]
    };
  }
}

module.exports = TechnicalAnalysis;
