const binance = require('./binance');
const TechnicalAnalysis = require('./analysis');
const db = require('./database');

class BacktestEngine {
  async run(params) {
    const {
      symbols = ['BTCUSDT'],
      interval = '4h',
      days = 30,
      stopLoss = 2.0,
      trailingStop = 0.5,
      minProfit = 1.5,
      commission = 0.1,
      slippage = 0.05,
      minScore = 50,
      tradeAmount = 100,
      maxPositions = 3,
    } = params;

    const totalCost    = (commission + slippage) * 2 / 100;
    const limit        = Math.ceil(days * 6) + 200;
    const results      = [];
    const coinSummaries = [];

    console.log(`Backtest v19: ${symbols.length} coin | ${days}g | ${interval}`);

    for (const symbol of symbols) {
      try {
        const [candles4H, candles1H, candles1D] = await Promise.all([
          binance.getKlines(symbol, '4h', Math.min(limit, 1000)),
          binance.getKlines(symbol, '1h', Math.min(limit * 4, 1000)),
          binance.getKlines(symbol, '1d', Math.min(days + 100, 1000)),
        ]);

        if (!candles4H || candles4H.length < 150) {
          console.log(`⚠️${symbol}: yetersiz(${candles4H?.length || 0})`);
          continue;
        }

        console.log(`✅${symbol}: 4H:${candles4H.length} 1H:${candles1H?.length||0} 1D:${candles1D?.length||0}`);

        const cutoff4H  = candles4H.length - Math.ceil(days * 6);
        const cutoff1H  = (candles1H?.length||0) - Math.ceil(days * 24);
        const cutoff1D  = (candles1D?.length||0) - days;

        const trades       = [];
        let openPositions  = [];
        let wins = 0, losses = 0;
        let grossWin = 0, grossLoss = 0;

        for (let i = 100; i < candles4H.length - cutoff4H; i++) {
          const symH4  = candles4H.slice(0, i + 1);
          const sym1D  = candles1D ? candles1D.slice(0, Math.floor(i / 6) + 1) : [];
          const ticker = { symbol, priceChangePercent: 0, quoteVolume: 999999999 };

          // Açık pozisyonları güncelle
          const currentPrice = parseFloat(candles4H[i][4]);
          const currentTime  = parseInt(candles4H[i][6]);

          openPositions = openPositions.filter(pos => {
            const entryPrice  = pos.entryPrice;
            const side        = pos.side || 'LONG';
            let pnlPct;

            if (side === 'SHORT') {
              pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100 - totalCost * 100;
            } else {
              pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100 - totalCost * 100;
            }

            // Trailing stop güncelle
            if (side === 'LONG' && currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;
            if (side === 'SHORT' && currentPrice < pos.lowestPrice)  pos.lowestPrice  = currentPrice;

            const trailingStopPrice = side === 'LONG'
              ? pos.highestPrice * (1 - trailingStop / 100)
              : pos.lowestPrice  * (1 + trailingStop / 100);
            const hardStopPrice = side === 'LONG'
              ? entryPrice * (1 - stopLoss / 100)
              : entryPrice * (1 + stopLoss / 100);

            let closeReason = null;
            if (pnlPct <= -stopLoss)     closeReason = 'STOP_LOSS';
            else if (pnlPct >= minProfit) {
              if (side === 'LONG'  && currentPrice <= trailingStopPrice) closeReason = 'TRAILING_STOP';
              if (side === 'SHORT' && currentPrice >= trailingStopPrice) closeReason = 'TRAILING_STOP';
            }

            if (closeReason) {
              const netPnl    = tradeAmount * pnlPct / 100;
              const netPnlPct = parseFloat(pnlPct.toFixed(2));
              trades.push({
                symbol, side,
                entryPrice,
                exitPrice:  currentPrice,
                entryTime:  pos.entryTime,
                exitTime:   currentTime,
                reason:     closeReason,
                score:      pos.score,
                trend4H:    pos.trend4H,
                trend1H:    pos.trend1H,
                netPnl:     parseFloat(netPnl.toFixed(4)),
                netPnlPct,
              });
              if (netPnl > 0) { wins++; grossWin += netPnl; }
              else             { losses++; grossLoss += Math.abs(netPnl); }
              return false;
            }
            return true;
          });

          if (openPositions.length >= maxPositions) continue;
          if (openPositions.find(p => p.symbol === symbol)) continue;

          // 4H setup analizi
          const setup4H = TechnicalAnalysis.analyze4HSetup(symH4, sym1D, ticker, { min_score: minScore });
          if (!setup4H || setup4H.setup === 'BEKLE') continue;

          // 1H timing
          const h1Start = cutoff1H + Math.floor(i * 4);
          const symH1   = candles1H ? candles1H.slice(0, h1Start + 1) : [];
          const timing  = symH1.length >= 50
            ? TechnicalAnalysis.analyze1HTiming(symH1, setup4H, {})
            : { signal: 'BEKLE' };

          const side = setup4H.setup === 'LONG_ADAY' ? 'LONG' : 'SHORT';

          // Giriş koşulu
          let giris = false;
          const sinyal = side === 'LONG' ? setup4H.longSinyal : setup4H.shortSinyal;

          if (sinyal === 'GUCLU') {
            giris = timing.signal !== 'BEKLE' || true; // direkt gir
          } else if (sinyal === 'NORMAL') {
            giris = timing.signal === 'ALIM' || timing.crossover;
          } else if (sinyal === 'ZAYIF') {
            giris = timing.signal === 'ALIM' && timing.crossover;
          }

          if (!giris) continue;

          openPositions.push({
            symbol,
            side,
            entryPrice:   currentPrice,
            highestPrice: currentPrice,
            lowestPrice:  currentPrice,
            entryTime:    currentTime,
            score:        setup4H.puan || setup4H.score || 0,
            trend4H:      setup4H.trend4H || setup4H.trend || '-',
            trend1H:      timing.trend || '-',
          });
        }

        // Açık kalan pozisyonları kapat
        const lastPrice = parseFloat(candles4H[candles4H.length-1][4]);
        const lastTime  = parseInt(candles4H[candles4H.length-1][6]);
        for (const pos of openPositions) {
          const side = pos.side || 'LONG';
          let pnlPct;
          if (side === 'SHORT') {
            pnlPct = ((pos.entryPrice - lastPrice) / pos.entryPrice) * 100 - totalCost * 100;
          } else {
            pnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;
          }
          const netPnl = tradeAmount * pnlPct / 100;
          trades.push({
            symbol, side,
            entryPrice: pos.entryPrice,
            exitPrice:  lastPrice,
            entryTime:  pos.entryTime,
            exitTime:   lastTime,
            reason:     'PERIOD_END',
            score:      pos.score,
            trend4H:    pos.trend4H,
            trend1H:    pos.trend1H,
            netPnl:     parseFloat(netPnl.toFixed(4)),
            netPnlPct:  parseFloat(pnlPct.toFixed(2)),
          });
          if (netPnl > 0) { wins++; grossWin += netPnl; }
          else             { losses++; grossLoss += Math.abs(netPnl); }
        }

        const totalPnl  = trades.reduce((s, t) => s + t.netPnl, 0);
        const winRate   = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : 0;
        const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : 999;

        coinSummaries.push({
          symbol,
          totalTrades: trades.length,
          wins, losses,
          winRate:   parseFloat(winRate),
          totalPnl:  parseFloat(totalPnl.toFixed(2)),
          profitFactor: parseFloat(profitFactor),
        });

        results.push(...trades);

      } catch(e) {
        console.error(`${symbol} backtest hatası:`, e.message);
      }
    }

    // Genel özet
    const allWins   = results.filter(t => t.netPnl > 0);
    const allLosses = results.filter(t => t.netPnl <= 0);
    const totalPnl  = results.reduce((s, t) => s + t.netPnl, 0);
    const winRate   = results.length > 0 ? (allWins.length / results.length * 100).toFixed(1) : 0;
    const gW        = allWins.reduce((s,t) => s + t.netPnl, 0);
    const gL        = Math.abs(allLosses.reduce((s,t) => s + t.netPnl, 0));
    const avgWin    = allWins.length > 0 ? (allWins.reduce((s,t) => s + t.netPnlPct, 0) / allWins.length).toFixed(2) : 0;
    const avgLoss   = allLosses.length > 0 ? (allLosses.reduce((s,t) => s + t.netPnlPct, 0) / allLosses.length).toFixed(2) : 0;
    const best      = results.length > 0 ? Math.max(...results.map(t => t.netPnlPct)).toFixed(2) : 0;
    const worst     = results.length > 0 ? Math.min(...results.map(t => t.netPnlPct)).toFixed(2) : 0;

    return {
      summary: {
        totalTrades:   results.length,
        wins:          allWins.length,
        losses:        allLosses.length,
        winRate:       parseFloat(winRate),
        totalPnl:      parseFloat(totalPnl.toFixed(2)),
        profitFactor:  gL > 0 ? parseFloat((gW/gL).toFixed(2)) : 999,
        avgWin:        parseFloat(avgWin),
        avgLoss:       parseFloat(avgLoss),
        bestTrade:     parseFloat(best),
        worstTrade:    parseFloat(worst),
      },
      coinSummaries,
      trades: results.slice(0, 500),
      params: {
        interval, days, minScore, stopLoss,
        trailingStop, tradeAmount, maxPositions
      }
    };
  }
}

module.exports = new BacktestEngine();
