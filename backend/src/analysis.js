// v17 - 4/6 minimum + 4H konfirmasyon
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

  static ichimokuLongKontrol(ichimoku, rsi) {
    if (!ichimoku) return { gecti:false, puan:0, guclu:false, detay:[] };
    const k = [
      { isim:'Bulut üstü',    gecti:ichimoku.aboveCloud,  guclu:ichimoku.aboveCloud&&ichimoku.bulutUzaklik>0.5 },
      { isim:'Tenkan>Kijun',  gecti:ichimoku.tkBull,       guclu:ichimoku.tkBull&&(ichimoku.tenkan-ichimoku.kijun)/ichimoku.kijun*100>0.2 },
      { isim:'Chikou+',       gecti:ichimoku.chikouBull,   guclu:ichimoku.chikouBull },
      { isim:'Kumo yeşil',    gecti:ichimoku.kumoBull,     guclu:ichimoku.kumoBull&&ichimoku.kumoKalinlik>0.3 },
      { isim:`RSI(${rsi})`,   gecti:rsi>=25&&rsi<=72,      guclu:rsi>=30&&rsi<=65 }
    ];
    const gec=k.filter(x=>x.gecti).length, guc=k.filter(x=>x.guclu).length;
    return { gecti:gec>=3, guclu:gec>=4||guc>=3, puan:gec, detay:k.map(x=>`${x.gecti?'✅':'❌'}${x.isim}`) };
  }

  static ichimokuShortKontrol(ichimoku, rsi) {
    if (!ichimoku) return { gecti:false, puan:0, guclu:false, detay:[] };
    const k = [
      { isim:'Bulut altı',    gecti:ichimoku.belowCloud,  guclu:ichimoku.belowCloud&&ichimoku.bulutUzaklik>0.5 },
      { isim:'Tenkan<Kijun',  gecti:ichimoku.tkBear,       guclu:ichimoku.tkBear&&(ichimoku.kijun-ichimoku.tenkan)/ichimoku.kijun*100>0.2 },
      { isim:'Chikou-',       gecti:ichimoku.chikouBear,   guclu:ichimoku.chikouBear },
      { isim:'Kumo kırmızı',  gecti:ichimoku.kumoBear,     guclu:ichimoku.kumoBear&&ichimoku.kumoKalinlik>0.3 },
      { isim:`RSI(${rsi})`,   gecti:rsi>=28&&rsi<=68,      guclu:rsi>=35&&rsi<=62 }
    ];
    const gec=k.filter(x=>x.gecti).length, guc=k.filter(x=>x.guclu).length;
    return { gecti:gec>=3, guclu:gec>=4||guc>=3, puan:gec, detay:k.map(x=>`${x.gecti?'✅':'❌'}${x.isim}`) };
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

  // ── ANA ANALİZ — 4/6 MİNİMUM + AĞIRLIKLI SKOR ───────────
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

    // Ichimoku kontroller
    const ichimokuLong  = this.ichimokuLongKontrol(ichimoku, rsi);
    const ichimokuShort = this.ichimokuShortKontrol(ichimoku, rsi);

    // ── 6 LONG KOŞULU ────────────────────────────────────
    const longK = {
      k1_rsi:      rsi < 52,
      k2_macd:     macd.bullish || macd.crossover,
      k3_hacim:    hacimOran >= 1.0 || hacimTrend,
      k4_destek:   pozisyon < 55,
      k5_ichimoku: ichimokuLong.gecti,
      k6_momentum: ema5 > ema10 && roc1 > 0
    };

    // ── 6 SHORT KOŞULU ───────────────────────────────────
    const shortK = {
      k1_rsi:      rsi > 50,
      k2_macd:     macd.bearish || macd.crossunder,
      k3_hacim:    hacimOran >= 1.0 || hacimTrend,
      k4_direnc:   pozisyon > 45,
      k5_ichimoku: ichimokuShort.gecti,
      k6_momentum: ema5 < ema10 && roc1 < 0
    };

    const longTutulan  = Object.values(longK).filter(Boolean).length;
    const shortTutulan = Object.values(shortK).filter(Boolean).length;

    // ── SİNYAL KARAR MEKANİZMASI ─────────────────────────
    // 6/6 → çok güçlü
    // 5/6 → güçlü
    // 4/6 → orta (minimum)
    // 3/6 veya altı → sinyal yok

    const LONG_MIN  = 4;
    const SHORT_MIN = 4;

    // Ichimoku şart — en az 3/5 tutmalı
    const longIchimokuOK  = ichimokuLong.puan  >= 3;
    const shortIchimokuOK = ichimokuShort.puan >= 3;

    const isLong  = longTutulan  >= LONG_MIN  && longIchimokuOK;
    const isShort = shortTutulan >= SHORT_MIN && shortIchimokuOK;

    // Çakışma varsa daha güçlü olanı seç
    let signal = 'BEKLE';
    if (isLong && isShort) {
      signal = longTutulan >= shortTutulan ? 'ALIM' : 'SATIS';
    } else if (isLong) {
      signal = 'ALIM';
    } else if (isShort) {
      signal = 'SATIS';
    }

    // ── SKOR HESAPLA ─────────────────────────────────────
    let score = 0;
    if (signal === 'ALIM') {
      // Baz skor: kaç koşul tuttu
      score = 30 + longTutulan * 10;
      // Ichimoku kalitesi
      if (ichimokuLong.guclu)    score += 10;
      else if (ichimokuLong.puan>=3) score += 5;
      // Bonus
      if (divergence.bullish)    score += 8;
      if (macd.crossover)        score += 7;
      if (hacimOran >= 2.0)      score += 5;
      if (rsi < 35)              score += 5;
      if (pozisyon < 20)         score += 5;
      score = Math.min(100, score);
    } else if (signal === 'SATIS') {
      score = -(30 + shortTutulan * 10);
      if (ichimokuShort.guclu)   score -= 10;
      else if (ichimokuShort.puan>=3) score -= 5;
      if (divergence.bearish)    score -= 8;
      if (macd.crossunder)       score -= 7;
      if (hacimOran >= 2.0)      score -= 5;
      if (rsi > 68)              score -= 5;
      if (pozisyon > 80)         score -= 5;
      score = Math.max(-100, score);
    }

    const risk = Math.abs(score)>=80?'DUSUK':Math.abs(score)>=60?'ORTA':'YUKSEK';

    const komisyon  = parseFloat(settings.commission_rate||0.1);
    const slippage  = parseFloat(settings.slippage_rate||0.05);
    const minNetKar = (komisyon+slippage)*2+parseFloat(settings.min_profit_percent||1.0);
    const stopLossPct = parseFloat(settings.stop_loss_percent||2.0);
    const hedefFiyat = parseFloat((price*(1+minNetKar/100)).toFixed(8));
    const stopFiyat  = parseFloat((price*(1-stopLossPct/100)).toFixed(8));

    const positive=[], negative=[];

    if (signal==='ALIM') {
      positive.push(`✅ ${longTutulan}/6 LONG koşulu`);
      if (longK.k1_rsi)      positive.push(`📊 RSI(${rsi})<52`);
      if (longK.k2_macd)     positive.push(macd.crossover?'🚀 MACD Cross↑':'📈 MACD+');
      if (longK.k3_hacim)    positive.push(`💧 Hacim ${hacimOran.toFixed(1)}x`);
      if (longK.k4_destek)   positive.push(`📍 SR:%${pozisyon.toFixed(0)}`);
      positive.push(`☁️ Ichimoku ${ichimokuLong.puan}/5${ichimokuLong.guclu?' 💪':''}`);
      if (longK.k6_momentum) positive.push(`📈 EMA↑ +${roc1.toFixed(2)}%`);
      if (divergence.bullish) positive.push('🔀 Bullish Div');
    } else if (signal==='SATIS') {
      negative.push(`⚠️ ${shortTutulan}/6 SHORT koşulu`);
      if (shortK.k1_rsi)      negative.push(`📊 RSI(${rsi})>50`);
      if (shortK.k2_macd)     negative.push(macd.crossunder?'💀 MACD Cross↓':'📉 MACD-');
      if (shortK.k3_hacim)    negative.push(`💧 Hacim ${hacimOran.toFixed(1)}x`);
      if (shortK.k4_direnc)   negative.push(`📍 SR:%${pozisyon.toFixed(0)}`);
      negative.push(`☁️ Ichimoku ${ichimokuShort.puan}/5${ichimokuShort.guclu?' 💪':''}`);
      if (shortK.k6_momentum) negative.push(`📉 EMA↓ ${roc1.toFixed(2)}%`);
      if (divergence.bearish)  negative.push('🔀 Bearish Div');
    } else {
      // Bekle — en yakın sinyali göster
      if (longTutulan >= shortTutulan) {
        const eksik=Object.entries(longK).filter(([,v])=>!v).map(([k])=>k);
        negative.push(`Long ${longTutulan}/6 Ichimoku:${ichimokuLong.puan}/5 (eksik:${eksik.join(',')})`);
      } else {
        const eksik=Object.entries(shortK).filter(([,v])=>!v).map(([k])=>k);
        negative.push(`Short ${shortTutulan}/6 Ichimoku:${ichimokuShort.puan}/5 (eksik:${eksik.join(',')})`);
      }
    }

    return {
      symbol:ticker.symbol, price,
      change24h:parseFloat(ticker.priceChangePercent||0),
      volume24h:vol24h, signal, score, risk, rsi,
      momentum:roc1,
      longTutulan, shortTutulan,
      longKosullar:longK, shortKosullar:shortK,
      ichimokuLongPuan:ichimokuLong.puan,
      ichimokuShortPuan:ichimokuShort.puan,
      ichimokuLongGuclu:ichimokuLong.guclu,
      ichimokuShortGuclu:ichimokuShort.guclu,
      ichimokuDetayLong:ichimokuLong.detay,
      ichimokuDetayShort:ichimokuShort.detay,
      macdCrossover:macd.crossover, macdCrossunder:macd.crossunder,
      macdBullish:macd.bullish, macdBearish:macd.bearish,
      ichimokuAbove:ichimoku?.aboveCloud||false,
      ichimokuBelow:ichimoku?.belowCloud||false,
      ichimokuTKBull:ichimoku?.tkBull||false,
      ichimokuTKBear:ichimoku?.tkBear||false,
      ichimokuChikouBull:ichimoku?.chikouBull||false,
      ichimokuChikouBear:ichimoku?.chikouBear||false,
      ichimokuKumoBull:ichimoku?.kumoBull||false,
      ichimokuKumoBear:ichimoku?.kumoBear||false,
      rsiDivBull:divergence.bullish, rsiDivBear:divergence.bearish,
      hacimOran:parseFloat(hacimOran.toFixed(2)),
      hacimTrend,
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
