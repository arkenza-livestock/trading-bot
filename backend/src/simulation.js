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

  openPosition(signal, settings={}) {
    try {
      const wallet  = this.getWallet();
      const openPos = this.getOpenPositions();
      const maxPos  = parseInt(settings.max_open_positions||5);
      const baseAmt = parseFloat(settings.trade_amount_usdt||100);
      if (openPos.length>=maxPos) return null;
      const existing = openPos.find(p=>p.symbol===signal.symbol);
      if (existing) return null;
      const mult   = signal.pozisyonMult||1.0;
      const amount = parseFloat((baseAmt*mult).toFixed(2));
      if ((wallet?.balance||0)<amount) return null;
      const side     = signal.signal==='ALIM'?'LONG':'SHORT';
      const quantity = amount/signal.price;
      const guc      = signal.longSinyal||signal.shortSinyal||'NORMAL';
      const result = db.prepare(`
        INSERT INTO sim_positions
        (symbol,side,quantity,entry_price,current_price,stop_loss,highest_price,lowest_price,signal_guc,trend4H,trend1D,score)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        signal.symbol, side, quantity,
        signal.price, signal.price,
        signal.stopLoss||0,
        signal.price, signal.price,
        guc, signal.trend4H||'BELIRSIZ', signal.trend1D||'BELIRSIZ',
        signal.score||0
      );
      db.prepare('UPDATE sim_wallet SET balance=balance-?,updated_at=CURRENT_TIMESTAMP').run(amount);
      this.trailingStops[signal.symbol] = { highestPrice:signal.price, lowestPrice:signal.price, side };
      console.log(`[SIM] ✅ ${side} AÇILDI: ${signal.symbol} @ ${signal.price} | ${amount} USDT | Güç:${guc}`);
      return result.lastInsertRowid;
    } catch(e) { console.error('[SIM] Açma hatası:', e.message); return null; }
  }

  closePosition(pos, exitPrice, reason) {
    try {
      const side      = pos.side||'LONG';
      const totalCost = 0.003;
      let brutoPnlPct, netPnlPct, netPnl;
      if (side==='SHORT') {
        brutoPnlPct = ((pos.entry_price-exitPrice)/pos.entry_price)*100;
      } else {
        brutoPnlPct = ((exitPrice-pos.entry_price)/pos.entry_price)*100;
      }
      netPnlPct = brutoPnlPct-(totalCost*100);
      netPnl    = side==='SHORT'
        ? (pos.entry_price-exitPrice)*pos.quantity-(pos.entry_price*pos.quantity*totalCost)
        : (exitPrice-pos.entry_price)*pos.quantity-(pos.entry_price*pos.quantity*totalCost);
      const exitAmount = exitPrice*pos.quantity;
      db.prepare(`
        UPDATE sim_positions
        SET status=?,exit_price=?,current_price=?,pnl=?,pnl_percent=?,close_reason=?,closed_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(reason, exitPrice, exitPrice, netPnl, netPnlPct, reason, pos.id);
      db.prepare(`
        UPDATE sim_wallet
        SET balance=balance+?,total_pnl=total_pnl+?,total_trades=total_trades+?,winning_trades=winning_trades+?,updated_at=CURRENT_TIMESTAMP
      `).run(exitAmount, netPnl, 1, netPnl>0?1:0);
      delete this.trailingStops[pos.symbol];
      console.log(`[SIM] ${netPnl>=0?'✅':'❌'} ${reason}[${side}]: ${pos.symbol} | %${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT`);
      return { netPnl, netPnlPct };
    } catch(e) { console.error('[SIM] Kapatma hatası:', e.message); return null; }
  }

  updatePositions(prices, settings={}) {
    const trailingPct  = parseFloat(settings.trailing_stop_percent||0.5)/100;
    const minProfitPct = parseFloat(settings.min_profit_percent||1.5)/100;
    const hardStopPct  = parseFloat(settings.stop_loss_percent||2.0)/100;
    const totalCost    = 0.003;
    const openPos = this.getOpenPositions();
    for (const pos of openPos) {
      const currentPrice = prices[pos.symbol];
      if (!currentPrice) continue;
      const side = pos.side||'LONG';
      let brutoPnlPct, netPnlPct, netPnl;
      if (side==='SHORT') {
        brutoPnlPct = ((pos.entry_price-currentPrice)/pos.entry_price)*100;
      } else {
        brutoPnlPct = ((currentPrice-pos.entry_price)/pos.entry_price)*100;
      }
      netPnlPct = brutoPnlPct-(totalCost*100);
      netPnl    = side==='SHORT'
        ? (pos.entry_price-currentPrice)*pos.quantity-(pos.entry_price*pos.quantity*totalCost)
        : (currentPrice-pos.entry_price)*pos.quantity-(pos.entry_price*pos.quantity*totalCost);
      if (!this.trailingStops[pos.symbol]) {
        this.trailingStops[pos.symbol] = {
          highestPrice: pos.highest_price||pos.entry_price,
          lowestPrice:  pos.lowest_price||pos.entry_price,
          side
        };
      }
      const trailing = this.trailingStops[pos.symbol];
      let closeReason=null, newHighest=pos.highest_price||pos.entry_price;
      let newLowest=pos.lowest_price||pos.entry_price, stopPrice=pos.stop_loss||0;
      if (side==='LONG') {
        if (currentPrice>trailing.highestPrice) { trailing.highestPrice=currentPrice; newHighest=currentPrice; }
        const trailingStop = trailing.highestPrice*(1-trailingPct);
        const hardStop     = pos.entry_price*(1-hardStopPct);
        stopPrice          = Math.max(trailingStop, hardStop);
        if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
        else if (brutoPnlPct>=minProfitPct*100&&currentPrice<=trailingStop) closeReason='TRAILING_STOP';
      } else {
        if (currentPrice<trailing.lowestPrice) { trailing.lowestPrice=currentPrice; newLowest=currentPrice; }
        const trailingStop = trailing.lowestPrice*(1+trailingPct);
        const hardStop     = pos.entry_price*(1+hardStopPct);
        stopPrice          = Math.min(trailingStop, hardStop);
        if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
        else if (brutoPnlPct>=minProfitPct*100&&currentPrice>=trailingStop) closeReason='TRAILING_STOP';
      }
      if (closeReason) {
        this.closePosition(pos, currentPrice, closeReason);
      } else {
        db.prepare(`
          UPDATE sim_positions
          SET current_price=?,pnl=?,pnl_percent=?,stop_loss=?,highest_price=?,lowest_price=?
          WHERE id=?
        `).run(currentPrice, netPnl, netPnlPct, stopPrice, newHighest, newLowest, pos.id);
      }
    }
  }

  reset(startBalance=1000) {
    db.prepare("DELETE FROM sim_positions").run();
    db.prepare("DELETE FROM sim_wallet").run();
    db.prepare('INSERT INTO sim_wallet (balance) VALUES (?)').run(startBalance);
    this.trailingStops={};
    console.log(`[SIM] Sıfırlandı — ${startBalance} USDT`);
  }

  getStats() {
    const wallet  = this.getWallet();
    const openPos = this.getOpenPositions();
    const allPos  = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC").all();
    const closed  = allPos.filter(p=>p.status!=='OPEN');
    const wins    = closed.filter(p=>p.pnl>0);
    const losses  = closed.filter(p=>p.pnl<=0);
    const totalPnl= closed.reduce((s,p)=>s+(p.pnl||0),0);
    const winRate = closed.length>0?wins.length/closed.length*100:0;
    const gW      = wins.reduce((s,p)=>s+(p.pnl||0),0);
    const gL      = Math.abs(losses.reduce((s,p)=>s+(p.pnl||0),0));
    const avgWin  = wins.length>0?wins.reduce((s,p)=>s+(p.pnl_percent||0),0)/wins.length:0;
    const avgLoss = losses.length>0?losses.reduce((s,p)=>s+(p.pnl_percent||0),0)/losses.length:0;
    const startBal= parseFloat(db.prepare("SELECT value FROM settings WHERE key='sim_balance'").get()?.value||1000);
    return {
      balance:      parseFloat((wallet?.balance||startBal).toFixed(4)),
      startBalance: startBal,
      totalPnl:     parseFloat(totalPnl.toFixed(4)),
      totalPnlPct:  parseFloat((totalPnl/startBal*100).toFixed(2)),
      totalTrades:  closed.length,
      openTrades:   openPos.length,
      wins:         wins.length,
      losses:       losses.length,
      winRate:      parseFloat(winRate.toFixed(1)),
      profitFactor: gL>0?parseFloat((gW/gL).toFixed(2)):999,
      avgWin:       parseFloat(avgWin.toFixed(2)),
      avgLoss:      parseFloat(avgLoss.toFixed(2)),
      openPositions:openPos,
      recentTrades: allPos.slice(0,30)
    };
  }
}

module.exports = new SimulationEngine();
