const db = require('./database');

class SimulationEngine {
  constructor() {
    this.trailingStops = {};
  }

  getWallet() {
    return db.prepare('SELECT * FROM sim_wallet ORDER BY id DESC LIMIT 1').get();
  }

  getOpenPositions() {
    return db.prepare("SELECT * FROM sim_positions WHERE status='OPEN'").all();
  }

  // En iyi sinyali seç — puan + risk/ödül + BTC uyumu
  secEnIyiSinyal(sinyaller, btcTrend) {
    if (!sinyaller || sinyaller.length === 0) return null;

    // Sadece ALIM olanları al
    let adaylar = sinyaller.filter(s => s.signal_type === 'ALIM' || s.sinyal === 'ALIM');

    // BTC düşüşte ise hiç açma
    if (btcTrend && (btcTrend.trend === 'ASAGI' || btcTrend.trend === 'HAFIF_ASAGI')) {
      console.log('[SIM] BTC düşüş trendinde — pozisyon açılmıyor');
      return null;
    }

    // Puana göre sırala
    adaylar.sort(function(a, b) { return (b.score || b.puan || 0) - (a.score || a.puan || 0); });

    // En iyi adayı döndür
    return adaylar[0] || null;
  }

  openPosition(signal, settings, btcTrend) {
    try {
      const wallet  = this.getWallet();
      const openPos = this.getOpenPositions();
      const maxPos  = parseInt(settings.max_open_positions || 3);
      const baseAmt = parseFloat(settings.trade_amount_usdt || 100);

      // Max pozisyon kontrolü
      if (openPos.length >= maxPos) {
        console.log('[SIM] Max pozisyon doldu (' + openPos.length + '/' + maxPos + ')');
        return null;
      }

      // Aynı coin kontrolü
      if (openPos.find(function(p) { return p.symbol === signal.symbol; })) return null;

      // BTC düşüşte ise açma
      if (btcTrend && (btcTrend.trend === 'ASAGI' || btcTrend.trend === 'HAFIF_ASAGI')) {
        console.log('[SIM] BTC düşüş — ' + signal.symbol + ' atlandı');
        return null;
      }

      // Puan yeterli mi?
      const minScore = parseInt(settings.min_score || 40);
      const puan     = signal.score || signal.puan || 0;
      if (puan < minScore) {
        console.log('[SIM] Puan yetersiz: ' + puan + ' < ' + minScore);
        return null;
      }

      // Bakiye kontrolü
      if ((wallet?.balance || 0) < baseAmt) {
        console.log('[SIM] Yetersiz bakiye: ' + wallet?.balance);
        return null;
      }

      const price    = signal.price || signal.fiyat;
      const quantity = baseAmt / price;
      const guc      = puan >= 80 ? 'GUCLU' : puan >= 60 ? 'NORMAL' : 'ZAYIF';
      const stopLoss = signal.stop_loss || signal.stopLoss || price * 0.98;

      const result = db.prepare(
        'INSERT INTO sim_positions (symbol,side,quantity,entry_price,current_price,stop_loss,highest_price,lowest_price,signal_guc,trend4H,trend1D,score) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(
        signal.symbol, 'LONG', quantity,
        price, price, stopLoss,
        price, price, guc,
        signal.trend || '-',
        signal.trend || '-',
        puan
      );

      db.prepare('UPDATE sim_wallet SET balance=balance-?,updated_at=CURRENT_TIMESTAMP').run(baseAmt);

      this.trailingStops[signal.symbol] = { highestPrice: price, lowestPrice: price, side: 'LONG' };

      console.log('[SIM] ACILDI: ' + signal.symbol + ' @ ' + price + ' | ' + baseAmt + ' USDT | Guc:' + guc + ' | Puan:' + puan);
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
        'UPDATE sim_positions SET status=?,exit_price=?,current_price=?,pnl=?,pnl_percent=?,close_reason=?,closed_at=CURRENT_TIMESTAMP WHERE id=?'
      ).run(reason, exitPrice, exitPrice, netPnl, netPnlPct, reason, pos.id);

      db.prepare(
        'UPDATE sim_wallet SET balance=balance+?,total_pnl=total_pnl+?,total_trades=total_trades+?,winning_trades=winning_trades+?,updated_at=CURRENT_TIMESTAMP'
      ).run(exitAmount, netPnl, 1, netPnl > 0 ? 1 : 0);

      delete this.trailingStops[pos.symbol];

      const emoji = netPnl >= 0 ? 'KAR' : 'ZARAR';
      console.log('[SIM] ' + emoji + ' ' + reason + ': ' + pos.symbol + ' | %' + netPnlPct.toFixed(2) + ' | ' + netPnl.toFixed(4) + ' USDT');
      return { netPnl, netPnlPct };
    } catch(e) {
      console.error('[SIM] Kapatma hatasi:', e.message);
      return null;
    }
  }

  updatePositions(prices, settings) {
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
          side: 'LONG'
        };
      }

      const trailing    = this.trailingStops[pos.symbol];
      let newHighest    = pos.highest_price || pos.entry_price;
      let stopPrice     = pos.stop_loss || pos.entry_price * 0.98;
      let closeReason   = null;

      if (currentPrice > trailing.highestPrice) {
        trailing.highestPrice = currentPrice;
        newHighest = currentPrice;
      }

      const trailingStop = trailing.highestPrice * (1 - trailingPct);
      const hardStop     = pos.entry_price * (1 - hardStopPct);
      stopPrice          = Math.max(trailingStop, hardStop);

      if (netPnlPct <= -hardStopPct * 100) {
        closeReason = 'STOP_LOSS';
      } else if (brutoPnlPct >= minProfitPct * 100 && currentPrice <= trailingStop) {
        closeReason = 'TRAILING_STOP';
      }

      if (closeReason) {
        this.closePosition(pos, currentPrice, closeReason);
      } else {
        db.prepare(
          'UPDATE sim_positions SET current_price=?,pnl=?,pnl_percent=?,stop_loss=?,highest_price=? WHERE id=?'
        ).run(currentPrice, netPnl, netPnlPct, stopPrice, newHighest, pos.id);
      }
    }
  }

  reset(startBalance) {
    startBalance = startBalance || 1000;
    db.prepare("DELETE FROM sim_positions").run();
    db.prepare("DELETE FROM sim_wallet").run();
    db.prepare('INSERT INTO sim_wallet (balance) VALUES (?)').run(startBalance);
    this.trailingStops = {};
    console.log('[SIM] Sifirlandı — ' + startBalance + ' USDT');
  }

  getStats() {
    const wallet   = this.getWallet();
    const openPos  = this.getOpenPositions();
    const allPos   = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC").all();
    const closed   = allPos.filter(function(p) { return p.status !== 'OPEN'; });
    const wins     = closed.filter(function(p) { return p.pnl > 0; });
    const losses   = closed.filter(function(p) { return p.pnl <= 0; });
    const totalPnl = closed.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
    const winRate  = closed.length > 0 ? wins.length / closed.length * 100 : 0;
    const gW       = wins.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
    const gL       = Math.abs(losses.reduce(function(s, p) { return s + (p.pnl || 0); }, 0));
    const avgWin   = wins.length > 0 ? wins.reduce(function(s, p) { return s + (p.pnl_percent || 0); }, 0) / wins.length : 0;
    const avgLoss  = losses.length > 0 ? losses.reduce(function(s, p) { return s + (p.pnl_percent || 0); }, 0) / losses.length : 0;
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
      openPositions: openPos,
      recentTrades:  allPos.slice(0, 30)
    };
  }
}

module.exports = new SimulationEngine();
