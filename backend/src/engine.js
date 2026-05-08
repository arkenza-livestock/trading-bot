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

  // Coin yükselme potansiyeli filtresi
  calculatePumpPotential(signal, candles) {
    let score = 0;

    const volume = Number(signal.hacim24h || signal.quoteVolume || 0);
    const change24h = Number(signal.degisim24h || signal.priceChangePercent || 0);
    const baseScore = Number(signal.score || signal.puan || 0);

    if (baseScore >= 70) score += 20;
    if (baseScore >= 80) score += 10;

    if (volume >= 1000000) score += 10;
    if (volume >= 5000000) score += 10;
    if (volume >= 15000000) score += 10;

    // Çok şişmiş coinleri ele
    if (change24h >= 0.3 && change24h <= 8) score += 15;
    if (change24h > 12) score -= 20;
    if (change24h < -3) score -= 20;

    if (!candles || candles.length < 30) return score;

    const closes = candles.map(c => Number(c.close || c[4])).filter(Boolean);
    const volumes = candles.map(c => Number(c.volume || c[5])).filter(Boolean);

    if (closes.length < 30) return score;

    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];

    const ema9 = this.ema(closes, 9);
    const ema21 = this.ema(closes, 21);
    const ema50 = this.ema(closes, 50);

    if (last > ema9) score += 10;
    if (ema9 > ema21) score += 15;
    if (ema21 > ema50) score += 15;

    // Son mum yukarı kapatmışsa
    if (last > prev) score += 8;

    // Hacim artışı
    if (volumes.length >= 20) {
      const lastVol = volumes[volumes.length - 1];
      const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

      if (lastVol > avgVol * 1.2) score += 10;
      if (lastVol > avgVol * 2) score += 15;
    }

    // RSI aşırı alımda olmasın
    const rsi = this.rsi(closes, 14);
    if (rsi >= 45 && rsi <= 68) score += 15;
    if (rsi > 75) score -= 25;
    if (rsi < 35) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  ema(values, period) {
    if (!values || values.length < period) return values[values.length - 1] || 0;

    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }

    return ema;
  }

  rsi(values, period = 14) {
    if (!values || values.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = values.length - period; i < values.length; i++) {
      const diff = values[i] - values[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    if (losses === 0) return 100;

    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  secEnIyiSinyal(sinyaller, btcTrend, candlesData) {
    if (!sinyaller || sinyaller.length === 0) return null;

    const self = this;

    const degerlendirilen = sinyaller
      .filter(s => {
        const tip = s.signal_type || s.sinyal;
        return tip === 'ALIM' || tip === 'BUY';
      })
      .map(sinyal => {
        let machineScore = 0;
        let pumpPotential = 0;

        const candles = candlesData && candlesData[sinyal.symbol];

        if (candles) {
          const ma = self.machine.analyze(candles, {
            symbol: sinyal.symbol,
            priceChangePercent: sinyal.degisim24h || 0,
            quoteVolume: sinyal.hacim24h || 0
          });

          if (ma.action === 'BUY') {
            machineScore = ma.confidence || 0;
          } else {
            machineScore = 0;
          }

          sinyal.machineReasoning = ma.reasoning;
          sinyal.machineConfidence = ma.confidence || 0;
          sinyal.similarPatternsFound = ma.similarPatternsFound || 0;
        }

        pumpPotential = self.calculatePumpPotential(sinyal, candles);

        const normalScore = Number(sinyal.score || sinyal.puan || 0) / 100;

        const combinedScore =
          machineScore * 0.45 +
          normalScore * 0.20 +
          (pumpPotential / 100) * 0.35;

        return {
          ...sinyal,
          side: 'LONG',
          machineScore,
          pumpPotential,
          combinedScore
        };
      })
      .filter(s => {
        if (s.machineScore < self.getAdaptiveThreshold()) return false;
        if (s.pumpPotential < 65) return false;
        if (s.combinedScore < 0.70) return false;

        // BTC düşüşteyse alım yapma
        if (btcTrend && btcTrend.trend === 'ASAGI') return false;

        return true;
      })
      .sort((a, b) => b.combinedScore - a.combinedScore);

    if (degerlendirilen.length === 0) {
      console.log('[SIM] Yükselme potansiyeli yeterli coin bulunamadı');
      return null;
    }

    const best = degerlendirilen[0];

    console.log(
      `[SIM] EN IYI COIN: ${best.symbol} | AI:%${(best.machineScore * 100).toFixed(0)} | Potansiyel:${best.pumpPotential} | Skor:%${(best.combinedScore * 100).toFixed(0)}`
    );

    return best;
  }

  openPosition(signal, settings, btcTrend, candlesData) {
    try {
      const wallet = this.getWallet();
      const openPos = this.getOpenPositions();

      const maxPos = parseInt(settings.max_open_positions || 3);
      const baseAmt = parseFloat(settings.trade_amount_usdt || 100);

      if (openPos.length >= maxPos) {
        console.log('[SIM] Max pozisyon doldu');
        return null;
      }

      if (openPos.find(p => p.symbol === signal.symbol)) {
        console.log('[SIM] Aynı coinde açık pozisyon var');
        return null;
      }

      if (btcTrend && btcTrend.trend === 'ASAGI') {
        console.log('[SIM] BTC düşüşte — ALIM iptal');
        return null;
      }

      if ((wallet?.balance || 0) < baseAmt) {
        console.log('[SIM] Yetersiz bakiye');
        return null;
      }

      const candles = candlesData && candlesData[signal.symbol];

      if (candles) {
        const ma = this.machine.analyze(candles, { symbol: signal.symbol });
        const threshold = this.getAdaptiveThreshold();
        const pumpPotential = this.calculatePumpPotential(signal, candles);

        if (ma.action !== 'BUY') {
          console.log('[SIM] AI BUY vermedi');
          return null;
        }

        if ((ma.confidence || 0) < threshold) {
          console.log('[SIM] AI güven eşiği altında');
          return null;
        }

        if (pumpPotential < 65) {
          console.log('[SIM] Yükselme potansiyeli düşük');
          return null;
        }

        signal.machineConfidence = ma.confidence || 0;
        signal.pumpPotential = pumpPotential;
      }

      const side = 'LONG';
      const price = Number(signal.price || signal.fiyat);

      if (!price || price <= 0) {
        console.log('[SIM] Geçersiz fiyat');
        return null;
      }

      const quantity = baseAmt / price;

      // Başlangıç stop: %0.6
      const stopLoss = signal.stop_loss || signal.stopLoss || price * 0.994;

      // Net %1 için brüt hedef yaklaşık %1.30
      const takeProfit = price * 1.013;

      const guc =
        (signal.machineConfidence || 0) >= 0.85
          ? 'AI_COK_GUCLU'
          : (signal.machineConfidence || 0) >= 0.78
            ? 'AI_GUCLU'
            : 'AI_NORMAL';

      const result = db.prepare(
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
        signal.score || signal.puan || signal.pumpPotential || 0,
        signal.machineConfidence || 0
      );

      db.prepare(
        'UPDATE sim_wallet SET balance=balance-?, updated_at=CURRENT_TIMESTAMP'
      ).run(baseAmt);

      this.trailingStops[signal.symbol] = {
        highestPrice: price,
        lowestPrice: price,
        side,
        entryTime: Date.now(),
        trailingActive: false,
        machineConfidence: signal.machineConfidence || 0,
        pumpPotential: signal.pumpPotential || 0
      };

      this.performance.signals.push({
        symbol: signal.symbol,
        side,
        entryPrice: price,
        stopLoss,
        takeProfit,
        machineConfidence: signal.machineConfidence || 0,
        pumpPotential: signal.pumpPotential || 0,
        timestamp: Date.now()
      });

      console.log(
        `[SIM] ALIM AÇILDI: ${signal.symbol} @ ${price} | ${baseAmt} USDT | TP:%1+ | Stop:%0.6 | Güç:${guc}`
      );

      return result.lastInsertRowid;

    } catch (e) {
      console.error('[SIM] Açma hatası:', e.message);
      return null;
    }
  }

  closePosition(pos, exitPrice, reason) {
    try {
      const totalCost = 0.003;
      const side = pos.side || 'LONG';

      const brutoPnlPct =
        side === 'SHORT'
          ? ((pos.entry_price - exitPrice) / pos.entry_price) * 100
          : ((exitPrice - pos.entry_price) / pos.entry_price) * 100;

      const netPnlPct = brutoPnlPct - totalCost * 100;

      const netPnl =
        (side === 'SHORT'
          ? pos.entry_price - exitPrice
          : exitPrice - pos.entry_price) * pos.quantity -
        pos.entry_price * pos.quantity * totalCost;

      const exitAmount = exitPrice * pos.quantity;

      db.prepare(
        'UPDATE sim_positions SET status=?,exit_price=?,current_price=?,pnl=?,pnl_percent=?,close_reason=?,closed_at=CURRENT_TIMESTAMP WHERE id=?'
      ).run(reason, exitPrice, exitPrice, netPnl, netPnlPct, reason, pos.id);

      db.prepare(
        'UPDATE sim_wallet SET balance=balance+?,total_pnl=total_pnl+?,total_trades=total_trades+?,winning_trades=winning_trades+?,updated_at=CURRENT_TIMESTAMP'
      ).run(exitAmount, netPnl, 1, netPnl > 0 ? 1 : 0);

      const signalRecord = this.performance.signals.find(s =>
        s.symbol === pos.symbol &&
        Math.abs(s.entryPrice - pos.entry_price) < pos.entry_price * 0.01
      );

      if (signalRecord) {
        const maxFavorable = pos.highest_price
          ? ((pos.highest_price - pos.entry_price) / pos.entry_price) * 100
          : brutoPnlPct;

        const maxAdverse = pos.lowest_price
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
          maxFavorable,
          maxAdverse,
          reason,
          timestamp: Date.now()
        });

        this.performance.consecutiveLosses =
          netPnlPct <= 0 ? this.performance.consecutiveLosses + 1 : 0;

        this.updateAdaptiveThreshold();
      }

      delete this.trailingStops[pos.symbol];

      console.log(
        `[SIM] ${netPnl >= 0 ? 'KAR' : 'ZARAR'} ${reason}: ${pos.symbol} | %${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT`
      );

      return { netPnl, netPnlPct };

    } catch (e) {
      console.error('[SIM] Kapatma hatası:', e.message);
      return null;
    }
  }

  updatePositions(prices, settings, candlesData) {
    const totalCost = 0.003;

    // Net en az %1 için brütte yaklaşık %1.30 gerekir.
    const minNetProfitPct = parseFloat(settings.min_profit_percent || 1.0) / 100;
    const activationProfitPct = minNetProfitPct + totalCost;

    // Trailing mesafesi
    const trailingPct = parseFloat(settings.trailing_stop_percent || 0.45) / 100;

    // Sert zarar kes
    const hardStopPct = parseFloat(settings.stop_loss_percent || 0.6) / 100;

    // 1 saatlik işlem sınırı
    const maxHoldMs = parseInt(settings.max_hold_minutes || 60) * 60 * 1000;

    const openPos = this.getOpenPositions();

    for (let i = 0; i < openPos.length; i++) {
      const pos = openPos[i];
      const currentPrice = prices[pos.symbol];
      if (!currentPrice) continue;

      const side = pos.side || 'LONG';
      const entry = Number(pos.entry_price);
      const quantity = Number(pos.quantity);

      const brutoPnlPct =
        side === 'SHORT'
          ? ((entry - currentPrice) / entry) * 100
          : ((currentPrice - entry) / entry) * 100;

      const netPnlPct = brutoPnlPct - totalCost * 100;

      const netPnl =
        (side === 'SHORT'
          ? entry - currentPrice
          : currentPrice - entry) * quantity -
        entry * quantity * totalCost;

      if (!this.trailingStops[pos.symbol]) {
        this.trailingStops[pos.symbol] = {
          highestPrice: pos.highest_price || entry,
          lowestPrice: pos.lowest_price || entry,
          side,
          entryTime: Date.now(),
          trailingActive: false
        };
      }

      const trailing = this.trailingStops[pos.symbol];

      if (currentPrice > trailing.highestPrice) {
        trailing.highestPrice = currentPrice;
      }

      if (currentPrice < trailing.lowestPrice) {
        trailing.lowestPrice = currentPrice;
      }

      const newHighest = Math.max(pos.highest_price || entry, trailing.highestPrice);
      const newLowest = Math.min(pos.lowest_price || entry, trailing.lowestPrice);

      const hardStop = entry * (1 - hardStopPct);

      // Net %1 aktifleşme fiyatı
      const activationPrice = entry * (1 + activationProfitPct);

      // Net %1 görmeden trailing aktif olmaz
      if (!trailing.trailingActive && currentPrice >= activationPrice) {
        trailing.trailingActive = true;
        console.log(`[SIM] TRAILING AKTIF: ${pos.symbol} | Net hedef bölgesi görüldü`);
      }

      let stopPrice = hardStop;
      let closeReason = null;

      if (trailing.trailingActive) {
        const trailingStop = trailing.highestPrice * (1 - trailingPct);

        // Stop artık girişin altına düşmez
        const breakEvenPlus = entry * (1 + totalCost + 0.001);

        stopPrice = Math.max(trailingStop, breakEvenPlus);

        if (currentPrice <= stopPrice) {
          closeReason = 'TRAILING_STOP_MIN_1';
        }
      }

      if (!trailing.trailingActive && currentPrice <= hardStop) {
        closeReason = 'STOP_LOSS';
      }

      const openedAt = pos.opened_at
        ? new Date(pos.opened_at).getTime()
        : trailing.entryTime;

      const positionAge = Date.now() - openedAt;

      // 1 saat dolduysa ve kâr varsa kapat
      if (!closeReason && positionAge >= maxHoldMs && netPnlPct > 0) {
        closeReason = 'TIME_EXIT_PROFIT_1H';
      }

      // 1 saat dolduysa ve pozisyon hâlâ zarardaysa bekletme, küçük zararla kapat
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
    const recent = this.performance.feedbackLoop.slice(-30);
    if (recent.length < 10) return;

    const winRate = recent.filter(f => f.return > 0).length / recent.length;

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

    console.log('[SIM] Sıfırlandı — ' + startBalance + ' USDT');
  }

  getStats() {
    const wallet = this.getWallet();
    const openPos = this.getOpenPositions();

    const allPos = db.prepare(
      "SELECT * FROM sim_positions ORDER BY opened_at DESC"
    ).all();

    const closed = allPos.filter(p => p.status !== 'OPEN');
    const wins = closed.filter(p => p.pnl > 0);
    const losses = closed.filter(p => p.pnl <= 0);

    const totalPnl = closed.reduce((s, p) => s + (p.pnl || 0), 0);
    const gW = wins.reduce((s, p) => s + (p.pnl || 0), 0);
    const gL = Math.abs(losses.reduce((s, p) => s + (p.pnl || 0), 0));

    const startBal = parseFloat(
      (db.prepare("SELECT value FROM settings WHERE key='sim_balance'").get() || {}).value || 1000
    );

    const returns = closed.map(p => p.pnl_percent || 0);
    const avgReturn =
      returns.length > 0
        ? returns.reduce((a, b) => a + b, 0) / returns.length
        : 0;

    const variance =
      returns.length > 1
        ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length
        : 0;

    const sharpe =
      Math.sqrt(variance) > 0
        ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(Math.max(1, closed.length))
        : 0;

    let peak = startBal;
    let maxDD = 0;
    let runningBal = startBal;

    for (let i = 0; i < closed.length; i++) {
      runningBal += closed[i].pnl || 0;
      if (runningBal > peak) peak = runningBal;

      const dd = ((peak - runningBal) / peak) * 100;
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
        (closed.length > 0 ? (wins.length / closed.length) * 100 : 0).toFixed(1)
      ),
      profitFactor: gL > 0 ? parseFloat((gW / gL).toFixed(2)) : 999,
      avgWin: parseFloat(
        (wins.length > 0
          ? wins.reduce((s, p) => s + (p.pnl_percent || 0), 0) / wins.length
          : 0
        ).toFixed(2)
      ),
      avgLoss: parseFloat(
        (losses.length > 0
          ? losses.reduce((s, p) => s + (p.pnl_percent || 0), 0) / losses.length
          : 0
        ).toFixed(2)
      ),
      sharpeRatio: parseFloat(sharpe.toFixed(2)),
      maxDrawdown: parseFloat(maxDD.toFixed(2)),
      adaptiveThreshold: parseFloat(
        (this.performance.adaptiveThreshold * 100).toFixed(1)
      ),
      consecutiveLosses: this.performance.consecutiveLosses,
      openPositions: openPos,
      recentTrades: allPos.slice(0, 30)
    };
  }
}

module.exports = new AdvancedSimulationEngine();
