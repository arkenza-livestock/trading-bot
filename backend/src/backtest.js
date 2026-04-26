const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');

class BacktestEngine {

  async run(params = {}) {
    const {
      symbol        = 'BTCUSDT',
      interval      = '1h',
      days          = 30,
      stopLoss      = 2.0,
      trailingStop  = 0.5,
      minProfit     = 1.5,
      commission    = 0.1,
      slippage      = 0.05,
      minScore      = 50,
      tradeAmount   = 100,
      rsiPeriod     = 7,
      rsiOversold   = 40,
      rsiOverbought = 70,
      srLookback    = 20,
      maxPositions  = 3,
      symbols       = null
    } = params;

    const settings = {
      rsi_period: rsiPeriod, rsi_oversold: rsiOversold,
      rsi_overbought: rsiOverbought, sr_lookback: srLookback,
      min_score: minScore, commission_rate: commission,
      slippage_rate: slippage, min_profit_percent: minProfit,
      stop_loss_percent: stopLoss, trailing_stop_percent: trailingStop,
      min_volume: 0
    };

    const intervalMinutes = this.getIntervalMinutes(interval);
    const totalCandles    = Math.ceil((days * 24 * 60) / intervalMinutes) + 100;
    const limit           = Math.min(totalCandles, 1000);
    const coinList        = (symbols && symbols.length > 0) ? symbols : [symbol];
    const isMulti         = coinList.length > 1;

    console.log(`Backtest başlıyor: ${coinList.length} coin | ${interval} | ${days} gün | limit:${limit}`);

    const getKlines = async (sym, tf, lim) => {
      try {
        const binance = new BinanceService('', '');
        const data = await binance.getKlines(sym, tf, lim);
        return data || [];
      } catch (err) {
        console.error(`${sym} ${tf} hata:`, err.message);
        return [];
      }
    };

    // Tüm coinlerin verilerini çek
    const coinData = {};
    for (const sym of coinList) {
      await new Promise(r => setTimeout(r, 150));
      const main = await getKlines(sym, interval, limit);
      await new Promise(r => setTimeout(r, 150));
      const h1 = await getKlines(sym, '1h', 500);
      await new Promise(r => setTimeout(r, 150));
      const h4 = await getKlines(sym, '4h', 300);

      if (main.length >= 50) {
        coinData[sym] = { main, h1, h4 };
        console.log(`✅ ${sym}: main=${main.length} 1H=${h1.length} 4H=${h4.length}`);
      } else {
        console.log(`⚠️ ${sym}: yetersiz (${main.length})`);
      }
    }

    const availableCoins = Object.keys(coinData);
    console.log(`Kullanılabilir: ${availableCoins.length} coin`);
    if (availableCoins.length === 0) throw new Error('Hiçbir coin için veri çekilemedi');

    // BTC verisi
    let btcMain = [], btcH1 = [], btcH4 = [];
    if (coinData['BTCUSDT']) {
      btcMain = coinData['BTCUSDT'].main;
      btcH1   = coinData['BTCUSDT'].h1;
      btcH4   = coinData['BTCUSDT'].h4;
    } else {
      await new Promise(r => setTimeout(r, 150));
      btcMain = await getKlines('BTCUSDT', interval, limit);
      await new Promise(r => setTimeout(r, 150));
      btcH1 = await getKlines('BTCUSDT', '1h', 500);
      await new Promise(r => setTimeout(r, 150));
      btcH4 = await getKlines('BTCUSDT', '4h', 300);
      console.log(`BTC (ayrı): main=${btcMain.length} 1H=${btcH1.length} 4H=${btcH4.length}`);
    }

    // Referans zaman çizgisi
    const refData = (btcMain.length >= 50 ? btcMain : coinData[availableCoins[0]].main);
    if (refData.length < 50) throw new Error('Referans veri yetersiz');

    // Hızlı erişim için index
    const coinIndex = {};
    for (const sym of availableCoins) {
      coinIndex[sym] = {};
      for (const c of coinData[sym].main) coinIndex[sym][parseInt(c[0])] = c;
    }

    const totalCost     = (commission + slippage) / 100 * 2;
    const trades        = [];
    const openPositions = {};
    const highestPrices = {};

    // BTC trend cache
    let cachedBtcTrend4H  = { trend: 'BELIRSIZ', guclu: false };
    let cachedBtcTrend1H  = { trend: 'BELIRSIZ', guclu: false };
    let lastBtcTrendUpdate = 0;

    for (let i = 50; i < refData.length; i++) {
      const candleTime = parseInt(refData[i][0]);

      // Açık pozisyonları kontrol et
      for (const sym of Object.keys(openPositions)) {
        const pos       = openPositions[sym];
        const symCandle = coinIndex[sym]?.[candleTime];
        if (!symCandle) continue;

        const posPrice = parseFloat(symCandle[4]);
        if (posPrice > (highestPrices[sym] || pos.entryPrice)) highestPrices[sym] = posPrice;

        const trailingStopPrice = (highestPrices[sym] || pos.entryPrice) * (1 - trailingStop / 100);
        const brutoPnlPct       = ((posPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const netPnlPct         = brutoPnlPct - (totalCost * 100);
        pos.currentPnlPct       = netPnlPct;

        let closeReason = null;
        if (netPnlPct <= -stopLoss)                                         closeReason = 'STOP_LOSS';
        else if (brutoPnlPct >= minProfit && posPrice <= trailingStopPrice) closeReason = 'TRAILING_STOP';

        if (closeReason) {
          const netPnl = (posPrice - pos.entryPrice) * pos.quantity - (pos.entryPrice * pos.quantity * totalCost);
          trades.push({
            symbol: sym, entryTime: pos.entryTime, exitTime: new Date(candleTime),
            entryPrice: pos.entryPrice, exitPrice: posPrice, quantity: pos.quantity,
            reason: closeReason,
            netPnl: parseFloat(netPnl.toFixed(4)), netPnlPct: parseFloat(netPnlPct.toFixed(2)),
            score: pos.score, trend1H: pos.trend1H, trend4H: pos.trend4H, btcTrend: pos.btcTrend
          });
          delete openPositions[sym];
          delete highestPrices[sym];
        }
      }

      // Koruma filtreleri
      if (Object.keys(openPositions).length >= maxPositions) continue;

      const zararliVar = Object.values(openPositions).some(p => (p.currentPnlPct || 0) < -0.5);
      if (zararliVar) continue;

      // BTC ani düşüş
      if (btcMain.length >= 4) {
        const btcSlice = btcMain.filter(c => parseInt(c[0]) <= candleTime);
        if (btcSlice.length >= 4) {
          const btcNow  = parseFloat(btcSlice[btcSlice.length-1][4]);
          const btc3ago = parseFloat(btcSlice[btcSlice.length-4][4]);
          if (((btcNow - btc3ago) / btc3ago) * 100 < -1.0) continue;
        }
      }

      // BTC trend — 4 saatte bir güncelle
      if (candleTime - lastBtcTrendUpdate >= 4 * 60 * 60 * 1000) {
        const h1f = btcH1.filter(c => parseInt(c[0]) <= candleTime);
        const h4f = btcH4.filter(c => parseInt(c[0]) <= candleTime);
        if (h1f.length >= 50) cachedBtcTrend1H = TechnicalAnalysis.analyze1H(h1f);
        if (h4f.length >= 50) cachedBtcTrend4H = TechnicalAnalysis.analyze4H(h4f);
        lastBtcTrendUpdate = candleTime;
      }

      if (cachedBtcTrend4H.trend === 'ASAGI' && cachedBtcTrend1H.trend === 'ASAGI') continue;

      const btcMinScore = cachedBtcTrend4H.trend === 'ASAGI'       ? 75
        : cachedBtcTrend4H.trend === 'HAFIF_ASAGI' ? 65
        : cachedBtcTrend4H.trend === 'YATAY'       ? 55
        : cachedBtcTrend4H.trend === 'BELIRSIZ'    ? 60
        : 0;

      // Her coin için sinyal ara
      for (const sym of availableCoins) {
        if (openPositions[sym]) continue;

        const symData = coinData[sym];
        const symMain = symData.main.filter(c => parseInt(c[0]) <= candleTime);
        if (symMain.length < 50) continue;

        const price    = parseFloat(symMain[symMain.length-1][4]);
        const ticker   = { symbol: sym, priceChangePercent: '0', quoteVolume: '999999999' };
        const analysis = TechnicalAnalysis.analyze(symMain, ticker, settings);
        if (!analysis || analysis.signal !== 'ALIM') continue;
        if (btcMinScore > 0 && analysis.score < btcMinScore) continue;

        const symH4 = symData.h4.filter(c => parseInt(c[0]) <= candleTime);
        const trend4H = TechnicalAnalysis.analyze4H(symH4);
        if (['ASAGI', 'HAFIF_ASAGI', 'BELIRSIZ'].includes(trend4H.trend)) continue;
        if (trend4H.trend === 'YATAY' && analysis.score < 65) continue;

        const symH1 = symData.h1.filter(c => parseInt(c[0]) <= candleTime);
        const trend1H = TechnicalAnalysis.analyze1H(symH1);
        if (['ASAGI', 'BELIRSIZ'].includes(trend1H.trend)) continue;
        if (trend1H.trend === 'HAFIF_ASAGI' && analysis.score < 70) continue;
        if (trend1H.trend === 'YATAY' && analysis.score < 55) continue;

        let finalScore = analysis.score;
        if      (trend4H.trend === 'YUKARI' && trend1H.trend === 'YUKARI') finalScore = Math.min(100, finalScore + (trend4H.guclu && trend1H.guclu ? 25 : 15));
        else if (trend4H.trend === 'YUKARI') finalScore = Math.min(100, finalScore + 10);
        else if (trend1H.trend === 'YUKARI') finalScore = Math.min(100, finalScore + 8);
        if (cachedBtcTrend4H.trend === 'YUKARI') finalScore = Math.min(100, finalScore + 5);
        if (finalScore < minScore) continue;

        let multiplier = finalScore >= 80 ? 2.0 : finalScore >= 70 ? 1.5 : finalScore >= 60 ? 1.25 : finalScore >= 50 ? 1.0 : 0.75;
        if      (trend4H.trend === 'YUKARI' && trend1H.trend === 'YUKARI') multiplier *= trend4H.guclu && trend1H.guclu ? 1.5 : 1.3;
        else if (trend4H.trend === 'YUKARI') multiplier *= 1.1;
        else if (trend1H.trend === 'YATAY')  multiplier *= 0.7;
        if      (cachedBtcTrend4H.trend === 'YUKARI') multiplier *= 1.1;
        else if (cachedBtcTrend4H.trend === 'YATAY')  multiplier *= 0.8;
        multiplier = Math.min(2.0, Math.max(0.25, multiplier));

        const finalAmount = tradeAmount * multiplier;
        openPositions[sym] = {
          entryTime: new Date(candleTime), entryPrice: price,
          quantity: finalAmount / price, score: finalScore,
          trend1H: trend1H.trend, trend4H: trend4H.trend,
          btcTrend: cachedBtcTrend4H.trend,
          amount: finalAmount, currentPnlPct: 0
        };
        highestPrices[sym] = price;

        if (Object.keys(openPositions).length >= maxPositions) break;
      }
    }

    // Açık pozisyonları kapat
    for (const sym of Object.keys(openPositions)) {
      const pos       = openPositions[sym];
      const symMain   = coinData[sym]?.main || [];
      const lastPrice = symMain.length > 0 ? parseFloat(symMain[symMain.length-1][4]) : pos.entryPrice;
      const netPnl    = (lastPrice - pos.entryPrice) * pos.quantity - (pos.entryPrice * pos.quantity * totalCost);
      const netPnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice * 100) - (totalCost * 100);
      trades.push({
        symbol: sym, entryTime: pos.entryTime,
        exitTime: new Date(parseInt(refData[refData.length-1][0])),
        entryPrice: pos.entryPrice, exitPrice: lastPrice,
        quantity: pos.quantity, reason: 'OPEN',
        netPnl: parseFloat(netPnl.toFixed(4)), netPnlPct: parseFloat(netPnlPct.toFixed(2)),
        score: pos.score, trend1H: pos.trend1H, trend4H: pos.trend4H, btcTrend: pos.btcTrend
      });
    }

    const closedTrades = trades.filter(t => t.reason !== 'OPEN');
    const wins         = closedTrades.filter(t => t.netPnl > 0);
    const losses       = closedTrades.filter(t => t.netPnl <= 0);
    const totalPnl     = trades.reduce((s, t) => s + t.netPnl, 0);
    const winRate      = closedTrades.length > 0 ? wins.length / closedTrades.length * 100 : 0;
    const bestTrade    = trades.reduce((b, t) => t.netPnlPct > (b?.netPnlPct || -999) ? t : b, null);
    const worstTrade   = trades.reduce((w, t) => t.netPnlPct < (w?.netPnlPct || 999)  ? t : w, null);
    const avgWin       = wins.length   > 0 ? wins.reduce((s,t)   => s + t.netPnlPct, 0) / wins.length   : 0;
    const avgLoss      = losses.length > 0 ? losses.reduce((s,t) => s + t.netPnlPct, 0) / losses.length : 0;
    const grossWin     = Math.abs(wins.reduce((s,t)   => s + t.netPnl, 0));
    const grossLoss    = Math.abs(losses.reduce((s,t) => s + t.netPnl, 0));

    const coinSummaryMap = {};
    for (const t of trades) {
      if (!coinSummaryMap[t.symbol]) coinSummaryMap[t.symbol] = { symbol: t.symbol, totalTrades: 0, wins: 0, losses: 0, totalPnl: 0 };
      coinSummaryMap[t.symbol].totalTrades++;
      if (t.reason !== 'OPEN') { if (t.netPnl > 0) coinSummaryMap[t.symbol].wins++; else coinSummaryMap[t.symbol].losses++; }
      coinSummaryMap[t.symbol].totalPnl += t.netPnl;
    }

    const coinSummaries = Object.values(coinSummaryMap).map(c => ({
      ...c,
      totalPnl: parseFloat(c.totalPnl.toFixed(4)),
      winRate: c.wins + c.losses > 0 ? parseFloat((c.wins / (c.wins + c.losses) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.totalPnl - a.totalPnl);

    return {
      params: { symbol: coinList.join(','), interval, days, stopLoss, trailingStop, minScore, tradeAmount, maxPositions },
      isMulti, coinSummaries,
      summary: {
        totalCoins: availableCoins.length, totalTrades: trades.length,
        wins: wins.length, losses: losses.length,
        winRate: parseFloat(winRate.toFixed(1)),
        totalPnl: parseFloat(totalPnl.toFixed(4)),
        avgWin: parseFloat(avgWin.toFixed(2)), avgLoss: parseFloat(avgLoss.toFixed(2)),
        bestTrade:    bestTrade  ? parseFloat(bestTrade.netPnlPct.toFixed(2))  : 0,
        worstTrade:   worstTrade ? parseFloat(worstTrade.netPnlPct.toFixed(2)) : 0,
        profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : 999
      },
      trades: trades.sort((a,b) => new Date(b.entryTime) - new Date(a.entryTime)).slice(0, 50)
    };
  }

  getIntervalMinutes(interval) {
    const map = { '1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440 };
    return map[interval] || 60;
  }
}

module.exports = new BacktestEngine();
