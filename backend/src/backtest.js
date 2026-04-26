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
      maxPositions  = 3
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

    let allCandles;
    try {
      allCandles = await binance.getKlines(symbol, interval, limit);
    } catch (err) { throw new Error(`Veri çekilemedi: ${err.message}`); }
    if (!allCandles || allCandles.length < 50) throw new Error('Yetersiz veri');

    let all1HCandles = [];
    try { all1HCandles = await binance.getKlines(symbol, '1h', 500); } catch (err) {}

    let all4HCandles = [];
    try { all4HCandles = await binance.getKlines(symbol, '4h', 300); } catch (err) {}

    let allBTC1H = [], allBTC4H = [], allBTCMain = [];
    if (symbol !== 'BTCUSDT') {
      try { allBTC1H   = await binance.getKlines('BTCUSDT', '1h', 500); } catch (err) {}
      try { allBTC4H   = await binance.getKlines('BTCUSDT', '4h', 300); } catch (err) {}
      try { allBTCMain = await binance.getKlines('BTCUSDT', interval, limit); } catch (err) {}
    } else {
      allBTCMain = allCandles;
    }

    console.log(`Ana:${allCandles.length} | 1H:${all1HCandles.length} | 4H:${all4HCandles.length} | BTC:${allBTC1H.length}`);

    const trades        = [];
    const openPositions = {};
    const highestPrices = {};
    const totalCost     = (commission + slippage) / 100 * 2;

    for (let i = 50; i < allCandles.length; i++) {
      const candles    = allCandles.slice(0, i + 1);
      const price      = parseFloat(allCandles[i][4]);
      const candleTime = parseInt(allCandles[i][0]);

      const candles1H = all1HCandles.filter(c => parseInt(c[0]) <= candleTime);
      const candles4H = all4HCandles.filter(c => parseInt(c[0]) <= candleTime);
      const btc1H     = allBTC1H.filter(c => parseInt(c[0]) <= candleTime);
      const btc4H     = allBTC4H.filter(c => parseInt(c[0]) <= candleTime);
      const btcMain   = allBTCMain.filter(c => parseInt(c[0]) <= candleTime);

      // Açık pozisyonları kontrol et
      for (const sym of Object.keys(openPositions)) {
        const pos      = openPositions[sym];
        const posPrice = price;

        if (posPrice > (highestPrices[sym] || pos.entryPrice)) {
          highestPrices[sym] = posPrice;
        }

        const trailingStopPrice = (highestPrices[sym] || pos.entryPrice) * (1 - trailingStop / 100);
        const brutoPnlPct       = ((posPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const netPnlPct         = brutoPnlPct - (totalCost * 100);

        // Pozisyon PnL güncelle
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

      // ── KORUMA FİLTRELERİ ──────────────────────────────────

      // 1 — Max pozisyon kontrolü
      if (Object.keys(openPositions).length >= maxPositions) continue;

      // 2 — Aynı coin zaten açık mı?
      if (openPositions[symbol]) continue;

      // 3 — Zararlı pozisyon varsa yeni alım yapma
      const zararliVar = Object.values(openPositions).some(p => (p.currentPnlPct || 0) < -0.5);
      if (zararliVar) continue;

      // 4 — BTC ani düşüş kontrolü
      if (btcMain.length >= 4) {
        const btcNow  = parseFloat(btcMain[btcMain.length-1][4]);
        const btc3ago = parseFloat(btcMain[btcMain.length-4][4]);
        const btcDrop = ((btcNow - btc3ago) / btc3ago) * 100;
        if (btcDrop < -1.0) continue;
      }

      // 5 — BTC trend analizi
      const btcTrend1H = symbol !== 'BTCUSDT' ? TechnicalAnalysis.analyze1H(btc1H) : { trend: 'YUKARI' };
      const btcTrend4H = symbol !== 'BTCUSDT' ? TechnicalAnalysis.analyze4H(btc4H) : { trend: 'YUKARI' };

      // 6 — BTC güçlü düşüşte → hiç alım yapma
      if (btcTrend4H.trend === 'ASAGI' && btcTrend1H.trend === 'ASAGI') continue;

      // 7 — BTC durumuna göre min skor
      const btcMinScore = btcTrend4H.trend === 'ASAGI'       ? 75
        : btcTrend4H.trend === 'HAFIF_ASAGI' ? 65
        : btcTrend4H.trend === 'YATAY'       ? 55
        : btcTrend4H.trend === 'BELIRSIZ'    ? 60
        : 0;

      // Sinyal ara
      const ticker   = { symbol, priceChangePercent: '0', quoteVolume: '999999999' };
      const analysis = TechnicalAnalysis.analyze(candles, ticker, settings);
      if (!analysis || analysis.signal !== 'ALIM') continue;

      // BTC min skor filtresi
      if (btcMinScore > 0 && analysis.score < btcMinScore) continue;

      // 4H trend filtresi
      const trend4H = TechnicalAnalysis.analyze4H(candles4H);
      if (['ASAGI', 'HAFIF_ASAGI', 'BELIRSIZ'].includes(trend4H.trend)) continue;
      if (trend4H.trend === 'YATAY' && analysis.score < 65) continue;

      // 1H trend filtresi
      const trend1H = TechnicalAnalysis.analyze1H(candles1H);
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

      openPositions[symbol] = {
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
      highestPrices[symbol] = price;
    }

    // Açık pozisyonları kapat
    for (const sym of Object.keys(openPositions)) {
      const pos       = openPositions[sym];
      const lastPrice = parseFloat(allCandles[allCandles.length-1][4]);
      const netPnl    = (lastPrice - pos.entryPrice) * pos.quantity
                      - (pos.entryPrice * pos.quantity * totalCost);
      const netPnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice * 100) - (totalCost * 100);
      trades.push({
        symbol:     sym,
        entryTime:  pos.entryTime,
        exitTime:   new Date(parseInt(allCandles[allCandles.length-1][0])),
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

    return {
      params: { symbol, interval, days, stopLoss, trailingStop, minScore, tradeAmount, maxPositions },
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
