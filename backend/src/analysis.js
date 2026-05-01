// ============================================================
// PROFESYONEL KRİPTO ANALİZ MOTORU
// Kurumsal botların kullandığı indikatörler:
// RSI + Stochastic RSI + Williams %R + CCI + ADX +
// EMA/SMA + MACD + Bollinger + OBV + CMF + VWAP +
// Fibonacci + Mum Yapıları + Çoklu TF Uyumu
// ============================================================

class ProfessionalAnalysis {

  analyze(candles, ticker) {
    if (!candles || candles.length < 100) return null;

    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const opens   = candles.map(c => parseFloat(c[1]));
    const fiyat   = closes[closes.length - 1];

    // ── 1. RSI (14) ──────────────────────────────────────────
    const rsi       = this.hesaplaRSI(closes, 14);
    const rsi7      = this.hesaplaRSI(closes, 7);
    const rsiOnceki = this.hesaplaRSI(closes.slice(0,-1), 14);
    const rsiYon    = rsi > rsiOnceki ? 'YUKARI' : 'ASAGI';

    // RSI Diverjans (son 5 mum)
    const rsiDivBull = this.rsiBullishDiv(closes, highs, lows);
    const rsiDivBear = this.rsiBearishDiv(closes, highs, lows);

    // ── 2. STOCHASTIC RSI ────────────────────────────────────
    const stochRSI  = this.hesaplaStochRSI(closes, 14, 3, 3);
    const stochK    = stochRSI.k;
    const stochD    = stochRSI.d;
    const stochBull = stochK > stochD && stochK < 20; // Oversold crossover
    const stochBear = stochK < stochD && stochK > 80; // Overbought crossover

    // ── 3. WILLIAMS %R ───────────────────────────────────────
    const williamsR     = this.hesaplaWilliamsR(highs, lows, closes, 14);
    const williamsAsirim = williamsR < -80; // Aşırı satım
    const williamsAlim  = williamsR < -80 && williamsR > this.hesaplaWilliamsR(
      highs.slice(0,-1), lows.slice(0,-1), closes.slice(0,-1), 14
    ); // Yukarı dönüş

    // ── 4. CCI (Commodity Channel Index) ────────────────────
    const cci       = this.hesaplaCCI(highs, lows, closes, 20);
    const cciBull   = cci > -100 && cci < 0;  // -100 altından çıkış
    const cciBear   = cci < 100 && cci > 0;   // +100 üstünden iniş

    // ── 5. ADX (Trend Gücü) ──────────────────────────────────
    const adx       = this.hesaplaADX(highs, lows, closes, 14);
    const trendGuclu = adx.adx > 25;
    const diPlus    = adx.diPlus;
    const diMinus   = adx.diMinus;
    const trendYon  = diPlus > diMinus ? 'YUKARI' : 'ASAGI';

    // ── 6. EMA & SMA ─────────────────────────────────────────
    const ema9   = this.hesaplaEMA(closes, 9);
    const ema21  = this.hesaplaEMA(closes, 21);
    const ema50  = this.hesaplaEMA(closes, 50);
    const ema100 = this.hesaplaEMA(closes, 100);
    const ema200 = closes.length >= 200 ? this.hesaplaEMA(closes, 200) : null;
    const sma20  = closes.slice(-20).reduce((a,b)=>a+b,0) / 20;
    const sma50  = closes.slice(-50).reduce((a,b)=>a+b,0) / 50;

    const ema21Onceki = this.hesaplaEMA(closes.slice(0,-1), 21);
    const ema50Onceki = this.hesaplaEMA(closes.slice(0,-1), 50);
    const goldenCross = ema21Onceki <= ema50Onceki && ema21 > ema50;
    const deathCross  = ema21Onceki >= ema50Onceki && ema21 < ema50;

    // EMA sıralaması (bull alignment)
    const emaBullAlign = fiyat > ema9 && ema9 > ema21 && ema21 > ema50;
    const emaBearAlign = fiyat < ema9 && ema9 < ema21 && ema21 < ema50;

    let trend = 'NOTR';
    if      (emaBullAlign)              trend = 'GUCLU_YUKARI';
    else if (fiyat > ema21 && fiyat > ema50) trend = 'YUKARI';
    else if (emaBearAlign)              trend = 'GUCLU_ASAGI';
    else if (fiyat < ema21 && fiyat < ema50) trend = 'ASAGI';

    // ── 7. MACD (12, 26, 9) ──────────────────────────────────
    const macd        = this.hesaplaMACD(closes, 12, 26, 9);
    const macdLine    = macd.macdLine;
    const signalLine  = macd.signalLine;
    const macdHist    = macd.histogram;
    const macdBullish = macd.bullishCross;
    const macdBearish = macd.bearishCross;
    const macdBullDiv = macd.bullDiv;
    const macdBearDiv = macd.bearDiv;
    const macdZeroXup = macdLine > 0 && macd.prevMacd <= 0; // Zero cross up

    // ── 8. BOLLINGER BANDS (20, 2) ───────────────────────────
    const bb     = this.hesaplaBollinger(closes, 20, 2);
    const bPct   = bb.percent;
    const bWidth = bb.width;
    const bSqueeze     = bWidth < 2.0;    // Squeeze (patlama öncesi)
    const bExpanding   = bb.expanding;
    const bLowerTouch  = fiyat <= bb.lower * 1.01;
    const bUpperTouch  = fiyat >= bb.upper * 0.99;

    // Bollinger Band Walk (yukarı yürüyüş)
    const bbWalkUp = closes.slice(-3).every(c => c > bb.upper);

    // ── 9. OBV (On Balance Volume) ───────────────────────────
    const obv     = this.hesaplaOBV(closes, volumes);
    const obvTrend = obv.trend;
    const obvDiv   = obv.divergence;

    // ── 10. CMF (Chaikin Money Flow) ─────────────────────────
    const cmf      = this.hesaplaCMF(highs, lows, closes, volumes, 20);
    const cmfBull  = cmf > 0.1;  // Para girişi
    const cmfBear  = cmf < -0.1; // Para çıkışı

    // ── 11. VWAP ─────────────────────────────────────────────
    const vwap     = this.hesaplaVWAP(highs, lows, closes, volumes);
    const vwapBull = fiyat > vwap;
    const vwapDist = ((fiyat - vwap) / vwap * 100);

    // ── 12. ATR (Average True Range) ─────────────────────────
    const atr14   = this.hesaplaATR(highs, lows, closes, 14);
    const atrOran = (atr14 / fiyat * 100);

    // ── 13. HACİM ANALİZİ ────────────────────────────────────
    const vol20Ort  = volumes.slice(-20,-1).reduce((a,b)=>a+b,0) / 19;
    const sonVol    = volumes[volumes.length-1];
    const volOran   = parseFloat((sonVol / vol20Ort).toFixed(2));
    const volSpike  = volOran > 2.0;
    const volYuksek = volOran > 1.5;
    const volDusuk  = volOran < 0.5;

    // Alım/satım hacim baskısı
    const son5Mumlar  = candles.slice(-5);
    const alimVol     = son5Mumlar.filter(c=>parseFloat(c[4])>parseFloat(c[1])).reduce((a,c)=>a+parseFloat(c[5]),0);
    const satisVol    = son5Mumlar.filter(c=>parseFloat(c[4])<parseFloat(c[1])).reduce((a,c)=>a+parseFloat(c[5]),0);
    const volBaskisi  = alimVol > satisVol ? 'ALIM' : 'SATIS';
    const alimOrani   = alimVol + satisVol > 0 ? alimVol / (alimVol + satisVol) * 100 : 50;

    // ── 14. DESTEK / DİRENÇ ──────────────────────────────────
    const sr      = this.hesaplaSR(highs, lows, closes, 50);
    const destek  = sr.destek;
    const direnc  = sr.direnc;
    const destekUzak  = (fiyat - destek) / fiyat * 100;
    const direncUzak  = (direnc - fiyat) / fiyat * 100;
    const direncKirildi = closes.slice(-3).some(c => c > direnc * 0.998);
    const destekKirildi = closes.slice(-3).some(c => c < destek * 1.002);

    // ── 15. FİBONACCI ────────────────────────────────────────
    const fib     = this.hesaplaFibonacci(highs, lows, 50);
    const fib382  = fib.level382;
    const fib500  = fib.level500;
    const fib618  = fib.level618;
    const fibDesteği = Math.abs(fiyat - fib382) / fiyat < 0.015 ||
                       Math.abs(fiyat - fib500) / fiyat < 0.015 ||
                       Math.abs(fiyat - fib618) / fiyat < 0.015;

    // ── 16. MUM YAPILARI ─────────────────────────────────────
    const mumlar = this.analizMumYapilari(candles);

    // ── 17. TREND ÇİZGİSİ ────────────────────────────────────
    const son10H = highs.slice(-10);
    const son10L = lows.slice(-10);
    const hhCount = son10H.filter((h,i)=>i>0&&h>son10H[i-1]).length;
    const hlCount = son10L.filter((l,i)=>i>0&&l>son10L[i-1]).length;
    const yukselisTrendi = hhCount >= 5 && hlCount >= 5;
    const dususTrendi    = son10H.filter((h,i)=>i>0&&h<son10H[i-1]).length >= 5;

    // ════════════════════════════════════════════════════════
    // PROFESYONEL PUAN SİSTEMİ
    // Zorunlu koşullar + Ağırlıklı puanlama
    // ════════════════════════════════════════════════════════

    let puan = 0;
    const pozitif = [];
    const negatif = [];

    // ── ZORUNLU FİLTRELER (bunlar olmadan sinyal yok) ────────
    const rsiUygun    = rsi >= 20 && rsi <= 50;
    const hacimUygun  = volOran >= 0.7;
    const trendOlumlu = !['GUCLU_ASAGI'].includes(trend);

    if (!rsiUygun)    negatif.push(`RSI uygun değil (${rsi.toFixed(1)})`);
    if (!hacimUygun)  negatif.push(`Hacim çok düşük (${volOran}x)`);

    // ── RSI PUANLAMA (MAX 35) ────────────────────────────────
    if      (rsi < 20) { puan += 35; pozitif.push(`🔥 RSI Ekstreom Satım (${rsi.toFixed(1)})`); }
    else if (rsi < 25) { puan += 30; pozitif.push(`RSI Aşırı Satım (${rsi.toFixed(1)})`); }
    else if (rsi < 30) { puan += 25; pozitif.push(`RSI Güçlü Satım (${rsi.toFixed(1)})`); }
    else if (rsi < 35) { puan += 20; pozitif.push(`RSI Satım Bölgesi (${rsi.toFixed(1)})`); }
    else if (rsi < 45) { puan += 10; pozitif.push(`RSI Nötr-Pozitif (${rsi.toFixed(1)})`); }
    else if (rsi > 75) { puan -= 30; negatif.push(`RSI Aşırı Alım (${rsi.toFixed(1)})`); }
    else if (rsi > 65) { puan -= 15; negatif.push(`RSI Alım Bölgesi (${rsi.toFixed(1)})`); }
    if (rsiYon === 'YUKARI' && rsi < 50) { puan += 8; pozitif.push('RSI Yukarı Döndü'); }
    if (rsiDivBull) { puan += 20; pozitif.push('📈 RSI Bullish Divergence'); }
    if (rsiDivBear) { puan -= 20; negatif.push('📉 RSI Bearish Divergence'); }

    // ── STOCHASTIC RSI (MAX 20) ──────────────────────────────
    if (stochBull)        { puan += 20; pozitif.push(`Stoch RSI Alım (K:${stochK.toFixed(0)})`); }
    else if (stochK < 20) { puan += 10; pozitif.push(`Stoch RSI Oversold (${stochK.toFixed(0)})`); }
    else if (stochBear)   { puan -= 20; negatif.push(`Stoch RSI Satım (K:${stochK.toFixed(0)})`); }
    else if (stochK > 80) { puan -= 10; negatif.push(`Stoch RSI Overbought (${stochK.toFixed(0)})`); }

    // ── WILLIAMS %R (MAX 15) ─────────────────────────────────
    if (williamsAlim)       { puan += 15; pozitif.push(`Williams %R Alım (${williamsR.toFixed(0)})`); }
    else if (williamsAsirim){ puan +=  8; pozitif.push(`Williams %R Oversold (${williamsR.toFixed(0)})`); }
    else if (williamsR > -20){ puan -= 10; negatif.push(`Williams %R Overbought`); }

    // ── CCI (MAX 10) ─────────────────────────────────────────
    if      (cciBull && cci < -150) { puan += 15; pozitif.push(`CCI Aşırı Satım (${cci.toFixed(0)})`); }
    else if (cciBull)               { puan += 8;  pozitif.push(`CCI Pozitif (${cci.toFixed(0)})`); }
    else if (cci > 150)             { puan -= 15; negatif.push(`CCI Aşırı Alım (${cci.toFixed(0)})`); }

    // ── ADX TREND GÜCÜ (MAX 15) ──────────────────────────────
    if (trendGuclu && trendYon === 'YUKARI') {
      puan += 15; pozitif.push(`ADX Güçlü Yükseliş (${adx.adx.toFixed(0)})`);
    } else if (trendGuclu && trendYon === 'ASAGI') {
      puan -= 15; negatif.push(`ADX Güçlü Düşüş (${adx.adx.toFixed(0)})`);
    } else if (!trendGuclu) {
      puan -= 5; negatif.push(`ADX Zayıf Trend (${adx.adx.toFixed(0)})`);
    }

    // ── EMA / TREND (MAX 30) ─────────────────────────────────
    if      (goldenCross)   { puan += 30; pozitif.push('🌟 Golden Cross (EMA21/50)'); }
    else if (deathCross)    { puan -= 30; negatif.push('💀 Death Cross (EMA21/50)'); }
    else if (emaBullAlign)  { puan += 25; pozitif.push('EMA Bull Alignment (9>21>50)'); }
    else if (emaBearAlign)  { puan -= 25; negatif.push('EMA Bear Alignment'); }
    else if (trend === 'YUKARI') { puan += 12; pozitif.push('Yükseliş Trendi'); }
    else if (trend === 'ASAGI')  { puan -= 12; negatif.push('Düşüş Trendi'); }
    if (ema200 && fiyat > ema200)  { puan += 10; pozitif.push('EMA200 Üstünde (Bull Market)'); }
    else if (ema200 && fiyat < ema200) { puan -= 10; negatif.push('EMA200 Altında (Bear Market)'); }

    // ── MACD (MAX 30) ────────────────────────────────────────
    if      (macdBullish) { puan += 25; pozitif.push('⚡ MACD Bullish Crossover'); }
    else if (macdBearish) { puan -= 25; negatif.push('⚡ MACD Bearish Crossover'); }
    else if (macdLine > signalLine && macdHist > 0) { puan += 10; pozitif.push('MACD Pozitif Momentum'); }
    else if (macdLine < signalLine && macdHist < 0) { puan -= 10; negatif.push('MACD Negatif Momentum'); }
    if (macdZeroXup)  { puan += 15; pozitif.push('MACD Sıfır Çizgisi Kırıldı'); }
    if (macdBullDiv)  { puan += 18; pozitif.push('MACD Bullish Divergence'); }
    if (macdBearDiv)  { puan -= 18; negatif.push('MACD Bearish Divergence'); }

    // ── BOLLINGER BANDS (MAX 25) ─────────────────────────────
    if      (bPct < 2)   { puan += 25; pozitif.push('🎯 Bollinger Alt Bandı Dibinde'); }
    else if (bPct < 10)  { puan += 20; pozitif.push('Bollinger Alt Bandında'); }
    else if (bPct < 20)  { puan += 12; pozitif.push('Bollinger Alt Bölgede'); }
    else if (bPct > 98)  { puan -= 25; negatif.push('Bollinger Üst Bandı Tepesinde'); }
    else if (bPct > 90)  { puan -= 20; negatif.push('Bollinger Üst Bandında'); }
    else if (bPct > 80)  { puan -= 12; negatif.push('Bollinger Üst Bölgede'); }
    if (bSqueeze)   { puan += 8;  pozitif.push('Bollinger Squeeze (Patlama Yakın)'); }
    if (bExpanding && bPct < 50) { puan += 5; pozitif.push('Bollinger Genişliyor (Aşağıdan)'); }

    // ── OBV (MAX 20) ─────────────────────────────────────────
    if      (obvTrend === 'GUCLU_YUKARI') { puan += 20; pozitif.push('OBV Güçlü Yükseliş'); }
    else if (obvTrend === 'YUKARI')       { puan += 12; pozitif.push('OBV Yükseliş'); }
    else if (obvTrend === 'ASAGI')        { puan -= 12; negatif.push('OBV Düşüş'); }
    if (obvDiv === 'BULL') { puan += 18; pozitif.push('OBV Bullish Divergence'); }
    if (obvDiv === 'BEAR') { puan -= 18; negatif.push('OBV Bearish Divergence'); }

    // ── CMF (MAX 15) ─────────────────────────────────────────
    if      (cmf > 0.2)  { puan += 15; pozitif.push(`CMF Güçlü Para Girişi (${cmf.toFixed(2)})`); }
    else if (cmfBull)    { puan += 10; pozitif.push(`CMF Para Girişi (${cmf.toFixed(2)})`); }
    else if (cmf < -0.2) { puan -= 15; negatif.push(`CMF Güçlü Para Çıkışı (${cmf.toFixed(2)})`); }
    else if (cmfBear)    { puan -= 10; negatif.push(`CMF Para Çıkışı (${cmf.toFixed(2)})`); }

    // ── VWAP (MAX 10) ────────────────────────────────────────
    if (vwapBull && vwapDist < 2)  { puan += 10; pozitif.push('VWAP Üstünde (Yakın)'); }
    else if (vwapBull)             { puan +=  5; pozitif.push('VWAP Üstünde'); }
    else if (!vwapBull && vwapDist > -5) { puan -= 8; negatif.push('VWAP Altında'); }

    // ── HACİM (MAX 20) ───────────────────────────────────────
    if      (volSpike)              { puan += 20; pozitif.push(`Hacim Patlaması (${volOran}x)`); }
    else if (volYuksek)             { puan += 12; pozitif.push(`Yüksek Hacim (${volOran}x)`); }
    else if (volDusuk)              { puan -= 15; negatif.push(`Düşük Hacim (${volOran}x)`); }
    if (volBaskisi === 'ALIM' && alimOrani > 65) {
      puan += 12; pozitif.push(`Alım Baskısı (%${alimOrani.toFixed(0)})`);
    } else if (volBaskisi === 'SATIS' && alimOrani < 35) {
      puan -= 12; negatif.push(`Satış Baskısı (%${(100-alimOrani).toFixed(0)})`);
    }

    // ── DESTEK / DİRENÇ (MAX 25) ────────────────────────────
    if      (destekUzak < 1)  { puan += 25; pozitif.push('🏛️ Desteğe Çok Yakın (<1%)'); }
    else if (destekUzak < 3)  { puan += 18; pozitif.push('Desteğe Yakın (<3%)'); }
    else if (destekUzak < 5)  { puan += 10; pozitif.push('Destek Bölgesinde'); }
    if      (direncUzak < 1)  { puan -= 20; negatif.push('Direce Çok Yakın (<1%)'); }
    else if (direncUzak < 3)  { puan -= 10; negatif.push('Dirence Yakın (<3%)'); }
    if (direncKirildi) { puan += 25; pozitif.push('🚀 Direnç Kırıldı!'); }
    if (destekKirildi) { puan -= 25; negatif.push('⚠️ Destek Kırıldı!'); }

    // ── FİBONACCI (MAX 12) ───────────────────────────────────
    if (fibDesteği) { puan += 12; pozitif.push('📐 Fibonacci Destek Seviyesi'); }

    // ── MUM YAPILARI (MAX 25) ────────────────────────────────
    if (mumlar.bullishEngulfing) { puan += 25; pozitif.push('🕯️ Bullish Engulfing'); }
    if (mumlar.bearishEngulfing) { puan -= 25; negatif.push('🕯️ Bearish Engulfing'); }
    if (mumlar.hammer)           { puan += 20; pozitif.push('🔨 Hammer Mumu'); }
    if (mumlar.invertedHammer)   { puan += 15; pozitif.push('Inverted Hammer'); }
    if (mumlar.shootingStar)     { puan -= 20; negatif.push('🌠 Shooting Star'); }
    if (mumlar.dojiDragonfly)    { puan += 15; pozitif.push('Dragonfly Doji'); }
    if (mumlar.dojiGravestone)   { puan -= 15; negatif.push('Gravestone Doji'); }
    if (mumlar.morningStar)      { puan += 25; pozitif.push('⭐ Morning Star'); }
    if (mumlar.eveningStar)      { puan -= 25; negatif.push('⭐ Evening Star'); }
    if (mumlar.threeWhiteSoldiers){ puan += 20; pozitif.push('3 White Soldiers'); }
    if (mumlar.threeBlackCrows)  { puan -= 20; negatif.push('3 Black Crows'); }
    if (mumlar.piercingLine)     { puan += 18; pozitif.push('Piercing Line'); }
    if (mumlar.doji)             { puan +=  5; pozitif.push('Doji (Kararsızlık)'); }

    // ── TREND ÇİZGİSİ (MAX 15) ──────────────────────────────
    if (yukselisTrendi) { puan += 15; pozitif.push('HH & HL (Yükseliş Trendi)'); }
    if (dususTrendi)    { puan -= 15; negatif.push('LH & LL (Düşüş Trendi)'); }

    // ── ZORUNLU FİLTRE CEZASI ────────────────────────────────
    if (!rsiUygun)   puan -= 30;
    if (!hacimUygun) puan -= 20;

    // ── SİNYAL KARARI ────────────────────────────────────────
    const sinyal = puan >= 50 ? 'ALIM' : puan <= -20 ? 'SATIS' : 'BEKLE';
    const risk   = puan >= 80 ? 'DUSUK' : puan >= 60 ? 'ORTA' : 'YUKSEK';

    // ATR bazlı hedef ve stop
    const hedef   = parseFloat((fiyat + atr14 * 3).toFixed(8));
    const stopLos = parseFloat((fiyat - atr14 * 1.5).toFixed(8));
    const rrOrani = parseFloat(((hedef - fiyat) / (fiyat - stopLos)).toFixed(2));

    return {
      symbol:       ticker.symbol,
      fiyat:        parseFloat(fiyat.toFixed(8)),
      puan,
      risk,
      sinyal,
      // RSI grubu
      rsi:          parseFloat(rsi.toFixed(2)),
      rsi7:         parseFloat(rsi7.toFixed(2)),
      rsiYon,
      rsiDivBull,
      rsiDivBear,
      // Stochastic
      stochK:       parseFloat(stochK.toFixed(2)),
      stochD:       parseFloat(stochD.toFixed(2)),
      stochBull,
      // Williams
      williamsR:    parseFloat(williamsR.toFixed(2)),
      williamsAlim,
      // CCI
      cci:          parseFloat(cci.toFixed(2)),
      // ADX
      adx:          parseFloat(adx.adx.toFixed(2)),
      diPlus:       parseFloat(diPlus.toFixed(2)),
      diMinus:      parseFloat(diMinus.toFixed(2)),
      trendGuclu,
      trendYon,
      // EMA
      trend,
      goldenCross,
      deathCross,
      emaBullAlign,
      ema9:         parseFloat(ema9.toFixed(8)),
      ema21:        parseFloat(ema21.toFixed(8)),
      ema50:        parseFloat(ema50.toFixed(8)),
      ema200:       ema200 ? parseFloat(ema200.toFixed(8)) : null,
      // MACD
      macdLine:     parseFloat(macdLine.toFixed(8)),
      signalLine:   parseFloat(signalLine.toFixed(8)),
      macdHist:     parseFloat(macdHist.toFixed(8)),
      macdBullish,
      macdBearish,
      macdBullDiv,
      macdZeroXup,
      // Bollinger
      bPct:         parseFloat(bPct.toFixed(2)),
      bWidth:       parseFloat(bWidth.toFixed(2)),
      bSqueeze,
      bollinger_pct: parseFloat(bPct.toFixed(2)),
      // OBV
      obvTrend,
      obvDiv,
      // CMF
      cmf:          parseFloat(cmf.toFixed(4)),
      cmfBull,
      // VWAP
      vwap:         parseFloat(vwap.toFixed(8)),
      vwapBull,
      // Hacim
      volOran,
      volSpike,
      volBaskisi,
      alimOrani:    parseFloat(alimOrani.toFixed(1)),
      // S/R
      destek:       parseFloat(destek.toFixed(8)),
      direnc:       parseFloat(direnc.toFixed(8)),
      destekUzak:   parseFloat(destekUzak.toFixed(2)),
      direncUzak:   parseFloat(direncUzak.toFixed(2)),
      direncKirildi,
      destekKirildi,
      fibDesteği,
      fib382:       parseFloat(fib382.toFixed(8)),
      fib618:       parseFloat(fib618.toFixed(8)),
      // Mum
      mumlar,
      yukselisTrendi,
      dususTrendi,
      // Risk/Ödül
      atr14:        parseFloat(atr14.toFixed(8)),
      atrOran:      parseFloat(atrOran.toFixed(2)),
      hedef,
      stop_loss:    stopLos,
      rrOrani,
      // Özet
      pozitif,
      negatif,
      degisim24h:   parseFloat(ticker.priceChangePercent || 0),
      hacim24h:     parseFloat(ticker.quoteVolume || 0)
    };
  }

