const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');

class BacktestEngine {

  async run(params = {}) {
    const {
      symbol        = 'BTCUSDT',
      interval      = '5m',
      days          = 7,
      stopLoss      = 0.75,
      trailingStop  = 0.5,
      minProfit     = 0.5,
      commission    = 0.1,
      slippage      = 0.05,
      minScore      = 35,
      tradeAmount   = 100,
      rsiPeriod     = 7,
      rsiOversold   = 40,
      rsiOverbought = 70,
      srLookback    = 20,
      maxPositions  = 3,
      symbols       = null  // null = tek coin, array = multi coin
    } = params;

    const binance  = new BinanceService('', '');
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
    const coinList        = symbols || [symbol];
    const isMulti         = coinList.length > 1;

    console.log(`Backtest: ${coinList.length} coin | ${interval} | ${days} gün | ${limit} mum`);

    // Tüm coinlerin verilerini çek
    const coinData = {};
    for (const sym of coinList) {
      try {
        const [main, h1, h4] = await Promise.all([
          binance.getKlines(sym, interval, limit),
          binance.getKlines(sym, '1h', 500),
          binance.getKlines(sym, '4h', 300)
        ]);
        coinData[sym] = { main, h1, h4 };
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`${sym} veri hatası:`, err.message);
      }
    }

    // BTC verisi
    let btcMain = [], btcH1 = [], btcH4 = [];
    if (!coinList.includes('BTCUSDT')) {
      try {
        [btcMain, btcH1, btcH4] = await Promise.all([
          binance.getKlines('BTCUSDT', interval, limit),
          binance.getKlines('BTCUSDT', '1h', 500),
          binance.getKlines('BTCUSDT', '4h', 300)
        ]);
      } catch (err) {}
    } else {
      btcMain = coinData['BTCUSDT']?.main || [];
      btcH1   = coinData['BTCUSDT']?.h1   || [];
      btcH4   = coinData['BTCUSDT']?.h4   || [];
    }

    console.log(`Veriler hazır. BTC: ${btcMain.length} mum`);

    // Referans zaman çizgisi — en çok mumu olan coinin zamanları
    const refSymbol  = coinList[0];
    const refCandles = coinData[refSymbol]?.main || [];
    if (refCandles.length < 50) throw new Error('Yetersiz veri');

    const totalCost     = (commission + slippage) / 100 * 2;
    const trades        = [];
    const openPositions = {}; // symbol → position
    const highestPrices = {}; // symbol → highest price

