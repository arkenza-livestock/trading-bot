const db = require('./database');
const MachineDecisionEngine = require('./MachineDecisionEngine');

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
      adaptiveThreshold: 0.78,
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

  getAdaptiveThreshold() {
    return this.performance.adaptiveThreshold || 0.78;
  }

  ema(values, period) {
    if (!values || values.length < period) {
      return values && values.length ? values[values.length - 1] : 0;
    }

    var k = 2 / (period + 1);
    var ema = values.slice(0, period).reduce(function(a, b) {
      return a + b;
    }, 0) / period;

    for (var i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }

    return ema;
  }

  rsi(values, period) {
    period = period || 14;

    if (!values || values.length <= period) return 50;

    var gains = 0;
    var losses = 0;

    for (var i = values.length - period; i < values.length; i++) {
      var diff = values[i] - values[i - 1];

      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    if (losses === 0) return 100;

    var rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  getCandleClose(c) {
    return Number(c.close || c[4] || 0);
  }

  getCandleVolume(c) {
    return Number(c.volume || c[5] || 0);
  }

  calculatePumpPotential(signal, candles) {
    var score = 0;

    var baseScore = Number(signal.score || signal.puan || 0);
    var volume24h = Number(signal.hacim24h || signal.quoteVolume || 0);
    var change24h = Number(signal.degisim24h || signal.priceChangePercent || 0);

    if (baseScore >= 65) score += 10;
    if (baseScore >= 75) score += 10;
    if (baseScore >= 85) score += 10;

    if (volume24h >= 1000000) score += 8;
    if (volume24h >= 5000000) score += 8;
    if (volume24h >= 15000000) score += 8;

    if (change24h >= 0.3 && change24h <= 8) score += 15;
    if (change24h > 10) score -= 15;
    if (change24h > 18) score -= 30;
    if (change24h < -4) score -= 20;

    if (!candles || candles.length < 30) {
      return Math.max(0, Math.min(100, score));
    }

    var closes = candles.map(this.getCandleClose).filter(function(v) {
      return v > 0;
    });

    var volumes = candles.map(this.getCandleVolume).filter(function(v) {
      return v > 0;
    });

    if (closes.length < 30) {
      return Math.max(0, Math.min(100, score));
    }

    var last = closes[closes.length - 1];
    var prev = closes[closes.length - 2];

    var ema9 = this.ema(closes, 9);
    var ema21 = this.ema(closes, 21);
    var ema50 = this.ema(closes, 50);

    if (last > ema9) score += 8;
    if (ema9 > ema21) score += 12;
    if (ema21 > ema50) score += 12;
    if (last > prev) score += 6;

    var rsi = this.rsi(closes, 14);

    if (rsi >= 45 && rsi <= 68) score += 15;
    if (rsi > 72) score -= 15;
    if (rsi > 80) score -= 30;
    if (rsi < 35) score -= 10;

    if (volumes.length >= 20) {
      var lastVol = volumes[volumes.length - 1];
      var avgVol = volumes.slice(-20).reduce(function(a, b) {
        return a + b;
      }, 0) / 20;

      if (lastVol > avgVol * 1.15) score += 8;
      if (lastVol > avgVol * 1.8) score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  secEnIyiSinyal(sinyaller, btcTrend, candlesData) {
    if (!sinyaller || sinyaller.length === 0) return null;

    var self = this;

    var degerlendirilen = sinyaller
      .filter(function(s) {
        var tip = s.signal_type || s.sinyal;
        return tip === 'ALIM' || tip === 'BUY';
      })
      .map(function(sinyal) {
        var machineScore = 0;
        var pumpPotential = 0;
        var candles = candlesData && candlesData[sinyal.symbol];

        if (candles) {
          var ma = self.machine.analyze(candles, {
            symbol: sinyal.symbol,
            priceChangePercent: sinyal.degisim24h || 0,
            quoteVolume: sinyal.hacim24h || 0
          });

          if (ma.action === 'BUY') {
            machineScore = ma.confidence || 0;
          } else if (ma.action === 'WAIT') {
            machineScore = (ma.confidence || 0) * 0.4;
          } else {
            machineScore = 0;
          }

          sinyal.machineReasoning = ma.reasoning;
          sinyal.machineConfidence = ma.confidence || 0;
          sinyal.similarPatternsFound = ma.similarPatternsFound || 0;

          if (ma.stopLoss) sinyal.stop_loss = ma.stopLoss;
          if (ma.takeProfit) sinyal.target = ma.takeProfit;
        }

        pumpPotential = self.calculatePumpPotential(sinyal, candles);

        var normalScore = Number(sinyal.score || sinyal.puan || 0) / 100;

        var combinedScore =
          machineScore * 0.45 +
          normalScore * 0.20 +
          (pumpPotential / 100) * 0.35;

        return {
          ...sinyal,
          side: 'LONG',
          machineScore: machineScore,
          pumpPotential: pumpPotential,
          combinedScore: combinedScore
        };
      })
      .filter(function(s) {
        if (btcTrend && btcTrend.trend === 'ASAGI') return false;
        if (s.machineScore < self.getAdaptiveThreshold()) return false;
        if (s.pumpPotential < 65) return false;
        if (s.combinedScore < 0.70) return false;
        return true;
      })
      .sort(function(a, b) {
        return b.combinedScore - a.combinedScore;
      });

    if (degerlendirilen.length === 0) {
      console.log('[SIM] Yükselme potansiyeli olan uygun coin bulunamadı');
      return null;
    }

    var best = degerlendirilen[0];

    console.log(
      '[SIM] SECILEN COIN: ' +
      best.symbol +
      ' | AI:%' + ((best.machineScore || 0) * 100).toFixed(0) +
      ' | Potansiyel:' + best.pumpPotential +
      ' | Final:%' + ((best.combinedScore || 0) * 100).toFixed(0)
    );

    return best;
  }

  openPosition(signal, settings, btcTrend, candlesData) {
    try {
      var wallet = this.getWallet();
      var openPos = this.getOpenPositions();

      var maxPos = parseInt(settings.max_open_positions || 3);
      var baseAmt = parseFloat(settings.trade_amount_usdt || 100);

      if (openPos.length >= maxPos) {
        console.log('[SIM] Max pozisyon doldu');
        return null;
      }

      if (openPos.find(function(p) {
        return p.symbol === signal.symbol;
      })) {
        return null;
      }

      if (btcTrend && btcTrend.trend === 'ASAGI') {
        console.log('[SIM] BTC düşüşte — LONG atlandı');
        return null;
      }

      if ((wallet?.balance || 0) < baseAmt) {
        console.log('[SIM] Yetersiz bakiye');
        return null;
      }

      var candles = candlesData && candlesData[signal.symbol];

      if (candles) {
        var ma = this.machine.analyze(candles, { symbol: signal.symbol });
        var threshold = this.getAdaptiveThreshold();
        var potential = this.calculatePumpPotential(signal, candles);

        if (ma.action !== 'BUY') {
          console.log('[SIM] AI BUY onayı yok');
          return null;
        }

        if ((ma.confidence || 0) < threshold) {
          console.log('[SIM] Güven eşiği altında');
          return null;
        }

        if (potential < 65) {
          console.log('[SIM] Yükselme potansiyeli düşük');
          return null;
        }

        signal.machineConfidence = ma.confidence || 0;
        signal.pumpPotential = potential;
      }

      var side = 'LONG';
      var price = Number(signal.price || signal.fiyat);

      if (!price || price <= 0) {
        console.log('[SIM] Geçersiz fiyat');
        return null;
      }

      var quantity = baseAmt / price;

      var stopLossPct = parseFloat(settings.stop_loss_percent || 0.6) / 100;
      var totalCost = 0.003;
      var minNetProfitPct = parseFloat(settings.min_profit_percent || 1.0) / 100;

      var stopLoss = signal.stop_loss || signal.stopLoss || price * (1 - stopLossPct);
      var takeProfit = price * (1 + minNetProfitPct + totalCost);

      var guc =
        (signal.machineConfidence || 0) >= 0.85
          ? 'AI_COK_GUCLU'
          : (signal.machineConfidence || 0) >= 0.78
            ? 'AI_GUCLU'
            : 'AI_NORMAL';

      var result = db.prepare(
        'INSERT INTO sim_positions (symbol,side,quantity,entry_price,current_price,stop_loss,take_profit,highest_price,lowest_price,signal_guc,trend4H,trend1D,score,machine_confidence) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(
        signal.symbol,
        side,
        quantity,
        price,
        price,
        stopLoss,
        takeProfit,
        price,
        price,
        guc,
        signal.trend || '-',
        signal.trend || '-',
        signal.pumpPotential || signal.score || signal.puan || 0,
        signal.machineConfidence || 0
      );

      db.prepare(
        'UPDATE sim_wallet SET balance=balance-?, updated_at=CURRENT_TIMESTAMP'
      ).run(baseAmt);

      this.trailingStops[signal.symbol] = {
        highestPrice: price,
        lowestPrice: price,
        side: side,
        entryTime: Date.now(),
        trailingActive: false,
        machineConfidence: signal.machineConfidence || 0,
        pumpPotential: signal.pumpPotential || 0
      };

      this.performance.signals.push({
        symbol: signal.symbol,
        side: side,
        entryPrice: price,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        machineConfidence: signal.machineConfidence || 0,
        pumpPotential: signal.pumpPotential || 0,
        timestamp: Date.now()
      });

      console.log(
        '[SIM] ALIM ACILDI: ' +
        signal.symbol +
        ' @ ' + price +
        ' | ' + baseAmt + ' USDT' +
        ' | Stop:%' + (stopLossPct * 100).toFixed(2) +
        ' | Trailing net %1 sonrası aktif'
      );

      return result.lastInsertRowid;

    } catch (e) {
      console.error('[SIM] Acma hatasi:', e.message);
      return null;
    }
  }

  closePosition(pos, exitPrice, reason) {
    try {
      var totalCost = 0.003;
      var side = pos.side || 'LONG';

      var brutoPnlPct =
        side === 'SHORT'
          ? ((pos.entry_price - exitPrice) / pos.entry_price) * 100
          : ((exitPrice - pos.entry_price) / pos.entry_price) * 100;

      var netPnlPct = brutoPnlPct - (totalCost * 100);

      var netPnl =
        (side === 'SHORT'
          ? (pos.entry_price - exitPrice)
          : (exitPrice - pos.entry_price)) * pos.quantity -
        (pos.entry_price * pos.quantity * totalCost);

      var exitAmount =
        side === 'SHORT'
          ? (pos.entry_price * pos.quantity + netPnl)
          : (exitPrice * pos.quantity);

      db.prepare(
        'UPDATE sim_positions SET status=?,exit_price=?,current_price=?,pnl=?,pnl_percent=?,close_reason=?,closed_at=CURRENT_TIMESTAMP WHERE id=?'
      ).run(reason, exitPrice, exitPrice, netPnl, netPnlPct, reason, pos.id);

      db.prepare(
        'UPDATE sim_wallet SET balance=balance+?,total_pnl=total_pnl+?,total_trades=total_trades+?,winning_trades=winning_trades+?,updated_at=CURRENT_TIMESTAMP'
      ).run(exitAmount, netPnl, 1, netPnl > 0 ? 1 : 0);

      var signalRecord = this.performance.signals.find(function(s) {
        return s.symbol === pos.symbol &&
          Math.abs(s.entryPrice - pos.entry_price) < pos.entry_price * 0.01;
      });

      if (signalRecord) {
        var maxFavorable = pos.highest_price
          ? ((pos.highest_price - pos.entry_price) / pos.entry_price) * 100
          : brutoPnlPct;

        var maxAdverse = pos.lowest_price
          ? ((pos.lowest_price - pos.entry_price) / pos.entry_price) * 100
          : brutoPnlPct;

        this.machine.feedbackSignalResult(
          signalRecord.timestamp,
          netPnlPct,
          maxFavorable,
          maxAdverse
        );

        this.performance.feedbackLoop.push({
          symbol: pos.symbol,
          return: netPnlPct,
          maxFavorable: maxFavorable,
          maxAdverse: maxAdverse,
          reason: reason,
          timestamp: Date.now()
        });

        this.performance.consecutiveLosses =
          netPnlPct <= 0 ? this.performance.consecutiveLosses + 1 : 0;

        this.updateAdaptiveThreshold();
      }

      delete this.trailingStops[pos.symbol];

      console.log(
        `[SIM] ${netPnl >= 0 ? 'KAR' : 'ZARAR'} ${reason}: ${pos.symbol} (${side}) | %${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT | PesPese:${this.performance.consecutiveLosses}`
      );

      return { netPnl: netPnl, netPnlPct: netPnlPct };

    } catch (e) {
      console.error('[SIM] Kapatma hatasi:', e.message);
      return null;
    }
  }

  updatePositions(prices, settings, candlesData) {
    var totalCost = 0.003;

    var trailingPct = parseFloat(settings.trailing_stop_percent || 0.45) / 100;
    var minNetProfitPct = parseFloat(settings.min_profit_percent || 1.0) / 100;
    var hardStopPct = parseFloat(settings.stop_loss_percent || 0.6) / 100;
    var maxHoldMs = parseInt(settings.max_hold_minutes || 60) * 60 * 1000;

    var activationProfitPct = minNetProfitPct + totalCost;

    var openPos = this.getOpenPositions();

    for (var i = 0; i < openPos.length; i++) {
      var pos = openPos[i];
      var currentPrice = prices[pos.symbol];

      if (!currentPrice) continue;

      var side = pos.side || 'LONG';
      var entry = Number(pos.entry_price);
      var quantity = Number(pos.quantity);

      var brutoPnlPct =
        side === 'SHORT'
          ? ((entry - currentPrice) / entry) * 100
          : ((currentPrice - entry) / entry) * 100;

      var netPnlPct = brutoPnlPct - (totalCost * 100);

      var netPnl =
        (side === 'SHORT'
          ? (entry - currentPrice)
          : (currentPrice - entry)) * quantity -
        (entry * quantity * totalCost);

      if (!this.trailingStops[pos.symbol]) {
        this.trailingStops[pos.symbol] = {
          highestPrice: pos.highest_price || entry,
          lowestPrice: pos.lowest_price || entry,
          side: side,
          entryTime: Date.now(),
          trailingActive: false
        };
      }

      var trailing = this.trailingStops[pos.symbol];

      if (currentPrice > trailing.highestPrice) {
        trailing.highestPrice = currentPrice;
      }

      if (currentPrice < trailing.lowestPrice) {
        trailing.lowestPrice = currentPrice;
      }

      var newHighest = Math.max(pos.highest_price || entry, trailing.highestPrice);
      var newLowest = Math.min(pos.lowest_price || entry, trailing.lowestPrice);

      var hardStop = entry * (1 - hardStopPct);
      var activationPrice = entry * (1 + activationProfitPct);

      if (!trailing.trailingActive && currentPrice >= activationPrice) {
        trailing.trailingActive = true;
        console.log('[SIM] TRAILING AKTIF: ' + pos.symbol + ' | Net %1 bolgesi goruldu');
      }

      var stopPrice = hardStop;
      var closeReason = null;

      if (trailing.trailingActive) {
        var trailingStop = trailing.highestPrice * (1 - trailingPct);

        var breakEvenPlus = entry * (1 + totalCost + 0.001);

        stopPrice = Math.max(trailingStop, breakEvenPlus);

        if (currentPrice <= stopPrice) {
          closeReason = 'TRAILING_STOP_MIN_1';
        }
      }

      if (!trailing.trailingActive && currentPrice <= hardStop) {
        closeReason = 'STOP_LOSS';
      }

      var openedAt = pos.opened_at
        ? new Date(pos.opened_at).getTime()
        : trailing.entryTime;

      var positionAge = Date.now() - openedAt;

      if (!closeReason && positionAge >= maxHoldMs && netPnlPct > 0) {
        closeReason = 'TIME_EXIT_PROFIT_1H';
      }

      if (!closeReason && positionAge >= maxHoldMs && netPnlPct <= 0) {
        closeReason = 'TIME_EXIT_NO_MOMENTUM';
      }

      if (closeReason) {
        this.closePosition(pos, currentPrice, closeReason);
      } else {
        db.prepare(
          'UPDATE sim_positions SET current_price=?,pnl=?,pnl_percent=?,stop_loss=?,highest_price=?,lowest_price=? WHERE id=?'
        ).run(
          currentPrice,
          netPnl,
          netPnlPct,
          stopPrice,
          newHighest,
          newLowest,
          pos.id
        );
      }
    }
  }

  updateAdaptiveThreshold() {
    var recent = this.performance.feedbackLoop.slice(-30);

    if (recent.length < 10) return;

    var winRate = recent.filter(function(f) {
      return f.return > 0;
    }).length / recent.length;

    if (winRate > 0.70) {
      this.performance.adaptiveThreshold = Math.max(
        0.72,
        this.performance.adaptiveThreshold - 0.02
      );
    } else if (winRate < 0.50) {
      this.performance.adaptiveThreshold = Math.min(
        0.88,
        this.performance.adaptiveThreshold + 0.03
      );
    }

    if (this.performance.consecutiveLosses >= 3) {
      this.performance.adaptiveThreshold = Math.min(
        0.92,
        this.performance.adaptiveThreshold + 0.05
      );
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
      adaptiveThreshold: 0.78,
      consecutiveLosses: 0,
      dailyPnL: []
    };

    console.log('[SIM] Sifirlandi — ' + startBalance + ' USDT');
  }

  getStats() {
    var wallet = this.getWallet();
    var openPos = this.getOpenPositions();

    var allPos = db.prepare(
      "SELECT * FROM sim_positions ORDER BY opened_at DESC"
    ).all();

    var closed = allPos.filter(function(p) {
      return p.status !== 'OPEN';
    });

    var wins = closed.filter(function(p) {
      return p.pnl > 0;
    });

    var losses = closed.filter(function(p) {
      return p.pnl <= 0;
    });

    var totalPnl = closed.reduce(function(s, p) {
      return s + (p.pnl || 0);
    }, 0);

    var gW = wins.reduce(function(s, p) {
      return s + (p.pnl || 0);
    }, 0);

    var gL = Math.abs(losses.reduce(function(s, p) {
      return s + (p.pnl || 0);
    }, 0));

    var startBal = parseFloat(
      (db.prepare("SELECT value FROM settings WHERE key='sim_balance'").get() || {}).value || 1000
    );

    var returns = closed.map(function(p) {
      return p.pnl_percent || 0;
    });

    var avgReturn = returns.length > 0
      ? returns.reduce(function(a, b) { return a + b; }, 0) / returns.length
      : 0;

    var variance = returns.length > 1
      ? returns.reduce(function(a, b) {
          return a + Math.pow(b - avgReturn, 2);
        }, 0) / returns.length
      : 0;

    var sharpe = Math.sqrt(variance) > 0
      ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(Math.max(1, closed.length))
      : 0;

    var peak = startBal;
    var maxDD = 0;
    var runningBal = startBal;

    for (var i = 0; i < closed.length; i++) {
      runningBal += closed[i].pnl || 0;

      if (runningBal > peak) peak = runningBal;

      var dd = ((peak - runningBal) / peak) * 100;

      if (dd > maxDD) maxDD = dd;
    }

    return {
      balance: parseFloat((wallet ? wallet.balance : startBal).toFixed(4)),
      startBalance: startBal,
      totalPnl: parseFloat(totalPnl.toFixed(4)),
      totalPnlPct: parseFloat(((totalPnl / startBal) * 100).toFixed(2)),
      totalTrades: closed.length,
      openTrades: openPos.length,
      wins: wins.length,
      losses: losses.length,
      winRate: parseFloat(
        (closed.length > 0 ? wins.length / closed.length * 100 : 0).toFixed(1)
      ),
      profitFactor: gL > 0 ? parseFloat((gW / gL).toFixed(2)) : 999,
      avgWin: parseFloat(
        (wins.length > 0
          ? wins.reduce(function(s, p) {
              return s + (p.pnl_percent || 0);
            }, 0) / wins.length
          : 0
        ).toFixed(2)
      ),
      avgLoss: parseFloat(
        (losses.length > 0
          ? losses.reduce(function(s, p) {
              return s + (p.pnl_percent || 0);
            }, 0) / losses.length
          : 0
        ).toFixed(2)
      ),
      sharpeRatio: parseFloat(sharpe.toFixed(2)),
      maxDrawdown: parseFloat(maxDD.toFixed(2)),
      adaptiveThreshold: parseFloat((this.performance.adaptiveThreshold * 100).toFixed(1)),
      consecutiveLosses: this.performance.consecutiveLosses,
      openPositions: openPos,
      recentTrades: allPos.slice(0, 30)
    };
  }
}

module.exports = new AdvancedSimulationEngine();
