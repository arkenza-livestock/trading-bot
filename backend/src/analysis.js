class TechnicalAnalysis {

  // ── RSI ──────────────────────────────────────
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

  // ── MOMENTUM ──────────────────────────────────
  static calculateMomentum(closes, volumes) {
    const len = closes.length;
    if (len < 10) return { score: 0, desc: 'Yetersiz veri' };

    // Son 3 mumun yönü
    const son3 = closes.slice(-3);
    const yukselis = son3[2] > son3[1] && son3[1] > son3[0];
    const dusus = son3[2] < son3[1] && son3[1] < son3[0];

    // Fiyat değişim hızı (ROC - Rate of Change)
    const roc5 = ((closes[len-1] - closes[len-6]) / closes[len-6]) * 100;
    const roc3 = ((closes[len-1] - closes[len-4]) / closes[len-4]) * 100;

    // Son mumun gövdesi
    const sonMumBuyukluk = Math.abs(closes[len-1] - closes[len-2]) / closes[len-2] * 100;

    let puan = 0;
    let desc = [];

    if (yukselis) { puan += 30; desc.push('3 ardışık yeşil mum'); }
    else if (dusus) { puan -= 30; desc.push('3 ardışık kırmızı mum'); }

    if (roc3 > 0.5) { puan += 25; desc.push(`ROC3: +${roc3.toFixed(2)}%`); }
    else if (roc3 > 0) { puan += 10; desc.push(`ROC3: +${roc3.toFixed(2)}%`); }
    else if (roc3 < -0.5) { puan -= 25; desc.push(`ROC3: ${roc3.toFixed(2)}%`); }
    else { puan -= 10; }

    if (roc5 > 1) { puan += 20; desc.push(`ROC5: +${roc5.toFixed(2)}%`); }
    else if (roc5 < -1) { puan -= 20; }

    if (sonMumBuyukluk > 0.3) { puan += 10; desc.push('Güçlü mum'); }

    return { puan, desc: desc.join(', '), roc3, roc5, yukselis, dusus };
  }

  // ── HACİM ──────────────────────────────────────
  static calculateVolume(closes, volumes) {
    const len = volumes.length;
    if (len < 20) return { puan: 0, desc: 'Yetersiz veri' };

    const avg20 = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
    const sonVol = volumes[len - 1];
    const oran = parseFloat((sonVol / avg20).toFixed(2));

    // Yükselişte hacim artıyor mu?
    const son5 = closes.slice(-5);
    const son5Vol = volumes.slice(-5);
    let alimVol = 0, satisVol = 0;
    for (let i = 1; i < 5; i++) {
      if (son5[i] > son5[i-1]) alimVol += son5Vol[i];
      else satisVol += son5Vol[i];
    }
    const alimBaskisi = alimVol > satisVol;

    let puan = 0;
    let desc = [];

    if (oran > 3) { puan += 40; desc.push(`Hacim ${oran}x spike!`); }
    else if (oran > 2) { puan += 30; desc.push(`Hacim ${oran}x yüksek`); }
    else if (oran > 1.5) { puan += 20; desc.push(`Hacim ${oran}x orta`); }
    else if (oran > 1) { puan += 10; desc.push(`Hacim ${oran}x normal`); }
    else if (oran < 0.5) { puan -= 20; desc.push('Hacim çok düşük'); }

    if (alimBaskisi) { puan += 15; desc.push('Alım baskısı var'); }
    else { puan -= 10; desc.push('Satış baskısı var'); }

    return { puan, desc: desc.join(', '), oran, alimBaskisi, spike: oran > 2 };
  }

  // ── RSI SKOR ──────────────────────────────────
  static calculateRSIScore(rsi, settings = {}) {
    const oversold = parseFloat(settings.rsi_oversold || 35);
    const overbought = parseFloat(settings.rsi_overbought || 65);

    let puan = 0;
    let desc = [];

    if (rsi < 20) { puan += 50; desc.push(`RSI aşırı satım (${rsi})`); }
    else if (rsi < oversold) { puan += 35; desc.push(`RSI satım bölgesi (${rsi})`); }
    else if (rsi < 50) { puan += 15; desc.push(`RSI nötr pozitif (${rsi})`); }
    else if (rsi > 80) { puan -= 40; desc.push(`RSI aşırı alım (${rsi})`); }
    else if (rsi > overbought) { puan -= 20; desc.push(`RSI alım bölgesi (${rsi})`); }
    else { puan += 5; }

    return { puan, desc: desc.join(', ') };
  }

  // ── DESTEK / DİRENÇ ────────────────────────────
  static calculateSR(closes, highs, lows, settings = {}) {
    const lookback = parseInt(settings.sr_lookback || 20);
    const price = closes[closes.length - 1];
    const recentHighs = highs.slice(-lookback);
    const recentLows = lows.slice(-lookback);

    const resistance = Math.max(...recentHighs);
    const support = Math.min(...recentLows);
    const range = resistance - support;

    if (range === 0) return { puan: 0, desc: 'Range yok' };

    // Fiyat bandın neresinde?
    const pozisyon = (price - support) / range * 100;

    let puan = 0;
    let desc = [];

    if (pozisyon < 15) { puan += 40; desc.push(`Desteğe çok yakın (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 30) { puan += 25; desc.push(`Alt bölgede (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon < 50) { puan += 10; desc.push(`Orta-alt bölge (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon > 85) { puan -= 30; desc.push(`Direce çok yakın (%${pozisyon.toFixed(0)})`); }
    else if (pozisyon > 70) { puan -= 15; desc.push(`Üst bölgede (%${pozisyon.toFixed(0)})`); }

    return { puan, desc: desc.join(', '), pozisyon, resistance, support };
  }

  // ── ANA ANALİZ ─────────────────────────────────
  static analyze(candles, ticker, settings = {}) {
    if (!candles || candles.length < 20) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const price   = closes[closes.length - 1];

    // 4 kriter hesapla
    const momentum = this.calculateMomentum(closes, volumes);
    const rsi      = this.calculateRSI(closes, parseInt(settings.rsi_period || 14));
    const rsiSkor  = this.calculateRSIScore(rsi, settings);
    const hacim    = this.calculateVolume(closes, volumes);
    const sr       = this.calculateSR(closes, highs, lows, settings);

    // Ağırlıklı toplam skor
    const momentumPuan = momentum.puan * 0.30;
    const rsiPuan      = rsiSkor.puan  * 0.25;
    const hacimPuan    = hacim.puan    * 0.20;
    const srPuan       = sr.puan       * 0.15;

    const toplamSkor = Math.round(momentumPuan + rsiPuan + hacimPuan + srPuan);

    const minScore = parseFloat(settings.min_score || 30);
    const signal   = toplamSkor >= minScore ? 'ALIM' : toplamSkor <= -10 ? 'SATIS' : 'BEKLE';
    const risk     = toplamSkor >= 50 ? 'DUSUK' : toplamSkor >= 30 ? 'ORTA' : 'YUKSEK';

    // ATR bazlı hedef
    const atrDegerleri = [];
    for (let i = 1; i < candles.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i-1];
      atrDegerleri.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    const atr = atrDegerleri.slice(-14).reduce((a,b) => a+b, 0) / 14;

    const positive = [];
    const negative = [];
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
      volume24h: parseFloat(ticker.quoteVolume),
      signal, score: toplamSkor, risk,
      rsi,
      momentum:  momentum.puan,
      hacim:     hacim.oran,
      srPozisyon: sr.pozisyon,
      atr:       parseFloat(atr.toFixed(8)),
      target:    parseFloat((price + atr * 2).toFixed(8)),
      stopLoss:  parseFloat((price - atr * 1).toFixed(8)),
      positive, negative,
      detay: {
        momentum, rsiSkor, hacim, sr
      }
    };
  }
}

module.exports = TechnicalAnalysis;
