/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   SIMULATION.JS - BACKTESTING VE POZİSYON YÖNETİMİ
 *   
 *   📊 Özellikler:
 *   - Gerçekçi ticaret simülasyonu
 *   - Trailing Stop & Hard Stop Loss
 *   - Risk/Reward kontrol
 *   - Performans metrikleri
 *   - Adaptive threshold
 * ═══════════════════════════════════════════════════════════════════════════
 */

class SimulationEngine {
  constructor(db) {
    this.db = db;
    
    // Açık pozisyon takibi
    this.trailingStops = {};
    
    // Performans metrikleri
    this.performance = {
      signals: [],
      feedbackLoop: [],
      adaptiveThreshold: 0.65,
      consecutiveLosses: 0,
      winStreak: 0,
      totalTrades: 0,
      totalWins: 0,
      totalLosses: 0,
      totalPnL: 0
    };

    console.log('[SIMULATION] ✅ Engine başlatıldı');
  }

  /**
   * Cüzdan bilgisi al
   */
  getWallet() {
    try {
      const result = this.db.prepare('SELECT * FROM sim_wallet ORDER BY id DESC LIMIT 1').get();
      return result || { balance: 1000, total_pnl: 0, total_trades: 0 };
    } catch (e) {
      return { balance: 1000, total_pnl: 0, total_trades: 0 };
    }
  }

