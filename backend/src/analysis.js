// v19 - Profesyonel 6 Aşama + Sinyal Gücü Sistemi
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
    if (closes.length < slow + signal + 1) return { macd:0, signal:0, histogram:0, crossover:false, crossunder:false, bullish:false, bearish:false, aboveZero:false, belowZero:false };
    const kf=2/(fast+1), ks=2/(slow+1), kg=2/(signal+1);
    let ef=closes.slice(0,fast).reduce((a,b)=>a+b,0)/fast;
    let es=closes.slice(0,slow).reduce((a,b)=>a+b,0)/slow;
    const ml=[];
    for (let i=slow; i<closes.length; i++) {
      ef=closes[i]*kf+ef*(1-kf); es=closes[i]*ks+es*(1-ks); ml.push(ef-es);
    }
    if (ml.length<signal+1) return { macd:0, signal:0, histogram:0, crossover:false, crossunder:false, bullish:false, bearish:false, aboveZero:false, belowZero:false };
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
      bullish: cm>cs, bearish: cm<cs,
      aboveZero: cm>0, belowZero: cm<0
    };
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
    const yakinUst = !aboveCloud && (kumoUpper-price)/price*100 <= 2;
    const yakinAlt = !belowCloud && (price-kumoLower)/price*100 <= 2;
    return {
      tenkan, kijun, spanA, spanB, kumoUpper, kumoLower, kumoKalinlik,
      aboveCloud, belowCloud, insideCloud: !aboveCloud&&!belowCloud,
      bulutUzaklik, yakinUst, yakinAlt,
      tkBull: tenkan>kijun, tkBear: tenkan<kijun,
      chikouBull: price>chikouRef, chikouBear: price<chikouRef,
      kumoBull: spanA>spanB, kumoBear: spanA<spanB,
      price, chikouRef
    };
  }

  static calculateRSIDivergence(closes, lows, highs, period=14, lookback=30) {
    if (closes.length<lookback+period) return { bullish:false, bearish:false, bullishStrength:0, bearishStrength:0 };
    const slice=closes.slice(-lookback-period);
    const rsiSeries=[];
    for (let i=period; i<=slice.length; i++) rsiSeries.push(this.calculateRSI(slice.slice(0,i),period));
    const recentRSI=rsiSeries.slice(-lookback);
    const recentLow=lows.slice(-lookback), recentHigh=highs.slice(-lookback);
    const dips=[], peaks=[];
    for (let i=2; i<lookback-2; i++) {
      if (recentLow[i]<recentLow[i-1]&&recentLow[i]<recentLow[i+1]&&
          recentLow[i]<recentLow[i-2]&&recentLow[i]<recentLow[i+2]) dips.push(i);
      if (recentHigh[i]>recentHigh[i-1]&&recentHigh[i]>recentHigh[i+1]&&
          recentHigh[i]>recentHigh[i-2]&&recentHigh[i]>recentHigh[i+2]) peaks.push(i);
    }
    let bullishDiv=false, bearishDiv=false, bullishStrength=0, bearishStrength=0;
    if (dips.length>=2) {
      const d1=dips[dips.length-1], d2=dips[dips.length-2];
      if (recentLow[d1]<recentLow[d2]&&recentRSI[d1]>recentRSI[d2]) {
        bullishDiv=true;
        bullishStrength=parseFloat(((recentLow[d2]-recentLow[d1])/recentLow[d2]*100+(recentRSI[d1]-recentRSI[d2])/10).toFixed(2));
      }
    }
    if (peaks.length>=2) {
      const p1=peaks[peaks.length-1], p2=peaks[peaks.length-2];
      if (recentHigh[p1]>recentHigh[p2]&&recentRSI[p1]<recentRSI[p2]) {
        bearishDiv=true;
        bearishStrength=parseFloat(((recentHigh[p1]-recentHigh[p2])/recentHigh[p2]*100+(recentRSI[p2]-recentRSI[p1])/10).toFixed(2));
      }
    }
    return { bullish:bullishDiv, bearish:bearishDiv, bullishStrength, bearishStrength };
  }

  static volatiliteKontrol(highs, lows, closes, period=14) {
    const atr    = this.calculateATR(highs, lows, closes, period);
    const atrLong= this.calculateATR(highs, lows, closes, Math.min(50,closes.length));
    const atrOrani = atrLong>0 ? atr/atrLong : 1;
    const sonGovde = Math.abs(closes[closes.length-1]-closes[closes.length-2]);
    const govdeATROrani = atr>0 ? sonGovde/atr : 0;
    return {
      atr, atrOrani: parseFloat(atrOrani.toFixed(2)),
      asiriVolatil: atrOrani>3.0,
      normalMum: govdeATROrani>=0.2&&govdeATROrani<=1.8,
      govdeATROrani: parseFloat(govdeATROrani.toFixed(2))
    };
  }

  static halsizYukselis(closes, highs, lows, atr, lookback=3) {
    const len=closes.length;
    if (len<lookback+1) return false;
    const govdeler=[];
    for (let i=len-lookback; i<len; i++) govdeler.push(Math.abs(closes[i]-closes[i-1]));
    const kuculuyor=govdeler[govdeler.length-1]<govdeler[0];
    const kucukMum=atr>0&&govdeler[govdeler.length-1]<atr*0.3;
    return kuculuyor||kucukMum;
  }

  static destekDirenc(closes, highs, lows, lookback=20) {
    const price=closes[closes.length-1];
    const resistance=Math.max(...highs.slice(-lookback));
    const support=Math.min(...lows.slice(-lookback));
    const range=resistance-support;
    const pozisyon=range>0?(price-support)/range*100:50;
    const destekYakini=range>0&&(price-support)/price*100<=3;
    const direncYakini=range>0&&(resistance-price)/price*100<=3;
    const riskOdul=range>0?(resistance-price)/(price-support||1):1;
    return { resistance, support, range, pozisyon, destekYakini, direncYakini, riskOdul };
  }

  static hacimAnaliz(closes, volumes) {
    const len=volumes.length;
    if (len<20) return { oran:0, gecerli:false, alimOran:50, spike:false, trend:false, yuksekHacimKirmizi:false, yuksekHacimYesil:false };
    const avg20=volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
    const avg5 =volumes.slice(-6,-1).reduce((a,b)=>a+b,0)/5;
    const sonVol=volumes[len-1];
    const oran=avg20>0?sonVol/avg20:0;
    const trend=avg5>avg20*1.1;
    let alimVol=0, satisVol=0;
    for (let i=len-5; i<len; i++) {
      if (i>0&&closes[i]>=closes[i-1]) alimVol+=volumes[i];
      else if (i>0) satisVol+=volumes[i];
    }
    const toplam=alimVol+satisVol;
    const alimOran=toplam>0?(alimVol/toplam)*100:50;
    const sonMumKirmizi=closes[len-1]<closes[len-2];
    return {
      oran: parseFloat(oran.toFixed(2)), gecerli:len>=20,
      alimOran: parseFloat(alimOran.toFixed(1)),
      spike: oran>=1.5, trend,
      yuksekHacimKirmizi: sonMumKirmizi&&oran>=1.2,
      yuksekHacimYesil:   !sonMumKirmizi&&oran>=1.2
    };
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
    return { trend, puan, guclu, ema10, ema20, ema50, ema200, adx:adx.adx, diPlus:adx.diPlus, diMinus:adx.diMinus, rsi:rsi14 };
  }

  static analyze1H(candles) { return this.analyzeTF(candles); }
  static analyze4H(candles) { return this.analyzeTF(candles); }
  static analyze1D(candles) { return this.analyzeTF(candles); }

  // ── 4H SETUP ANALİZİ ─────────────────────────────────────
  static analyze4HSetup(candles4H, candles1D, ticker, settings={}) {
    if (!candles4H||candles4H.length<52) return null;

    const closes  = candles4H.map(c=>parseFloat(c[4]));
    const highs   = candles4H.map(c=>parseFloat(c[2]));
    const lows    = candles4H.map(c=>parseFloat(c[3]));
    const volumes = candles4H.map(c=>parseFloat(c[5]));
    const opens   = candles4H.map(c=>parseFloat(c[1]));
    const price   = closes[closes.length-1];

    const rsi        = this.calculateRSI(closes, 14);
    const macd       = this.calculateMACD(closes);
    const ichimoku   = this.calculateIchimoku(highs, lows, closes);
    const divergence = this.calculateRSIDivergence(closes, lows, highs, 14, 30);
    const volatilite = this.volatiliteKontrol(highs, lows, closes);
    const hacim      = this.hacimAnaliz(closes, volumes);
    const sr         = this.destekDirenc(closes, highs, lows, parseInt(settings.sr_lookback||20));
    const ema5       = this.calculateEMA(closes, 5);
    const ema10      = this.calculateEMA(closes, 10);
    const ema20      = this.calculateEMA(closes, 20);

    // 1D trend
    let trend1D = { trend:'BELIRSIZ', guclu:false };
    if (candles1D&&candles1D.length>=50) trend1D=this.analyze1D(candles1D);

    // 4H trend
    const trend4H = this.analyzeTF(candles4H);

    // Aşırı volatilite → dur
    if (volatilite.asiriVolatil) return { symbol:ticker.symbol, signal:'BEKLE', setup:'BEKLE', reason:'Aşırı volatilite' };

    // ── 6 LONG KOŞULU ────────────────────────────────────
    const longSetup = {
      // A1: 1D trend engel değil
      a1_trend1D: !['ASAGI'].includes(trend1D.trend),

      // A2: Zemin — bulut altı/içi/yakını + destek yakını
      a2_zemin: ichimoku && (ichimoku.belowCloud||ichimoku.insideCloud||ichimoku.yakinAlt) && sr.destekYakini,

      // A3: RSI aşırı satım (22-42)
      a3_rsi: rsi>=22&&rsi<=42,

      // A4: Pozitif RSI diverjansı — ZORUNLU filtre
      a4_diverjans: divergence.bullish,

      // A5: Hacim onayı — gevşetildi
      a5_hacim: hacim.oran>=0.8 || hacim.trend || hacim.alimOran>60,

      // A6: MACD — bearish crossunder yok
      a6_macd: !macd.crossunder
    };

    // ── 6 SHORT KOŞULU ───────────────────────────────────
    const shortSetup = {
      // B1: 1D trend engel değil
      b1_trend1D: !['YUKARI'].includes(trend1D.trend)||!trend1D.guclu,

      // B2: Tavan — bulut üstü + direnç yakını
      b2_tavan: ichimoku&&ichimoku.aboveCloud&&sr.direncYakini,

      // B3: RSI aşırı alım (65-85)
      b3_rsi: rsi>=65&&rsi<=85,

      // B4: Negatif RSI diverjansı — ZORUNLU filtre
      b4_diverjans: divergence.bearish,

      // B5: Hacim onayı — gevşetildi
      b5_hacim: hacim.oran>=0.8||hacim.trend||hacim.alimOran<40,

      // B6: MACD — bullish crossover yok
      b6_macd: !macd.crossover
    };

    const longTutulan  = Object.values(longSetup).filter(Boolean).length;
    const shortTutulan = Object.values(shortSetup).filter(Boolean).length;

    // ── SİNYAL GÜCÜ ──────────────────────────────────────
    // 6/6 → Güçlü | 5/6+div → Normal | 4/6+div → Zayıf
    let longSinyal='YOK', shortSinyal='YOK';

    if      (longTutulan===6)                             longSinyal='GUCLU';
    else if (longTutulan===5&&longSetup.a4_diverjans)     longSinyal='NORMAL';
    else if (longTutulan===4&&longSetup.a4_diverjans)     longSinyal='ZAYIF';

    if      (shortTutulan===6)                            shortSinyal='GUCLU';
    else if (shortTutulan===5&&shortSetup.b4_diverjans)   shortSinyal='NORMAL';
    else if (shortTutulan===4&&shortSetup.b4_diverjans)   shortSinyal='ZAYIF';

    const isLongAday  = longSinyal  !== 'YOK';
    const isShortAday = shortSinyal !== 'YOK';

    let setup='BEKLE';
    if      (isLongAday&&isShortAday) setup=longTutulan>=shortTutulan?'LONG_ADAY':'SHORT_ADAY';
    else if (isLongAday)              setup='LONG_ADAY';
    else if (isShortAday)             setup='SHORT_ADAY';

    return {
      symbol:ticker.symbol, price, rsi, setup,
      longSinyal, shortSinyal,
      longTutulan, shortTutulan,
      longSetup, shortSetup,
      trend4H:trend4H.trend, trend1D:trend1D.trend,
      ichimokuAbove:ichimoku?.aboveCloud||false,
      ichimokuBelow:ichimoku?.belowCloud||false,
      ichimokuKalinlik:ichimoku?.kumoKalinlik||0,
      macdCrossover:macd.crossover, macdCrossunder:macd.crossunder,
      macdBullish:macd.bullish, macdBearish:macd.bearish,
      divergenceBull:divergence.bullish, divergenceBear:divergence.bearish,
      divergenceBullStr:divergence.bullishStrength, divergenceBearStr:divergence.bearishStrength,
      hacimOran:hacim.oran, alimOran:hacim.alimOran,
      sr, volatilite, ema5, ema10, ema20,
      atr:volatilite.atr
    };
  }

  // ── 1H GİRİŞ ZAMANLAMASI ─────────────────────────────────
  static analyze1HTiming(candles1H, setup4H, settings={}) {
    if (!candles1H||candles1H.length<52||!setup4H) return null;
    if (setup4H.setup==='BEKLE') return null;

    const closes  = candles1H.map(c=>parseFloat(c[4]));
    const highs   = candles1H.map(c=>parseFloat(c[2]));
    const lows    = candles1H.map(c=>parseFloat(c[3]));
    const volumes = candles1H.map(c=>parseFloat(c[5]));
    const opens   = candles1H.map(c=>parseFloat(c[1]));
    const price   = closes[closes.length-1];

    const rsi1H   = this.calculateRSI(closes, 14);
    const macd1H  = this.calculateMACD(closes);
    const trend1H = this.analyzeTF(candles1H);
    const hacim1H = this.hacimAnaliz(closes, volumes);
    const vol1H   = this.volatiliteKontrol(highs, lows, closes);

    const sonMumYesil  = closes[closes.length-1]>opens[closes.length-1];
    const sonMumKirmizi= closes[closes.length-1]<opens[closes.length-1];
    const normalMum    = vol1H.normalMum;

    let signal='BEKLE', score=0;
    const reasons=[];

    if (setup4H.setup==='LONG_ADAY') {
      const girisOK = macd1H.crossover &&
                      !['ASAGI'].includes(trend1H.trend) &&
                      sonMumYesil &&
                      normalMum;
      if (girisOK) {
        signal='ALIM'; score=70;
        if (macd1H.belowZero)     { score+=10; reasons.push('🚀 MACD sıfır altı cross↑'); }
        else                      { reasons.push('📈 MACD Cross↑'); }
        if (rsi1H<50)             { score+=5;  reasons.push(`📊 RSI(${rsi1H})<50`); }
        if (hacim1H.spike)        { score+=5;  reasons.push(`💧 Hacim ${hacim1H.oran}x`); }
        if (setup4H.divergenceBull){ score+=10; reasons.push('🔀 Bullish Div'); }
        if (setup4H.longSinyal==='GUCLU')  { score+=10; reasons.push('💪 6/6 Güçlü'); }
        else if (setup4H.longSinyal==='NORMAL') { score+=5; reasons.push('📊 5/6 Normal'); }
        else                      { reasons.push('⚠️ 4/6 Zayıf'); }
        score=Math.min(100,score);
      } else {
        if (!macd1H.crossover)              reasons.push('MACD crossover bekleniyor');
        if (['ASAGI'].includes(trend1H.trend)) reasons.push(`1H ${trend1H.trend}`);
        if (!sonMumYesil)                   reasons.push('Yeşil mum bekleniyor');
        if (!normalMum)                     reasons.push(`Anormal mum(${vol1H.govdeATROrani}x ATR)`);
      }
    }

    else if (setup4H.setup==='SHORT_ADAY') {
      const girisOK = macd1H.crossunder &&
                      !['YUKARI'].includes(trend1H.trend) &&
                      sonMumKirmizi &&
                      normalMum;
      if (girisOK) {
        signal='SATIS'; score=-70;
        if (macd1H.aboveZero)      { score-=10; reasons.push('💀 MACD sıfır üstü cross↓'); }
        else                       { reasons.push('📉 MACD Cross↓'); }
        if (rsi1H>55)              { score-=5;  reasons.push(`📊 RSI(${rsi1H})>55`); }
        if (hacim1H.yuksekHacimKirmizi) { score-=5; reasons.push(`💧 Hacim ${hacim1H.oran}x kırmızı`); }
        if (setup4H.divergenceBear){ score-=10; reasons.push('🔀 Bearish Div'); }
        if (setup4H.shortSinyal==='GUCLU')  { score-=10; reasons.push('💪 6/6 Güçlü'); }
        else if (setup4H.shortSinyal==='NORMAL') { score-=5; reasons.push('📊 5/6 Normal'); }
        else                       { reasons.push('⚠️ 4/6 Zayıf'); }
        score=Math.max(-100,score);
      } else {
        if (!macd1H.crossunder)               reasons.push('MACD crossunder bekleniyor');
        if (['YUKARI'].includes(trend1H.trend)) reasons.push(`1H ${trend1H.trend}`);
        if (!sonMumKirmizi)                   reasons.push('Kırmızı mum bekleniyor');
        if (!normalMum)                       reasons.push(`Anormal mum(${vol1H.govdeATROrani}x ATR)`);
      }
    }

    const risk=Math.abs(score)>=85?'DUSUK':Math.abs(score)>=70?'ORTA':'YUKSEK';
    const komisyon   = parseFloat(settings.commission_rate||0.1);
    const slippage   = parseFloat(settings.slippage_rate||0.05);
    const minNetKar  = (komisyon+slippage)*2+parseFloat(settings.min_profit_percent||1.0);
    const stopLossPct= parseFloat(settings.stop_loss_percent||2.0);
    const atr1H      = vol1H.atr;
    const stopLoss   = signal==='ALIM'
      ? Math.max(parseFloat((price-atr1H*1.5).toFixed(8)), parseFloat((price*(1-stopLossPct/100)).toFixed(8)))
      : Math.min(parseFloat((price+atr1H*1.5).toFixed(8)), parseFloat((price*(1+stopLossPct/100)).toFixed(8)));
    const hedefFiyat = parseFloat((price*(1+minNetKar/100)).toFixed(8));

    return {
      symbol:setup4H.symbol, price, signal, score, risk,
      rsi1H, trend1H:trend1H.trend,
      macdCrossover:macd1H.crossover, macdCrossunder:macd1H.crossunder,
      macdBullish:macd1H.bullish, macdBearish:macd1H.bearish,
      macdAboveZero:macd1H.aboveZero, macdBelowZero:macd1H.belowZero,
      hacimOran:hacim1H.oran, alimOran:hacim1H.alimOran,
      atr1H, stopLoss, target:hedefFiyat,
      setup4H:setup4H.setup,
      longSinyal:setup4H.longSinyal, shortSinyal:setup4H.shortSinyal,
      trend4H:setup4H.trend4H, trend1D:setup4H.trend1D,
      longTutulan:setup4H.longTutulan, shortTutulan:setup4H.shortTutulan,
      divergenceBull:setup4H.divergenceBull, divergenceBear:setup4H.divergenceBear,
      ichimokuAbove:setup4H.ichimokuAbove, ichimokuBelow:setup4H.ichimokuBelow,
      reasons,
      positive:signal==='ALIM'?reasons:[],
      negative:signal==='SATIS'?reasons:[]
    };
  }

  // ── GERİYE DÖNÜK UYUMLULUK ───────────────────────────────
  static analyze(candles, ticker, settings={}) {
    if (!candles||candles.length<52) return null;
    const closes  = candles.map(c=>parseFloat(c[4]));
    const highs   = candles.map(c=>parseFloat(c[2]));
    const lows    = candles.map(c=>parseFloat(c[3]));
    const volumes = candles.map(c=>parseFloat(c[5]));
    const price   = closes[closes.length-1];
    const rsi     = this.calculateRSI(closes,14);
    const macd    = this.calculateMACD(closes);
    const hacim   = this.hacimAnaliz(closes,volumes);
    const vol     = this.volatiliteKontrol(highs,lows,closes);
    const sr      = this.destekDirenc(closes,highs,lows,20);
    const div     = this.calculateRSIDivergence(closes,lows,highs,14,30);
    const ich     = this.calculateIchimoku(highs,lows,closes);
    const komisyon  = parseFloat(settings.commission_rate||0.1);
    const slippage  = parseFloat(settings.slippage_rate||0.05);
    const minNetKar = (komisyon+slippage)*2+parseFloat(settings.min_profit_percent||1.0);
    const hedefFiyat= parseFloat((price*(1+minNetKar/100)).toFixed(8));
    const stopFiyat = parseFloat((price*(1-parseFloat(settings.stop_loss_percent||2)/100)).toFixed(8));
    const longOK  = rsi<42&&(macd.bullish||macd.crossover)&&hacim.oran>=0.8&&sr.destekYakini&&ich&&(ich.belowCloud||ich.insideCloud)&&div.bullish;
    const shortOK = rsi>65&&(macd.bearish||macd.crossunder)&&hacim.oran>=0.8&&sr.direncYakini&&ich&&ich.aboveCloud&&div.bearish;
    let signal='BEKLE', score=0;
    if (longOK)  { signal='ALIM';  score=75; }
    if (shortOK) { signal='SATIS'; score=-75; }
    return {
      symbol:ticker.symbol, price, signal, score, risk:'ORTA', rsi,
      longSkor:longOK?75:0, shortSkor:shortOK?75:0, momentum:0,
      macdCrossover:macd.crossover, macdCrossunder:macd.crossunder,
      macdBullish:macd.bullish, macdBearish:macd.bearish,
      ichimokuAbove:ich?.aboveCloud||false, ichimokuBelow:ich?.belowCloud||false,
      rsiDivBull:div.bullish, rsiDivBear:div.bearish,
      hacimOran:hacim.oran, alimOran:hacim.alimOran,
      srPozisyon:sr.pozisyon, riskOdul:sr.riskOdul,
      atr:vol.atr, atrPct:vol.atr/price*100,
      target:hedefFiyat, stopLoss:stopFiyat, minNetKar,
      positive:signal==='ALIM'?['✅ LONG sinyal']:[],
      negative:signal==='SATIS'?['⚠️ SHORT sinyal']:[]
    };
  }
}

module.exports = TechnicalAnalysis;
