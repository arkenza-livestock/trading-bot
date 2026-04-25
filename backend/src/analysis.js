class TechnicalAnalysis {

  // ── RSI ──────────────────────────────────────
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

  // ── MOMENTUM (1-3-5 mum) ──────────────────────
  static calculateMomentum(closes) {
    const len = closes.length;
    if (len < 6) return { puan: 0, desc: 'Yetersiz veri' };

    const son1 = ((closes[len-1] - closes[len-2]) / closes[len-2]) * 100;
    const son3 = ((closes[len-1] - closes[len-4]) / closes[len-4]) * 100;
    const son5 = ((closes[len-1] - closes[len-6]) / closes[len-6]) * 100;

    // Ardışık yeşil mum sayısı
    let ardisikYesil = 0;
    for (let i = len-1; i >= len-5; i--) {
      if (closes[i] > closes[i-1]) ardisikYesil++;
      else break;
    }

    let ardisikKirmizi = 0;
    for (let i = len-1; i >= len-5; i--) {
      if (closes[i] < closes[i-1]) ardisikKirmizi++;
      else break;
    }

    let puan = 0;
    const desc = [];

    // 1 mum momentum
    if (son1 > 0.3) { puan += 20; desc.push(`1M: +${son1.toFixed(2)}%`); }
    else if (son1 > 0) { puan += 10; }
    else if (son1 < -0.3) { puan -= 20; desc.push(`1M: ${son1.toFixed(2)}%`); }
    else { puan -= 10; }

    // 3 mum momentum
    if (son3 > 0.5) { puan += 25; desc.push(`3M: +${son3.toFixed(2)}%`); }
    else if (son3 > 0) { puan += 10; }
    else if (son3 < -0.5) { puan -= 25; desc.push(`3M: ${son3.toFixed(2)}%`); }
    else { puan -= 10; }

    // 5 mum momentum
    if (son5 > 1.0) { puan += 20; desc.push(`5M: +${son5.toFixed(2)}%`); }
    else if (son5 > 0) { puan += 10; }
    else if (son5 < -1.0) { puan -= 20; }

    // Ardışık mumlar
    if (ardisikYesil >= 3) { puan += 25; desc.push(`${ardisikYesil} ardışık yeşil`); }
    else if (ardisikYesil === 2) { puan += 15; desc.push('2 ardışık yeşil'); }
    if (ardisikKirmizi >= 3) { puan -= 25; desc.push(`${ardisikKirmizi} ardışık kırmızı`); }

    return { puan, desc: desc.join(' | '), son1, son3, son5, ardisikYesil };
  }

  // ── HACİM ANALİZİ ─────────────────────────────
  static calculateVolume(closes, volumes) {
    const len = volumes.length;
    if (len < 20) return { puan: -50, desc: 'Yetersiz veri', gecerli: false };

    const sonVol = volumes[len - 1];
    const avg20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const avg5  = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
    const oran  = parseFloat((sonVol / avg20).toFixed(2));
    const oran5 = parseFloat((sonVol / avg5).toFixed(2));

    // Minimum hacim kontrolü — düşük hacimli geçemez
    if (avg20 < 100) return { puan: -100, desc: 'Hacim yetersiz', gecerli: false, oran };

    // Yükselişte hacim artıyor mu?
    let alimVol = 0, satisVol = 0;
    for (let i = len - 5; i < len; i++) {
      if (closes[i] > closes[i-1]) alimVol += volumes[i];
      else satisVol += volumes[i];
    }
    const alimBaskisi = alimVol > satisVol * 1.2; // %20 fazla alım baskısı

    let puan = 0;
    const desc = [];

    // Anlık hacim spike
    if (oran > 4)      { puan += 50; desc.push(`🔥 ${oran}x spike`); }
    else if (oran > 3) { puan += 40; desc.push(`⚡ ${oran}x yüksek`); }
    else if (oran > 2) { puan += 30; desc.push(`📈 ${oran}x orta`); }
    else if (oran > 1.5){ puan += 20; desc.push(`${oran}x normal+`); }
    else if (oran > 1)  { puan += 10; desc.push(`${oran}x normal`); }
    else if (oran < 0.5){ puan -= 30; desc.push('⚠️ Hacim çok düşük'); }
    else                { puan -= 10; }

    // 5 mum ortalama vs anlık
    if (oran5 > 1.5) { puan += 15; desc.push('Son 5 mumda hacim artıyor'); }

    // Alım/satış baskısı
    if (alimBaskisi) { puan += 20; desc.push('💪 Alım baskısı'); }
    else             { puan -= 15; desc.push('Satış baskısı'); }

    return { puan, desc: desc.join(' | '), oran, oran5, alimBaskisi, gecerli: true, spike: oran > 2 };
  }

  // ── RSI SKOR ──────────────────────────────────
  static calculateRSIScore(rsi, settings = {}) {
    const oversold  = parseFloat(settings.rsi_oversold  || 35);
    const overbought= parseFloat(settings.rsi_overbought|| 65);

    let puan = 0;
    const desc = [];

    if      (rsi < 20)         { puan += 50; desc.push(`🔥 RSI aşırı satım (${rsi})`); }
    else if (rsi < oversold)   { puan += 35; desc.push(`RSI satım bölgesi (${rsi})`); }
    else if (rsi < 50)         { puan += 15; desc.push(`RSI nötr+ (${rsi})`); }
    else if (rsi > 80)         { puan -= 40; desc.push(`⚠️ RSI aşırı alım (${rsi})`); }
    else if (rsi > overbought) { puan -= 20; desc.push(`RSI alım bölgesi (${rsi})`); }
    else                       { puan += 5; }

    return { puan, desc: desc.join(' | ') };
  }

  // ── DESTEK / DİRENÇ ────────────────────────────
  static calculateSR(closes, highs, lows, settings = {}) {
    const lookback = parseInt(settings.sr_lookback || 20);
    const price = closes[closes.length - 1];
    const recentHighs = highs.slice(-lookback);
    const recentLows  = lows.slice(-lookback);

    const resistance = Math.max(...recentHighs);
    const support    = Math.min(...recentLows);
    const range      = resistance - support;

    if (range === 0) return { puan: 0, desc: 'Range yok', pozisyon: 50 };

    const pozisyon = (price - support) / range * 100;

    let puan = 0;
    const desc = [];

    if      (pozisyon < 10) { puan += 50; desc.push(`🔥 Desteğe çok yakın (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 25) { puan += 35; desc.push(`Alt bölge (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 40) { puan += 15; desc.push(`Orta-alt (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon > 90) { puan -= 40; desc.push(`⚠️ Direce çok yakın (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon > 75) { puan -= 20; desc.push(`Üst bölge (%${pozisyon.toFixed(0)})`); }
    else                    { puan += 5; }

    return { puan, desc: desc.join(' | '), pozisyon, resistance, support };
  }

  // ── ANA ANALİZ ─────────────────────────────────
  static analyze(candles, ticker, settings = {}) {
    if (!candles || candles.length < 20) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const price   = closes[closes.length - 1];

    // 4 kriter
    const momentum = this.calculateMomentum(closes);
    const rsi      = this.calculateRSI(closes, parseInt(settings.rsi_period || 7));
    const rsiSkor  = this.calculateRSIScore(rsi, settings);
    const hacim    = this.calculateVolume(closes, volumes);
    const sr       = this.calculateSR(closes, highs, lows, settings);

    // Hacim yetersizse direkt eleme
    if (!hacim.gecerli) return null;

    // Düşük hacimli coinleri eleme
    // 24s hacim kontrolü (ticker'dan)
    const vol24h = parseFloat(ticker.quoteVolume || 0);
    const minVol = parseFloat(settings.min_volume || 5000000);
    if (vol24h < minVol) return null;

    // Ağırlıklı skor
    const toplamSkor = Math.round(
      momentum.puan * 0.30 +
      rsiSkor.puan  * 0.25 +
      hacim.puan    * 0.30 + // Hacime daha fazla ağırlık
      sr.puan       * 0.15
    );

    const minScore = parseFloat(settings.min_score || 25);
    const signal   = toplamSkor >= minScore ? 'ALIM' : toplamSkor <= -15 ? 'SATIS' : 'BEKLE';
    const risk     = toplamSkor >= 50 ? 'DUSUK' : toplamSkor >= 30 ? 'ORTA' : 'YUKSEK';

    // ATR
    const atrDegerleri = [];
    for (let i = 1; i < candles.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i-1];
      atrDegerleri.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    const atr = atrDegerleri.slice(-14).reduce((a,b) => a+b, 0) / 14;

    const positive = [], negative = [];
    if (momentum.puan > 0) positive.push('Momentum: ' + momentum.desc);
    else negative.push('Momentum: ' + momentum.desc);
    if (rsiSkor.puan > 0) positive.push(rsiSkor.desc);
    else if (rsiSkor.puan < 0) negative.push(rsiSkor.desc);
    if (hacim.puan > 0) positive.push('Hacim: ' + hacim.desc);
    else negative.push('Hacim: ' + hacim.desc);
    if (sr.puan > 0) positive.push('S/R: ' + sr.desc);
    else if (sr.puan < 0) negative.push('S/R: ' + sr.desc);

    return {
      symbol:    ticker.symbol,
      price,
      change24h: parseFloat(ticker.priceChangePercent),
      volume24h: vol24h,
      signal,
      score:     toplamSkor,
      risk,
      rsi,
      momentum:  momentum.puan,
      hacimOran: hacim.oran,
      srPozisyon: sr.pozisyon,
      atr:       parseFloat(atr.toFixed(8)),
      target:    parseFloat((price + atr * 2).toFixed(8)),
      stopLoss:  parseFloat((price - atr * 1).toFixed(8)),
      positive,
      negative
    };
  }
}

module.exports = TechnicalAnalysis;
