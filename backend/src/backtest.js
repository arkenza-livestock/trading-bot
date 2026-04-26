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
      srLookback    = 20
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

    console.log(`Backtest: ${symbol} | ${interval} | ${days} gün | ${limit} mum`);

    // Ana mum verisi
    let allCandles;
    try {
      allCandles = await binance.getKlines(symbol, interval, limit);
    } catch (err) {
      throw new Error(`Veri çekilemedi: ${err.message}`);
    }
    if (!allCandles || allCandles.length < 50) throw new Error('Yetersiz veri');

    // 1H mum verisi
    let all1HCandles;
    try {
      all1HCandles = await binance.getKlines(symbol, '1h', 500);
    } catch (err) { all1HCandles = []; }

    // 4H mum verisi
    let all4HCandles;
    try {
      all4HCandles = await binance.getKlines(symbol, '4h', 300);
    } catch (err) { all4HCandles = []; }

    console.log(`Ana:${allCandles.length} | 1H:${all1HCandles.length} | 4H:${all4HCandles.length}`);

    const trades     = [];
    let openPosition = null;
    let highestPrice = 0;
    const totalCost  = (commission + slippage) / 100 * 2;

    for (let i = 50; i < allCandles.length; i++) {
      const candles    = allCandles.slice(0, i + 1);
      const price      = parseFloat(allCandles[i][4]);
      const candleTime = parseInt(allCandles[i][0]);

      // Bu ana karşılık gelen 1H ve 4H mumları
      const candles1H = all1HCandles.filter(c => parseInt(c[0]) <= candleTime);
      const candles4H = all4HCandles.filter(c => parseInt(c[0]) <= candleTime);

      // Açık pozisyon varsa kontrol et
      if (openPosition) {
        if (price > highestPrice) highestPrice = price;

        const trailingStopPrice = highestPrice * (1 - trailingStop / 100);
        const brutoPnlPct       = ((price - openPosition.entryPrice) / openPosition.entryPrice) * 100;
        const netPnlPct         = brutoPnlPct - (totalCost * 100);

        let closeReason = null;
        if (netPnlPct <= -stopLoss)                                      closeReason = 'STOP_LOSS';
        else if (brutoPnlPct >= minProfit && price <= trailingStopPrice) closeReason = 'TRAILING_STOP';

        if (closeReason) {
          const netPnl = (price - openPosition.entryPrice) * openPosition.quantity
                       - (openPosition.entryPrice * openPosition.quantity * totalCost);
          trades.push({
            symbol,
            entryTime:  openPosition.entryTime,
            exitTime:   new Date(candleTime),
            entryPrice: openPosition.entryPrice,
            exitPrice:  price,
            quantity:   openPosition.quantity,
            reason:     closeReason,
            netPnl:     parseFloat(netPnl.toFixed(4)),
            netPnlPct:  parseFloat(netPnlPct.toFixed(2)),
            score:      openPosition.score,
            trend1H:    openPosition.trend1H,
            trend4H:    openPosition.trend4H
          });
          openPosition = null;
          highestPrice = 0;
        }
        continue;
      }

      // Sinyal ara
      const ticker   = { symbol, priceChangePercent: '0', quoteVolume: '999999999' };
      const analysis = TechnicalAnalysis.analyze(candles, ticker, settings);
      if (!analysis || analysis.signal !== 'ALIM') continue;

      // 4H trend — ana filtre
      const trend4H = TechnicalAnalysis.analyze4H(candles4H);

      // 4H ASAGI veya HAFIF_ASAGI → alım yok
      if (trend4H.trend === 'ASAGI' || trend4H.trend === 'HAFIF_ASAGI') continue;

      // 4H YATAY → yüksek skor gerek
      if (trend4H.trend === 'YATAY' && analysis.score < 65) continue;

      // 1H trend — ikinci filtre
      const trend1H = TechnicalAnalysis.analyze1H(candles1H);

      // 1H ASAGI → alım yok
      if (trend1H.trend === 'ASAGI') continue;

      // 1H HAFIF_ASAGI → çok yüksek skor gerek
      if (trend1H.trend === 'HAFIF_ASAGI' && analysis.score < 70) continue;

      // 1H YATAY → yüksek skor gerek
      if (trend1H.trend === 'YATAY' && analysis.score < 55) continue;

      // Skor bonusu
      let finalScore = analysis.score;
      if      (trend4H.trend === 'YUKARI' && trend1H.trend === 'YUKARI') {
        finalScore = Math.min(100, finalScore + (trend4H.guclu && trend1H.guclu ? 25 : 15));
      } else if (trend4H.trend === 'YUKARI') {
        finalScore = Math.min(100, finalScore + 10);
      } else if (trend1H.trend === 'YUKARI') {
        finalScore = Math.min(100, finalScore + 8);
      }

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

      multiplier = Math.min(2.0, Math.max(0.25, multiplier));
      const finalAmount = tradeAmount * multiplier;
      const quantity    = finalAmount / price;

      openPosition = {
        entryTime:  new Date(candleTime),
        entryPrice: price,
        quantity,
        score:      finalScore,
        trend1H:    trend1H.trend,
        trend4H:    trend4H.trend,
        amount:     finalAmount
      };
      highestPrice = price;
    }

    // Açık pozisyonu kapat
    if (openPosition) {
      const lastPrice = parseFloat(allCandles[allCandles.length-1][4]);
      const netPnl    = (lastPrice - openPosition.entryPrice) * openPosition.quantity
                      - (openPosition.entryPrice * openPosition.quantity * totalCost);
      const netPnlPct = ((lastPrice - openPosition.entryPrice) / openPosition.entryPrice * 100) - (totalCost * 100);
      trades.push({
        symbol,
        entryTime:  openPosition.entryTime,
        exitTime:   new Date(parseInt(allCandles[allCandles.length-1][0])),
        entryPrice: openPosition.entryPrice,
        exitPrice:  lastPrice,
        quantity:   openPosition.quantity,
        reason:     'OPEN',
        netPnl:     parseFloat(netPnl.toFixed(4)),
        netPnlPct:  parseFloat(netPnlPct.toFixed(2)),
        score:      openPosition.score,
        trend1H:    openPosition.trend1H,
        trend4H:    openPosition.trend4H
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

    return {
      params: { symbol, interval, days, stopLoss, trailingStop, minScore, tradeAmount },
      summary: {
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
      trades: trades.slice(-50)
    };
  }

  getIntervalMinutes(interval) {
    const map = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
    return map[interval] || 5;
  }
}

module.exports = new BacktestEngine();