  // ════════════════════════════════════════════════════════
  // İNDİKATÖR FONKSİYONLARI
  // ════════════════════════════════════════════════════════

  hesaplaRSI(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i] - data[i-1];
      if (diff > 0) gains  += diff;
      else          losses -= diff;
    }
    const ag = gains / period;
    const al = losses / period;
    if (al === 0) return 100;
    return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
  }

  hesaplaEMA(data, period) {
    if (data.length < period) return data[data.length-1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a,b)=>a+b,0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1-k);
    }
    return parseFloat(ema.toFixed(8));
  }

  hesaplaStochRSI(closes, rsiPeriod=14, stochPeriod=14, smoothK=3, smoothD=3) {
    // RSI serisini hesapla
    const rsiSeries = [];
    for (let i = rsiPeriod; i <= closes.length; i++) {
      rsiSeries.push(this.hesaplaRSI(closes.slice(0, i), rsiPeriod));
    }
    if (rsiSeries.length < stochPeriod) return { k: 50, d: 50 };

    // Stochastic RSI
    const stochSeries = [];
    for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
      const slice  = rsiSeries.slice(i - stochPeriod + 1, i + 1);
      const maxRSI = Math.max(...slice);
      const minRSI = Math.min(...slice);
      const stoch  = maxRSI === minRSI ? 50 : (rsiSeries[i] - minRSI) / (maxRSI - minRSI) * 100;
      stochSeries.push(stoch);
    }

    // Smooth K
    const kSmoothed = [];
    for (let i = smoothK - 1; i < stochSeries.length; i++) {
      kSmoothed.push(stochSeries.slice(i - smoothK + 1, i + 1).reduce((a,b)=>a+b,0) / smoothK);
    }

    // D line
    const dSmoothed = [];
    for (let i = smoothD - 1; i < kSmoothed.length; i++) {
      dSmoothed.push(kSmoothed.slice(i - smoothD + 1, i + 1).reduce((a,b)=>a+b,0) / smoothD);
    }

    return {
      k: kSmoothed[kSmoothed.length - 1] || 50,
      d: dSmoothed[dSmoothed.length - 1] || 50
    };
  }

  hesaplaWilliamsR(highs, lows, closes, period=14) {
    const slice = highs.slice(-period);
    const lowSlice = lows.slice(-period);
    const highestHigh = Math.max(...slice);
    const lowestLow   = Math.min(...lowSlice);
    const close = closes[closes.length - 1];
    if (highestHigh === lowestLow) return -50;
    return ((highestHigh - close) / (highestHigh - lowestLow) * -100);
  }

  hesaplaCCI(highs, lows, closes, period=20) {
    const tp = closes.map((c,i) => (highs[i] + lows[i] + c) / 3);
    const slice = tp.slice(-period);
    const mean  = slice.reduce((a,b)=>a+b,0) / period;
    const mad   = slice.reduce((a,b)=>a+Math.abs(b-mean),0) / period;
    if (mad === 0) return 0;
    return (tp[tp.length-1] - mean) / (0.015 * mad);
  }

  hesaplaADX(highs, lows, closes, period=14) {
    if (highs.length < period + 1) return { adx: 0, diPlus: 0, diMinus: 0 };

    const trList=[], dmPlus=[], dmMinus=[];
    for (let i = 1; i < highs.length; i++) {
      const h = highs[i], l = lows[i], ph = highs[i-1], pl = lows[i-1], pc = closes[i-1];
      trList.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
      dmPlus.push(h-ph > pl-l && h-ph > 0 ? h-ph : 0);
      dmMinus.push(pl-l > h-ph && pl-l > 0 ? pl-l : 0);
    }

    const atr   = trList.slice(-period).reduce((a,b)=>a+b,0) / period;
    const diP   = (dmPlus.slice(-period).reduce((a,b)=>a+b,0) / period) / atr * 100;
    const diM   = (dmMinus.slice(-period).reduce((a,b)=>a+b,0) / period) / atr * 100;
    const dx    = Math.abs(diP - diM) / (diP + diM) * 100;

    return { adx: dx, diPlus: diP, diMinus: diM };
  }

  hesaplaMACD(closes, fast=12, slow=26, signal=9) {
    const emaFast = this.hesaplaEMA(closes, fast);
    const emaSlow = this.hesaplaEMA(closes, slow);
    const macdLine = emaFast - emaSlow;

    const macdSeries = [];
    for (let i = slow; i < closes.length; i++) {
      const ef = this.hesaplaEMA(closes.slice(0, i+1), fast);
      const es = this.hesaplaEMA(closes.slice(0, i+1), slow);
      macdSeries.push(ef - es);
    }
    const signalLine  = this.hesaplaEMA(macdSeries, signal);
    const histogram   = macdLine - signalLine;
    const prevMacd    = macdSeries[macdSeries.length-2] || 0;
    const prevSignal  = this.hesaplaEMA(macdSeries.slice(0,-1), signal);

    // Divergence
    const closes5  = closes.slice(-5);
    const macd5    = macdSeries.slice(-5);
    const bullDiv  = closes5[4] < closes5[0] && macd5[4] > macd5[0];
    const bearDiv  = closes5[4] > closes5[0] && macd5[4] < macd5[0];

    return {
      macdLine,
      signalLine,
      histogram,
      prevMacd,
      bullishCross: prevMacd <= prevSignal && macdLine > signalLine,
      bearishCross: prevMacd >= prevSignal && macdLine < signalLine,
      bullDiv,
      bearDiv
    };
  }

  hesaplaBollinger(closes, period=20, multiplier=2) {
    const slice = closes.slice(-period);
    const mean  = slice.reduce((a,b)=>a+b,0) / period;
    const std   = Math.sqrt(slice.reduce((a,b)=>a+Math.pow(b-mean,2),0) / period);
    const upper = mean + multiplier * std;
    const lower = mean - multiplier * std;
    const width = (upper - lower) / mean * 100;
    const pct   = (closes[closes.length-1] - lower) / (upper - lower) * 100;

    // Önceki bant genişliği
    const prevSlice = closes.slice(-period-5,-5);
    const prevMean  = prevSlice.reduce((a,b)=>a+b,0) / period;
    const prevStd   = Math.sqrt(prevSlice.reduce((a,b)=>a+Math.pow(b-prevMean,2),0) / period);
    const prevWidth = ((prevMean+2*prevStd) - (prevMean-2*prevStd)) / prevMean * 100;

    return {
      upper, lower, mid: mean, width, percent: pct,
      expanding: width > prevWidth * 1.1,
      contracting: width < prevWidth * 0.9
    };
  }

  hesaplaOBV(closes, volumes) {
    let obv = 0;
    const series = [0];
    for (let i = 1; i < closes.length; i++) {
      if      (closes[i] > closes[i-1]) obv += volumes[i];
      else if (closes[i] < closes[i-1]) obv -= volumes[i];
      series.push(obv);
    }
    const obv5  = series.slice(-5).reduce((a,b)=>a+b,0)  / 5;
    const obv20 = series.slice(-20).reduce((a,b)=>a+b,0) / 20;
    const obv50 = series.slice(-50).reduce((a,b)=>a+b,0) / 50;

    let trend = 'NOTR';
    if      (obv5 > obv20 && obv20 > obv50) trend = 'GUCLU_YUKARI';
    else if (obv5 > obv20)                   trend = 'YUKARI';
    else if (obv5 < obv20 && obv20 < obv50) trend = 'ASAGI';

    // Divergence
    const closes5 = closes.slice(-5);
    const obv5s   = series.slice(-5);
    let divergence = 'YOK';
    if (closes5[4] < closes5[0] && obv5s[4] > obv5s[0]) divergence = 'BULL';
    if (closes5[4] > closes5[0] && obv5s[4] < obv5s[0]) divergence = 'BEAR';

    return { trend, divergence, current: obv };
  }

  hesaplaCMF(highs, lows, closes, volumes, period=20) {
    let mfvSum = 0, volSum = 0;
    const start = closes.length - period;
    for (let i = start; i < closes.length; i++) {
      const h = highs[i], l = lows[i], c = closes[i], v = volumes[i];
      const mfm = h === l ? 0 : ((c-l) - (h-c)) / (h-l);
      mfvSum += mfm * v;
      volSum += v;
    }
    return volSum === 0 ? 0 : mfvSum / volSum;
  }

  hesaplaVWAP(highs, lows, closes, volumes) {
    let tpvSum = 0, volSum = 0;
    const period = Math.min(20, closes.length);
    for (let i = closes.length - period; i < closes.length; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      tpvSum += tp * volumes[i];
      volSum += volumes[i];
    }
    return volSum === 0 ? closes[closes.length-1] : tpvSum / volSum;
  }

  hesaplaATR(highs, lows, closes, period=14) {
    const trList = [];
    for (let i = 1; i < closes.length; i++) {
      trList.push(Math.max(
        highs[i]-lows[i],
        Math.abs(highs[i]-closes[i-1]),
        Math.abs(lows[i]-closes[i-1])
      ));
    }
    return trList.slice(-period).reduce((a,b)=>a+b,0) / period;
  }

  hesaplaSR(highs, lows, closes, lookback=50) {
    const h = highs.slice(-lookback);
    const l = lows.slice(-lookback);
    return {
      direnc: Math.max(...h),
      destek: Math.min(...l)
    };
  }

  hesaplaFibonacci(highs, lows, lookback=50) {
    const maxH = Math.max(...highs.slice(-lookback));
    const minL = Math.min(...lows.slice(-lookback));
    const diff = maxH - minL;
    return {
      level236: maxH - diff * 0.236,
      level382: maxH - diff * 0.382,
      level500: maxH - diff * 0.500,
      level618: maxH - diff * 0.618,
      level786: maxH - diff * 0.786
    };
  }

  rsiBullishDiv(closes, highs, lows) {
    const n = closes.length;
    if (n < 10) return false;
    const rsiNow  = this.hesaplaRSI(closes, 14);
    const rsiPrev = this.hesaplaRSI(closes.slice(0,-5), 14);
    return closes[n-1] < closes[n-6] && rsiNow > rsiPrev;
  }

  rsiBearishDiv(closes, highs, lows) {
    const n = closes.length;
    if (n < 10) return false;
    const rsiNow  = this.hesaplaRSI(closes, 14);
    const rsiPrev = this.hesaplaRSI(closes.slice(0,-5), 14);
    return closes[n-1] > closes[n-6] && rsiNow < rsiPrev;
  }

  analizMumYapilari(candles) {
    const n = candles.length;
    if (n < 3) return {};

    const c0 = candles[n-1]; // Son mum
    const c1 = candles[n-2]; // Önceki
    const c2 = candles[n-3]; // İki önceki

    const o0=parseFloat(c0[1]), h0=parseFloat(c0[2]), l0=parseFloat(c0[3]), cl0=parseFloat(c0[4]);
    const o1=parseFloat(c1[1]), h1=parseFloat(c1[2]), l1=parseFloat(c1[3]), cl1=parseFloat(c1[4]);
    const o2=parseFloat(c2[1]), h2=parseFloat(c2[2]), l2=parseFloat(c2[3]), cl2=parseFloat(c2[4]);

    const body0  = Math.abs(cl0-o0);
    const body1  = Math.abs(cl1-o1);
    const range0 = h0-l0;
    const ust0   = h0 - Math.max(cl0,o0);
    const alt0   = Math.min(cl0,o0) - l0;
    const bull0  = cl0 > o0;
    const bear0  = cl0 < o0;
    const bull1  = cl1 > o1;
    const bear1  = cl1 < o1;

    return {
      // Tek mum
      hammer:          alt0 > body0*2 && ust0 < body0*0.5 && bull0,
      invertedHammer:  ust0 > body0*2 && alt0 < body0*0.5 && bull0,
      shootingStar:    ust0 > body0*2 && alt0 < body0*0.5 && bear0,
      hangingMan:      alt0 > body0*2 && ust0 < body0*0.5 && bear0,
      doji:            body0 < range0*0.1,
      dojiDragonfly:   body0 < range0*0.1 && alt0 > range0*0.6,
      dojiGravestone:  body0 < range0*0.1 && ust0 > range0*0.6,
      spinningTop:     body0 < range0*0.3 && ust0 > range0*0.2 && alt0 > range0*0.2,
      marubozu:        body0 > range0*0.9,

      // İki mum
      bullishEngulfing: bear1 && bull0 && o0 <= cl1 && cl0 >= o1,
      bearishEngulfing: bull1 && bear0 && o0 >= cl1 && cl0 <= o1,
      piercingLine:     bear1 && bull0 && o0 < l1 && cl0 > (o1+cl1)/2,
      darkCloudCover:   bull1 && bear0 && o0 > h1 && cl0 < (o1+cl1)/2,
      tweezerBottom:    Math.abs(l0-l1)/l0 < 0.001 && bull0 && bear1,
      tweezerTop:       Math.abs(h0-h1)/h0 < 0.001 && bear0 && bull1,

      // Üç mum
      morningStar:      bear1 && body1 < Math.abs(cl2-o2)*0.5 && bull0 && cl0 > (o2+cl2)/2,
      eveningStar:      bull1 && body1 < Math.abs(cl2-o2)*0.5 && bear0 && cl0 < (o2+cl2)/2,
      threeWhiteSoldiers: bull0 && bull1 && cl2>o2 && cl0>cl1 && cl1>cl2,
      threeBlackCrows:    bear0 && bear1 && cl2<o2 && cl0<cl1 && cl1<cl2,
      threeInsideUp:    bear1 && bull0 && cl0>o1 && cl1>o1*0.5+cl1*0.5,
      threeInsideDown:  bull1 && bear0 && cl0<o1,
    };
  }
}

module.exports = new ProfessionalAnalysis();
