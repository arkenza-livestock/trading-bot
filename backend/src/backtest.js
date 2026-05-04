const binance = require('./binance');
const TechnicalAnalysis = require('./analysis');
const MachineDecisionEngine = require('./MachineDecisionEngine');
const db = require('./database');

/**
 * ═══════════════════════════════════════════════════════════
 *   MAKİNE EĞİTİM BACKTEST MOTORU - v2.0
 *   - Epoch tabanlı eğitim
 *   - Train/Test ayrımı
 *   - Walk-forward analiz
 *   - Makine öğrenme metrikleri
 * ═══════════════════════════════════════════════════════════
 */

class MachineBacktestEngine {

  constructor() {
    this.machine = null;
    this.results = {
      epochs: [],
      finalTest: null,
      learningCurve: []
    };
  }

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
      epochs = 3,
      trainSplit = 0.70,
      machineConfidenceMin = 0.70,
      enableLearning = true
    } = params;

    const totalCost = (commission + slippage) * 2 / 100;
    const limit = Math.ceil(days * 6) + 200;

    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   MAKİNE EĞİTİM BACKTEST - v2.0             ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('Semboller: ' + symbols.length + ' | Periyot: ' + interval + ' | Gun: ' + days);
    console.log('Epoch: ' + epochs + ' | Egitim: %' + (trainSplit*100) + ' | AI Guven: %' + (machineConfidenceMin*100));
    console.log('='.repeat(50) + '\n');

    // Veri topla
    const allData = {};
    for (const symbol of symbols) {
      try {
        const candles = await binance.getKlines(symbol, interval, Math.min(limit, 1000));
        if (candles && candles.length >= 150) {
          allData[symbol] = candles;
          console.log('✅ ' + symbol + ': ' + candles.length + ' mum');
        } else {
          console.log('⚠️ ' + symbol + ': Yetersiz veri (' + (candles?.length || 0) + ')');
        }
        await new Promise(r => setTimeout(r, 200));
      } catch(e) {
        console.error('❌ ' + symbol + ': ' + e.message);
      }
    }

    if (Object.keys(allData).length === 0) {
      console.error('Hiç veri toplanamadı!');
      return null;
    }

    // Eğitim ve test
    const allTrades = [];
    const epochResults = [];

    for (const [symbol, candles] of Object.entries(allData)) {
      const splitIndex = Math.floor(candles.length * trainSplit);
      const trainData = candles.slice(0, splitIndex);
      const testData = candles.slice(splitIndex);

      console.log('\n' + '-'.repeat(50));
      console.log('🪙 ' + symbol + ': Egitim=' + trainData.length + ' | Test=' + testData.length);

      for (let epoch = 0; epoch < epochs; epoch++) {
        console.log('  Epoch ' + (epoch + 1) + '/' + epochs + '...');
        
        if (epoch === 0 || epoch % 2 === 0) {
          this.machine = new MachineDecisionEngine();
        }

        const trainTrades = await this.runSingleBacktest(symbol, trainData, {
          stopLoss, trailingStop, minProfit, commission, slippage,
          minScore, tradeAmount, maxPositions, machineConfidenceMin
        }, 'TRAIN');

        if (enableLearning) {
          for (const trade of trainTrades) {
            this.machine.feedbackSignalResult(
              trade.entryTime,
              trade.netPnlPct,
              trade.maxFavorable || trade.netPnlPct,
              trade.maxAdverse || trade.netPnlPct
            );
          }
        }

        const trainStats = this.calculateStats(trainTrades, symbol);
        trainStats.epoch = epoch + 1;
        trainStats.phase = 'TRAIN';
        epochResults.push(trainStats);

        if (trainTrades.length > 0) {
          console.log('    Islem: ' + trainTrades.length + ' | Basari: %' + trainStats.winRate + ' | PnL: ' + trainStats.totalPnl?.toFixed(2));
        }
      }

      // Test aşaması
      if (testData.length > 100) {
        console.log('  🧪 TEST...');
        const testTrades = await this.runSingleBacktest(symbol, testData, {
          stopLoss, trailingStop, minProfit, commission, slippage,
          minScore, tradeAmount, maxPositions, machineConfidenceMin
        }, 'TEST');

        const testStats = this.calculateStats(testTrades, symbol);
        testStats.phase = 'TEST';
        epochResults.push(testStats);
        allTrades.push(...testTrades);

        console.log('    Islem: ' + testTrades.length + ' | Basari: %' + testStats.winRate + ' | PnL: ' + testStats.totalPnl?.toFixed(2));
      }
    }

    this.results.epochs = epochResults;
    this.results.finalTest = this.calculateStats(allTrades, 'TOPLAM');

    // Sonuçları yazdır
    this.printLearningCurve();

    const finalStats = this.results.finalTest;
    
    return {
      summary: {
        totalTrades: finalStats.totalTrades,
        wins: finalStats.wins,
        losses: finalStats.losses,
        winRate: finalStats.winRate,
        totalPnl: finalStats.totalPnl,
        profitFactor: finalStats.profitFactor,
        avgWin: finalStats.avgWin,
        avgLoss: finalStats.avgLoss,
        bestTrade: finalStats.bestTrade,
        worstTrade: finalStats.worstTrade,
        sharpeRatio: finalStats.sharpeRatio
      },
      learningCurve: epochResults,
      trades: allTrades.slice(0, 500),
      params: { interval, days, minScore, stopLoss, trailingStop, tradeAmount, maxPositions, epochs, machineConfidenceMin }
    };
  }

  async runSingleBacktest(symbol, candles, params, phase = 'TEST') {
    const {
      stopLoss, trailingStop, minProfit, commission, slippage,
      tradeAmount, maxPositions, machineConfidenceMin
    } = params;

    const totalCost = (commission + slippage) * 2 / 100;
    const trades = [];
    let openPositions = [];
    const startIndex = 100;

    for (let i = startIndex; i < candles.length; i++) {
      const currentSlice = candles.slice(0, i + 1);
      const currentPrice = parseFloat(candles[i][4]);
      const currentTime = parseInt(candles[i][6]);

      // Açık pozisyonları güncelle
      openPositions = openPositions.filter(pos => {
        const entryPrice = pos.entryPrice;
        let pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100 - totalCost * 100;

        if (currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;
        if (currentPrice < pos.lowestPrice) pos.lowestPrice = currentPrice;

        const trailingStopPrice = pos.highestPrice * (1 - trailingStop / 100);
        const hardStopPrice = entryPrice * (1 - stopLoss / 100);
        const effectiveStop = Math.max(trailingStopPrice, hardStopPrice);

        let closeReason = null;

        if (pnlPct <= -stopLoss) {
          closeReason = 'STOP_LOSS';
        } else if (pnlPct >= minProfit && currentPrice <= trailingStopPrice) {
          closeReason = 'TRAILING_STOP';
        } else if (pos.takeProfit && currentPrice >= pos.takeProfit) {
          closeReason = 'TAKE_PROFIT';
        }

        if (closeReason) {
          const netPnl = tradeAmount * pnlPct / 100;
          trades.push({
            symbol, side: 'LONG',
            entryPrice, exitPrice: currentPrice,
            entryTime: pos.entryTime, exitTime: currentTime,
            reason: closeReason,
            score: pos.score || 0,
            machineConfidence: pos.machineConfidence || 0,
            netPnl: parseFloat(netPnl.toFixed(4)),
            netPnlPct: parseFloat(pnlPct.toFixed(2)),
            maxFavorable: pos.highestPrice ? ((pos.highestPrice - entryPrice) / entryPrice) * 100 : pnlPct,
            maxAdverse: pos.lowestPrice ? ((pos.lowestPrice - entryPrice) / entryPrice) * 100 : pnlPct,
            phase
          });
          return false;
        }
        return true;
      });

      if (openPositions.length >= maxPositions) continue;

      // Makine analizi
      if (!this.machine) this.machine = new MachineDecisionEngine();

      let machineAnalysis;
      try {
        machineAnalysis = this.machine.analyze(currentSlice, {
          symbol,
          priceChangePercent: 0,
          quoteVolume: parseFloat(candles[i][5]) || 0
        });
      } catch(e) {
        continue;
      }

      const shouldEnter = machineAnalysis.action === 'BUY' && machineAnalysis.confidence >= machineConfidenceMin;
      if (!shouldEnter) continue;

      openPositions.push({
        symbol, side: 'LONG',
        entryPrice: currentPrice,
        highestPrice: currentPrice,
        lowestPrice: currentPrice,
        entryTime: currentTime,
        score: 0,
        machineConfidence: machineAnalysis.confidence,
        takeProfit: machineAnalysis.takeProfit || null,
        stopLoss: machineAnalysis.stopLoss || null
      });
    }

    // Açık pozisyonları kapat
    const lastPrice = parseFloat(candles[candles.length - 1][4]);
    const lastTime = parseInt(candles[candles.length - 1][6]);

    for (const pos of openPositions) {
      const pnlPct = ((lastPrice - pos.entryPrice) / pos.entryPrice) * 100 - totalCost * 100;
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
        maxFavorable: pos.highestPrice ? ((pos.highestPrice - pos.entryPrice) / pos.entryPrice) * 100 : pnlPct,
        maxAdverse: pos.lowestPrice ? ((pos.lowestPrice - pos.entryPrice) / pos.entryPrice) * 100 : pnlPct,
        phase
      });
    }

    return trades;
  }

  calculateStats(trades, symbol) {
    const wins = trades.filter(t => t.netPnl > 0);
    const losses = trades.filter(t => t.netPnl <= 0);
    const totalPnl = trades.reduce((s, t) => s + t.netPnl, 0);
    const gW = wins.reduce((s, t) => s + t.netPnl, 0);
    const gL = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
    
    const returns = trades.map(t => t.netPnlPct);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1 ? Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length) : 0;
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(Math.max(1, trades.length)) : 0;

    return {
      symbol,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length > 0 ? parseFloat((wins.length / trades.length * 100).toFixed(1)) : 0,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      profitFactor: gL > 0 ? parseFloat((gW / gL).toFixed(2)) : 999,
      avgWin: wins.length > 0 ? parseFloat((wins.reduce((s, t) => s + t.netPnlPct, 0) / wins.length).toFixed(2)) : 0,
      avgLoss: losses.length > 0 ? parseFloat((losses.reduce((s, t) => s + t.netPnlPct, 0) / losses.length).toFixed(2)) : 0,
      bestTrade: trades.length > 0 ? parseFloat(Math.max(...trades.map(t => t.netPnlPct)).toFixed(2)) : 0,
      worstTrade: trades.length > 0 ? parseFloat(Math.min(...trades.map(t => t.netPnlPct)).toFixed(2)) : 0,
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2))
    };
  }

  printLearningCurve() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                ÖĞRENME EĞRİSİ                       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('Epoch | Sembol        | Islem | Basari% | PnL     | Sharpe');
    console.log('──────┼───────────────┼───────┼─────────┼─────────┼───────');

    for (const epoch of this.results.epochs) {
      const sym = (epoch.symbol || 'ALL').padEnd(13);
      const trd = String(epoch.totalTrades).padStart(5);
      const win = String(epoch.winRate?.toFixed(1) + '%').padStart(7);
      const pnl = String(epoch.totalPnl?.toFixed(2)).padStart(7);
      const shrp = String(epoch.sharpeRatio?.toFixed(2) || '-').padStart(5);
      console.log('  ' + String(epoch.epoch || '-').padStart(3) + '  | ' + sym + ' | ' + trd + ' | ' + win + ' | ' + pnl + ' | ' + shrp);
    }

    if (this.results.finalTest) {
      console.log('──────┼───────────────┼───────┼─────────┼─────────┼───────');
      const ft = this.results.finalTest;
      console.log('  TEST | TOPLAM        | ' + String(ft.totalTrades).padStart(5) + ' | ' + String(ft.winRate?.toFixed(1) + '%').padStart(7) + ' | ' + String(ft.totalPnl?.toFixed(2)).padStart(7) + ' | ' + String(ft.sharpeRatio?.toFixed(2) || '-').padStart(5));
    }
    console.log('='.repeat(62) + '\n');
  }
}

module.exports = new MachineBacktestEngine();
