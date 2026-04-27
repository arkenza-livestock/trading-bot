// v18 - Ağırlıklı puanlama sistemi
class TechnicalAnalysis {

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
      const h=highs[i], l=lows[i], ph=highs[i-1], pl=lows[i-1], pc=closes[i-1];
      const tr = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
      const upMove = h-ph, downMove = pl-l;
      trList.push(tr);
      dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
      dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    const smoothTR      = trList.slice(-period).reduce((a,b)=>a+b,0);
    const smoothDMPlus  = dmPlus.slice(-period).reduce((a,b)=>a+b,0);
    const smoothDMMinus = dmMinus.slice(-period).reduce((a,b)=>a+b,0);
    const diPlus  = smoothTR > 0 ? (smoothDMPlus  / smoothTR) * 100 : 0;
    const diMinus = smoothTR > 0 ? (smoothDMMinus / smoothTR) * 100 : 0;
    const diSum   = diPlus + diMinus;
    const dx      = diSum > 0 ? Math.abs(diPlus - diMinus) / diSum * 100 : 0;
    return { adx: parseFloat(dx.toFixed(2)), diPlus: parseFloat(diPlus.toFixed(2)), diMinus: parseFloat(diMinus.toFixed(2)) };
  }

  static calculateMACD(closes, fast = 12, slow = 26, signal = 9) {
    if (closes.length < slow + signal + 1) return { macd:0, signal:0, histogram:0, crossover:false, crossunder:false, bullish:false, bearish:false };
    const kf=2/(fast+1), ks=2/(slow+1), kg=2/(signal+1);
    let ef=closes.slice(0,fast).reduce((a,b)=>a+b,0)/fast;
    let es=closes.slice(0,slow).reduce((a,b)=>a+b,0)/slow;
    const ml=[];
    for (let i=slow; i<closes.length; i++) {
      ef=closes[i]*kf+ef*(1-kf); es=closes[i]*ks+es*(1-ks); ml.push(ef-es);
    }
    if (ml.length<signal+1) return { macd:0, signal:0, histogram:0, crossover:false, crossunder:false, bullish:false, bearish:false };
    let sg=ml.slice(0,signal).reduce((a,b)=>a+b,0)/signal;
    const sl=[];
    for (let i=signal; i<ml.length; i++) { sg=ml[i]*kg+sg*(1-kg); sl.push(sg); }
    const cm=ml[ml.length-1], cs=sl[sl.length-1];
    const pm=ml[ml.length-2], ps=sl[sl.length-2];
    return {
      macd: parseFloat(cm.toFixed(8)), signal: parseFloat(cs.toFixed(8)),
      histogram: parseFloat((cm-cs).toFixed(8)),
      crossover:  pm<=ps && cm>cs,
      crossunder: pm>=ps && cm<cs,
      bullish: cm>cs, bearish: cm<cs
    };
  }

  static calculateIchimoku(highs, lows, closes) {
    const len = closes.length;
    if (len < 52) return null;
    const maxOf = (arr, n) => Math.max(...arr.slice(-n));
    const minOf = (arr, n) => Math.min(...arr.slice(-n));
    const tenkan = (maxOf(highs,9)  + minOf(lows,9))  / 2;
    const kijun  = (maxOf(highs,26) + minOf(lows,26)) / 2;
    const spanA  = (tenkan + kijun) / 2;
    const spanB  = (maxOf(highs,52) + minOf(lows,52)) / 2;
    const price  = closes[len-1];
    const kumoUpper = Math.max(spanA, spanB);
    const kumoLower = Math.min(spanA, spanB);
    const chikouRef = closes[len-26] || closes[0];
    const kumoKalinlik = Math.abs(spanA-spanB)/price*100;
    const aboveCloud  = price > kumoUpper;
    const belowCloud  = price < kumoLower;
    const bulutUzaklik = aboveCloud ? (price-kumoUpper)/price*100 : belowCloud ? (kumoLower-price)/price*100 : 0;
    return {
      tenkan, kijun, spanA, spanB, kumoUpper, kumoLower, kumoKalinlik,
      aboveCloud, belowCloud, insideCloud: !aboveCloud&&!belowCloud, bulutUzaklik,
      tkBull: tenkan>kijun, tkBear: tenkan<kijun,
      chikouBull: price>chikouRef, chikouBear: price<chikouRef,
      kumoBull: spanA>spanB, kumoBear: spanA<spanB,
      price, chikouRef
    };
  }

  // ── İCHİMOKU LONG — ağırlıklı puan ──────────────────────
  static ichimokuLongPuanla(ichimoku, rsi) {
    if (!ichimoku) return { puan: 0, maxPuan: 25, gecti: false, guclu: false, detay: [] };

    let puan = 0;
    const detay = [];

    // Fiyat-Bulut ilişkisi — 8 puan
    if (ichimoku.aboveCloud) {
      puan += ichimoku.bulutUzaklik > 1 ? 8 : 6;
      detay.push(`✅ Bulut üstü(+${ichimoku.bulutUzaklik > 1 ? 8 : 6})`);
    } else if (ichimoku.insideCloud) {
      puan += 2;
      detay.push(`⚠️ Bulut içi(+2)`);
    } else {
      detay.push(`❌ Bulut altı(0)`);
    }

    // TK Cross — 6 puan
    if (ichimoku.tkBull) {
      const tkFark = (ichimoku.tenkan - ichimoku.kijun) / ichimoku.kijun * 100;
      puan += tkFark > 0.5 ? 6 : tkFark > 0.2 ? 4 : 3;
      detay.push(`✅ TK+(${(puan).toFixed(0)})`);
    } else {
      detay.push(`❌ TK-(0)`);
    }

    // Chikou — 5 puan
    if (ichimoku.chikouBull) {
      puan += 5;
      detay.push(`✅ Chikou+(+5)`);
    } else {
      detay.push(`❌ Chikou-(0)`);
    }

    // Kumo rengi — 4 puan
    if (ichimoku.kumoBull) {
      puan += ichimoku.kumoKalinlik > 1 ? 4 : 2;
      detay.push(`✅ Kumo yeşil(+${ichimoku.kumoKalinlik > 1 ? 4 : 2})`);
    } else {
      detay.push(`❌ Kumo kırmızı(0)`);
    }

    // RSI-Bulut uyumu — 2 puan
    // Bulut üstünde: RSI 35-70 ideal, çok yüksek RSI tehlike
    // Bulut altında veya içinde: RSI 30-55 ideal
    let rsiUyumPuan = 0;
    if (ichimoku.aboveCloud) {
      if (rsi >= 35 && rsi <= 65)       rsiUyumPuan = 2;
      else if (rsi > 65 && rsi <= 72)   rsiUyumPuan = 1;
      else if (rsi > 72)                rsiUyumPuan = 0; // Aşırı alım
      else if (rsi >= 25 && rsi < 35)   rsiUyumPuan = 1;
    } else {
      if (rsi >= 30 && rsi <= 55)       rsiUyumPuan = 2;
      else if (rsi >= 25 && rsi < 30)   rsiUyumPuan = 1;
    }
    puan += rsiUyumPuan;
    detay.push(`${rsiUyumPuan>0?'✅':'❌'} RSI uyumu(+${rsiUyumPuan})`);

    const maxPuan = 25;
    return {
      puan,
      maxPuan,
      gecti: puan >= 12,  // 25'ten 12+ = geçer
      guclu: puan >= 18,  // 25'ten 18+ = güçlü
      detay
    };
  }

  // ── İCHİMOKU SHORT — ağırlıklı puan ─────────────────────
  static ichimokuShortPuanla(ichimoku, rsi) {
    if (!ichimoku) return { puan: 0, maxPuan: 25, gecti: false, guclu: false, detay: [] };

    let puan = 0;
    const detay = [];

    // Fiyat-Bulut ilişkisi — 8 puan
    if (ichimoku.belowCloud) {
      puan += ichimoku.bulutUzaklik > 1 ? 8 : 6;
      detay.push(`✅ Bulut altı(+${ichimoku.bulutUzaklik > 1 ? 8 : 6})`);
    } else if (ichimoku.insideCloud) {
      puan += 2;
      detay.push(`⚠️ Bulut içi(+2)`);
    } else {
      detay.push(`❌ Bulut üstü(0)`);
    }

    // TK Cross — 6 puan
    if (ichimoku.tkBear) {
      const tkFark = (ichimoku.kijun - ichimoku.tenkan) / ichimoku.kijun * 100;
      puan += tkFark > 0.5 ? 6 : tkFark > 0.2 ? 4 : 3;
      detay.push(`✅ TK-(${puan})`);
    } else {
      detay.push(`❌ TK+(0)`);
    }

    // Chikou — 5 puan
    if (ichimoku.chikouBear) {
      puan += 5;
      detay.push(`✅ Chikou-(+5)`);
    } else {
      detay.push(`❌ Chikou+(0)`);
    }

    // Kumo rengi — 4 puan
    if (ichimoku.kumoBear) {
      puan += ichimoku.kumoKalinlik > 1 ? 4 : 2;
      detay.push(`✅ Kumo kırmızı(+${ichimoku.kumoKalinlik > 1 ? 4 : 2})`);
    } else {
      detay.push(`❌ Kumo yeşil(0)`);
    }

    // RSI-Bulut uyumu — 2 puan
    let rsiUyumPuan = 0;
    if (ichimoku.belowCloud) {
      if (rsi >= 35 && rsi <= 62)       rsiUyumPuan = 2;
      else if (rsi > 62 && rsi <= 68)   rsiUyumPuan = 1;
      else if (rsi > 68)                rsiUyumPuan = 2; // Aşırı alım → short güçlü
      else if (rsi >= 28 && rsi < 35)   rsiUyumPuan = 1;
      else if (rsi < 28)                rsiUyumPuan = 0; // Aşırı satım → short riskli
    } else {
      if (rsi >= 55 && rsi <= 75)       rsiUyumPuan = 2;
      else if (rsi > 75)                rsiUyumPuan = 2;
      else if (rsi >= 45 && rsi < 55)   rsiUyumPuan = 1;
    }
    puan += rsiUyumPuan;
    detay.push(`${rsiUyumPuan>0?'✅':'❌'} RSI uyumu(+${rsiUyumPuan})`);

    const maxPuan = 25;
    return {
      puan,
      maxPuan,
      gecti: puan >= 12,
      guclu: puan >= 18,
      detay
    };
  }

  static calculateRSIDivergence(closes, lows, highs, period=14, lookback=25) {
    if (closes.length<lookback+period) return { bullish:false, bearish:false };
    const slice=closes.slice(-lookback-period);
    const rsiSeries=[];
    for (let i=period; i<=slice.length; i++) rsiSeries.push(this.calculateRSI(slice.slice(0,i),period));
    const recentRSI=rsiSeries.slice(-lookback);
    const recentLow=lows.slice(-lookback), recentHigh=highs.slice(-lookback);
    const dips=[], peaks=[];
    for (let i=1; i<lookback-1; i++) {
      if (recentLow[i]<recentLow[i-1]&&recentLow[i]<recentLow[i+1]) dips.push(i);
      if (recentHigh[i]>recentHigh[i-1]&&recentHigh[i]>recentHigh[i+1]) peaks.push(i);
    }
    let bullishDiv=false, bearishDiv=false;
    if (dips.length>=2) { const d1=dips[dips.length-1],d2=dips[dips.length-2]; bullishDiv=recentLow[d1]<recentLow[d2]&&recentRSI[d1]>recentRSI[d2]; }
    if (peaks.length>=2) { const p1=peaks[peaks.length-1],p2=peaks[peaks.length-2]; bearishDiv=recentHigh[p1]>recentHigh[p2]&&recentRSI[p1]<recentRSI[p2]; }
    return { bullish:bullishDiv, bearish:bearishDiv };
  }

  static calculateATR(highs, lows, closes, period=14) {
    const trList=[];
    for (let i=1; i<closes.length; i++) {
      const h=highs[i],l=lows[i],pc=closes[i-1];
      trList.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
    }
    if (trList.length<period) return trList[trList.length-1]||0;
    return trList.slice(-period).reduce((a,b)=>a+b,0)/period;
  }

  static analyzeTF(candles) {
    if (!candles||candles.length<50) return { trend:'BELIRSIZ', puan:0, guclu:false };
    const closes=candles.map(c=>parseFloat(c[4]));
    const highs=candles.map(c=>parseFloat(c[2]));
    const lows=candles.map(c=>parseFloat(c[3]));
    const volumes=candles.map(c=>parseFloat(c[5]));
    const len=closes.length, price=closes[len-1];
    const ema10=this.calculateEMA(closes,10), ema20=this.calculateEMA(closes,20);
    const ema50=this.calculateEMA(closes,Math.min(50,len));
    const ema200=this.calculateEMA(closes,Math.min(200,len));
    const rsi14=this.calculateRSI(closes,14);
    const adx=this.calculateADX(highs,lows,closes,14);
    const s10H=highs.slice(-10), s10L=lows.slice(-10);
    const hhC=s10H.filter((h,i)=>i>0&&h>s10H[i-1]).length;
    const hlC=s10L.filter((l,i)=>i>0&&l>s10L[i-1]).length;
    const llC=s10L.filter((l,i)=>i>0&&l<s10L[i-1]).length;
    const lhC=s10H.filter((h,i)=>i>0&&h<s10H[i-1]).length;
    const avgV=volumes.slice(-10,-1).reduce((a,b)=>a+b,0)/9;
    const volUp=volumes[len-1]>avgV*1.1;
    let puan=0;
    if      (ema10>ema20&&ema20>ema50) puan+=35; else if (ema10>ema20) puan+=15;
    else if (ema10<ema20&&ema20<ema50) puan-=35; else if (ema10<ema20) puan-=15;
    if (price>ema50)  puan+=20; else puan-=20;
    if (price>ema200) puan+=15; else puan-=15;
    if      (adx.adx>30&&adx.diPlus>adx.diMinus)  puan+=35;
    else if (adx.adx>25&&adx.diPlus>adx.diMinus)  puan+=25;
    else if (adx.adx>30&&adx.diMinus>adx.diPlus)  puan-=35;
    else if (adx.adx>25&&adx.diMinus>adx.diPlus)  puan-=25;
    else if (adx.adx<15) puan-=30; else if (adx.adx<20) puan-=15;
    if      (hhC>=5&&hlC>=5) puan+=20; else if (hhC>=3) puan+=10;
    if      (llC>=5&&lhC>=5) puan-=20; else if (llC>=3) puan-=10;
    if (rsi14>55&&rsi14<75) puan+=10; else if (rsi14<45) puan-=10;
    if (volUp&&ema10>ema20) puan+=10;
    let trend='BELIRSIZ', guclu=false;
    if      (puan>=80)                   { trend='YUKARI';       guclu=true; }
    else if (puan>=50&&adx.adx>=20)     { trend='YUKARI'; }
    else if (puan>=50)                   { trend='YATAY'; }
    else if (puan>=20&&adx.adx>=20)     { trend='HAFIF_YUKARI'; }
    else if (puan>=20)                   { trend='YATAY'; }
    else if (puan>=-20)                  { trend='YATAY'; }
    else if (puan>=-50&&adx.adx>=20)    { trend='HAFIF_ASAGI'; }
    else if (puan>=-50)                  { trend='YATAY'; }
    else if (puan>=-80&&adx.adx>=20)    { trend='ASAGI'; }
    else if (puan>=-80)                  { trend='HAFIF_ASAGI'; }
    else                                 { trend='ASAGI'; guclu=true; }
    return { trend, puan, guclu, ema10, ema20, ema50, adx:adx.adx, diPlus:adx.diPlus, diMinus:adx.diMinus, rsi:rsi14, hhC, hlC };
  }

  static analyze1H(candles) { return this.analyzeTF(candles); }
  static analyze4H(candles) { return this.analyzeTF(candles); }

  // ── ANA ANALİZ — AĞIRLIKLI PUAN SİSTEMİ ─────────────────
  static analyze(candles, ticker, settings={}) {
    if (!candles||candles.length<52) return null;

    const closes  = candles.map(c=>parseFloat(c[4]));
    const highs   = candles.map(c=>parseFloat(c[2]));
    const lows    = candles.map(c=>parseFloat(c[3]));
    const volumes = candles.map(c=>parseFloat(c[5]));
    const price   = closes[closes.length-1];

    const vol24h=parseFloat(ticker.quoteVolume||0);
    const minVol=parseFloat(settings.min_volume||0);
    if (minVol>0&&vol24h<minVol) return null;

    const rsiPeriod = parseInt(settings.rsi_period||14);
    const rsi       = this.calculateRSI(closes, rsiPeriod);
    const macd      = this.calculateMACD(closes);
    const ichimoku  = this.calculateIchimoku(highs, lows, closes);
    const divergence= this.calculateRSIDivergence(closes, lows, highs, rsiPeriod, 25);
    const atr       = this.calculateATR(highs, lows, closes, 14);
    const atrPct    = (atr/price)*100;

    const ema5  = this.calculateEMA(closes, 5);
    const ema10 = this.calculateEMA(closes, 10);
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, Math.min(50, closes.length));

    // Hacim
    const len    = volumes.length;
    const avg20  = volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
    const sonVol = volumes[len-1];
    const hacimOran = avg20>0 ? sonVol/avg20 : 0;
    const avg5  = volumes.slice(-6,-1).reduce((a,b)=>a+b,0)/5;
    const hacimTrend = avg5 > avg20 * 1.1;

    // Alım/Satış hacim
    let alimVol=0, satisVol=0;
    for (let i=len-5; i<len; i++) {
      if (i>0&&closes[i]>=closes[i-1]) alimVol+=volumes[i];
      else if (i>0) satisVol+=volumes[i];
    }
    const alimOran=(alimVol+satisVol)>0?(alimVol/(alimVol+satisVol))*100:50;

    // Destek/Direnç
    const lookback  = parseInt(settings.sr_lookback||20);
    const resistance= Math.max(...highs.slice(-lookback));
    const support   = Math.min(...lows.slice(-lookback));
    const range     = resistance-support;
    const pozisyon  = range>0 ? (price-support)/range*100 : 50;
    const riskOdul  = range>0 ? (resistance-price)/(price-support||1) : 1;

    // Momentum
    const roc1 = closes.length>=2 ? ((closes[closes.length-1]-closes[closes.length-2])/closes[closes.length-2])*100 : 0;
    const roc3 = closes.length>=4 ? ((closes[closes.length-1]-closes[closes.length-4])/closes[closes.length-4])*100 : 0;

    // Ichimoku ağırlıklı puan
    const ichimokuL = this.ichimokuLongPuanla(ichimoku, rsi);
    const ichimokuS = this.ichimokuShortPuanla(ichimoku, rsi);

    // ── LONG PUAN SİSTEMİ (toplam 100) ───────────────────

    // K1 — RSI (15 puan)
    let longRsiPuan = 0;
    if      (rsi < 25)  longRsiPuan = 15;
    else if (rsi < 30)  longRsiPuan = 13;
    else if (rsi < 35)  longRsiPuan = 11;
    else if (rsi < 40)  longRsiPuan = 9;
    else if (rsi < 45)  longRsiPuan = 7;
    else if (rsi < 50)  longRsiPuan = 5;
    else if (rsi < 55)  longRsiPuan = 3;
    else if (rsi < 60)  longRsiPuan = 1;
    else                longRsiPuan = 0;

    // K2 — MACD (20 puan)
    let longMacdPuan = 0;
    if      (macd.crossover)  longMacdPuan = 20;
    else if (macd.bullish)    longMacdPuan = 12;
    else                      longMacdPuan = 0;

    // K3 — Hacim (10 puan)
    let longHacimPuan = 0;
    if      (hacimOran >= 3.0) longHacimPuan = 10;
    else if (hacimOran >= 2.0) longHacimPuan = 8;
    else if (hacimOran >= 1.5) longHacimPuan = 6;
    else if (hacimOran >= 1.2) longHacimPuan = 4;
    else if (hacimOran >= 1.0) longHacimPuan = 2;
    else if (hacimTrend)       longHacimPuan = 3;
    else                       longHacimPuan = 0;

    // K4 — Destek/Direnç (15 puan)
    let longSrPuan = 0;
    if      (pozisyon < 10) longSrPuan = 15;
    else if (pozisyon < 20) longSrPuan = 13;
    else if (pozisyon < 30) longSrPuan = 10;
    else if (pozisyon < 40) longSrPuan = 7;
    else if (pozisyon < 50) longSrPuan = 4;
    else if (pozisyon < 60) longSrPuan = 1;
    else                    longSrPuan = 0;

    // K5 — Ichimoku (25 puan) — zaten 0-25 arası
    const longIchimokuPuan = ichimokuL.puan;

    // K6 — Momentum (15 puan)
    let longMomentumPuan = 0;
    if (ema5 > ema10 && ema10 > ema20) {
      if      (roc1 > 1.0)  longMomentumPuan = 15;
      else if (roc1 > 0.5)  longMomentumPuan = 12;
      else if (roc1 > 0.2)  longMomentumPuan = 9;
      else if (roc1 > 0)    longMomentumPuan = 6;
      else                   longMomentumPuan = 3;
    } else if (ema5 > ema10) {
      if      (roc1 > 0.5)  longMomentumPuan = 10;
      else if (roc1 > 0)    longMomentumPuan = 6;
      else                   longMomentumPuan = 2;
    }

    const longToplamBaz = longRsiPuan + longMacdPuan + longHacimPuan + longSrPuan + longIchimokuPuan + longMomentumPuan;

    // Bonus (max +20)
    let longBonus = 0;
    if (divergence.bullish)   longBonus += 8;
    if (macd.crossover)       longBonus += 0; // Zaten yukarıda sayıldı
    if (hacimOran >= 2.0 && roc1 > 0) longBonus += 5;
    if (rsi < 30 && ichimokuL.gecti)   longBonus += 5;
    if (pozisyon < 15 && macd.bullish) longBonus += 5;
    if (ichimokuL.guclu)      longBonus += 7;

    const longSkor = Math.min(100, longToplamBaz + longBonus);

    // ── SHORT PUAN SİSTEMİ (toplam 100) ──────────────────

    // K1 — RSI (15 puan)
    let shortRsiPuan = 0;
    if      (rsi > 80)  shortRsiPuan = 15;
    else if (rsi > 75)  shortRsiPuan = 13;
    else if (rsi > 70)  shortRsiPuan = 11;
    else if (rsi > 65)  shortRsiPuan = 9;
    else if (rsi > 60)  shortRsiPuan = 7;
    else if (rsi > 55)  shortRsiPuan = 5;
    else if (rsi > 52)  shortRsiPuan = 3;
    else if (rsi > 50)  shortRsiPuan = 1;
    else                shortRsiPuan = 0;

    // K2 — MACD (20 puan)
    let shortMacdPuan = 0;
    if      (macd.crossunder) shortMacdPuan = 20;
    else if (macd.bearish)    shortMacdPuan = 12;
    else                      shortMacdPuan = 0;

    // K3 — Hacim (10 puan)
    let shortHacimPuan = 0;
    if      (hacimOran >= 3.0) shortHacimPuan = 10;
    else if (hacimOran >= 2.0) shortHacimPuan = 8;
    else if (hacimOran >= 1.5) shortHacimPuan = 6;
    else if (hacimOran >= 1.2) shortHacimPuan = 4;
    else if (hacimOran >= 1.0) shortHacimPuan = 2;
    else if (hacimTrend)       shortHacimPuan = 3;
    else                       shortHacimPuan = 0;

    // K4 — Direnç (15 puan)
    let shortSrPuan = 0;
    if      (pozisyon > 90) shortSrPuan = 15;
    else if (pozisyon > 80) shortSrPuan = 13;
    else if (pozisyon > 70) shortSrPuan = 10;
    else if (pozisyon > 60) shortSrPuan = 7;
    else if (pozisyon > 50) shortSrPuan = 4;
    else if (pozisyon > 40) shortSrPuan = 1;
    else                    shortSrPuan = 0;

    // K5 — Ichimoku (25 puan)
    const shortIchimokuPuan = ichimokuS.puan;

    // K6 — Momentum (15 puan)
    let shortMomentumPuan = 0;
    if (ema5 < ema10 && ema10 < ema20) {
      if      (roc1 < -1.0)  shortMomentumPuan = 15;
      else if (roc1 < -0.5)  shortMomentumPuan = 12;
      else if (roc1 < -0.2)  shortMomentumPuan = 9;
      else if (roc1 < 0)     shortMomentumPuan = 6;
      else                    shortMomentumPuan = 3;
    } else if (ema5 < ema10) {
      if      (roc1 < -0.5)  shortMomentumPuan = 10;
      else if (roc1 < 0)     shortMomentumPuan = 6;
      else                    shortMomentumPuan = 2;
    }

    const shortToplamBaz = shortRsiPuan + shortMacdPuan + shortHacimPuan + shortSrPuan + shortIchimokuPuan + shortMomentumPuan;

    // Bonus
    let shortBonus = 0;
    if (divergence.bearish)   shortBonus += 8;
    if (hacimOran >= 2.0 && roc1 < 0) shortBonus += 5;
    if (rsi > 70 && ichimokuS.gecti)   shortBonus += 5;
    if (pozisyon > 85 && macd.bearish) shortBonus += 5;
    if (ichimokuS.guclu)      shortBonus += 7;

    const shortSkor = Math.min(100, shortToplamBaz + shortBonus);

    // ── SİNYAL KARAR ─────────────────────────────────────
    const minScore = parseFloat(settings.min_score||40);

    let signal = 'BEKLE';
    let score  = 0;

    if (longSkor >= shortSkor && longSkor >= minScore) {
      signal = 'ALIM';
      score  = longSkor;
    } else if (shortSkor > longSkor && shortSkor >= minScore) {
      signal = 'SATIS';
      score  = -shortSkor;
    } else {
      // Puanı hangisi daha yüksekse onu göster
      score = longSkor >= shortSkor ? longSkor : -shortSkor;
    }

    const risk = Math.abs(score)>=75?'DUSUK':Math.abs(score)>=55?'ORTA':'YUKSEK';

    const komisyon  = parseFloat(settings.commission_rate||0.1);
    const slippage  = parseFloat(settings.slippage_rate||0.05);
    const minNetKar = (komisyon+slippage)*2+parseFloat(settings.min_profit_percent||1.0);
    const stopLossPct = parseFloat(settings.stop_loss_percent||2.0);
    const hedefFiyat = parseFloat((price*(1+minNetKar/100)).toFixed(8));
    const stopFiyat  = parseFloat((price*(1-stopLossPct/100)).toFixed(8));

    const positive=[], negative=[];

    if (signal==='ALIM') {
      positive.push(`✅ LONG skoru: ${longSkor}/100`);
      positive.push(`📊 RSI(${rsi}) → ${longRsiPuan}/15`);
      positive.push(`📈 MACD → ${longMacdPuan}/20${macd.crossover?' 🚀':''}`);
      positive.push(`💧 Hacim ${hacimOran.toFixed(1)}x → ${longHacimPuan}/10`);
      positive.push(`📍 SR:%${pozisyon.toFixed(0)} → ${longSrPuan}/15`);
      positive.push(`☁️ Ichimoku → ${longIchimokuPuan}/25${ichimokuL.guclu?' 💪':''}`);
      positive.push(`⚡ Momentum → ${longMomentumPuan}/15`);
      if (divergence.bullish) positive.push('🔀 Bullish Div +8');
      if (longBonus > 0)      positive.push(`🎯 Bonus: +${longBonus}`);
    } else if (signal==='SATIS') {
      negative.push(`⚠️ SHORT skoru: ${shortSkor}/100`);
      negative.push(`📊 RSI(${rsi}) → ${shortRsiPuan}/15`);
      negative.push(`📉 MACD → ${shortMacdPuan}/20${macd.crossunder?' 💀':''}`);
      negative.push(`💧 Hacim ${hacimOran.toFixed(1)}x → ${shortHacimPuan}/10`);
      negative.push(`📍 SR:%${pozisyon.toFixed(0)} → ${shortSrPuan}/15`);
      negative.push(`☁️ Ichimoku → ${shortIchimokuPuan}/25${ichimokuS.guclu?' 💪':''}`);
      negative.push(`⚡ Momentum → ${shortMomentumPuan}/15`);
      if (divergence.bearish) negative.push('🔀 Bearish Div +8');
      if (shortBonus > 0)     negative.push(`🎯 Bonus: +${shortBonus}`);
    } else {
      negative.push(`Long: ${longSkor}/100 | Short: ${shortSkor}/100 | Min: ${minScore}`);
      negative.push(`RSI:${rsi} MACD:${macd.bullish?'+':'-'} Hacim:${hacimOran.toFixed(1)}x SR:%${pozisyon.toFixed(0)}`);
      negative.push(`Ichimoku L:${longIchimokuPuan}/25 S:${shortIchimokuPuan}/25`);
    }

    return {
      symbol:ticker.symbol, price,
      change24h:parseFloat(ticker.priceChangePercent||0),
      volume24h:vol24h, signal, score, risk, rsi,
      momentum:roc1,
      longSkor, shortSkor,
      longPuanlar:{ rsi:longRsiPuan, macd:longMacdPuan, hacim:longHacimPuan, sr:longSrPuan, ichimoku:longIchimokuPuan, momentum:longMomentumPuan, bonus:longBonus },
      shortPuanlar:{ rsi:shortRsiPuan, macd:shortMacdPuan, hacim:shortHacimPuan, sr:shortSrPuan, ichimoku:shortIchimokuPuan, momentum:shortMomentumPuan, bonus:shortBonus },
      ichimokuLongPuan:ichimokuL.puan, ichimokuLongGuclu:ichimokuL.guclu,
      ichimokuShortPuan:ichimokuS.puan, ichimokuShortGuclu:ichimokuS.guclu,
      ichimokuDetayLong:ichimokuL.detay, ichimokuDetayShort:ichimokuS.detay,
      macdCrossover:macd.crossover, macdCrossunder:macd.crossunder,
      macdBullish:macd.bullish, macdBearish:macd.bearish,
      ichimokuAbove:ichimoku?.aboveCloud||false,
      ichimokuBelow:ichimoku?.belowCloud||false,
      rsiDivBull:divergence.bullish, rsiDivBear:divergence.bearish,
      hacimOran:parseFloat(hacimOran.toFixed(2)), hacimTrend,
      alimOran:parseFloat(alimOran.toFixed(1)),
      srPozisyon:parseFloat(pozisyon.toFixed(1)),
      riskOdul:parseFloat(riskOdul.toFixed(2)),
      atr:parseFloat(atr.toFixed(8)), atrPct:parseFloat(atrPct.toFixed(3)),
      ema5, ema10, ema20, ema50,
      target:hedefFiyat, stopLoss:stopFiyat, minNetKar,
      positive:positive.filter(Boolean),
      negative:negative.filter(Boolean)
    };
  }
}

module.exports = TechnicalAnalysis;
