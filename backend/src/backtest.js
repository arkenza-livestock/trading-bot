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

    const binance = new BinanceService('', '');
    const settings = {
      rsi_period: rsiPeriod, rsi_oversold: rsiOversold,
      rsi_overbought: rsiOverbought, sr_lookback: srLookback,
      min_score: minScore, commission_rate: commission,
      slippage_rate: slippage, min_profit_percent: minProfit,
      stop_loss_percent: stopLoss, trailing_stop_percent: trailingStop
    };

    // Kaç mum lazım
    const intervalMinutes = this.getIntervalMinutes(interval);
    const totalCandles    = Math.ceil((days * 24 * 60) / intervalMinutes) + 100;
    const limit           = Math.min(totalCandles, 1000);

    console.log(`Backtest başlıyor: ${symbol} | ${interval} | ${days} gün | ${limit} mum`);

    // Veri çek
    let allCandles;
    try {
      allCandles = await binance.getKlines(symbol, interval, limit);
    } catch (err) {
      throw new Error(`Veri çekilemedi: ${err.message}`);
    }

    if (!allCandles || allCandles.length < 50) {
      throw new Error('Yetersiz veri');
    }

    // 1H veri çek
    let candles1H;
    try {
      candles1H = await binance.getKlines(symbol, '1h', 200);
    } catch (err) {
      candles1H = [];
    }

    const trades       = [];
    let openPosition   = null;
    let highestPrice   = 0;
    const totalCost    = (commission + slippage) / 100 * 2;

    // Her mum için simülasyon
    for (let i = 50; i < allCandles.length; i++) {
      const candles = allCandles.slice(0, i + 1);
      const price   = parseFloat(allCandles[i][4]);
      const time    = new Date(allCandles[i][0]);

      // Açık pozisyon varsa kontrol et
      if (openPosition) {
        if (price > highestPrice) highestPrice = price;

        const trailingStopPrice = highestPrice * (1 - trailingStop / 100);
        const hardStopPrice     = openPosition.entryPrice * (1 - stopLoss / 100);
        const brutoPnlPct       = ((price - openPosition.entryPrice) / openPosition.entryPrice) * 100;
        const netPnlPct         = brutoPnlPct - (totalCost * 100);

        let closeReason = null;

        if (netPnlPct <= -(stopLoss)) {
          closeReason = 'STOP_LOSS';
        } else if (brutoPnlPct >= minProfit && price <= trailingStopPrice) {
          closeReason = 'TRAILING_STOP';
        }

        if (closeReason) {
          const netPnl = (price - openPosition.entryPrice) * openPosition.quantity - (openPosition.entryPrice * openPosition.quantity * totalCost);
          trades.push({
            symbol,
            entryTime:   openPosition.entryTime,
            exitTime:    time,
            entryPrice:  openPosition.entryPrice,
            exitPrice:   price,
            quantity:    openPosition.quantity,
            reason:      closeReason,
            netPnl:      parseFloat(netPnl.toFixed(4)),
            netPnlPct:   parseFloat(netPnlPct.toFixed(2)),
            score:       openPosition.score,
            trend1H:     openPosition.trend1H
          });
          openPosition = null;
          highestPrice = 0;
        }
        continue;
      }

      // Pozisyon yoksa sinyal ara
      const ticker = {
        symbol,
        priceChangePercent: '0',
        quoteVolume: '999999999'
      };

      const analysis = TechnicalAnalysis.analyze(candles, ticker, settings);
      if (!analysis || analysis.signal !== 'ALIM') continue;

      // 1H konfirmasyon
      const trend1H = TechnicalAnalysis.analyze1H(candles1H);
      if (trend1H.trend === 'ASAGI') continue;

      // Skora göre pozisyon boyutu
      let multiplier = 1.0;
      if      (analysis.score >= 80) multiplier = 2.0;
      else if (analysis.score >= 70) multiplier = 1.5;
      else if (analysis.score >= 60) multiplier = 1.25;
      else if (analysis.score >= 50) multiplier = 1.0;
      else if (analysis.score >= 35) multiplier = 0.75;
      if (trend1H.trend === 'YUKARI')       multiplier *= 1.2;
      else if (trend1H.trend === 'YATAY')   multiplier *= 0.85;
      else if (trend1H.trend === 'HAFIF_ASAGI') multiplier *= 0.7;
      multiplier = Math.min(2.0, Math.max(0.25, multiplier));

      const finalAmount = tradeAmount * multiplier;
      const quantity    = finalAmount / price;

      openPosition = {
        entryTime:  time,
        entryPrice: price,
        quantity,
        score:      analysis.score,
        trend1H:    trend1H.trend,
        amount:     finalAmount
      };
      highestPrice = price;
    }

    // Açık pozisyon varsa kapat
    if (openPosition) {
      const lastPrice  = parseFloat(allCandles[allCandles.length - 1][4]);
      const netPnl     = (lastPrice - openPosition.entryPrice) * openPosition.quantity - (openPosition.entryPrice * openPosition.quantity * totalCost);
      const netPnlPct  = ((lastPrice - openPosition.entryPrice) / openPosition.entryPrice * 100) - (totalCost * 100);
      trades.push({
        symbol,
        entryTime:   openPosition.entryTime,
        exitTime:    new Date(allCandles[allCandles.length - 1][0]),
        entryPrice:  openPosition.entryPrice,
        exitPrice:   lastPrice,
        quantity:    openPosition.quantity,
        reason:      'OPEN',
        netPnl:      parseFloat(netPnl.toFixed(4)),
        netPnlPct:   parseFloat(netPnlPct.toFixed(2)),
        score:       openPosition.score,
        trend1H:     openPosition.trend1H
      });
    }

    // İstatistikler
    const closedTrades = trades.filter(t => t.reason !== 'OPEN');
    const wins         = closedTrades.filter(t => t.netPnl > 0);
    const losses       = closedTrades.filter(t => t.netPnl <= 0);
    const totalPnl     = trades.reduce((s, t) => s + t.netPnl, 0);
    const winRate      = closedTrades.length > 0 ? (wins.length / closedTrades.length * 100) : 0;
    const bestTrade    = trades.reduce((b, t) => t.netPnlPct > (b?.netPnlPct || -999) ? t : b, null);
    const worstTrade   = trades.reduce((w, t) => t.netPnlPct < (w?.netPnlPct || 999) ? t : w, null);
    const avgWin       = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnlPct, 0) / wins.length : 0;
    const avgLoss      = losses.length > 0 ? losses.reduce((s, t) => s + t.netPnlPct, 0) / losses.length : 0;

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
        bestTrade:    bestTrade ? parseFloat(bestTrade.netPnlPct.toFixed(2)) : 0,
        worstTrade:   worstTrade ? parseFloat(worstTrade.netPnlPct.toFixed(2)) : 0,
        profitFactor: losses.length > 0 ? parseFloat((Math.abs(wins.reduce((s,t) => s+t.netPnl, 0)) / Math.abs(losses.reduce((s,t) => s+t.netPnl, 0))).toFixed(2)) : 999
      },
      trades: trades.slice(-50) // Son 50 işlem
    };
  }

  getIntervalMinutes(interval) {
    const map = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
    return map[interval] || 5;
  }
}

module.exports = new BacktestEngine();
