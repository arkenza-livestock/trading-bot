/**
 * ═══════════════════════════════════════════════════════════════════════
 *   SİMÜLASYON/BACKTESTING MOTORU (PROFESYONELİZE EDİLMİŞ)
 *   
 *   📊 Özellikler:
 *   - Gerçekçi ticaret simülasyonu
 *   - Trailing Stop & Hard Stop yönetimi
 *   - Risk/Reward oranı kontrolü
 *   - Performans metriklerini takip
 *   - Adaptive Threshold (uyarlanabilir minimum sinyali)
 *   - Geri bildirim loop sistemi
 *   - Detaylı işlem istatistikleri
 * ═══════════════════════════════════════════════════════════════════════
 */

const db = require('./database');

class SimulationEngine {
  
  constructor() {
    // Açık pozisyon takibi
    this.trailingStops = {};
    this.openTrades = {};

    // Performans metrikleri
    this.performance = {
      signals: [],           // Tüm sinyaller
      feedbackLoop: [],      // Kapalı işlemlerden feedback
      adaptiveThreshold: 0.65, // Dinamik minimum sinyal eşiği
      consecutiveLosses: 0,   // Art arda kaybedilen işlem sayısı
      winStreak: 0,           // Art arda kazanan işlem sayısı
      dailyPnL: []           // Günlük kar/zarar
    };

    this.loadInitialSettings();
  }

  /**
   * Veritabanından başlangıç ayarlarını yükle
   */
  loadInitialSettings() {
    try {
      const wallet = this.getWallet();
      if (!wallet && db) {
        db.prepare('INSERT INTO sim_wallet (balance, total_pnl, total_trades) VALUES (?, ?, ?)')
          .run(1000, 0, 0);
      }
    } catch (e) {
      console.warn('[SIM] Başlangıç ayarları yüklenemedi');
    }
  }

  /**
   * Cüzdan bilgisi al
   */
  getWallet() {
    try {
      return db.prepare('SELECT * FROM sim_wallet ORDER BY id DESC LIMIT 1').get();
    } catch (e) {
      return null;
    }
  }

