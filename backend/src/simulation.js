const db = require('./database');

class SimulationEngine {

  constructor() {
    this.trailingStops = {};
    this.performance = { signals: [], feedbackLoop: [], adaptiveThreshold: 0.70, consecutiveLosses: 0, dailyPnL: [] };
  }

  getWallet() {
    return db.prepare('SELECT * FROM sim_wallet ORDER BY id DESC LIMIT 1').get();
  }

  getOpenPositions() {
    return db.prepare("SELECT * FROM sim_positions WHERE status='OPEN'").all();
  }

  openPosition(signal, settings, btcTrend, candlesData) {
    try {
      var wallet = this.getWallet();
      var openPos = this.getOpenPositions();
      var maxPos = parseInt(settings.max_open_positions || 3);
      var baseAmt = parseFloat(settings.trade_amount_usdt || 100);
      
      if (openPos.length >= maxPos) { console.log('[SIM] Max pozisyon doldu'); return null; }
      if (openPos.find(function(p) { return p.symbol === signal.symbol; })) return null;
      if ((wallet?.balance || 0) < baseAmt) { console.log('[SIM] Yetersiz bakiye'); return null; }

      var price = signal.price || signal.fiyat;
      var quantity = baseAmt / price;
      var stopLoss = signal.stop_loss || signal.stopLoss || price * 0.98;
      var guc = (signal.machineConfidence || 0) >= 0.80 ? 'AI_GUCLU' : (signal.machineConfidence || 0) >= 0.65 ? 'AI_NORMAL' : 'AI_ZAYIF';
      var passedRules = signal.passedCount || signal.ruleResults ? Object.values(signal.ruleResults || {}).filter(v => v === true).length : 0;

      var result = db.prepare(
        'INSERT INTO sim_positions (symbol,side,quantity,entry_price,current_price,stop_loss,take_profit,highest_price,lowest_price,signal_guc,trend4H,trend1D,score,machine_confidence) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(signal.symbol, 'LONG', quantity, price, price, stopLoss, 0, price, price, guc, signal.trend || '-', signal.trend || '-', signal.score || signal.puan || 0, signal.machineConfidence || 0);

      db.prepare('UPDATE sim_wallet SET balance=balance-?, updated_at=CURRENT_TIMESTAMP').run(baseAmt);

      this.trailingStops[signal.symbol] = { highestPrice: price, lowestPrice: price, side: 'LONG', entryTime: Date.now(), machineConfidence: signal.machineConfidence || 0 };
      this.performance.signals.push({ symbol: signal.symbol, side: 'LONG', entryPrice: price, stopLoss: stopLoss, machineConfidence: signal.machineConfidence || 0, timestamp: Date.now() });

      console.log('[SIM] ACILDI: ' + signal.symbol + ' (LONG) @ ' + price + ' | ' + baseAmt + ' USDT | Kurallar:' + passedRules + '/6 | AI:%' + ((signal.machineConfidence||0)*100).toFixed(0));
      return result.lastInsertRowid;
    } catch(e) { console.error('[SIM] Acma hatasi:', e.message); return null; }
  }

  closePosition(pos, exitPrice, reason) {
    try {
      var totalCost = 0.003;
      var brutoPnlPct = ((exitPrice - pos.entry_price) / pos.entry_price) * 100;
      var netPnlPct = brutoPnlPct - (totalCost * 100);
      var netPnl = (exitPrice - pos.entry_price) * pos.quantity - (pos.entry_price * pos.quantity * totalCost);
      var exitAmount = exitPrice * pos.quantity;

      db.prepare('UPDATE sim_positions SET status=?,exit_price=?,current_price=?,pnl=?,pnl_percent=?,close_reason=?,closed_at=CURRENT_TIMESTAMP WHERE id=?').run(reason, exitPrice, exitPrice, netPnl, netPnlPct, reason, pos.id);
      db.prepare('UPDATE sim_wallet SET balance=balance+?,total_pnl=total_pnl+?,total_trades=total_trades+?,winning_trades=winning_trades+?,updated_at=CURRENT_TIMESTAMP').run(exitAmount, netPnl, 1, netPnl > 0 ? 1 : 0);

      var signalRecord = this.performance.signals.find(function(s) { return s.symbol === pos.symbol && Math.abs(s.entryPrice - pos.entry_price) < pos.entry_price * 0.01; });
      if (signalRecord) {
        var maxFavorable = pos.highest_price ? ((pos.highest_price - pos.entry_price) / pos.entry_price) * 100 : brutoPnlPct;
        var maxAdverse = pos.lowest_price ? ((pos.lowest_price - pos.entry_price) / pos.entry_price) * 100 : brutoPnlPct;
        this.performance.feedbackLoop.push({ symbol: pos.symbol, return: netPnlPct, maxFavorable: maxFavorable, maxAdverse: maxAdverse, reason: reason, timestamp: Date.now() });
        this.performance.consecutiveLosses = netPnlPct <= 0 ? this.performance.consecutiveLosses + 1 : 0;
        this.updateAdaptiveThreshold();
      }
      delete this.trailingStops[pos.symbol];
      console.log(`[SIM] ${netPnl >= 0 ? 'KAR' : 'ZARAR'} ${reason}: ${pos.symbol} (LONG) | %${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT | PesPese:${this.performance.consecutiveLosses}`);
      return { netPnl, netPnlPct };
    } catch(e) { console.error('[SIM] Kapatma hatasi:', e.message); return null; }
  }

  updatePositions(prices, settings, candlesData) {
    var trailingPct = parseFloat(settings.trailing_stop_percent || 0.5) / 100;
    var minProfitPct = parseFloat(settings.min_profit_percent || 1.5) / 100;
    var hardStopPct = parseFloat(settings.stop_loss_percent || 2.0) / 100;
    var totalCost = 0.003;
    var openPos = this.getOpenPositions();

    for (var i = 0; i < openPos.length; i++) {
      var pos = openPos[i];
      var currentPrice = prices[pos.symbol];
      if (!currentPrice) continue;

      var brutoPnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
      var netPnlPct = brutoPnlPct - (totalCost * 100);
      var netPnl = (currentPrice - pos.entry_price) * pos.quantity - (pos.entry_price * pos.quantity * totalCost);

      if (!this.trailingStops[pos.symbol]) {
        this.trailingStops[pos.symbol] = { highestPrice: pos.highest_price || pos.entry_price, lowestPrice: pos.lowest_price || pos.entry_price, side: 'LONG', entryTime: Date.now() };
      }

      var trailing = this.trailingStops[pos.symbol];
      var newHighest = pos.highest_price || pos.entry_price;
      var newLowest = pos.lowest_price || pos.entry_price;
      var stopPrice = pos.stop_loss;
      var closeReason = null;

      if (currentPrice > trailing.highestPrice) { trailing.highestPrice = currentPrice; newHighest = currentPrice; }
      if (currentPrice < trailing.lowestPrice) { newLowest = currentPrice; }
      var hardStop = pos.entry_price * (1 - hardStopPct);
      var trailingStop = trailing.highestPrice * (1 - trailingPct);
      stopPrice = Math.max(trailingStop, hardStop);

      if (currentPrice <= hardStop) closeReason = 'STOP_LOSS';
      else if (brutoPnlPct >= minProfitPct * 100 && currentPrice <= trailingStop) closeReason = 'TRAILING_STOP';

      if (closeReason) this.closePosition(pos, currentPrice, closeReason);
      else db.prepare('UPDATE sim_positions SET current_price=?,pnl=?,pnl_percent=?,stop_loss=?,highest_price=?,lowest_price=? WHERE id=?').run(currentPrice, netPnl, netPnlPct, stopPrice, newHighest, newLowest, pos.id);
    }
  }

  getAdaptiveThreshold() { return this.performance.adaptiveThreshold || 0.70; }

  updateAdaptiveThreshold() {
    var recent = this.performance.feedbackLoop.slice(-30);
    if (recent.length < 10) return;
    var winRate = recent.filter(function(f) { return f.return > 0; }).length / recent.length;
    if (winRate > 0.70) this.performance.adaptiveThreshold = Math.max(0.60, this.performance.adaptiveThreshold - 0.02);
    else if (winRate < 0.50) this.performance.adaptiveThreshold = Math.min(0.85, this.performance.adaptiveThreshold + 0.03);
    if (this.performance.consecutiveLosses >= 3) this.performance.adaptiveThreshold = Math.min(0.90, this.performance.adaptiveThreshold + 0.05);
  }

  reset(startBalance) {
    startBalance = startBalance || 1000;
    db.prepare("DELETE FROM sim_positions").run();
    db.prepare("DELETE FROM sim_wallet").run();
    db.prepare('INSERT INTO sim_wallet (balance) VALUES (?)').run(startBalance);
    this.trailingStops = {};
    this.performance = { signals: [], feedbackLoop: [], adaptiveThreshold: 0.70, consecutiveLosses: 0, dailyPnL: [] };
    console.log('[SIM] Sifirlandi — ' + startBalance + ' USDT');
  }

  getStats() {
    var wallet = this.getWallet(), openPos = this.getOpenPositions();
    var allPos = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC").all();
    var closed = allPos.filter(function(p) { return p.status !== 'OPEN'; });
    var wins = closed.filter(function(p) { return p.pnl > 0; });
    var losses = closed.filter(function(p) { return p.pnl <= 0; });
    var totalPnl = closed.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
    var gW = wins.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
    var gL = Math.abs(losses.reduce(function(s, p) { return s + (p.pnl || 0); }, 0));
    var startBal = parseFloat((db.prepare("SELECT value FROM settings WHERE key='sim_balance'").get() || {}).value || 1000);

    var returns = closed.map(function(p) { return p.pnl_percent || 0; });
    var avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    var variance = returns.length > 1 ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length : 0;
    var sharpe = Math.sqrt(variance) > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(Math.max(1, closed.length)) : 0;

    var peak = startBal, maxDD = 0, runningBal = startBal;
    for (var i = 0; i < closed.length; i++) {
      runningBal += (closed[i].pnl || 0); if (runningBal > peak) peak = runningBal;
      var dd = (peak - runningBal) / peak * 100; if (dd > maxDD) maxDD = dd;
    }

    return {
      balance: parseFloat((wallet ? wallet.balance : startBal).toFixed(4)), startBalance: startBal,
      totalPnl: parseFloat(totalPnl.toFixed(4)), totalPnlPct: parseFloat((totalPnl / startBal * 100).toFixed(2)),
      totalTrades: closed.length, openTrades: openPos.length, wins: wins.length, losses: losses.length,
      winRate: parseFloat((closed.length > 0 ? wins.length / closed.length * 100 : 0).toFixed(1)),
      profitFactor: gL > 0 ? parseFloat((gW / gL).toFixed(2)) : 999,
      avgWin: parseFloat((wins.length > 0 ? wins.reduce((s, p) => s + (p.pnl_percent || 0), 0) / wins.length : 0).toFixed(2)),
      avgLoss: parseFloat((losses.length > 0 ? losses.reduce((s, p) => s + (p.pnl_percent || 0), 0) / losses.length : 0).toFixed(2)),
      sharpeRatio: parseFloat(sharpe.toFixed(2)), maxDrawdown: parseFloat(maxDD.toFixed(2)),
      adaptiveThreshold: parseFloat((this.performance.adaptiveThreshold * 100).toFixed(1)),
      consecutiveLosses: this.performance.consecutiveLosses,
      openPositions: openPos, recentTrades: allPos.slice(0, 30)
    };
  }
}

module.exports = new SimulationEngine();
