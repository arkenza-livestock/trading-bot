const db = require('./database');
const MachineDecisionEngine = require('./MachineDecisionEngine');

/**
 * ═══════════════════════════════════════════════════════════
 *   GELİŞMİŞ SİMÜLASYON MOTORU - v2.0
 *   - MachineDecisionEngine ile entegre
 *   - Geçmiş desenleri analiz eder
 *   - Kendi kendine öğrenir
 *   - Sabit puan eşikleri YOK
 * ═══════════════════════════════════════════════════════════
 */

class AdvancedSimulationEngine {

  constructor() {
    this.trailingStops = {};
    this.machine = new MachineDecisionEngine();
    
    this.marketMemory = {
      btcHistory: [],
      allCandles: {},
      regimeHistory: [],
      correlationMatrix: {}
    };
    
    this.performance = {
      signals: [],
      feedbackLoop: [],
      adaptiveThreshold: 0.70,
      consecutiveLosses: 0,
      dailyPnL: []
    };
  }

  getWallet() {
    return db.prepare('SELECT * FROM sim_wallet ORDER BY id DESC LIMIT 1').get();
  }

  getOpenPositions() {
    return db.prepare("SELECT * FROM sim_positions WHERE status='OPEN'").all();
  }

  secEnIyiSinyal(sinyaller, btcTrend, candlesData = null) {
    if (!sinyaller || sinyaller.length === 0) return null;

    if (btcTrend && (btcTrend.trend === 'ASAGI' || btcTrend.trend === 'HAFIF_ASAGI')) {
      console.log('[SIM] BTC düşüş trendinde — pozisyon açılmıyor');
      return null;
    }

    const degerlendirilenSinyaller = sinyaller
      .filter(s => s.signal_type === 'ALIM' || s.sinyal === 'ALIM')
      .map(sinyal => {
        let machineScore = 0.5;
        
        if (candlesData && candlesData[sinyal.symbol]) {
          const machineAnalysis = this.machine.analyze(candlesData[sinyal.symbol], {
            symbol: sinyal.symbol,
            priceChangePercent: sinyal.degisim24h || 0,
            quoteVolume: sinyal.hacim24h || 0
          });
          
          if (machineAnalysis.action === 'BUY') {
            machineScore = machineAnalysis.confidence;
            if (machineAnalysis.stopLoss) sinyal.stop_loss = machineAnalysis.stopLoss;
            if (machineAnalysis.takeProfit) sinyal.target = machineAnalysis.takeProfit;
          } else if (machineAnalysis.action === 'WAIT') {
            machineScore = machineAnalysis.confidence * 0.5;
          } else {
            machineScore = 0;
          }
          
          sinyal.machineReasoning = machineAnalysis.reasoning;
          sinyal.machineConfidence = machineAnalysis.confidence;
          sinyal.similarPatternsFound = machineAnalysis.similarPatternsFound || 0;
        }
        
        return {
          ...sinyal,
          machineScore,
          combinedScore: (machineScore * 0.7) + ((sinyal.score || sinyal.puan || 0) / 100 * 0.3)
        };
      })
      .filter(s => s.machineScore > 0)
      .sort((a, b) => b.combinedScore - a.combinedScore);

    if (degerlendirilenSinyaller.length === 0) {
      console.log('[SIM] Hiçbir sinyal makine onayından geçemedi');
      return null;
    }

    return degerlendirilenSinyaller[0];
  }