  /**
   * Açık pozisyonları getir
   */
  getOpenPositions() {
    try {
      return db.prepare("SELECT * FROM sim_positions WHERE status='OPEN'").all() || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Ana pozisyon açma fonksiyonu
   * @param {Object} signal - Analiz sinyali
   * @param {Object} settings - Bot ayarları
   * @param {Object} btcTrend - BTC trend verisi
   * @param {Object} candlesData - Mum verileri
   * @returns {number|null} Açılan pozisyon ID'si
   */
  openPosition(signal, settings, btcTrend, candlesData) {
    try {
      // ── Girdi validasyonu ──
      if (!signal || !signal.symbol || !signal.price) {
        console.warn('[SIM] Eksik sinyal verisi');
        return null;
      }

      // ── Cüzdan ve pozisyon kontrolleri ──
      const wallet = this.getWallet();
      const openPositions = this.getOpenPositions();
      const maxOpenPositions = parseInt(settings.max_open_positions || 3);
      const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);

      // Max pozisyon kontrolü
      if (openPositions.length >= maxOpenPositions) {
        console.log(`[SIM] ⚠️  Max pozisyon (${maxOpenPositions}) doldu. Yeni işlem açılamadı.`);
        return null;
      }

      // Aynı sembol kontrolü
      if (openPositions.find(p => p.symbol === signal.symbol)) {
        console.log(`[SIM] ⚠️  ${signal.symbol} zaten açık`);
        return null;
      }

      // Bakiye kontrolü
      if (!wallet || (wallet.balance || 0) < tradeAmount) {
        console.log(`[SIM] ❌ Yetersiz bakiye (${wallet?.balance || 0} USDT)`);
        return null;
      }

      // ── Taraf (LONG/SHORT) belirle ──
      let side = this.determineSide(signal);

      // ── Stop Loss belirle ──
      let stopLoss = signal.stop_loss || signal.stopLoss;
      if (!stopLoss) {
        const atr = signal.atr?.value || (signal.price * 0.02);
        stopLoss = side === 'SHORT' 
          ? signal.price + atr * 1.5 
          : signal.price - atr * 1.5;
      }

      // ── Take Profit belirle ──
      let takeProfit = signal.target || signal.hedef || signal.take_profit || 0;
      if (!takeProfit) {
        const atr = signal.atr?.value || (signal.price * 0.02);
        takeProfit = side === 'SHORT' 
          ? signal.price - atr * 3 
          : signal.price + atr * 3;
      }

      // ── Risk kontrolü ──
      const slDistance = Math.abs(signal.price - stopLoss) / signal.price * 100;
      const tpDistance = Math.abs(takeProfit - signal.price) / signal.price * 100;
      const rrRatio = slDistance > 0 ? tpDistance / slDistance : 0;

      if (rrRatio < 1.5) {
        console.log(`[SIM] ⚠️  Zayıf Risk/Reward (${rrRatio.toFixed(2)})`);
        // Devam et ama uyar
      }

      // ── Miktar hesapla ──
      const quantity = tradeAmount / signal.price;

      // ── Confidence seviyesi ──
      const confidence = signal.machineConfidence || signal.score / 100 || 0.5;
      const confidenceLevel = confidence >= 0.75 ? 'YUKSEK' 
                            : confidence >= 0.60 ? 'NORMAL' : 'DUSUK';

      // ── Database'e kaydet ──
      const result = db.prepare(`
        INSERT INTO sim_positions 
        (symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, 
         highest_price, lowest_price, signal_confidence, trend_4h, trend_1d, 
         risk_reward_ratio, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        signal.symbol,
        side,
        quantity,
        signal.price,
        signal.price,
        stopLoss,
        takeProfit,
        signal.price,
        signal.price,
        confidence,
        signal.trend || btcTrend.trend || '-',
        '-',
        parseFloat(rrRatio.toFixed(2)),
        'OPEN'
      );

      // ── Cüzdanı güncelle ──
      db.prepare('UPDATE sim_wallet SET balance=balance-?, updated_at=CURRENT_TIMESTAMP')
        .run(tradeAmount);

      // ── Trailing stop bilgisi ──
      this.trailingStops[signal.symbol] = {
        highestPrice: signal.price,
        lowestPrice: signal.price,
        side: side,
        entryTime: Date.now(),
        confidence: confidence
      };

      // ── Sinyal kaydı ──
      this.performance.signals.push({
        symbol: signal.symbol,
        side: side,
        entryPrice: signal.price,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        confidence: confidence,
        riskReward: rrRatio,
        timestamp: Date.now()
      });

      // ── Log ──
      console.log(`
╔════════════════════════════════════════╗
║ ✅ POZİSYON AÇILDI                     ║
╠════════════════════════════════════════╣
║ Sembol: ${String(signal.symbol).padEnd(28)} ║
║ Taraf: ${String(side).padEnd(29)} ║
║ Fiyat: $${String(signal.price.toFixed(8)).padEnd(25)} ║
║ S/L: $${String(stopLoss.toFixed(8)).padEnd(25)} ║
║ T/P: $${String(takeProfit.toFixed(8)).padEnd(25)} ║
║ R/R: ${String(rrRatio.toFixed(2)).padEnd(29)} ║
║ Confidence: ${String(`${(confidence*100).toFixed(0)}%`).padEnd(20)} ║
║ Tutar: ${String(`${tradeAmount} USDT`).padEnd(25)} ║
╚════════════════════════════════════════╝
      `);

      return result.lastInsertRowid;
    } catch (e) {
      console.error('[SIM] Pozisyon açma hatası:', e.message);
      return null;
    }
  }

  /**
   * Sinyal tarafını belirle (LONG/SHORT)
   */
  determineSide(signal) {
    const rawSide = (signal.side || signal.signal_type || signal.sinyal || '').toString().toUpperCase().trim();

    // SHORT benzerleri
    if (['SHORT', 'SELL', 'SATIS', 'SAT', 'AÇIK', 'CLOSE_LONG'].includes(rawSide)) {
      return 'SHORT';
    }

    // LONG benzerleri
    if (['LONG', 'BUY', 'ALIM', 'AL', 'KAPALI', 'OPEN_LONG'].includes(rawSide)) {
      return 'LONG';
    }

    // Varsayılan
    return 'LONG';
  }

  /**
   * Pozisyonu kapat
   * @param {Object} position - Pozisyon verisi
   * @param {number} exitPrice - Çıkış fiyatı
   * @param {string} reason - Kapanış nedeni (STOP_LOSS, TAKE_PROFIT, TRAILING_STOP, MANUAL)
   * @returns {Object|null} Kar/Zarar verisi
   */
  closePosition(position, exitPrice, reason = 'MANUAL') {
    try {
      // ── Kar/Zarar hesapla ──
      const side = position.side || 'LONG';
      const tradingFeePercent = 0.003; // 0.3% komisyon (maker + taker)

      let brutoPnL, netPnL, netPnLPercent;

      if (side === 'SHORT') {
        // SHORT işlem: al fiyat yüksek, sat fiyat düşük olmalı
        brutoPnL = (position.entry_price - exitPrice) * position.quantity;
        netPnL = brutoPnL - (position.entry_price * position.quantity * tradingFeePercent);
        netPnLPercent = ((position.entry_price - exitPrice) / position.entry_price) * 100 - (tradingFeePercent * 100);
      } else {
        // LONG işlem: al fiyat düşük, sat fiyat yüksek olmalı
        brutoPnL = (exitPrice - position.entry_price) * position.quantity;
        netPnL = brutoPnL - (position.entry_price * position.quantity * tradingFeePercent);
        netPnLPercent = ((exitPrice - position.entry_price) / position.entry_price) * 100 - (tradingFeePercent * 100);
      }

      // ── Database güncelle ──
      db.prepare(`
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

      // ── Cüzdan güncelle ──
      const exitAmount = side === 'SHORT' 
        ? (position.entry_price * position.quantity + netPnL)
        : (exitPrice * position.quantity);

      db.prepare(`
        UPDATE sim_wallet 
        SET balance=balance+?, total_pnl=total_pnl+?, total_trades=total_trades+1, 
            winning_trades=winning_trades+?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `).run(
        parseFloat(exitAmount.toFixed(8)),
        parseFloat(netPnL.toFixed(8)),
        netPnL > 0 ? 1 : 0
      );

      // ── Geri bildirim güncelle ──
      this.updateFeedbackLoop(position, netPnLPercent, reason);

      // ── Trailing stop sil ──
      delete this.trailingStops[position.symbol];

      // ── Streaks güncelle ──
      if (netPnLPercent > 0) {
        this.performance.winStreak++;
        this.performance.consecutiveLosses = 0;
      } else {
        this.performance.consecutiveLosses++;
        this.performance.winStreak = 0;
      }

      // ── Log ──
      const emoji = netPnL >= 0 ? '💚 KAR' : '❤️  ZARAR';
      console.log(`
${emoji} KAPANDI (${reason})
  Sembol: ${position.symbol} (${side})
  PnL: ${netPnL.toFixed(4)} USDT (${netPnLPercent.toFixed(2)}%)
  Consecutive Losses: ${this.performance.consecutiveLosses}
      `);

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
   * Geri bildirim loop'unu güncelle
   */
  updateFeedbackLoop(position, pnlPercent, reason) {
    try {
      const maxFavorableMove = position.side === 'SHORT'
        ? ((position.entry_price - position.lowest_price) / position.entry_price) * 100
        : ((position.highest_price - position.entry_price) / position.entry_price) * 100;

      const maxAdverseMove = position.side === 'SHORT'
        ? ((position.highest_price - position.entry_price) / position.entry_price) * 100
        : ((position.entry_price - position.lowest_price) / position.entry_price) * 100;

      this.performance.feedbackLoop.push({
        symbol: position.symbol,
        side: position.side,
        return: pnlPercent,
        maxFavorable: maxFavorableMove,
        maxAdverse: maxAdverseMove,
        reason: reason,
        confidence: position.signal_confidence || 0.5,
        timestamp: Date.now()
      });

      // Adaptive threshold güncelle
      this.updateAdaptiveThreshold();
    } catch (e) {
      console.warn('[SIM] Feedback güncelleme hatası:', e.message);
    }
  }

  /**
   * Aktif pozisyonları piyasa fiyatlarına göre güncelle
   * @param {Object} prices - Sembol -> Fiyat eşlemesi
   * @param {Object} settings - Bot ayarları
   * @param {Object} candlesData - Mum verileri
   */
  updatePositions(prices, settings, candlesData) {
    try {
      const trailingStopPercent = parseFloat(settings.trailing_stop_percent || 0.5) / 100;
      const minProfitPercent = parseFloat(settings.min_profit_percent || 1.5) / 100;
      const hardStopPercent = parseFloat(settings.stop_loss_percent || 2.0) / 100;

      const openPositions = this.getOpenPositions();

      for (const position of openPositions) {
        const currentPrice = prices[position.symbol];
        if (!currentPrice) continue;

        const side = position.side || 'LONG';

        // ── PnL hesapla ──
        let pnlPercent, closeReason = null;
        if (side === 'SHORT') {
          pnlPercent = ((position.entry_price - currentPrice) / position.entry_price) * 100;
        } else {
          pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100;
        }

        // ── Trailing stop'ları başlat ──
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

        // ── Yeni en yüksek/düşük ──
        if (side === 'SHORT') {
          if (currentPrice < trailing.lowestPrice) {
            trailing.lowestPrice = currentPrice;
            newLowest = currentPrice;
          }
          if (currentPrice > trailing.highestPrice) {
            newHighest = currentPrice;
          }
        } else {
          if (currentPrice > trailing.highestPrice) {
            trailing.highestPrice = currentPrice;
            newHighest = currentPrice;
          }
          if (currentPrice < trailing.lowestPrice) {
            newLowest = currentPrice;
          }
        }

        // ── Stop Loss hesapla ──
        let stopPrice;
        if (side === 'SHORT') {
          const hardStop = position.entry_price * (1 + hardStopPercent);
          const trailingStop = trailing.lowestPrice * (1 + trailingStopPercent);
          stopPrice = Math.min(trailingStop, hardStop);

          if (currentPrice >= hardStop) {
            closeReason = 'STOP_LOSS';
          } else if (pnlPercent >= minProfitPercent * 100 && currentPrice >= trailingStop) {
            closeReason = 'TRAILING_STOP';
          }
        } else {
          const hardStop = position.entry_price * (1 - hardStopPercent);
          const trailingStop = trailing.highestPrice * (1 - trailingStopPercent);
          stopPrice = Math.max(trailingStop, hardStop);

          if (currentPrice <= hardStop) {
            closeReason = 'STOP_LOSS';
          } else if (pnlPercent >= minProfitPercent * 100 && currentPrice <= trailingStop) {
            closeReason = 'TRAILING_STOP';
          }
        }

        // ── Karar ver ──
        if (closeReason) {
          this.closePosition(position, currentPrice, closeReason);
        } else {
          // Update position
          const pnl = side === 'SHORT'
            ? (position.entry_price - currentPrice) * position.quantity
            : (currentPrice - position.entry_price) * position.quantity;

          db.prepare(`
            UPDATE sim_positions 
            SET current_price=?, pnl=?, pnl_percent=?, stop_loss=?, highest_price=?, lowest_price=? 
            WHERE id=?
          `).run(
            currentPrice,
            parseFloat(pnl.toFixed(8)),
            parseFloat(pnlPercent.toFixed(2)),
            stopPrice,
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
   * Uyarlanabilir threshold'u güncelle
   */
  updateAdaptiveThreshold() {
    try {
      const recent = this.performance.feedbackLoop.slice(-50);
      if (recent.length < 10) return;

      const wins = recent.filter(f => f.return > 0).length;
      const winRate = wins / recent.length;

      // Kazanç oranına göre ayarla
      if (winRate > 0.65) {
        this.performance.adaptiveThreshold = Math.max(0.55, this.performance.adaptiveThreshold - 0.03);
      } else if (winRate < 0.45) {
        this.performance.adaptiveThreshold = Math.min(0.85, this.performance.adaptiveThreshold + 0.04);
      }

      // Art arda kayıplara göre cezalandır
      if (this.performance.consecutiveLosses >= 3) {
        this.performance.adaptiveThreshold = Math.min(0.90, this.performance.adaptiveThreshold + 0.05);
      }

      // Art arda kazanışlara göre ödüllendir
      if (this.performance.winStreak >= 5) {
        this.performance.adaptiveThreshold = Math.max(0.55, this.performance.adaptiveThreshold - 0.02);
      }
    } catch (e) {
      console.warn('[SIM] Threshold güncelleme hatası:', e.message);
    }
  }

  /**
   * Simülasyonu sıfırla
   * @param {number} startBalance - Başlangıç bakiyesi
   */
  reset(startBalance = 1000) {
    try {
      db.prepare("DELETE FROM sim_positions").run();
      db.prepare("DELETE FROM sim_wallet").run();
      db.prepare('INSERT INTO sim_wallet (balance, total_pnl, total_trades) VALUES (?, 0, 0)')
        .run(startBalance);

      this.trailingStops = {};
      this.performance = {
        signals: [],
        feedbackLoop: [],
        adaptiveThreshold: 0.65,
        consecutiveLosses: 0,
        winStreak: 0,
        dailyPnL: []
      };

      console.log(`[SIM] ♻️  Sıfırlandı — ${startBalance} USDT`);
    } catch (e) {
      console.error('[SIM] Reset hatası:', e.message);
    }
  }

  /**
   * Detaylı istatistikler al
   */
  getStats() {
    try {
      const wallet = this.getWallet();
      const openPos = this.getOpenPositions();
      const allPos = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC").all() || [];
      const closedPos = allPos.filter(p => p.status === 'CLOSED');
      const wins = closedPos.filter(p => (p.pnl || 0) > 0);
      const losses = closedPos.filter(p => (p.pnl || 0) <= 0);

      const totalPnL = closedPos.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
      const totalWinPnL = wins.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
      const totalLossPnL = Math.abs(losses.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0));

      const startBalance = parseFloat(wallet?.balance || 1000) - totalPnL;
      const currentBalance = parseFloat(wallet?.balance || 0);

      // ── Kar/Zarar yüzdeleri ──
      const returns = closedPos.map(p => parseFloat(p.pnl_percent) || 0);
      const avgReturn = returns.length > 0 
        ? returns.reduce((a, b) => a + b, 0) / returns.length 
        : 0;

      // ── Sharpe Ratio ──
      const variance = returns.length > 1 
        ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length 
        : 0;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 
        ? (avgReturn / stdDev) * Math.sqrt(252) 
        : 0;

      // ── Maximum Drawdown ──
      let peak = startBalance;
      let maxDD = 0;
      let runningBalance = startBalance;

      for (const pos of closedPos) {
        runningBalance += parseFloat(pos.pnl) || 0;
        if (runningBalance > peak) peak = runningBalance;
        const dd = (peak - runningBalance) / peak * 100;
        if (dd > maxDD) maxDD = dd;
      }

      // ── Profit Factor ──
      const profitFactor = totalLossPnL > 0 
        ? parseFloat((totalWinPnL / totalLossPnL).toFixed(2)) 
        : 999;

      return {
        wallet: {
          current: parseFloat(currentBalance.toFixed(2)),
          start: parseFloat(startBalance.toFixed(2)),
          change: parseFloat(((currentBalance - startBalance) / startBalance * 100).toFixed(2))
        },
        trades: {
          total: closedPos.length,
          open: openPos.length,
          wins: wins.length,
          losses: losses.length,
          winRate: closedPos.length > 0 
            ? parseFloat((wins.length / closedPos.length * 100).toFixed(1)) 
            : 0
        },
        profitability: {
          totalPnL: parseFloat(totalPnL.toFixed(4)),
          totalPnLPercent: parseFloat((totalPnL / startBalance * 100).toFixed(2)),
          avgWin: wins.length > 0 
            ? parseFloat((wins.reduce((s, p) => s + (parseFloat(p.pnl_percent) || 0), 0) / wins.length).toFixed(2)) 
            : 0,
          avgLoss: losses.length > 0 
            ? parseFloat((losses.reduce((s, p) => s + (parseFloat(p.pnl_percent) || 0), 0) / losses.length).toFixed(2)) 
            : 0,
          profitFactor: profitFactor
        },
        risk: {
          sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
          maxDrawdown: parseFloat(maxDD.toFixed(2)),
          consecutiveLosses: this.performance.consecutiveLosses,
          winStreak: this.performance.winStreak
        },
        adaptive: {
          threshold: parseFloat((this.performance.adaptiveThreshold * 100).toFixed(1))
        },
        openPositions: openPos,
        recentTrades: allPos.slice(0, 50)
      };
    } catch (e) {
      console.error('[SIM] Stats hatası:', e.message);
      return null;
    }
  }

  /**
   * Geriye dönük uyumluluk metotları
   */
  getAdaptiveThreshold() {
    return this.performance.adaptiveThreshold || 0.65;
  }
}

module.exports = new SimulationEngine();
