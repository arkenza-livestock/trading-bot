const binance = require('./binance');
const analysis = require('./analysis');
const MachineDecisionEngine = require('./MachineDecisionEngine');

class MachineBacktestEngine {
  async run(params) {
    const {
      symbols = ['BTCUSDT'], interval = '4h', days = 30,
      stopLoss = 2.0, trailingStop = 0.5, minProfit = 1.5,
      commission = 0.1, slippage = 0.05, minScore = 50,
      tradeAmount = 100, maxPositions = 3, epochs = 1,
      machineConfidenceMin = 0.70,
      longEnabled = true, shortEnabled = true, shortConfMin = 0.85
    } = params;

    const totalCost = (commission + slippage) * 2 / 100;
    const limit = Math.ceil(days * 6) + 200;
    const allTrades = [];

    console.log(`[BACKTEST] ${symbols.length} coin, ${days}g, ${interval}`);
    console.log(`[BACKTEST] LONG:${longEnabled} SHORT:${shortEnabled}(esik:%${Math.round(shortConfMin*100)})`);

    for (const symbol of symbols) {
      try {
        const candles = await binance.getKlines(symbol, interval, Math.min(limit, 1000));
        if (!candles || candles.length < 150) continue;

        const engine = new MachineDecisionEngine();
        const trades = []; const openPositions = []; const startIdx = 100;

        // BTC verisini çek (SHORT için trend kontrolü)
        let btcCandles = null;
        if (shortEnabled) {
          try { btcCandles = await binance.getKlines('BTCUSDT', interval, Math.min(limit, 1000)); } catch(e) {}
        }

        for (let i = startIdx; i < candles.length; i++) {
          const slice = candles.slice(0, i + 1);
          const currentPrice = parseFloat(candles[i][4]);
          const currentTime = parseInt(candles[i][6]);

          // BTC trend kontrolü (SHORT için)
          let btcDown = false;
          if (shortEnabled && btcCandles && i < (btcCandles.length - 50)) {
            const btcSlice = btcCandles.slice(0, i + 1);
            const btcCloses = btcSlice.map(c => parseFloat(c[4]));
            const btcEma21 = analysis.hesaplaEMA(btcCloses, 21);
            const btcEma50 = analysis.hesaplaEMA(btcCloses, 50);
            const btcPrice = btcCloses[btcCloses.length - 1];
            // BTC düşüş şartı: fiyat EMA21'in altında VE EMA21 EMA50'nin altında
            btcDown = btcPrice < btcEma21 && btcEma21 < btcEma50;
          }

          // Açık pozisyonları güncelle (LONG & SHORT)
          for (let j = openPositions.length - 1; j >= 0; j--) {
            var pos = openPositions[j], side = pos.side || 'LONG', pnlPct, closeReason = null;
            if (side === 'SHORT') {
              if (currentPrice < pos.lowestPrice) pos.lowestPrice = currentPrice;
              pnlPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100 - totalCost * 100;
              var hardStop = pos.entryPrice * (1 + stopLoss / 100);
              var trailingStopPrice = pos.lowestPrice * (1 + trailingStop / 100);
              if (pnlPct <= -stopLoss) closeReason = 'STOP_LOSS';
              else if (pnlPct >= minProfit && currentPrice >= trailingStopPrice) closeReason = 'TRAILING_STOP';
            } else {
              if (currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;
              pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;
              var hardStop = pos.entryPrice * (1 - stopLoss / 100);
              var trailingStopPrice = pos.highestPrice * (1 - trailingStop / 100);
              if (pnlPct <= -stopLoss) closeReason = 'STOP_LOSS';
              else if (pnlPct >= minProfit && currentPrice <= trailingStopPrice) closeReason = 'TRAILING_STOP';
            }
            if (closeReason) {
              const netPnl = tradeAmount * pnlPct / 100;
              trades.push({ symbol, side, entryPrice: pos.entryPrice, exitPrice: currentPrice, entryTime: pos.entryTime, exitTime: currentTime, reason: closeReason, score: pos.score || 0, machineConfidence: pos.machineConfidence || 0, netPnl: parseFloat(netPnl.toFixed(4)), netPnlPct: parseFloat(pnlPct.toFixed(2)), phase: 'BACKTEST' });
              openPositions.splice(j, 1);
            }
          }

          if (openPositions.length >= maxPositions) continue;

          const analysisResult = analysis.analyze(slice, { symbol, priceChangePercent: 0, quoteVolume: 999999 });
          if (!analysisResult) continue;
          const machineAnalysis = engine.analyze(slice, { symbol });
          if (!machineAnalysis) continue;

          var side = null;
          const confidenceOk = machineAnalysis.confidence >= machineConfidenceMin;

          // LONG sinyali (her zaman)
          if (machineAnalysis.action === 'BUY' && confidenceOk && longEnabled) side = 'LONG';
          // SHORT sinyali (sadece BTC düşüşte)
          else if (machineAnalysis.action === 'SELL' && shortEnabled && machineAnalysis.confidence >= shortConfMin && btcDown) side = 'SHORT';

          if (side && analysisResult.puan >= minScore) {
            openPositions.push({ symbol, side, entryPrice: currentPrice, highestPrice: currentPrice, lowestPrice: currentPrice, entryTime: currentTime, score: analysisResult.puan, machineConfidence: machineAnalysis.confidence });
          }
        }

        // Açık kalanları kapat
        const lastPrice = parseFloat(candles[candles.length - 1][4]);
        const lastTime = parseInt(candles[candles.length - 1][6]);
        for (const pos of openPositions) {
          var side = pos.side || 'LONG', pnlPct;
          if (side === 'SHORT') pnlPct = ((pos.entryPrice - lastPrice) / pos.entryPrice) * 100 - totalCost * 100;
          else pnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;
          const netPnl = tradeAmount * pnlPct / 100;
          trades.push({ symbol, side, entryPrice: pos.entryPrice, exitPrice: lastPrice, entryTime: pos.entryTime, exitTime: lastTime, reason: 'PERIOD_END', score: pos.score || 0, machineConfidence: pos.machineConfidence || 0, netPnl: parseFloat(netPnl.toFixed(4)), netPnlPct: parseFloat(pnlPct.toFixed(2)), phase: 'BACKTEST' });
        }
        allTrades.push(...trades);
        console.log(`[BACKTEST] ${symbol}: ${trades.length} islem`);
      } catch (e) { console.error(`[BACKTEST] ${symbol}:`, e.message); }
    }

    // Özet hesaplamalar (Sharpe, MaxDD vb.)
    const wins = allTrades.filter(t => t.netPnl > 0);
    const losses = allTrades.filter(t => t.netPnl <= 0);
    const totalPnl = allTrades.reduce((s, t) => s + t.netPnl, 0);
    const gW = wins.reduce((s, t) => s + t.netPnl, 0);
    const gL = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
    const longTrades = allTrades.filter(t => t.side === 'LONG');
    const shortTrades = allTrades.filter(t => t.side === 'SHORT');

    // Sharpe ve MaxDD hesaplamaları
    const rets = allTrades.map(t => t.netPnlPct);
    const avgR = rets.length > 0 ? rets.reduce((a,b) => a + b, 0) / rets.length : 0;
    const vari = rets.length > 1 ? rets.reduce((a,b) => a + Math.pow(b - avgR, 2), 0) / rets.length : 0;
    const std = Math.sqrt(vari);
    const sharpeRatio = std > 0 ? parseFloat((avgR / std * Math.sqrt(allTrades.length)).toFixed(2)) : 0;
    var peak2 = 0, maxDD2 = 0, running2 = 0;
    for (const t of allTrades) { running2 += t.netPnl || 0; if (running2 > peak2) peak2 = running2; var dd2 = peak2 > 0 ? (peak2 - running2) / peak2 * 100 : 0; if (dd2 > maxDD2) maxDD2 = dd2; }
    const summary = {
      totalTrades: allTrades.length, wins: wins.length, losses: losses.length,
      winRate: allTrades.length > 0 ? parseFloat((wins.length / allTrades.length * 100).toFixed(1)) : 0,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      profitFactor: gL > 0 ? parseFloat((gW / gL).toFixed(2)) : 999,
      avgWin: wins.length > 0 ? parseFloat((wins.reduce((s, t) => s + t.netPnlPct, 0) / wins.length).toFixed(2)) : 0,
      avgLoss: losses.length > 0 ? parseFloat((losses.reduce((s, t) => s + t.netPnlPct, 0) / losses.length).toFixed(2)) : 0,
      bestTrade: allTrades.length > 0 ? parseFloat(Math.max(...allTrades.map(t => t.netPnlPct)).toFixed(2)) : 0,
      worstTrade: allTrades.length > 0 ? parseFloat(Math.min(...allTrades.map(t => t.netPnlPct)).toFixed(2)) : 0,
      sharpeRatio: sharpeRatio, maxDrawdown: parseFloat(maxDD2.toFixed(2)),
      longCount: longTrades.length,
      longWinRate: longTrades.length > 0 ? parseFloat((longTrades.filter(t => t.netPnl > 0).length / longTrades.length * 100).toFixed(1)) : 0,
      shortCount: shortTrades.length,
      shortWinRate: shortTrades.length > 0 ? parseFloat((shortTrades.filter(t => t.netPnl > 0).length / shortTrades.length * 100).toFixed(1)) : 0
    };

    return { summary, trades: allTrades.slice(0, 200) };
  }
}

module.exports = new MachineBacktestEngine();
