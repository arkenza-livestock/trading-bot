// backend/src/backtest.js
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

          // Pozisyonları güncelle
          for (let j = openPositions.length - 1; j >= 0; j--) {
            const pos = openPositions[j];
            let pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;

            if (currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;

            const trailingStopPrice = pos.highestPrice * (1 - trailingStop / 100);
            const hardStopPrice = pos.entryPrice * (1 - stopLoss / 100);
            let closeReason = null;

            if (pnlPct <= -stopLoss) closeReason = 'STOP_LOSS';
            else if (pnlPct >= minProfit && currentPrice <= trailingStopPrice) closeReason = 'TRAILING_STOP';

            if (closeReason) {
              const netPnl = tradeAmount * pnlPct / 100;
              trades.push({
                symbol, side: 'LONG',
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

          // Basit sinyal: puan bazlı giriş
          if (analysisResult.puan < minScore) continue;

          // Makine onayı kontrolü
          const machineAnalysis = engine.analyze(slice, { symbol });
          if (machineAnalysis.action !== 'BUY' || machineAnalysis.confidence < machineConfidenceMin) continue;

          openPositions.push({
            symbol,
            side: 'LONG',
            entryPrice: currentPrice,
            highestPrice: currentPrice,
            entryTime: currentTime,
            score: analysisResult.puan,
            machineConfidence: machineAnalysis.confidence
          });
        }

        // Açık kalanları kapat
        const lastPrice = parseFloat(candles[candles.length - 1][4]);
        const lastTime = parseInt(candles[candles.length - 1][6]);
        for (const pos of openPositions) {
          let pnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;
          const netPnl = tradeAmount * pnlPct / 100;
          trades.push({
            symbol, side: 'LONG',
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
      worstTrade: allTrades.length > 0 ? parseFloat(Math.min(...allTrades.map(t => t.netPnlPct)).toFixed(2)) : 0
    };

    return { summary, trades: allTrades.slice(0, 200) };
  }
}

module.exports = new MachineBacktestEngine();
