// v15 - Ichimoku + RSI ilişkisi güçlendirildi
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
      ef=closes[i]*kf+ef*(1-kf);
      es=closes[i]*ks+es*(1-ks);
      ml.push(ef-es);
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

  // ── GÜÇLENDİRİLMİŞ İCHİMOKU ─────────────────────────────
  static calculateIchimoku(highs, lows, closes) {
    const len = closes.length;
    if (len < 52) return null;

    const maxOf = (arr, n) => Math.max(...arr.slice(-n));
    const minOf = (arr, n) => Math.min(...arr.slice(-n));

    const tenkan = (maxOf(highs,9)  + minOf(lows,9))  / 2;
    const kijun  = (maxOf(highs,26) + minOf(lows,26)) / 2;
    const spanA  = (tenkan + kijun) / 2;
    const spanB  = (maxOf(highs,52) + minOf(lows,52)) / 2;

    const price     = closes[len-1];
    const kumoUpper = Math.max(spanA, spanB);
    const kumoLower = Math.min(spanA, spanB);

    // Chikou Span: mevcut fiyatın 26 periyot önceki fiyatla karşılaştırması
    const chikouRef = closes[len-26] || closes[0];

    // Kumo kalınlığı — ne kadar kalın o kadar güçlü destek/direnç
    const kumoKalinlik = Math.abs(spanA - spanB) / price * 100;

    // Fiyat-Bulut ilişkisi
    const aboveCloud  = price > kumoUpper;
    const belowCloud  = price < kumoLower;
    const insideCloud = !aboveCloud && !belowCloud;

    // Buluttan ne kadar uzakta (%)
    const bulutUzaklik = aboveCloud
      ? (price - kumoUpper) / price * 100
      : belowCloud
        ? (kumoLower - price) / price * 100
        : 0;

    return {
      tenkan, kijun, spanA, spanB,
      kumoUpper, kumoLower, kumoKalinlik,
      aboveCloud, belowCloud, insideCloud,
      bulutUzaklik,
      // TK ilişkisi
      tkBull: tenkan > kijun,
      tkBear: tenkan < kijun,
      // Chikou ilişkisi
      chikouBull: price > chikouRef,
      chikouBear: price < chikouRef,
      // Kumo rengi (gelecek bulutu)
      kumoBull: spanA > spanB,   // Yeşil bulut
      kumoBear: spanA < spanB,   // Kırmızı bulut
      price,
      chikouRef
    };
  }

  // ── İCHİMOKU GÜÇLÜ LONG KONTROL ─────────────────────────
  static ichimokuLongKontrol(ichimoku, rsi) {
    if (!ichimoku) return { gecti: false, puan: 0, detay: [] };

    const kontroller = [];

    // 1. Fiyat bulut üstünde
    kontroller.push({
      isim: 'Fiyat bulut üstü',
      gecti: ichimoku.aboveCloud,
      guclu: ichimoku.aboveCloud && ichimoku.bulutUzaklik > 1
    });

    // 2. Tenkan > Kijun (TK Cross bullish)
    kontroller.push({
      isim: 'Tenkan > Kijun',
      gecti: ichimoku.tkBull,
      guclu: ichimoku.tkBull && (ichimoku.tenkan - ichimoku.kijun) / ichimoku.kijun * 100 > 0.5
    });

    // 3. Chikou fiyatın üstünde
    kontroller.push({
      isim: 'Chikou pozitif',
      gecti: ichimoku.chikouBull,
      guclu: ichimoku.chikouBull
    });

    // 4. Kumo bullish (yeşil bulut)
    kontroller.push({
      isim: 'Kumo yeşil',
      gecti: ichimoku.kumoBull,
      guclu: ichimoku.kumoBull && ichimoku.kumoKalinlik > 1
    });

    // 5. RSI-Bulut uyumu — fiyat bulut üstündeyken RSI 40-70 arası ideal
    // RSI çok yüksek (>75) + bulut üstü = aşırı alım riski
    const rsiUyum = rsi >= 35 && rsi <= 72;
    kontroller.push({
      isim: `RSI bulut uyumu(${rsi})`,
      gecti: rsiUyum,
      guclu: rsi >= 40 && rsi <= 65
    });

    const gecenler = kontroller.filter(k => k.gecti).length;
    const gucluler = kontroller.filter(k => k.guclu).length;

    // En az 3/5 koşul geçmeli (esnek) veya 4/5 (güçlü)
    const gecti = gecenler >= 3;
    const guclu = gecenler >= 4 || gucluler >= 3;

    return {
      gecti,
      guclu,
      puan: gecenler,
      toplamKosul: 5,
      detay: kontroller.map(k => `${k.gecti?'✅':'❌'} ${k.isim}`)
    };
  }

  // ── İCHİMOKU GÜÇLÜ SHORT KONTROL ────────────────────────
  static ichimokuShortKontrol(ichimoku, rsi) {
    if (!ichimoku) return { gecti: false, puan: 0, detay: [] };

    const kontroller = [];

    // 1. Fiyat bulut altında
    kontroller.push({
      isim: 'Fiyat bulut altı',
      gecti: ichimoku.belowCloud,
      guclu: ichimoku.belowCloud && ichimoku.bulutUzaklik > 1
    });

    // 2. Tenkan < Kijun (TK Cross bearish)
    kontroller.push({
      isim: 'Tenkan < Kijun',
      gecti: ichimoku.tkBear,
      guclu: ichimoku.tkBear && (ichimoku.kijun - ichimoku.tenkan) / ichimoku.kijun * 100 > 0.5
    });

    // 3. Chikou fiyatın altında
    kontroller.push({
      isim: 'Chikou negatif',
      gecti: ichimoku.chikouBear,
      guclu: ichimoku.chikouBear
    });

    // 4. Kumo bearish (kırmızı bulut)
    kontroller.push({
      isim: 'Kumo kırmızı',
      gecti: ichimoku.kumoBear,
      guclu: ichimoku.kumoBear && ichimoku.kumoKalinlik > 1
    });

    // 5. RSI-Bulut uyumu — fiyat bulut altındayken RSI 30-65 arası ideal
    // RSI çok düşük (<25) + bulut altı = aşırı satım, short riski
    const rsiUyum = rsi >= 28 && rsi <= 65;
    kontroller.push({
      isim: `RSI bulut uyumu(${rsi})`,
      gecti: rsiUyum,
      guclu: rsi >= 35 && rsi <= 60
    });

    const gecenler = kontroller.filter(k => k.gecti).length;
    const gucluler = kontroller.filter(k => k.guclu).length;

    const gecti = gecenler >= 3;
    const guclu = gecenler >= 4 || gucluler >= 3;

    return {
      gecti,
      guclu,
      puan: gecenler,
      toplamKosul: 5,
      detay: kontroller.map(k => `${k.gecti?'✅':'❌'} ${k.isim}`)
    };
  }

  static calculateRSIDivergence(closes, lows, highs, period=14, lookback=25) {
    if (closes.length<lookback+period) return { bullish:false, bearish:false };
    const slice=closes.slice(-lookback-period);
    const rsiSeries=[];
    for (let i=period; i<=slice.length; i++) rsiSeries.push(this.calculateRSI(slice.slice(0,i),period));
    const recentRSI=rsiSeries.slice(-lookback);
    const recentLow=lows.slice(-lookback);
    const recentHigh=highs.slice(-lookback);
    const dips=[], peaks=[];
    for (let i=1; i<lookback-1; i++) {
      if (recentLow[i]<recentLow[i-1]&&recentLow[i]<recentLow[i+1]) dips.push(i);
      if (recentHigh[i]>recentHigh[i-1]&&recentHigh[i]>recentHigh[i+1]) peaks.push(i);
    }
    let bullishDiv=false, bearishDiv=false;
    if (dips.length>=2) {
      const d1=dips[dips.length-1], d2=dips[dips.length-2];
      bullishDiv=recentLow[d1]<recentLow[d2]&&recentRSI[d1]>recentRSI[d2];
    }
    if (peaks.length>=2) {
      const p1=peaks[peaks.length-1], p2=peaks[peaks.length-2];
      bearishDiv=recentHigh[p1]>recentHigh[p2]&&recentRSI[p1]<recentRSI[p2];
    }
    return { bullish:bullishDiv, bearish:bearishDiv };
  }

  static calculateATR(highs, lows, closes, period=14) {
    const trList=[];
    for (let i=1; i<closes.length; i++) {
      const h=highs[i], l=lows[i], pc=closes[i-1];
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

  // ── ANA ANALİZ — 6 KOŞUL + GÜÇLENDİRİLMİŞ İCHİMOKU ─────
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

    // ── İNDİKATÖRLER ─────────────────────────────────────
    const rsiPeriod = parseInt(settings.rsi_period||14);
    const rsi       = this.calculateRSI(closes, rsiPeriod);
    const macd      = this.calculateMACD(closes);
    const ichimoku  = this.calculateIchimoku(highs, lows, closes);
    const divergence= this.calculateRSIDivergence(closes, lows, highs, rsiPeriod, 25);
    const atr       = this.calculateATR(highs, lows, closes, 14);
    const atrPct    = (atr/price)*100;

    // EMA'lar
    const ema5  = this.calculateEMA(closes, 5);
    const ema10 = this.calculateEMA(closes, 10);
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, Math.min(50, closes.length));

    // Hacim
    const len    = volumes.length;
    const avg20  = volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
    const sonVol = volumes[len-1];
    const hacimOran = avg20>0 ? sonVol/avg20 : 0;

    // Alım/Satış hacim oranı
    let alimVol=0, satisVol=0;
    for (let i=len-5; i<len; i++) {
      if (i>0&&closes[i]>=closes[i-1]) alimVol+=volumes[i];
      else if (i>0) satisVol+=volumes[i];
    }
    const toplamVol=alimVol+satisVol;
    const alimOran=toplamVol>0?(alimVol/toplamVol)*100:50;

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

    // ── İCHİMOKU KONTROL ─────────────────────────────────
    const ichimokuLong  = this.ichimokuLongKontrol(ichimoku, rsi);
    const ichimokuShort = this.ichimokuShortKontrol(ichimoku, rsi);

    // ── 6 LONG KOŞULU ────────────────────────────────────
    const longKosullar = {
      k1_rsi:       rsi < 50,                           // RSI satım tarafında
      k2_macd:      macd.bullish || macd.crossover,     // MACD pozitif
      k3_hacim:     hacimOran >= 1.3,                   // Hacim artışı
      k4_destek:    pozisyon < 45,                      // Destek bölgesi
      k5_ichimoku:  ichimokuLong.gecti,                 // Ichimoku long (3/5)
      k6_momentum:  ema5 > ema10 && roc1 > 0            // EMA + momentum
    };

    // ── 6 SHORT KOŞULU ───────────────────────────────────
    const shortKosullar = {
      k1_rsi:       rsi > 52,                           // RSI alım tarafında
      k2_macd:      macd.bearish || macd.crossunder,    // MACD negatif
      k3_hacim:     hacimOran >= 1.3,                   // Hacim artışı
      k4_direnc:    pozisyon > 55,                      // Direnç bölgesi
      k5_ichimoku:  ichimokuShort.gecti,                // Ichimoku short (3/5)
      k6_momentum:  ema5 < ema10 && roc1 < 0            // EMA + momentum
    };

    const longTutulan  = Object.values(longKosullar).filter(Boolean).length;
    const shortTutulan = Object.values(shortKosullar).filter(Boolean).length;

    const isLong  = longTutulan  === 6;
    const isShort = shortTutulan === 6;

    // Skor
    let score = 0;
    if (isLong) {
      score = 50 + longTutulan * 5;
      if (ichimokuLong.guclu)    score += 10;
      if (divergence.bullish)    score += 10;
      if (macd.crossover)        score += 5;
      score = Math.min(100, score);
    }
    if (isShort) {
      score = -(50 + shortTutulan * 5);
      if (ichimokuShort.guclu)   score -= 10;
      if (divergence.bearish)    score -= 10;
      if (macd.crossunder)       score -= 5;
      score = Math.max(-100, score);
    }

    let signal = 'BEKLE';
    if (isLong)  signal = 'ALIM';
    if (isShort) signal = 'SATIS';

    const risk = isLong||isShort ? (ichimokuLong.guclu||ichimokuShort.guclu ? 'DUSUK' : 'ORTA') : 'YUKSEK';

    const komisyon  = parseFloat(settings.commission_rate||0.1);
    const slippage  = parseFloat(settings.slippage_rate||0.05);
    const minNetKar = (komisyon+slippage)*2+parseFloat(settings.min_profit_percent||1.0);
    const stopLossPct = parseFloat(settings.stop_loss_percent||2.0);
    const hedefFiyat = parseFloat((price*(1+minNetKar/100)).toFixed(8));
    const stopFiyat  = parseFloat((price*(1-stopLossPct/100)).toFixed(8));

    const positive=[], negative=[];

    if (isLong) {
      positive.push(`✅ 6/6 LONG koşulu tuttu`);
      if (longKosullar.k1_rsi)      positive.push(`📊 RSI(${rsi}) < 50`);
      if (longKosullar.k2_macd)     positive.push(macd.crossover?'🚀 MACD Cross↑':'📈 MACD pozitif');
      if (longKosullar.k3_hacim)    positive.push(`💧 Hacim ${hacimOran.toFixed(1)}x`);
      if (longKosullar.k4_destek)   positive.push(`📍 Destek %${pozisyon.toFixed(0)}`);
      positive.push(...ichimokuLong.detay.filter(d=>d.startsWith('✅')));
      if (longKosullar.k6_momentum) positive.push(`📈 Momentum +${roc1.toFixed(2)}%`);
      if (divergence.bullish)        positive.push('🔀 Bullish diverjans');
      if (ichimokuLong.guclu)        positive.push('💪 Ichimoku güçlü long');
    }

    if (isShort) {
      negative.push(`⚠️ 6/6 SHORT koşulu tuttu`);
      if (shortKosullar.k1_rsi)      negative.push(`📊 RSI(${rsi}) > 52`);
      if (shortKosullar.k2_macd)     negative.push(macd.crossunder?'💀 MACD Cross↓':'📉 MACD negatif');
      if (shortKosullar.k3_hacim)    negative.push(`💧 Hacim ${hacimOran.toFixed(1)}x`);
      if (shortKosullar.k4_direnc)   negative.push(`📍 Direnç %${pozisyon.toFixed(0)}`);
      negative.push(...ichimokuShort.detay.filter(d=>d.startsWith('✅')));
      if (shortKosullar.k6_momentum) negative.push(`📉 Momentum ${roc1.toFixed(2)}%`);
      if (divergence.bearish)         negative.push('🔀 Bearish diverjans');
      if (ichimokuShort.guclu)        negative.push('💪 Ichimoku güçlü short');
    }

    // Tutulmayan koşullar — debug için
    if (!isLong && !isShort) {
      if (longTutulan >= shortTutulan) {
        const eksik = Object.entries(longKosullar).filter(([,v])=>!v).map(([k])=>k);
        negative.push(`Long: ${longTutulan}/6 (eksik: ${eksik.join(', ')})`);
        if (ichimoku && !ichimokuLong.gecti) {
          negative.push(`Ichimoku: ${ichimokuLong.puan}/5`);
        }
      } else {
        const eksik = Object.entries(shortKosullar).filter(([,v])=>!v).map(([k])=>k);
        negative.push(`Short: ${shortTutulan}/6 (eksik: ${eksik.join(', ')})`);
        if (ichimoku && !ichimokuShort.gecti) {
          negative.push(`Ichimoku: ${ichimokuShort.puan}/5`);
        }
      }
    }

    return {
      symbol: ticker.symbol, price,
      change24h: parseFloat(ticker.priceChangePercent||0),
      volume24h: vol24h, signal, score, risk, rsi,
      momentum: roc1,
      longTutulan, shortTutulan,
      longKosullar, shortKosullar,
      ichimokuLongPuan:  ichimokuLong.puan,
      ichimokuShortPuan: ichimokuShort.puan,
      ichimokuLongGuclu:  ichimokuLong.guclu,
      ichimokuShortGuclu: ichimokuShort.guclu,
      ichimokuDetayLong:  ichimokuLong.detay,
      ichimokuDetayShort: ichimokuShort.detay,
      macdCrossover: macd.crossover, macdCrossunder: macd.crossunder,
      macdBullish: macd.bullish, macdBearish: macd.bearish,
      ichimokuAbove: ichimoku?.aboveCloud||false,
      ichimokuBelow: ichimoku?.belowCloud||false,
      ichimokuTKBull: ichimoku?.tkBull||false,
      ichimokuTKBear: ichimoku?.tkBear||false,
      ichimokuChikouBull: ichimoku?.chikouBull||false,
      ichimokuChikouBear: ichimoku?.chikouBear||false,
      ichimokuKumoBull: ichimoku?.kumoBull||false,
      ichimokuKumoBear: ichimoku?.kumoBear||false,
      ichimokuKalinlik: ichimoku?.kumoKalinlik||0,
      rsiDivBull: divergence.bullish, rsiDivBear: divergence.bearish,
      hacimOran: parseFloat(hacimOran.toFixed(2)),
      alimOran: parseFloat(alimOran.toFixed(1)),
      srPozisyon: parseFloat(pozisyon.toFixed(1)),
      riskOdul: parseFloat(riskOdul.toFixed(2)),
      atr: parseFloat(atr.toFixed(8)), atrPct: parseFloat(atrPct.toFixed(3)),
      ema5, ema10, ema20, ema50,
      target: hedefFiyat, stopLoss: stopFiyat, minNetKar,
      positive: positive.filter(Boolean),
      negative: negative.filter(Boolean)
    };
  }
}

module.exports = TechnicalAnalysis;