  openPosition(signal, settings, btcTrend, candlesData = null) {
    try {
      const wallet  = this.getWallet();
      const openPos = this.getOpenPositions();
      const maxPos  = parseInt(settings.max_open_positions || 3);
      const baseAmt = parseFloat(settings.trade_amount_usdt || 100);

      if (openPos.length >= maxPos) {
        console.log('[SIM] Max pozisyon doldu');
        return null;
      }

      if (openPos.find(p => p.symbol === signal.symbol)) return null;

      if (btcTrend && (btcTrend.trend === 'ASAGI' || btcTrend.trend === 'HAFIF_ASAGI')) {
        console.log('[SIM] BTC düşüş — ' + signal.symbol + ' atlandı');
        return null;
      }

      if ((wallet?.balance || 0) < baseAmt) {
        console.log('[SIM] Yetersiz bakiye');
        return null;
      }

      if (candlesData && candlesData[signal.symbol]) {
        const machineAnalysis = this.machine.analyze(candlesData[signal.symbol], {
          symbol: signal.symbol
        });
        
        if (machineAnalysis.action !== 'BUY') {
          console.log(`[SIM] Makine ${signal.symbol} için AL demedi: ${machineAnalysis.reasoning}`);
          return null;
        }
        
        const threshold = this.getAdaptiveThreshold();
        if (machineAnalysis.confidence < threshold) {
          console.log(`[SIM] Güven eşiği altında: ${(machineAnalysis.confidence*100).toFixed(1)}% < ${(threshold*100).toFixed(1)}%`);
          return null;
        }
      }

      const price    = signal.price || signal.fiyat;
      const quantity = baseAmt / price;
      const stopLoss = signal.stop_loss || signal.stopLoss || price * 0.98;
      const takeProfit = signal.target || price * 1.05;
      const guc = (signal.machineConfidence || 0) >= 0.80 ? 'AI_GUCLU' : 
                  (signal.machineConfidence || 0) >= 0.65 ? 'AI_NORMAL' : 'AI_ZAYIF';

      const result = db.prepare(
        `INSERT INTO sim_positions 
         (symbol, side, quantity, entry_price, current_price, 
          stop_loss, take_profit, highest_price, lowest_price, 
          signal_guc, trend4H, trend1D, score, machine_confidence)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        signal.symbol, 'LONG', quantity,
        price, price, stopLoss, takeProfit,
        price, price, guc,
        signal.trend || '-',
        signal.trend || '-',
        signal.score || signal.puan || 0,
        signal.machineConfidence || 0
      );

      db.prepare('UPDATE sim_wallet SET balance=balance-?, updated_at=CURRENT_TIMESTAMP').run(baseAmt);

      this.trailingStops[signal.symbol] = {
        highestPrice: price,
        lowestPrice: price,
        side: 'LONG',
        entryTime: Date.now(),
        machineConfidence: signal.machineConfidence || 0
      };

      this.performance.signals.push({
        symbol: signal.symbol,
        entryPrice: price,
        stopLoss,
        takeProfit,
        machineConfidence: signal.machineConfidence || 0,
        timestamp: Date.now()
      });

      console.log(`[SIM] ACILDI: ${signal.symbol} @ ${price} | ${baseAmt} USDT | Guc:${guc} | AI:%${((signal.machineConfidence||0)*100).toFixed(0)}`);
      return result.lastInsertRowid;
    } catch(e) {
      console.error('[SIM] Acma hatasi:', e.message);
      return null;
    }
  }

  closePosition(pos, exitPrice, reason) {
    try {
      const totalCost = 0.003;
      const brutoPnlPct = ((exitPrice - pos.entry_price) / pos.entry_price) * 100;
      const netPnlPct   = brutoPnlPct - (totalCost * 100);
      const netPnl      = (exitPrice - pos.entry_price) * pos.quantity - (pos.entry_price * pos.quantity * totalCost);
      const exitAmount  = exitPrice * pos.quantity;

      db.prepare(
        `UPDATE sim_positions 
         SET status=?, exit_price=?, current_price=?, 
             pnl=?, pnl_percent=?, close_reason=?, closed_at=CURRENT_TIMESTAMP 
         WHERE id=?`
      ).run(reason, exitPrice, exitPrice, netPnl, netPnlPct, reason, pos.id);

      db.prepare(
        `UPDATE sim_wallet 
         SET balance=balance+?, total_pnl=total_pnl+?, 
             total_trades=total_trades+?, 
             winning_trades=winning_trades+?,
             updated_at=CURRENT_TIMESTAMP`
      ).run(exitAmount, netPnl, 1, netPnl > 0 ? 1 : 0);

      const signalRecord = this.performance.signals.find(
        s => s.symbol === pos.symbol && 
        Math.abs(s.entryPrice - pos.entry_price) < pos.entry_price * 0.01
      );
      
      if (signalRecord) {
        const maxFavorable = pos.highest_price ? 
          ((pos.highest_price - pos.entry_price) / pos.entry_price) * 100 : brutoPnlPct;
        const maxAdverse = pos.lowest_price ? 
          ((pos.lowest_price - pos.entry_price) / pos.entry_price) * 100 : brutoPnlPct;
        
        this.machine.feedbackSignalResult(signalRecord.timestamp, netPnlPct, maxFavorable, maxAdverse);
        
        this.performance.feedbackLoop.push({
          symbol: pos.symbol,
          return: netPnlPct,
          maxFavorable,
          maxAdverse,
          reason,
          timestamp: Date.now()
        });
        
        if (netPnlPct <= 0) {
          this.performance.consecutiveLosses++;
        } else {
          this.performance.consecutiveLosses = 0;
        }
        
        this.updateAdaptiveThreshold();
      }

      delete this.trailingStops[pos.symbol];

      const emoji = netPnl >= 0 ? 'KAR' : 'ZARAR';
      console.log(`[SIM] ${emoji} ${reason}: ${pos.symbol} | %${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT | PesPese:${this.performance.consecutiveLosses}`);
      return { netPnl, netPnlPct };
    } catch(e) {
      console.error('[SIM] Kapatma hatasi:', e.message);
      return null;
    }
  }

  updatePositions(prices, settings, candlesData = null) {
    const trailingPct  = parseFloat(settings.trailing_stop_percent || 0.5) / 100;
    const minProfitPct = parseFloat(settings.min_profit_percent || 1.5) / 100;
    const hardStopPct  = parseFloat(settings.stop_loss_percent || 2.0) / 100;
    const totalCost    = 0.003;
    const openPos      = this.getOpenPositions();

    for (let i = 0; i < openPos.length; i++) {
      const pos          = openPos[i];
      const currentPrice = prices[pos.symbol];
      if (!currentPrice) continue;

      const brutoPnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
      const netPnlPct   = brutoPnlPct - (totalCost * 100);
      const netPnl      = (currentPrice - pos.entry_price) * pos.quantity - (pos.entry_price * pos.quantity * totalCost);

      if (!this.trailingStops[pos.symbol]) {
        this.trailingStops[pos.symbol] = {
          highestPrice: pos.highest_price || pos.entry_price,
          lowestPrice:  pos.lowest_price  || pos.entry_price,
          side: 'LONG',
          entryTime: Date.now()
        };
      }

      const trailing    = this.trailingStops[pos.symbol];
      let newHighest    = pos.highest_price || pos.entry_price;
      let newLowest     = pos.lowest_price || pos.entry_price;
      let stopPrice     = pos.stop_loss || pos.entry_price * (1 - hardStopPct);
      let closeReason   = null;

      if (currentPrice > trailing.highestPrice) {
        trailing.highestPrice = currentPrice;
        newHighest = currentPrice;
      }
      if (currentPrice < trailing.lowestPrice) {
        trailing.lowestPrice = currentPrice;
        newLowest = currentPrice;
      }

      const trailingStop = trailing.highestPrice * (1 - trailingPct);
      const hardStop     = pos.entry_price * (1 - hardStopPct);
      stopPrice          = Math.max(trailingStop, hardStop);

      if (currentPrice <= pos.entry_price * (1 - hardStopPct)) {
        closeReason = 'HARD_STOP';
      } else if (brutoPnlPct >= minProfitPct * 100 && currentPrice <= stopPrice) {
        closeReason = 'TRAILING_STOP';
      } else if (this.performance.consecutiveLosses >= 3 && netPnlPct < 0) {
        closeReason = 'CONSECUTIVE_LOSS_PROTECTION';
        stopPrice = currentPrice;
      } else if (pos.take_profit && currentPrice >= pos.take_profit) {
        closeReason = 'TAKE_PROFIT';
        stopPrice = currentPrice;
      }

      if (closeReason) {
        this.closePosition(pos, currentPrice, closeReason);
      } else {
        db.prepare(
          `UPDATE sim_positions 
           SET current_price=?, pnl=?, pnl_percent=?, 
               stop_loss=?, highest_price=?, lowest_price=? 
           WHERE id=?`
        ).run(currentPrice, netPnl, netPnlPct, stopPrice, newHighest, newLowest, pos.id);
      }
    }
  }

  getAdaptiveThreshold() {
    return this.performance.adaptiveThreshold || 0.70;
  }

  updateAdaptiveThreshold() {
    const recent = this.performance.feedbackLoop.slice(-30);
    if (recent.length < 10) return;
    
    const winRate = recent.filter(f => f.return > 0).length / recent.length;
    
    if (winRate > 0.70) {
      this.performance.adaptiveThreshold = Math.max(0.60, this.performance.adaptiveThreshold - 0.02);
    } else if (winRate < 0.50) {
      this.performance.adaptiveThreshold = Math.min(0.85, this.performance.adaptiveThreshold + 0.03);
    }
    
    if (this.performance.consecutiveLosses >= 3) {
      this.performance.adaptiveThreshold = Math.min(0.90, this.performance.adaptiveThreshold + 0.05);
    }
  }

  reset(startBalance) {
    startBalance = startBalance || 1000;
    db.prepare("DELETE FROM sim_positions").run();
    db.prepare("DELETE FROM sim_wallet").run();
    db.prepare('INSERT INTO sim_wallet (balance) VALUES (?)').run(startBalance);
    this.trailingStops = {};
    this.performance = {
      signals: [],
      feedbackLoop: [],
      adaptiveThreshold: 0.70,
      consecutiveLosses: 0,
      dailyPnL: []
    };
    console.log('[SIM] Sifirlandı — ' + startBalance + ' USDT');
  }

  getStats() {
    const wallet   = this.getWallet();
    const openPos  = this.getOpenPositions();
    const allPos   = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC").all();
    const closed   = allPos.filter(p => p.status !== 'OPEN');
    const wins     = closed.filter(p => p.pnl > 0);
    const losses   = closed.filter(p => p.pnl <= 0);
    const totalPnl = closed.reduce((s, p) => s + (p.pnl || 0), 0);
    const winRate  = closed.length > 0 ? wins.length / closed.length * 100 : 0;
    const gW       = wins.reduce((s, p) => s + (p.pnl || 0), 0);
    const gL       = Math.abs(losses.reduce((s, p) => s + (p.pnl || 0), 0));
    const avgWin   = wins.length > 0 ? wins.reduce((s, p) => s + (p.pnl_percent || 0), 0) / wins.length : 0;
    const avgLoss  = losses.length > 0 ? losses.reduce((s, p) => s + (p.pnl_percent || 0), 0) / losses.length : 0;
    const startBal = parseFloat((db.prepare("SELECT value FROM settings WHERE key='sim_balance'").get() || {}).value || 1000);

    return {
      balance:       parseFloat((wallet ? wallet.balance : startBal).toFixed(4)),
      startBalance:  startBal,
      totalPnl:      parseFloat(totalPnl.toFixed(4)),
      totalPnlPct:   parseFloat((totalPnl / startBal * 100).toFixed(2)),
      totalTrades:   closed.length,
      openTrades:    openPos.length,
      wins:          wins.length,
      losses:        losses.length,
      winRate:       parseFloat(winRate.toFixed(1)),
      profitFactor:  gL > 0 ? parseFloat((gW / gL).toFixed(2)) : 999,
      avgWin:        parseFloat(avgWin.toFixed(2)),
      avgLoss:       parseFloat(avgLoss.toFixed(2)),
      adaptiveThreshold: parseFloat((this.performance.adaptiveThreshold * 100).toFixed(1)),
      consecutiveLosses: this.performance.consecutiveLosses,
      openPositions: openPos,
      recentTrades:  allPos.slice(0, 30)
    };
  }
}

module.exports = new AdvancedSimulationEngine();
