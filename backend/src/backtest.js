const binance = require('./binance');
const analysis = require('./analysis');
const MachineDecisionEngine = require('./MachineDecisionEngine');

class MachineBacktestEngine {
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
      epochs = 1,
      machineConfidenceMin = 0.70
    } = params;

    const totalCost = (commission + slippage) * 2 / 100;
    const limit = Math.ceil(days * 6) + 200;
    const allTrades = [];

    console.log(`[BACKTEST] Başlıyor: ${symbols.length} coin, ${days} gün, ${interval}`);
    console.log(`[BACKTEST] 🟢 LONG & 🔴 SHORT modu`);

    for (const symbol of symbols) {
      try {
        const candles = await binance.getKlines(symbol, interval, Math.min(limit, 1000));
        if (!candles || candles.length < 150) {
          console.log(`[BACKTEST] ${symbol}: yetersiz veri (${candles?.length || 0})`);
          continue;
        }

        const engine = new MachineDecisionEngine();
        const trades = [];
        const openPositions = [];
        const startIdx = 100;

        for (let i = startIdx; i < candles.length; i++) {
          const slice = candles.slice(0, i + 1);
          const currentPrice = parseFloat(candles[i][4]);
          const currentTime = parseInt(candles[i][6]);

          // Pozisyonları güncelle (LONG & SHORT)
          for (let j = openPositions.length - 1; j >= 0; j--) {
            var pos = openPositions[j];
            var side = pos.side || 'LONG';
            var pnlPct, closeReason = null;

            if (side === 'SHORT') {
              // SHORT: fiyat düşerse kâr
              if (currentPrice < pos.lowestPrice) pos.lowestPrice = currentPrice;
              pnlPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100 - totalCost * 100;

              var hardStop = pos.entryPrice * (1 + stopLoss / 100);
              var trailingStopPrice = pos.lowestPrice * (1 + trailingStop / 100);

              if (pnlPct <= -stopLoss) closeReason = 'STOP_LOSS';
              else if (pnlPct >= minProfit && currentPrice >= trailingStopPrice) closeReason = 'TRAILING_STOP';
              else if (pos.takeProfit && currentPrice <= pos.takeProfit) closeReason = 'TAKE_PROFIT';
            } else {
              // LONG: fiyat yükselirse kâr
              if (currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;
              pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;

              var hardStop = pos.entryPrice * (1 - stopLoss / 100);
              var trailingStopPrice = pos.highestPrice * (1 - trailingStop / 100);

              if (pnlPct <= -stopLoss) closeReason = 'STOP_LOSS';
              else if (pnlPct >= minProfit && currentPrice <= trailingStopPrice) closeReason = 'TRAILING_STOP';
              else if (pos.takeProfit && currentPrice >= pos.takeProfit) closeReason = 'TAKE_PROFIT';
            }

            if (closeReason) {
              const netPnl = tradeAmount * pnlPct / 100;
              trades.push({
                symbol, side: side,
                entryPrice: pos.entryPrice, exitPrice: currentPrice,
                entryTime: pos.entryTime, exitTime: currentTime,
                reason: closeReason,
                score: pos.score || 0,
                machineConfidence: pos.machineConfidence || 0,
                netPnl: parseFloat(netPnl.toFixed(4)),
                netPnlPct: parseFloat(pnlPct.toFixed(2)),
                phase: 'BACKTEST'
              });
              openPositions.splice(j, 1);
            }
          }

          // Yeni sinyal ara
          if (openPositions.length >= maxPositions) continue;

          const analysisResult = analysis.analyze(slice, { symbol, priceChangePercent: 0, quoteVolume: 999999 });
          if (!analysisResult) continue;

          const machineAnalysis = engine.analyze(slice, { symbol });
          if (!machineAnalysis) continue;

          var side = null;
          var confidenceOk = machineAnalysis.confidence >= machineConfidenceMin;

          if (machineAnalysis.action === 'BUY' && confidenceOk) {
            side = 'LONG';
          } else if (machineAnalysis.action === 'SELL' && confidenceOk) {
            side = 'SHORT';
          }

          // Puan filtresi (opsiyonel)
          if (side && analysisResult.puan < minScore) continue;

          if (side) {
            var stopPrice, takePrice;
            if (side === 'SHORT') {
              stopPrice = currentPrice * (1 + stopLoss / 100);
              takePrice = currentPrice * (1 - minProfit / 100);
            } else {
              stopPrice = currentPrice * (1 - stopLoss / 100);
              takePrice = currentPrice * (1 + minProfit / 100);
            }

            openPositions.push({
              symbol,
              side: side,
              entryPrice: currentPrice,
              highestPrice: currentPrice,
              lowestPrice: currentPrice,
              entryTime: currentTime,
              score: analysisResult.puan,
              machineConfidence: machineAnalysis.confidence,
              takeProfit: takePrice,
              stopLoss: stopPrice
            });
          }
        }

        // Açık kalanları kapat
        const lastPrice = parseFloat(candles[candles.length - 1][4]);
        const lastTime = parseInt(candles[candles.length - 1][6]);
        for (const pos of openPositions) {
          var side = pos.side || 'LONG';
          var pnlPct;
          if (side === 'SHORT') {
            pnlPct = ((pos.entryPrice - lastPrice) / pos.entryPrice) * 100 - totalCost * 100;
          } else {
            pnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;
          }
          const netPnl = tradeAmount * pnlPct / 100;
          trades.push({
            symbol, side: side,
            entryPrice: pos.entryPrice, exitPrice: lastPrice,
            entryTime: pos.entryTime, exitTime: lastTime,
            reason: 'PERIOD_END',
            score: pos.score || 0,
            machineConfidence: pos.machineConfidence || 0,
            netPnl: parseFloat(netPnl.toFixed(4)),
            netPnlPct: parseFloat(pnlPct.toFixed(2)),
            phase: 'BACKTEST'
          });
        }

        allTrades.push(...trades);
        console.log(`[BACKTEST] ${symbol}: ${trades.length} işlem`);
      } catch (e) {
        console.error(`[BACKTEST] ${symbol} hata:`, e.message);
      }
    }

    // Özet hesapla
    const wins = allTrades.filter(t => t.netPnl > 0);
    const losses = allTrades.filter(t => t.netPnl <= 0);
    const totalPnl = allTrades.reduce((s, t) => s + t.netPnl, 0);
    const gW = wins.reduce((s, t) => s + t.netPnl, 0);
    const gL = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));

    // LONG & SHORT ayrı ayrı
    const longTrades = allTrades.filter(t => t.side === 'LONG');
    const shortTrades = allTrades.filter(t => t.side === 'SHORT');
    const longWins = longTrades.filter(t => t.netPnl > 0).length;
    const shortWins = shortTrades.filter(t => t.netPnl > 0).length;

    const summary = {
      totalTrades: allTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: allTrades.length > 0 ? parseFloat((wins.length / allTrades.length * 100).toFixed(1)) : 0,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      profitFactor: gL > 0 ? parseFloat((gW / gL).toFixed(2)) : 999,
      avgWin: wins.length > 0 ? parseFloat((wins.reduce((s, t) => s + t.netPnlPct, 0) / wins.length).toFixed(2)) : 0,
      avgLoss: losses.length > 0 ? parseFloat((losses.reduce((s, t) => s + t.netPnlPct, 0) / losses.length).toFixed(2)) : 0,
      bestTrade: allTrades.length > 0 ? parseFloat(Math.max(...allTrades.map(t => t.netPnlPct)).toFixed(2)) : 0,
      worstTrade: allTrades.length > 0 ? parseFloat(Math.min(...allTrades.map(t => t.netPnlPct)).toFixed(2)) : 0,
      longCount: longTrades.length,
      longWinRate: longTrades.length > 0 ? parseFloat((longWins / longTrades.length * 100).toFixed(1)) : 0,
      shortCount: shortTrades.length,
      shortWinRate: shortTrades.length > 0 ? parseFloat((shortWins / shortTrades.length * 100).toFixed(1)) : 0
    };

    return { summary, trades: allTrades.slice(0, 200) };
  }
}

module.exports = new MachineBacktestEngine();