    // Her zaman adımında tüm coinleri kontrol et
    for (let i = 50; i < refCandles.length; i++) {
      const candleTime = parseInt(refCandles[i][0]);

      // ── Açık pozisyonları güncelle ve kontrol et ──────────
      for (const sym of Object.keys(openPositions)) {
        const pos      = openPositions[sym];
        const symData  = coinData[sym]?.main || [];
        const symCandle = symData.find(c => parseInt(c[0]) === candleTime);
        if (!symCandle) continue;

        const posPrice = parseFloat(symCandle[4]);

        if (posPrice > (highestPrices[sym] || pos.entryPrice)) {
          highestPrices[sym] = posPrice;
        }

        const trailingStopPrice = (highestPrices[sym] || pos.entryPrice) * (1 - trailingStop / 100);
        const brutoPnlPct       = ((posPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const netPnlPct         = brutoPnlPct - (totalCost * 100);

        pos.currentPnlPct = netPnlPct;

        let closeReason = null;
        if (netPnlPct <= -stopLoss)                                          closeReason = 'STOP_LOSS';
        else if (brutoPnlPct >= minProfit && posPrice <= trailingStopPrice)  closeReason = 'TRAILING_STOP';

        if (closeReason) {
          const netPnl = (posPrice - pos.entryPrice) * pos.quantity
                       - (pos.entryPrice * pos.quantity * totalCost);
          trades.push({
            symbol:     sym,
            entryTime:  pos.entryTime,
            exitTime:   new Date(candleTime),
            entryPrice: pos.entryPrice,
            exitPrice:  posPrice,
            quantity:   pos.quantity,
            reason:     closeReason,
            netPnl:     parseFloat(netPnl.toFixed(4)),
            netPnlPct:  parseFloat(netPnlPct.toFixed(2)),
            score:      pos.score,
            trend1H:    pos.trend1H,
            trend4H:    pos.trend4H,
            btcTrend:   pos.btcTrend
          });
          delete openPositions[sym];
          delete highestPrices[sym];
        }
      }

      // ── Koruma filtreleri ──────────────────────────────────

      // 1 — Max pozisyon
      if (Object.keys(openPositions).length >= maxPositions) continue;

      // 2 — Zararlı pozisyon varsa yeni alım yapma
      const zararliVar = Object.values(openPositions).some(p => (p.currentPnlPct || 0) < -0.5);
      if (zararliVar) continue;

      // 3 — BTC ani düşüş
      if (btcMain.length >= 4) {
        const btcIdx  = btcMain.filter(c => parseInt(c[0]) <= candleTime);
        if (btcIdx.length >= 4) {
          const btcNow  = parseFloat(btcIdx[btcIdx.length-1][4]);
          const btc3ago = parseFloat(btcIdx[btcIdx.length-4][4]);
          const btcDrop = ((btcNow - btc3ago) / btc3ago) * 100;
          if (btcDrop < -1.0) continue;
        }
      }

      // 4 — BTC trend
      const btcH1Filtered = btcH1.filter(c => parseInt(c[0]) <= candleTime);
      const btcH4Filtered = btcH4.filter(c => parseInt(c[0]) <= candleTime);
      const btcTrend1H = coinList.includes('BTCUSDT') && !isMulti
        ? { trend: 'YUKARI' }
        : TechnicalAnalysis.analyze1H(btcH1Filtered);
      const btcTrend4H = coinList.includes('BTCUSDT') && !isMulti
        ? { trend: 'YUKARI' }
        : TechnicalAnalysis.analyze4H(btcH4Filtered);

      if (btcTrend4H.trend === 'ASAGI' && btcTrend1H.trend === 'ASAGI') continue;

      const btcMinScore = btcTrend4H.trend === 'ASAGI'       ? 75
        : btcTrend4H.trend === 'HAFIF_ASAGI' ? 65
        : btcTrend4H.trend === 'YATAY'       ? 55
        : btcTrend4H.trend === 'BELIRSIZ'    ? 60
        : 0;

      // ── Her coin için sinyal ara ───────────────────────────
      for (const sym of coinList) {
        // Zaten açık pozisyon varsa atla
        if (openPositions[sym]) continue;

        const symData = coinData[sym];
        if (!symData) continue;

        const symMain = symData.main.filter(c => parseInt(c[0]) <= candleTime);
        const symH1   = symData.h1.filter(c => parseInt(c[0]) <= candleTime);
        const symH4   = symData.h4.filter(c => parseInt(c[0]) <= candleTime);

        if (symMain.length < 50) continue;

        const price  = parseFloat(symMain[symMain.length-1][4]);
        const ticker = { symbol: sym, priceChangePercent: '0', quoteVolume: '999999999' };

        const analysis = TechnicalAnalysis.analyze(symMain, ticker, settings);
        if (!analysis || analysis.signal !== 'ALIM') continue;

        if (btcMinScore > 0 && analysis.score < btcMinScore) continue;

        // 4H filtresi
        const trend4H = TechnicalAnalysis.analyze4H(symH4);
        if (['ASAGI', 'HAFIF_ASAGI', 'BELIRSIZ'].includes(trend4H.trend)) continue;
        if (trend4H.trend === 'YATAY' && analysis.score < 65) continue;

        // 1H filtresi
        const trend1H = TechnicalAnalysis.analyze1H(symH1);
        if (['ASAGI', 'BELIRSIZ'].includes(trend1H.trend)) continue;
        if (trend1H.trend === 'HAFIF_ASAGI' && analysis.score < 70) continue;
        if (trend1H.trend === 'YATAY' && analysis.score < 55) continue;

        // Skor bonusu
        let finalScore = analysis.score;
        if (trend4H.trend === 'YUKARI' && trend1H.trend === 'YUKARI') {
          finalScore = Math.min(100, finalScore + (trend4H.guclu && trend1H.guclu ? 25 : 15));
        } else if (trend4H.trend === 'YUKARI') {
          finalScore = Math.min(100, finalScore + 10);
        } else if (trend1H.trend === 'YUKARI') {
          finalScore = Math.min(100, finalScore + 8);
        }
        if (btcTrend4H.trend === 'YUKARI') finalScore = Math.min(100, finalScore + 5);
        if (finalScore < minScore) continue;

        // Dinamik pozisyon boyutu
        let multiplier = 1.0;
        if      (finalScore >= 80) multiplier = 2.0;
        else if (finalScore >= 70) multiplier = 1.5;
        else if (finalScore >= 60) multiplier = 1.25;
        else if (finalScore >= 50) multiplier = 1.0;
        else if (finalScore >= 35) multiplier = 0.75;

        if (trend4H.trend === 'YUKARI' && trend1H.trend === 'YUKARI') {
          multiplier *= trend4H.guclu && trend1H.guclu ? 1.5 : 1.3;
        } else if (trend4H.trend === 'YUKARI') {
          multiplier *= 1.1;
        } else if (trend1H.trend === 'YATAY') {
          multiplier *= 0.7;
        }
        if      (btcTrend4H.trend === 'YUKARI') multiplier *= 1.1;
        else if (btcTrend4H.trend === 'YATAY')  multiplier *= 0.8;

        multiplier = Math.min(2.0, Math.max(0.25, multiplier));
        const finalAmount = tradeAmount * multiplier;
        const quantity    = finalAmount / price;

        openPositions[sym] = {
          entryTime:     new Date(candleTime),
          entryPrice:    price,
          quantity,
          score:         finalScore,
          trend1H:       trend1H.trend,
          trend4H:       trend4H.trend,
          btcTrend:      btcTrend4H.trend,
          amount:        finalAmount,
          currentPnlPct: 0
        };
        highestPrices[sym] = price;

        // Max pozisyon doldu mu?
        if (Object.keys(openPositions).length >= maxPositions) break;
      }
    }

    // Açık pozisyonları kapat
    for (const sym of Object.keys(openPositions)) {
      const pos      = openPositions[sym];
      const symData  = coinData[sym]?.main || [];
      const lastPrice = symData.length > 0
        ? parseFloat(symData[symData.length-1][4])
        : pos.entryPrice;
      const netPnl    = (lastPrice - pos.entryPrice) * pos.quantity
                      - (pos.entryPrice * pos.quantity * totalCost);
      const netPnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice * 100) - (totalCost * 100);
      trades.push({
        symbol:     sym,
        entryTime:  pos.entryTime,
        exitTime:   new Date(parseInt(refCandles[refCandles.length-1][0])),
        entryPrice: pos.entryPrice,
        exitPrice:  lastPrice,
        quantity:   pos.quantity,
        reason:     'OPEN',
        netPnl:     parseFloat(netPnl.toFixed(4)),
        netPnlPct:  parseFloat(netPnlPct.toFixed(2)),
        score:      pos.score,
        trend1H:    pos.trend1H,
        trend4H:    pos.trend4H,
        btcTrend:   pos.btcTrend
      });
    }

    // İstatistikler
    const closedTrades = trades.filter(t => t.reason !== 'OPEN');
    const wins         = closedTrades.filter(t => t.netPnl > 0);
    const losses       = closedTrades.filter(t => t.netPnl <= 0);
    const totalPnl     = trades.reduce((s, t) => s + t.netPnl, 0);
    const winRate      = closedTrades.length > 0 ? (wins.length / closedTrades.length * 100) : 0;
    const bestTrade    = trades.reduce((b, t) => t.netPnlPct > (b?.netPnlPct || -999) ? t : b, null);
    const worstTrade   = trades.reduce((w, t) => t.netPnlPct < (w?.netPnlPct || 999)  ? t : w, null);
    const avgWin       = wins.length   > 0 ? wins.reduce((s,t)   => s + t.netPnlPct, 0) / wins.length   : 0;
    const avgLoss      = losses.length > 0 ? losses.reduce((s,t) => s + t.netPnlPct, 0) / losses.length : 0;
    const grossWin     = Math.abs(wins.reduce((s,t)   => s + t.netPnl, 0));
    const grossLoss    = Math.abs(losses.reduce((s,t) => s + t.netPnl, 0));

    // Coin bazlı özet
    const coinSummaries = {};
    for (const t of trades) {
      if (!coinSummaries[t.symbol]) {
        coinSummaries[t.symbol] = { symbol: t.symbol, totalTrades: 0, wins: 0, losses: 0, totalPnl: 0 };
      }
      coinSummaries[t.symbol].totalTrades++;
      if (t.reason !== 'OPEN') {
        if (t.netPnl > 0) coinSummaries[t.symbol].wins++;
        else coinSummaries[t.symbol].losses++;
      }
      coinSummaries[t.symbol].totalPnl += t.netPnl;
    }

    const coinSummaryList = Object.values(coinSummaries)
      .map(c => ({
        ...c,
        totalPnl:     parseFloat(c.totalPnl.toFixed(4)),
        winRate:      c.wins + c.losses > 0 ? parseFloat((c.wins / (c.wins + c.losses) * 100).toFixed(1)) : 0,
        profitFactor: 999
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    return {
      params:        { symbol: coinList.join(','), interval, days, stopLoss, trailingStop, minScore, tradeAmount, maxPositions },
      summary: {
        totalCoins:   coinList.length,
        totalTrades:  trades.length,
        wins:         wins.length,
        losses:       losses.length,
        winRate:      parseFloat(winRate.toFixed(1)),
        totalPnl:     parseFloat(totalPnl.toFixed(4)),
        avgWin:       parseFloat(avgWin.toFixed(2)),
        avgLoss:      parseFloat(avgLoss.toFixed(2)),
        bestTrade:    bestTrade  ? parseFloat(bestTrade.netPnlPct.toFixed(2))  : 0,
        worstTrade:   worstTrade ? parseFloat(worstTrade.netPnlPct.toFixed(2)) : 0,
        profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : 999
      },
      coinSummaries: coinSummaryList,
      isMulti:       isMulti,
      trades:        trades.sort((a,b) => new Date(b.entryTime) - new Date(a.entryTime)).slice(0, 50)
    };
  }

  getIntervalMinutes(interval) {
    const map = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
    return map[interval] || 5;
  }
}

module.exports = new BacktestEngine();
