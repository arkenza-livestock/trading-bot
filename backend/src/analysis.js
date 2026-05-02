class ProfessionalAnalysis {

  analyze(candles, ticker) {
    if (!candles || candles.length < 100) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const opens   = candles.map(c => parseFloat(c[1]));
    const fiyat   = closes[closes.length - 1];

    const rsi        = this.hesaplaRSI(closes, 14);
    const rsiOnceki  = this.hesaplaRSI(closes.slice(0,-1), 14);
    const rsiYon     = rsi > rsiOnceki ? 'YUKARI' : 'ASAGI';
    const rsiDivBull = this.rsiBullishDiv(closes);
    const rsiDivBear = this.rsiBearishDiv(closes);

    const stochRSI  = this.hesaplaStochRSI(closes);
    const stochK    = stochRSI.k;
    const stochD    = stochRSI.d;
    const stochBull = stochK > stochD && stochK < 20;
    const stochBear = stochK < stochD && stochK > 80;

    const williamsR     = this.hesaplaWilliamsR(highs, lows, closes, 14);
    const williamsAsirim = williamsR < -80;
    const williamsAlim  = williamsR < -80 && williamsR > this.hesaplaWilliamsR(
      highs.slice(0,-1), lows.slice(0,-1), closes.slice(0,-1), 14
    );

    const cci     = this.hesaplaCCI(highs, lows, closes, 20);
    const cciBull = cci > -100 && cci < 0;
    const cciBear = cci < 100  && cci > 0;

    const adx        = this.hesaplaADX(highs, lows, closes, 14);
    const trendGuclu = adx.adx > 25;
    const diPlus     = adx.diPlus;
    const diMinus    = adx.diMinus;
    const trendYon   = diPlus > diMinus ? 'YUKARI' : 'ASAGI';

    const ema9   = this.hesaplaEMA(closes, 9);
    const ema21  = this.hesaplaEMA(closes, 21);
    const ema50  = this.hesaplaEMA(closes, 50);
    const ema100 = this.hesaplaEMA(closes, 100);
    const ema200 = closes.length >= 200 ? this.hesaplaEMA(closes, 200) : null;

    const ema21Onceki  = this.hesaplaEMA(closes.slice(0,-1), 21);
    const ema50Onceki  = this.hesaplaEMA(closes.slice(0,-1), 50);
    const goldenCross  = ema21Onceki <= ema50Onceki && ema21 > ema50;
    const deathCross   = ema21Onceki >= ema50Onceki && ema21 < ema50;
    const emaBullAlign = fiyat > ema9 && ema9 > ema21 && ema21 > ema50;
    const emaBearAlign = fiyat < ema9 && ema9 < ema21 && ema21 < ema50;

    let trend = 'NOTR';
    if      (emaBullAlign)                   trend = 'GUCLU_YUKARI';
    else if (fiyat > ema21 && fiyat > ema50) trend = 'YUKARI';
    else if (emaBearAlign)                   trend = 'GUCLU_ASAGI';
    else if (fiyat < ema21 && fiyat < ema50) trend = 'ASAGI';

    const macd        = this.hesaplaMACD(closes);
    const macdLine    = macd.macdLine;
    const signalLine  = macd.signalLine;
    const macdHist    = macd.histogram;
    const macdBullish = macd.bullishCross;
    const macdBearish = macd.bearishCross;
    const macdBullDiv = macd.bullDiv;
    const macdBearDiv = macd.bearDiv;
    const macdZeroXup = macdLine > 0 && macd.prevMacd <= 0;

    const bb       = this.hesaplaBollinger(closes, 20, 2);
    const bPct     = bb.percent;
    const bWidth   = bb.width;
    const bSqueeze = bWidth < 2.0;

    const obv      = this.hesaplaOBV(closes, volumes);
    const obvTrend = obv.trend;
    const obvDiv   = obv.divergence;

    const cmf     = this.hesaplaCMF(highs, lows, closes, volumes, 20);
    const cmfBull = cmf > 0.1;
    const cmfBear = cmf < -0.1;

    const vwap     = this.hesaplaVWAP(highs, lows, closes, volumes);
    const vwapBull = fiyat > vwap;
    const vwapDist = (fiyat - vwap) / vwap * 100;

    const atr14   = this.hesaplaATR(highs, lows, closes, 14);
    const atrOran = atr14 / fiyat * 100;

    const vol20Ort = volumes.slice(-20,-1).reduce((a,b)=>a+b,0) / 19;
    const sonVol   = volumes[volumes.length-1];
    const volOran  = parseFloat((sonVol / vol20Ort).toFixed(2));
    const volSpike  = volOran > 2.0;
    const volYuksek = volOran > 1.5;
    const volDusuk  = volOran < 0.5;

    const son5 = candles.slice(-5);
    const alimVol  = son5.filter(c=>parseFloat(c[4])>parseFloat(c[1])).reduce((a,c)=>a+parseFloat(c[5]),0);
    const satisVol = son5.filter(c=>parseFloat(c[4])<parseFloat(c[1])).reduce((a,c)=>a+parseFloat(c[5]),0);
    const volBaskisi = alimVol > satisVol ? 'ALIM' : 'SATIS';
    const alimOrani  = alimVol+satisVol > 0 ? alimVol/(alimVol+satisVol)*100 : 50;

    const sr      = this.hesaplaSR(highs, lows, 50);
    const destek  = sr.destek;
    const direnc  = sr.direnc;
    const destekUzak    = (fiyat - destek) / fiyat * 100;
    const direncUzak    = (direnc - fiyat) / fiyat * 100;
    const direncKirildi = closes.slice(-3).some(c => c > direnc * 0.998);
    const destekKirildi = closes.slice(-3).some(c => c < destek * 1.002);

    const fib        = this.hesaplaFibonacci(highs, lows, 50);
    const fibDesteği = Math.abs(fiyat-fib.level382)/fiyat < 0.015 ||
                       Math.abs(fiyat-fib.level500)/fiyat < 0.015 ||
                       Math.abs(fiyat-fib.level618)/fiyat < 0.015;

    const mumlar = this.analizMumYapilari(candles);

    const son10H = highs.slice(-10);
    const son10L = lows.slice(-10);
    const hhCount = son10H.filter((h,i)=>i>0&&h>son10H[i-1]).length;
    const hlCount = son10L.filter((l,i)=>i>0&&l>son10L[i-1]).length;
    const yukselisTrendi = hhCount >= 5 && hlCount >= 5;
    const dususTrendi    = son10H.filter((h,i)=>i>0&&h<son10H[i-1]).length >= 5;

    let puan = 0;
    const pozitif = [];
    const negatif = [];

    if      (rsi < 20) { puan += 35; pozitif.push(`🔥 RSI Ekstrem Satım (${rsi.toFixed(1)})`); }
    else if (rsi < 25) { puan += 30; pozitif.push(`RSI Aşırı Satım (${rsi.toFixed(1)})`); }
    else if (rsi < 30) { puan += 25; pozitif.push(`RSI Güçlü Satım (${rsi.toFixed(1)})`); }
    else if (rsi < 35) { puan += 20; pozitif.push(`RSI Satım Bölgesi (${rsi.toFixed(1)})`); }
    else if (rsi < 45) { puan += 10; pozitif.push(`RSI Nötr-Pozitif (${rsi.toFixed(1)})`); }
    else if (rsi > 80) { puan -= 30; negatif.push(`RSI Aşırı Alım (${rsi.toFixed(1)})`); }
    else if (rsi > 70) { puan -= 15; negatif.push(`RSI Alım Bölgesi (${rsi.toFixed(1)})`); }
    if (rsiYon === 'YUKARI' && rsi < 55) { puan += 8; pozitif.push('RSI Yukarı Döndü'); }
    if (rsiDivBull) { puan += 20; pozitif.push('📈 RSI Bullish Divergence'); }
    if (rsiDivBear) { puan -= 20; negatif.push('📉 RSI Bearish Divergence'); }

    if      (stochBull)   { puan += 20; pozitif.push(`Stoch RSI Alım (K:${stochK.toFixed(0)})`); }
    else if (stochK < 20) { puan += 10; pozitif.push(`Stoch RSI Oversold (${stochK.toFixed(0)})`); }
    else if (stochBear)   { puan -= 20; negatif.push(`Stoch RSI Satım (K:${stochK.toFixed(0)})`); }
    else if (stochK > 80) { puan -= 10; negatif.push(`Stoch RSI Overbought (${stochK.toFixed(0)})`); }

    if      (williamsAlim)    { puan += 15; pozitif.push(`Williams %R Alım (${williamsR.toFixed(0)})`); }
    else if (williamsAsirim)  { puan +=  8; pozitif.push(`Williams %R Oversold (${williamsR.toFixed(0)})`); }
    else if (williamsR > -20) { puan -= 10; negatif.push('Williams %R Overbought'); }

    if      (cciBull && cci < -150) { puan += 15; pozitif.push(`CCI Aşırı Satım (${cci.toFixed(0)})`); }
    else if (cciBull)               { puan +=  8; pozitif.push(`CCI Pozitif (${cci.toFixed(0)})`); }
    else if (cci > 150)             { puan -= 15; negatif.push(`CCI Aşırı Alım (${cci.toFixed(0)})`); }

    if      (trendGuclu && trendYon === 'YUKARI') { puan += 15; pozitif.push(`ADX Güçlü Yükseliş (${adx.adx.toFixed(0)})`); }
    else if (trendGuclu && trendYon === 'ASAGI')  { puan -= 15; negatif.push(`ADX Güçlü Düşüş (${adx.adx.toFixed(0)})`); }
    else if (!trendGuclu)                         { puan -=  5; negatif.push(`ADX Zayıf Trend (${adx.adx.toFixed(0)})`); }

    if      (goldenCross)        { puan += 30; pozitif.push('🌟 Golden Cross (EMA21/50)'); }
    else if (deathCross)         { puan -= 30; negatif.push('💀 Death Cross (EMA21/50)'); }
    else if (emaBullAlign)       { puan += 25; pozitif.push('EMA Bull Alignment (9>21>50)'); }
    else if (emaBearAlign)       { puan -= 25; negatif.push('EMA Bear Alignment'); }
    else if (trend === 'YUKARI') { puan += 12; pozitif.push('Yükseliş Trendi'); }
    else if (trend === 'ASAGI')  { puan -= 12; negatif.push('Düşüş Trendi'); }
    if      (ema200 && fiyat > ema200) { puan += 10; pozitif.push('EMA200 Üstünde'); }
    else if (ema200 && fiyat < ema200) { puan -= 10; negatif.push('EMA200 Altında'); }

    if      (macdBullish) { puan += 25; pozitif.push('⚡ MACD Bullish Crossover'); }
    else if (macdBearish) { puan -= 25; negatif.push('⚡ MACD Bearish Crossover'); }
    else if (macdLine > signalLine && macdHist > 0) { puan += 10; pozitif.push('MACD Pozitif Momentum'); }
    else if (macdLine < signalLine && macdHist < 0) { puan -= 10; negatif.push('MACD Negatif Momentum'); }
    if (macdZeroXup) { puan += 15; pozitif.push('MACD Sıfır Çizgisi Kırıldı'); }
    if (macdBullDiv) { puan += 18; pozitif.push('MACD Bullish Divergence'); }
    if (macdBearDiv) { puan -= 18; negatif.push('MACD Bearish Divergence'); }

    if      (bPct <  2)  { puan += 25; pozitif.push('🎯 Bollinger Alt Bandı Dibinde'); }
    else if (bPct < 10)  { puan += 20; pozitif.push('Bollinger Alt Bandında'); }
    else if (bPct < 20)  { puan += 12; pozitif.push('Bollinger Alt Bölgede'); }
    else if (bPct > 98)  { puan -= 25; negatif.push('Bollinger Üst Bandı Tepesinde'); }
    else if (bPct > 90)  { puan -= 20; negatif.push('Bollinger Üst Bandında'); }
    else if (bPct > 80)  { puan -= 12; negatif.push('Bollinger Üst Bölgede'); }
    if (bSqueeze) { puan += 8; pozitif.push('Bollinger Squeeze (Patlama Yakın)'); }

    if      (obvTrend === 'GUCLU_YUKARI') { puan += 20; pozitif.push('OBV Güçlü Yükseliş'); }
    else if (obvTrend === 'YUKARI')       { puan += 12; pozitif.push('OBV Yükseliş'); }
    else if (obvTrend === 'ASAGI')        { puan -= 12; negatif.push('OBV Düşüş'); }
    if (obvDiv === 'BULL') { puan += 18; pozitif.push('OBV Bullish Divergence'); }
    if (obvDiv === 'BEAR') { puan -= 18; negatif.push('OBV Bearish Divergence'); }

    if      (cmf > 0.2)  { puan += 15; pozitif.push(`CMF Güçlü Para Girişi (${cmf.toFixed(2)})`); }
    else if (cmfBull)    { puan += 10; pozitif.push(`CMF Para Girişi (${cmf.toFixed(2)})`); }
    else if (cmf < -0.2) { puan -= 15; negatif.push(`CMF Güçlü Para Çıkışı (${cmf.toFixed(2)})`); }
    else if (cmfBear)    { puan -= 10; negatif.push(`CMF Para Çıkışı (${cmf.toFixed(2)})`); }

    if      (vwapBull && vwapDist < 2)  { puan += 10; pozitif.push('VWAP Üstünde (Yakın)'); }
    else if (vwapBull)                   { puan +=  5; pozitif.push('VWAP Üstünde'); }
    else if (!vwapBull && vwapDist > -5) { puan -=  8; negatif.push('VWAP Altında'); }

    if      (volSpike)  { puan += 20; pozitif.push(`Hacim Patlaması (${volOran}x)`); }
    else if (volYuksek) { puan += 12; pozitif.push(`Yüksek Hacim (${volOran}x)`); }
    else if (volDusuk)  { puan -= 15; negatif.push(`Düşük Hacim (${volOran}x)`); }
    if      (volBaskisi === 'ALIM'  && alimOrani > 65) { puan += 12; pozitif.push(`Alım Baskısı (%${alimOrani.toFixed(0)})`); }
    else if (volBaskisi === 'SATIS' && alimOrani < 35) { puan -= 12; negatif.push('Satış Baskısı'); }

    if      (destekUzak < 1) { puan += 25; pozitif.push('🏛️ Desteğe Çok Yakın (<1%)'); }
    else if (destekUzak < 3) { puan += 18; pozitif.push('Desteğe Yakın (<3%)'); }
    else if (destekUzak < 5) { puan += 10; pozitif.push('Destek Bölgesinde'); }
    if      (direncUzak < 1) { puan -= 20; negatif.push('Direce Çok Yakın (<1%)'); }
    else if (direncUzak < 3) { puan -= 10; negatif.push('Dirence Yakın (<3%)'); }
    if (direncKirildi) { puan += 25; pozitif.push('🚀 Direnç Kırıldı!'); }
    if (destekKirildi) { puan -= 25; negatif.push('⚠️ Destek Kırıldı!'); }

    if (fibDesteği) { puan += 12; pozitif.push('📐 Fibonacci Destek Seviyesi'); }

    if (mumlar.bullishEngulfing)  { puan += 25; pozitif.push('🕯️ Bullish Engulfing'); }
    if (mumlar.bearishEngulfing)  { puan -= 25; negatif.push('🕯️ Bearish Engulfing'); }
    if (mumlar.hammer)            { puan += 20; pozitif.push('🔨 Hammer Mumu'); }
    if (mumlar.invertedHammer)    { puan += 15; pozitif.push('Inverted Hammer'); }
    if (mumlar.shootingStar)      { puan -= 20; negatif.push('🌠 Shooting Star'); }
    if (mumlar.dojiDragonfly)     { puan += 15; pozitif.push('Dragonfly Doji'); }
    if (mumlar.dojiGravestone)    { puan -= 15; negatif.push('Gravestone Doji'); }
    if (mumlar.morningStar)       { puan += 25; pozitif.push('⭐ Morning Star'); }
    if (mumlar.eveningStar)       { puan -= 25; negatif.push('⭐ Evening Star'); }
    if (mumlar.threeWhiteSoldiers){ puan += 20; pozitif.push('3 White Soldiers'); }
    if (mumlar.threeBlackCrows)   { puan -= 20; negatif.push('3 Black Crows'); }
    if (mumlar.piercingLine)      { puan += 18; pozitif.push('Piercing Line'); }
    if (mumlar.doji)              { puan +=  5; pozitif.push('Doji (Kararsızlık)'); }

    if (yukselisTrendi) { puan += 15; pozitif.push('HH & HL (Yükseliş Trendi)'); }
    if (dususTrendi)    { puan -= 15; negatif.push('LH & LL (Düşüş Trendi)'); }

    const sinyal = puan >= 50 ? 'ALIM' : puan <= -20 ? 'SATIS' : 'BEKLE';
    const risk   = puan >= 80 ? 'DUSUK' : puan >= 60 ? 'ORTA' : 'YUKSEK';
    const hedef   = parseFloat((fiyat + atr14 * 3).toFixed(8));
    const stopLos = parseFloat((fiyat - atr14 * 1.5).toFixed(8));
    const rrOrani = parseFloat(((hedef - fiyat) / (fiyat - stopLos)).toFixed(2));

    return {
      symbol:    ticker.symbol,
      fiyat:     parseFloat(fiyat.toFixed(8)),
      price:     parseFloat(fiyat.toFixed(8)),
      puan, risk, sinyal,
      score:     puan,
      signal:    sinyal === 'ALIM' ? 'ALIM' : sinyal === 'SATIS' ? 'SATIS' : 'BEKLE',
      rsi:       parseFloat(rsi.toFixed(2)),
      rsiYon, rsiDivBull, rsiDivBear,
      stochK:    parseFloat(stochK.toFixed(2)),
      stochD:    parseFloat(stochD.toFixed(2)),
      stochBull,
      williamsR: parseFloat(williamsR.toFixed(2)),
      williamsAlim,
      cci:       parseFloat(cci.toFixed(2)),
      adx:       parseFloat(adx.adx.toFixed(2)),
      diPlus:    parseFloat(diPlus.toFixed(2)),
      diMinus:   parseFloat(diMinus.toFixed(2)),
      trendGuclu, trendYon,
      trend, goldenCross, deathCross, emaBullAlign,
      trend4H:   trend,
      trend1H:   trend,
      trend1D:   trend,
      ema9:      parseFloat(ema9.toFixed(8)),
      ema21:     parseFloat(ema21.toFixed(8)),
      ema50:     parseFloat(ema50.toFixed(8)),
      ema200:    ema200 ? parseFloat(ema200.toFixed(8)) : null,
      macdLine:  parseFloat(macdLine.toFixed(8)),
      signalLine:parseFloat(signalLine.toFixed(8)),
      macdHist:  parseFloat(macdHist.toFixed(8)),
      macdBullish, macdBearish, macdBullDiv, macdZeroXup,
      macdCrossover:  macdBullish,
      macdCrossunder: macdBearish,
      bPct:      parseFloat(bPct.toFixed(2)),
      bWidth:    parseFloat(bWidth.toFixed(2)),
      bSqueeze,
      bollinger_pct: parseFloat(bPct.toFixed(2)),
      ichimokuBelow: fiyat < ema50,
      ichimokuAbove: fiyat > ema50,
      obvTrend, obvDiv,
      cmf:       parseFloat(cmf.toFixed(4)),
      cmfBull,
      vwap:      parseFloat(vwap.toFixed(8)),
      vwapBull,
      volOran, volSpike, volBaskisi,
      hacimOran: volOran,
      alimOran:  parseFloat(alimOrani.toFixed(1)),
      alimOrani: parseFloat(alimOrani.toFixed(1)),
      destek:    parseFloat(destek.toFixed(8)),
      direnc:    parseFloat(direnc.toFixed(8)),
      destekUzak:parseFloat(destekUzak.toFixed(2)),
      direncUzak:parseFloat(direncUzak.toFixed(2)),
      direncKirildi, destekKirildi, fibDesteği,
      fib382:    parseFloat(fib.level382.toFixed(8)),
      fib618:    parseFloat(fib.level618.toFixed(8)),
      mumlar, yukselisTrendi, dususTrendi,
      atr:       parseFloat(atr14.toFixed(8)),
      atr14:     parseFloat(atr14.toFixed(8)),
      atrOran:   parseFloat(atrOran.toFixed(2)),
      hedef, stop_loss: stopLos, rrOrani,
      stopLoss:  stopLos,
      divergenceBull: rsiDivBull || macdBullDiv,
      divergenceBear: rsiDivBear || macdBearDiv,
      pozitif, negatif,
      positive:  pozitif,
      negative:  negatif,
      degisim24h: parseFloat(ticker.priceChangePercent || 0),
      hacim24h:   parseFloat(ticker.quoteVolume || 0)
    };
  }

  // ── ENGINE UYUMLULUK FONKSİYONLARI ───────────────────────

  analyze4HSetup(candles4H, candles1D, ticker, settings) {
    const result = this.analyze(candles4H, ticker);
    if (!result) return { setup:'BEKLE' };
    const minScore = parseInt(settings?.min_score || 40);
    if      (result.puan >= 70) return { ...result, setup:'LONG_ADAY', longSinyal:'GUCLU',  price:result.fiyat };
    else if (result.puan >= 55) return { ...result, setup:'LONG_ADAY', longSinyal:'NORMAL', price:result.fiyat };
    else if (result.puan >= minScore) return { ...result, setup:'LONG_ADAY', longSinyal:'ZAYIF', price:result.fiyat };
    else if (result.puan <= -40) return { ...result, setup:'SHORT_ADAY', shortSinyal:'GUCLU',  price:result.fiyat };
    else if (result.puan <= -25) return { ...result, setup:'SHORT_ADAY', shortSinyal:'NORMAL', price:result.fiyat };
    return { ...result, setup:'BEKLE', price:result.fiyat };
  }

  analyze1H(candles) {
    if (!candles || candles.length < 50) return { trend:'BELIRSIZ', guclu:false };
    const closes = candles.map(c => parseFloat(c[4]));
    const ema21  = this.hesaplaEMA(closes, 21);
    const ema50  = this.hesaplaEMA(closes, 50);
    const fiyat  = closes[closes.length-1];
    const rsi    = this.hesaplaRSI(closes, 14);
    let trend = 'BELIRSIZ';
    if      (fiyat > ema21 && ema21 > ema50) trend = 'YUKARI';
    else if (fiyat > ema21)                  trend = 'HAFIF_YUKARI';
    else if (fiyat < ema21 && ema21 < ema50) trend = 'ASAGI';
    else if (fiyat < ema21)                  trend = 'HAFIF_ASAGI';
    else                                     trend = 'YATAY';
    const macd = this.hesaplaMACD(closes);
    return {
      trend,
      guclu: Math.abs(fiyat-ema21)/fiyat > 0.02,
      rsi,
      crossover:  macd.bullishCross,
      crossunder: macd.bearishCross
    };
  }

  analyze4H(candles)  { return this.analyze1H(candles); }
  analyze1D(candles)  { return this.analyze1H(candles); }
  analyzeTF(candles)  { return this.analyze1H(candles); }

  hacimAnaliz(closes, volumes) {
    const vol20  = volumes.slice(-20,-1).reduce((a,b)=>a+b,0) / 19;
    const sonVol = volumes[volumes.length-1];
    const oran   = sonVol / vol20;
    return {
      spike:              oran > 2.0,
      yuksekHacimKirmizi: oran > 1.5 && closes[closes.length-1] < closes[closes.length-2],
      oran
    };
  }

  volatiliteKontrol(highs, lows, closes) {
    const atr    = this.hesaplaATR(highs, lows, closes, 14);
    const fiyat  = closes[closes.length-1];
    const atrOran = atr / fiyat * 100;
    return { normalMum: atrOran < 5, atrOran };
  }

  calculateMACD(closes)          { return this.hesaplaMACD(closes); }
  calculateRSI(closes, period=14){ return this.hesaplaRSI(closes, period); }

  // ── İNDİKATÖR FONKSİYONLARI ──────────────────────────────

  hesaplaRSI(data, period=14) {
    if (data.length < period+1) return 50;
    let gains=0, losses=0;
    for (let i=data.length-period; i<data.length; i++) {
      const d=data[i]-data[i-1];
      if (d>0) gains+=d; else losses-=d;
    }
    const ag=gains/period, al=losses/period;
    if (al===0) return 100;
    return parseFloat((100-100/(1+ag/al)).toFixed(2));
  }

  hesaplaEMA(data, period) {
    if (data.length<period) return data[data.length-1];
    const k=2/(period+1);
    let ema=data.slice(0,period).reduce((a,b)=>a+b,0)/period;
    for (let i=period; i<data.length; i++) ema=data[i]*k+ema*(1-k);
    return parseFloat(ema.toFixed(8));
  }

  hesaplaStochRSI(closes, rsiP=14, stochP=14, smoothK=3, smoothD=3) {
    const rsiSeries=[];
    for (let i=rsiP; i<=closes.length; i++)
      rsiSeries.push(this.hesaplaRSI(closes.slice(0,i), rsiP));
    if (rsiSeries.length<stochP) return {k:50,d:50};
    const stoch=[];
    for (let i=stochP-1; i<rsiSeries.length; i++) {
      const sl=rsiSeries.slice(i-stochP+1,i+1);
      const mx=Math.max(...sl), mn=Math.min(...sl);
      stoch.push(mx===mn?50:(rsiSeries[i]-mn)/(mx-mn)*100);
    }
    const kS=[];
    for (let i=smoothK-1; i<stoch.length; i++)
      kS.push(stoch.slice(i-smoothK+1,i+1).reduce((a,b)=>a+b,0)/smoothK);
    const dS=[];
    for (let i=smoothD-1; i<kS.length; i++)
      dS.push(kS.slice(i-smoothD+1,i+1).reduce((a,b)=>a+b,0)/smoothD);
    return {k:kS[kS.length-1]||50, d:dS[dS.length-1]||50};
  }

  hesaplaWilliamsR(highs, lows, closes, period=14) {
    const hh=Math.max(...highs.slice(-period));
    const ll=Math.min(...lows.slice(-period));
    const c=closes[closes.length-1];
    if (hh===ll) return -50;
    return (hh-c)/(hh-ll)*-100;
  }

  hesaplaCCI(highs, lows, closes, period=20) {
    const tp=closes.map((c,i)=>(highs[i]+lows[i]+c)/3);
    const sl=tp.slice(-period);
    const mean=sl.reduce((a,b)=>a+b,0)/period;
    const mad=sl.reduce((a,b)=>a+Math.abs(b-mean),0)/period;
    if (mad===0) return 0;
    return (tp[tp.length-1]-mean)/(0.015*mad);
  }

  hesaplaADX(highs, lows, closes, period=14) {
    if (highs.length<period+1) return {adx:0,diPlus:0,diMinus:0};
    const tr=[],dp=[],dm=[];
    for (let i=1; i<highs.length; i++) {
      const h=highs[i],l=lows[i],ph=highs[i-1],pl=lows[i-1],pc=closes[i-1];
      tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
      dp.push(h-ph>pl-l&&h-ph>0?h-ph:0);
      dm.push(pl-l>h-ph&&pl-l>0?pl-l:0);
    }
    const atr=tr.slice(-period).reduce((a,b)=>a+b,0)/period;
    if (atr===0) return {adx:0,diPlus:0,diMinus:0};
    const diP=(dp.slice(-period).reduce((a,b)=>a+b,0)/period)/atr*100;
    const diM=(dm.slice(-period).reduce((a,b)=>a+b,0)/period)/atr*100;
    const dx=diP+diM===0?0:Math.abs(diP-diM)/(diP+diM)*100;
    return {adx:dx,diPlus:diP,diMinus:diM};
  }

  hesaplaMACD(closes, fast=12, slow=26, signal=9) {
    const series=[];
    for (let i=slow; i<closes.length; i++)
      series.push(this.hesaplaEMA(closes.slice(0,i+1),fast)-this.hesaplaEMA(closes.slice(0,i+1),slow));
    const macdLine=series[series.length-1]||0;
    const signalLine=this.hesaplaEMA(series,signal);
    const histogram=macdLine-signalLine;
    const prevMacd=series[series.length-2]||0;
    const prevSignal=this.hesaplaEMA(series.slice(0,-1),signal);
    const c5=closes.slice(-5), m5=series.slice(-5);
    return {
      macdLine, signalLine, histogram, prevMacd,
      bullishCross: prevMacd<=prevSignal && macdLine>signalLine,
      bearishCross: prevMacd>=prevSignal && macdLine<signalLine,
      crossover:    prevMacd<=prevSignal && macdLine>signalLine,
      crossunder:   prevMacd>=prevSignal && macdLine<signalLine,
      bullDiv: c5.length>=5 && c5[4]<c5[0] && m5.length>=5 && m5[4]>m5[0],
      bearDiv: c5.length>=5 && c5[4]>c5[0] && m5.length>=5 && m5[4]<m5[0]
    };
  }

  hesaplaBollinger(closes, period=20, mult=2) {
    const sl=closes.slice(-period);
    const mean=sl.reduce((a,b)=>a+b,0)/period;
    const std=Math.sqrt(sl.reduce((a,b)=>a+Math.pow(b-mean,2),0)/period);
    const upper=mean+mult*std, lower=mean-mult*std;
    const width=(upper-lower)/mean*100;
    const pct=(closes[closes.length-1]-lower)/(upper-lower)*100;
    const psl=closes.slice(-period-5,-5);
    const pm=psl.reduce((a,b)=>a+b,0)/period;
    const ps=Math.sqrt(psl.reduce((a,b)=>a+Math.pow(b-pm,2),0)/period);
    const pw=((pm+2*ps)-(pm-2*ps))/pm*100;
    return {upper,lower,mid:mean,width,percent:pct,expanding:width>pw*1.1,contracting:width<pw*0.9};
  }

  hesaplaOBV(closes, volumes) {
    let obv=0;
    const s=[0];
    for (let i=1; i<closes.length; i++) {
      if (closes[i]>closes[i-1]) obv+=volumes[i];
      else if (closes[i]<closes[i-1]) obv-=volumes[i];
      s.push(obv);
    }
    const o5=s.slice(-5).reduce((a,b)=>a+b,0)/5;
    const o20=s.slice(-20).reduce((a,b)=>a+b,0)/20;
    const o50=s.slice(-50).reduce((a,b)=>a+b,0)/50;
    let trend='NOTR';
    if (o5>o20&&o20>o50) trend='GUCLU_YUKARI';
    else if (o5>o20)     trend='YUKARI';
    else if (o5<o20&&o20<o50) trend='ASAGI';
    const c5=closes.slice(-5), s5=s.slice(-5);
    let divergence='YOK';
    if (c5[4]<c5[0]&&s5[4]>s5[0]) divergence='BULL';
    if (c5[4]>c5[0]&&s5[4]<s5[0]) divergence='BEAR';
    return {trend,divergence,current:obv};
  }

  hesaplaCMF(highs, lows, closes, volumes, period=20) {
    let mfv=0, vol=0;
    for (let i=closes.length-period; i<closes.length; i++) {
      const h=highs[i],l=lows[i],c=closes[i],v=volumes[i];
      mfv+=(h===l?0:((c-l)-(h-c))/(h-l))*v;
      vol+=v;
    }
    return vol===0?0:mfv/vol;
  }

  hesaplaVWAP(highs, lows, closes, volumes) {
    let tpv=0, vol=0;
    const p=Math.min(20,closes.length);
    for (let i=closes.length-p; i<closes.length; i++) {
      const tp=(highs[i]+lows[i]+closes[i])/3;
      tpv+=tp*volumes[i]; vol+=volumes[i];
    }
    return vol===0?closes[closes.length-1]:tpv/vol;
  }

  hesaplaATR(highs, lows, closes, period=14) {
    const tr=[];
    for (let i=1; i<closes.length; i++)
      tr.push(Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i-1]),Math.abs(lows[i]-closes[i-1])));
    return tr.slice(-period).reduce((a,b)=>a+b,0)/period;
  }

  hesaplaSR(highs, lows, lookback=50) {
    return {direnc:Math.max(...highs.slice(-lookback)), destek:Math.min(...lows.slice(-lookback))};
  }

  hesaplaFibonacci(highs, lows, lookback=50) {
    const mx=Math.max(...highs.slice(-lookback));
    const mn=Math.min(...lows.slice(-lookback));
    const d=mx-mn;
    return {level236:mx-d*0.236,level382:mx-d*0.382,level500:mx-d*0.5,level618:mx-d*0.618,level786:mx-d*0.786};
  }

  rsiBullishDiv(closes) {
    const n=closes.length;
    if (n<10) return false;
    return closes[n-1]<closes[n-6] && this.hesaplaRSI(closes,14)>this.hesaplaRSI(closes.slice(0,-5),14);
  }

  rsiBearishDiv(closes) {
    const n=closes.length;
    if (n<10) return false;
    return closes[n-1]>closes[n-6] && this.hesaplaRSI(closes,14)<this.hesaplaRSI(closes.slice(0,-5),14);
  }

  analizMumYapilari(candles) {
    const n=candles.length;
    if (n<3) return {};
    const c0=candles[n-1],c1=candles[n-2],c2=candles[n-3];
    const o0=parseFloat(c0[1]),h0=parseFloat(c0[2]),l0=parseFloat(c0[3]),cl0=parseFloat(c0[4]);
    const o1=parseFloat(c1[1]),h1=parseFloat(c1[2]),l1=parseFloat(c1[3]),cl1=parseFloat(c1[4]);
    const o2=parseFloat(c2[1]),h2=parseFloat(c2[2]),l2=parseFloat(c2[3]),cl2=parseFloat(c2[4]);
    const b0=Math.abs(cl0-o0),b1=Math.abs(cl1-o1),r0=h0-l0;
    const u0=h0-Math.max(cl0,o0),a0=Math.min(cl0,o0)-l0;
    const bull0=cl0>o0,bear0=cl0<o0,bull1=cl1>o1,bear1=cl1<o1;
    return {
      hammer:            a0>b0*2&&u0<b0*0.5&&bull0,
      invertedHammer:    u0>b0*2&&a0<b0*0.5&&bull0,
      shootingStar:      u0>b0*2&&a0<b0*0.5&&bear0,
      hangingMan:        a0>b0*2&&u0<b0*0.5&&bear0,
      doji:              b0<r0*0.1,
      dojiDragonfly:     b0<r0*0.1&&a0>r0*0.6,
      dojiGravestone:    b0<r0*0.1&&u0>r0*0.6,
      marubozu:          b0>r0*0.9,
      bullishEngulfing:  bear1&&bull0&&o0<=cl1&&cl0>=o1,
      bearishEngulfing:  bull1&&bear0&&o0>=cl1&&cl0<=o1,
      piercingLine:      bear1&&bull0&&o0<l1&&cl0>(o1+cl1)/2,
      darkCloudCover:    bull1&&bear0&&o0>h1&&cl0<(o1+cl1)/2,
      tweezerBottom:     Math.abs(l0-l1)/l0<0.001&&bull0&&bear1,
      tweezerTop:        Math.abs(h0-h1)/h0<0.001&&bear0&&bull1,
      morningStar:       bear1&&b1<Math.abs(cl2-o2)*0.5&&bull0&&cl0>(o2+cl2)/2,
      eveningStar:       bull1&&b1<Math.abs(cl2-o2)*0.5&&bear0&&cl0<(o2+cl2)/2,
      threeWhiteSoldiers:bull0&&bull1&&cl2>o2&&cl0>cl1&&cl1>cl2,
      threeBlackCrows:   bear0&&bear1&&cl2<o2&&cl0<cl1&&cl1<cl2,
    };
  }
}

const parts = new ProfessionalAnalysis();
module.exports = parts;