  /**
   * Açık pozisyonları getir
   */
  getOpenPositions() {
    try {
      return this.db.prepare("SELECT * FROM sim_positions WHERE status='OPEN'").all() || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Pozisyon aç
   */
  openPosition(signal, settings) {
    try {
      if (!signal || !signal.symbol || !signal.fiyat) {
        return null;
      }

      // Kontroller
      const wallet = this.getWallet();
      const openPos = this.getOpenPositions();
      const maxPos = parseInt(settings.max_open_positions || 3);
      const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);

      if (openPos.length >= maxPos) {
        console.log(`[SIM] ⚠️  Max pozisyon (${maxPos}) doldu`);
        return null;
      }

      if (openPos.find(p => p.symbol === signal.symbol)) {
        console.log(`[SIM] ⚠️  ${signal.symbol} zaten açık`);
        return null;
      }

      if ((wallet?.balance || 0) < tradeAmount) {
        console.log(`[SIM] ❌ Yetersiz bakiye`);
        return null;
      }

      // Taraf belirle
      const side = this.determineSide(signal);

      // Stop Loss
      let stopLoss = signal.stop_loss || signal.stopLoss;
      if (!stopLoss) {
        const atr = signal.atr || (signal.fiyat * 0.02);
        stopLoss = side === 'SHORT' 
          ? signal.fiyat + atr * 1.5 
          : signal.fiyat - atr * 1.5;
      }

      // Take Profit
      let takeProfit = signal.target || signal.hedef;
      if (!takeProfit) {
        const atr = signal.atr || (signal.fiyat * 0.02);
        takeProfit = side === 'SHORT' 
          ? signal.fiyat - atr * 3 
          : signal.fiyat + atr * 3;
      }

      // Miktar
      const quantity = tradeAmount / signal.fiyat;

      // Risk kontrolü
      const slDistance = Math.abs(signal.fiyat - stopLoss) / signal.fiyat * 100;
      const tpDistance = Math.abs(takeProfit - signal.fiyat) / signal.fiyat * 100;
      const rrRatio = slDistance > 0 ? tpDistance / slDistance : 0;

      // Database'e kaydet
      try {
        const result = this.db.prepare(`
          INSERT INTO sim_positions 
          (symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, 
           highest_price, lowest_price, signal_confidence, risk_reward_ratio, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          signal.symbol,
          side,
          quantity,
          signal.fiyat,
          signal.fiyat,
          stopLoss,
          takeProfit,
          signal.fiyat,
          signal.fiyat,
          signal.machineConfidence || signal.score / 100 || 0.5,
          parseFloat(rrRatio.toFixed(2)),
          'OPEN'
        );

        // Cüzdanı güncelle
        this.db.prepare('UPDATE sim_wallet SET balance=balance-?, updated_at=CURRENT_TIMESTAMP')
          .run(tradeAmount);

        // Trailing stop kaydı
        this.trailingStops[signal.symbol] = {
          highestPrice: signal.fiyat,
          lowestPrice: signal.fiyat,
          side: side,
          entryTime: Date.now(),
          confidence: signal.machineConfidence || 0.5
        };

        // Performans kaydı
        this.performance.signals.push({
          symbol: signal.symbol,
          side: side,
          entryPrice: signal.fiyat,
          stopLoss: stopLoss,
          takeProfit: takeProfit,
          confidence: signal.machineConfidence || 0.5,
          riskReward: rrRatio,
          timestamp: Date.now()
        });

        console.log(`
╔══════════════════════════════════════╗
║ ✅ POZİSYON AÇILDI                   ║
╠══════════════════════════════════════╣
║ ${signal.symbol.padEnd(28)} ║
║ ${side.padEnd(28)} ║
║ Fiyat: $${signal.fiyat.toFixed(8).padEnd(20)} ║
║ S/L: $${stopLoss.toFixed(8).padEnd(22)} ║
║ T/P: $${takeProfit.toFixed(8).padEnd(22)} ║
║ R/R: ${rrRatio.toFixed(2).padEnd(26)} ║
╚══════════════════════════════════════╝
        `);

        return result.lastInsertRowid;
      } catch (e) {
        console.error('[SIM] Database hatası:', e.message);
        return null;
      }
    } catch (e) {
      console.error('[SIM] Pozisyon açma hatası:', e.message);
      return null;
    }
  }

  /**
   * Sinyal tarafını belirle
   */
  determineSide(signal) {
    const rawSide = (signal.side || signal.signal_type || '').toString().toUpperCase().trim();
    
    if (['SHORT', 'SELL', 'SATIS', 'SAT'].includes(rawSide)) {
      return 'SHORT';
    }
    
    return 'LONG';
  }

  /**
   * Pozisyonu kapat
   */
  closePosition(position, exitPrice, reason = 'MANUAL') {
    try {
      const side = position.side || 'LONG';
      const tradingFee = 0.003; // 0.3%

      let netPnL, netPnLPercent;

      if (side === 'SHORT') {
        const brutoPnL = (position.entry_price - exitPrice) * position.quantity;
        netPnL = brutoPnL - (position.entry_price * position.quantity * tradingFee);
        netPnLPercent = ((position.entry_price - exitPrice) / position.entry_price) * 100 - (tradingFee * 100);
      } else {
        const brutoPnL = (exitPrice - position.entry_price) * position.quantity;
        netPnL = brutoPnL - (position.entry_price * position.quantity * tradingFee);
        netPnLPercent = ((exitPrice - position.entry_price) / position.entry_price) * 100 - (tradingFee * 100);
      }

      // Database güncelle
      this.db.prepare(`
        UPDATE sim_positions 
        SET status=?, exit_price=?, current_price=?, pnl=?, pnl_percent=?, close_reason=?, closed_at=CURRENT_TIMESTAMP 
        WHERE id=?
      `).run(
        'CLOSED',
        exitPrice,
        exitPrice,
        parseFloat(netPnL.toFixed(8)),
        parseFloat(netPnLPercent.toFixed(2)),
        reason,
        position.id
      );

      // Cüzdan güncelle
      const exitAmount = side === 'SHORT' 
        ? (position.entry_price * position.quantity + netPnL)
        : (exitPrice * position.quantity);

      this.db.prepare(`
        UPDATE sim_wallet 
        SET balance=balance+?, total_pnl=total_pnl+?, total_trades=total_trades+1, 
            winning_trades=winning_trades+?
        WHERE id=1
      `).run(
        parseFloat(exitAmount.toFixed(8)),
        parseFloat(netPnL.toFixed(8)),
        netPnL > 0 ? 1 : 0
      );

      // Trailing stop sil
      delete this.trailingStops[position.symbol];

      // Streak güncelle
      if (netPnLPercent > 0) {
        this.performance.winStreak++;
        this.performance.consecutiveLosses = 0;
      } else {
        this.performance.consecutiveLosses++;
        this.performance.winStreak = 0;
      }

      // Performans
      this.performance.totalTrades++;
      this.performance.totalPnL += parseFloat(netPnL.toFixed(8));
      if (netPnL > 0) this.performance.totalWins++;
      else this.performance.totalLosses++;

      const emoji = netPnL >= 0 ? '💚' : '❤️';
      console.log(`${emoji} ${reason}: ${position.symbol} | PnL: ${netPnLPercent.toFixed(2)}%`);

      return {
        netPnL: parseFloat(netPnL.toFixed(8)),
        netPnLPercent: parseFloat(netPnLPercent.toFixed(2)),
        reason: reason
      };
    } catch (e) {
      console.error('[SIM] Pozisyon kapanış hatası:', e.message);
      return null;
    }
  }

  /**
   * Açık pozisyonları güncelle (Her 3 saniyede)
   */
  updatePositions(prices, settings) {
    try {
      const trailingStopPercent = parseFloat(settings.trailing_stop_percent || 0.5) / 100;
      const minProfitPercent = parseFloat(settings.min_profit_percent || 1.5) / 100;
      const hardStopPercent = parseFloat(settings.stop_loss_percent || 2.0) / 100;

      const openPositions = this.getOpenPositions();

      for (const position of openPositions) {
        const currentPrice = prices[position.symbol];
        if (!currentPrice) continue;

        const side = position.side || 'LONG';
        let pnlPercent = 0;
        let closeReason = null;

        if (side === 'SHORT') {
          pnlPercent = ((position.entry_price - currentPrice) / position.entry_price) * 100;
        } else {
          pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100;
        }

        // Trailing stop
        if (!this.trailingStops[position.symbol]) {
          this.trailingStops[position.symbol] = {
            highestPrice: position.highest_price || position.entry_price,
            lowestPrice: position.lowest_price || position.entry_price,
            side: side,
            entryTime: Date.now()
          };
        }

        const trailing = this.trailingStops[position.symbol];
        let newHighest = position.highest_price || position.entry_price;
        let newLowest = position.lowest_price || position.entry_price;

        if (side === 'SHORT') {
          if (currentPrice < trailing.lowestPrice) {
            trailing.lowestPrice = currentPrice;
            newLowest = currentPrice;
          }
          if (currentPrice > trailing.highestPrice) {
            newHighest = currentPrice;
          }

          const hardStop = position.entry_price * (1 + hardStopPercent);
          const trailingStop = trailing.lowestPrice * (1 + trailingStopPercent);

          if (currentPrice >= hardStop) {
            closeReason = 'STOP_LOSS';
          } else if (pnlPercent >= minProfitPercent * 100 && currentPrice >= trailingStop) {
            closeReason = 'TRAILING_STOP';
          }
        } else {
          if (currentPrice > trailing.highestPrice) {
            trailing.highestPrice = currentPrice;
            newHighest = currentPrice;
          }
          if (currentPrice < trailing.lowestPrice) {
            newLowest = currentPrice;
          }

          const hardStop = position.entry_price * (1 - hardStopPercent);
          const trailingStop = trailing.highestPrice * (1 - trailingStopPercent);

          if (currentPrice <= hardStop) {
            closeReason = 'STOP_LOSS';
          } else if (pnlPercent >= minProfitPercent * 100 && currentPrice <= trailingStop) {
            closeReason = 'TRAILING_STOP';
          }
        }

        if (closeReason) {
          this.closePosition(position, currentPrice, closeReason);
        } else {
          // Update position
          const pnl = side === 'SHORT'
            ? (position.entry_price - currentPrice) * position.quantity
            : (currentPrice - position.entry_price) * position.quantity;

          this.db.prepare(`
            UPDATE sim_positions 
            SET current_price=?, pnl=?, pnl_percent=?, highest_price=?, lowest_price=? 
            WHERE id=?
          `).run(
            currentPrice,
            parseFloat(pnl.toFixed(8)),
            parseFloat(pnlPercent.toFixed(2)),
            newHighest,
            newLowest,
            position.id
          );
        }
      }
    } catch (e) {
      console.error('[SIM] Pozisyon güncelleme hatası:', e.message);
    }
  }

  /**
   * Adaptive threshold güncelle
   */
  updateAdaptiveThreshold() {
    try {
      const recent = this.performance.feedbackLoop.slice(-50);
      if (recent.length < 10) return;

      const wins = recent.filter(f => f.return > 0).length;
      const winRate = wins / recent.length;

      if (winRate > 0.65) {
        this.performance.adaptiveThreshold = Math.max(0.55, this.performance.adaptiveThreshold - 0.03);
      } else if (winRate < 0.45) {
        this.performance.adaptiveThreshold = Math.min(0.85, this.performance.adaptiveThreshold + 0.04);
      }

      if (this.performance.consecutiveLosses >= 3) {
        this.performance.adaptiveThreshold = Math.min(0.90, this.performance.adaptiveThreshold + 0.05);
      }

      if (this.performance.winStreak >= 5) {
        this.performance.adaptiveThreshold = Math.max(0.55, this.performance.adaptiveThreshold - 0.02);
      }
    } catch (e) {
      console.warn('[SIM] Threshold güncelleme hatası:', e.message);
    }
  }

  /**
   * İstatistikleri al
   */
  getStats() {
    try {
      const wallet = this.getWallet();
      const openPos = this.getOpenPositions();
      const allPos = this.db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC").all() || [];
      const closedPos = allPos.filter(p => p.status === 'CLOSED');
      const wins = closedPos.filter(p => (p.pnl || 0) > 0);
      const losses = closedPos.filter(p => (p.pnl || 0) <= 0);

      const totalPnL = closedPos.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
      const totalWinPnL = wins.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
      const totalLossPnL = Math.abs(losses.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0));

      const returns = closedPos.map(p => parseFloat(p.pnl_percent) || 0);
      const avgReturn = returns.length > 0 
        ? returns.reduce((a, b) => a + b, 0) / returns.length 
        : 0;

      const variance = returns.length > 1 
        ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length 
        : 0;

      const sharpeRatio = Math.sqrt(variance) > 0 
        ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(252) 
        : 0;

      return {
        balance: parseFloat((wallet?.balance || 0).toFixed(2)),
        totalPnL: parseFloat(totalPnL.toFixed(4)),
        totalPnLPercent: parseFloat((totalPnL / (wallet?.balance || 1000) * 100).toFixed(2)),
        totalTrades: closedPos.length,
        openTrades: openPos.length,
        wins: wins.length,
        losses: losses.length,
        winRate: closedPos.length > 0 ? parseFloat((wins.length / closedPos.length * 100).toFixed(1)) : 0,
        profitFactor: totalLossPnL > 0 ? parseFloat((totalWinPnL / totalLossPnL).toFixed(2)) : 999,
        avgWin: wins.length > 0 ? parseFloat((wins.reduce((s, p) => s + (parseFloat(p.pnl_percent) || 0), 0) / wins.length).toFixed(2)) : 0,
        avgLoss: losses.length > 0 ? parseFloat((losses.reduce((s, p) => s + (parseFloat(p.pnl_percent) || 0), 0) / losses.length).toFixed(2)) : 0,
        sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
        adaptiveThreshold: parseFloat((this.performance.adaptiveThreshold * 100).toFixed(1)),
        consecutiveLosses: this.performance.consecutiveLosses,
        winStreak: this.performance.winStreak,
        recentTrades: allPos.slice(0, 30)
      };
    } catch (e) {
      console.error('[SIM] Stats hatası:', e.message);
      return null;
    }
  }

  /**
   * Simülasyonu sıfırla
   */
  reset(startBalance = 1000) {
    try {
      this.db.prepare("DELETE FROM sim_positions").run();
      this.db.prepare("DELETE FROM sim_wallet").run();
      this.db.prepare('INSERT INTO sim_wallet (balance, total_pnl, total_trades) VALUES (?, 0, 0)')
        .run(startBalance);

      this.trailingStops = {};
      this.performance = {
        signals: [],
        feedbackLoop: [],
        adaptiveThreshold: 0.65,
        consecutiveLosses: 0,
        winStreak: 0,
        totalTrades: 0,
        totalWins: 0,
        totalLosses: 0,
        totalPnL: 0
      };

      console.log(`[SIM] ♻️  Sıfırlandı — ${startBalance} USDT`);
    } catch (e) {
      console.error('[SIM] Reset hatası:', e.message);
    }
  }
}

module.exports = SimulationEngine;
