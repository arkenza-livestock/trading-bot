const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');
const db = require('./database');

class TradingEngine {
  constructor() {
    this.running = false;
    this.interval = null;
  }

  getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  // Sadece son tarama sinyallerini tut
  clearOldSignals() {
    db.prepare("DELETE FROM signals WHERE created_at < datetime('now', '-1 hour')").run();
  }

  saveSignal(analysis) {
    const result = db.prepare(`
      INSERT INTO signals (symbol, signal_type, score, risk, price, rsi, macd, trend, positive_signals, negative_signals, ai_comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysis.symbol, analysis.signal, analysis.score, analysis.risk, analysis.price,
      analysis.rsi, analysis.momentum || 0, 'MOMENTUM',
      JSON.stringify(analysis.positive), JSON.stringify(analysis.negative), ''
    );
    return result.lastInsertRowid;
  }

  async openPosition(analysis, signalId) {
    const settings = this.getSettings();
    if (settings.auto_trade_enabled !== 'true') return null;
    if (!settings.binance_api_key || !settings.binance_api_secret) return null;
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'OPEN'").get();
    if (openCount.count >= parseInt(settings.max_open_positions || 5)) return null;
    const existing = db.prepare("SELECT id FROM positions WHERE symbol = ? AND status = 'OPEN'").get(analysis.symbol);
    if (existing) return null;
    try {
      const binance = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
      const quantity = parseFloat(settings.trade_amount_usdt || 100) / analysis.price;
      const order = await binance.placeOrder(analysis.symbol, 'BUY', quantity);
      const fillPrice = parseFloat(order.fills?.[0]?.price || analysis.price);
      const fillQty = parseFloat(order.executedQty);
      const stopLoss = parseFloat((fillPrice * (1 - parseFloat(settings.stop_loss_percent || 1) / 100)).toFixed(8));
      const takeProfit = parseFloat((fillPrice * (1 + parseFloat(settings.take_profit_percent || 1.5) / 100)).toFixed(8));
      const posResult = db.prepare(`
        INSERT INTO positions (symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, signal_id)
        VALUES (?, 'BUY', ?, ?, ?, ?, ?, ?)
      `).run(analysis.symbol, fillQty, fillPrice, fillPrice, stopLoss, takeProfit, signalId);
      db.prepare(`
        INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id)
        VALUES (?, ?, 'BUY', ?, ?, ?, ?)
      `).run(posResult.lastInsertRowid, analysis.symbol, fillQty, fillPrice, fillQty * fillPrice, order.orderId);
      return posResult.lastInsertRowid;
    } catch (err) {
      console.error('Pozisyon açma hatası:', err.message);
      return null;
    }
  }

  async checkPositions() {
    const settings = this.getSettings();
    if (settings.auto_trade_enabled !== 'true') return;
    if (!settings.binance_api_key || !settings.binance_api_secret) return;
    const positions = db.prepare("SELECT * FROM positions WHERE status = 'OPEN'").all();
    if (!positions.length) return;
    const binance = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
    for (const pos of positions) {
      try {
        const currentPrice = await binance.getPrice(pos.symbol);
        const pnl = (currentPrice - pos.entry_price) * pos.quantity;
        const pnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
        db.prepare('UPDATE positions SET current_price = ?, pnl = ?, pnl_percent = ? WHERE id = ?').run(currentPrice, pnl, pnlPct, pos.id);
        
        // Zaman stop kontrolü
        const settings2 = this.getSettings();
        const timeStop = parseInt(settings2.time_stop_minutes || 0);
        if (timeStop > 0) {
          const openedAt = new Date(pos.opened_at).getTime();
          const now = Date.now();
          if (now - openedAt > timeStop * 60 * 1000) {
            await this.closePosition(pos, binance, 'TIME_STOP');
            continue;
          }
        }

        if (currentPrice <= pos.stop_loss || currentPrice >= pos.take_profit) {
          const reason = currentPrice <= pos.stop_loss ? 'STOP_LOSS' : 'TAKE_PROFIT';
          await this.closePosition(pos, binance, reason);
        }
      } catch (err) {
        console.error(`${pos.symbol} hata:`, err.message);
      }
    }
  }

  async closePosition(pos, binance, reason) {
    try {
      const order = await binance.placeOrder(pos.symbol, 'SELL', pos.quantity);
      const sellPrice = parseFloat(order.fills?.[0]?.price || pos.current_price);
      const finalPnl = (sellPrice - pos.entry_price) * pos.quantity;
      const finalPct = ((sellPrice - pos.entry_price) / pos.entry_price) * 100;
      db.prepare("UPDATE positions SET status = ?, current_price = ?, pnl = ?, pnl_percent = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(reason, sellPrice, finalPnl, finalPct, pos.id);
      db.prepare("INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id) VALUES (?, ?, 'SELL', ?, ?, ?, ?)")
        .run(pos.id, pos.symbol, pos.quantity, sellPrice, pos.quantity * sellPrice, order.orderId);
      console.log(`${pos.symbol} kapatıldı: ${reason} | PnL: ${finalPct.toFixed(2)}%`);
    } catch (err) {
      console.error(`${pos.symbol} kapatma hatası:`, err.message);
    }
  }

  async runAnalysis() {
    console.log('Analiz başlatılıyor...');
    const settings = this.getSettings();
    try {
      const binance = new BinanceService('', '');
      const tickers = await binance.getAllTickers();
      const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT']);
      
      const filtered = tickers
        .filter(t => {
          if (!t.symbol.endsWith('USDT')) return false;
          if (STABLES.has(t.symbol)) return false;
          const vol = parseFloat(t.quoteVolume) || 0;
          const chg = parseFloat(t.priceChangePercent) || 0;
          const price = parseFloat(t.lastPrice) || 0;
          return price > 0 
            && vol >= parseFloat(settings.min_volume || 5000000) 
            && chg >= parseFloat(settings.min_change || -50) 
            && chg <= parseFloat(settings.max_change || 50);
        })
        .sort((a, b) => {
          const sA = parseFloat(a.quoteVolume) * Math.abs(parseFloat(a.priceChangePercent));
          const sB = parseFloat(b.quoteVolume) * Math.abs(parseFloat(b.priceChangePercent));
          return sB - sA;
        })
        .slice(0, parseInt(settings.max_coins || 100));

      console.log(`${filtered.length} coin analiz edilecek`);

      // Eski sinyalleri temizle
      this.clearOldSignals();

      let signalCount = 0;
      const interval = settings.candle_interval || '15m';
      const limit = parseInt(settings.candle_limit || 50);

      for (const ticker of filtered) {
        try {
          const candles = await binance.getKlines(ticker.symbol, interval, limit);
          const analysis = TechnicalAnalysis.analyze(candles, ticker, settings);
          if (!analysis) continue;

          if (analysis.signal === 'ALIM') {
            signalCount++;
            const signalId = this.saveSignal(analysis);
            if (settings.auto_trade_enabled === 'true') {
              await this.openPosition(analysis, signalId);
            }
            if (global.wss) {
              global.wss.clients.forEach(client => {
                if (client.readyState === 1) {
                  client.send(JSON.stringify({ type: 'NEW_SIGNAL', data: analysis }));
                }
              });
            }
          }

          await new Promise(r => setTimeout(r, 50));
        } catch (err) {
          console.error(`${ticker.symbol} hata:`, err.message);
        }
      }

      await this.checkPositions();
      console.log(`Analiz tamamlandı. ${signalCount} sinyal bulundu.`);

    } catch (err) {
      console.error('Analiz hatası:', err.message);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const intervalMin = parseInt(this.getSetting('check_interval') || 5);
    const intervalMs = intervalMin * 60 * 1000;
    this.runAnalysis();
    this.interval = setInterval(() => this.runAnalysis(), intervalMs);
    console.log(`Engine başlatıldı. Interval: ${intervalMin} dakika`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running = false;
    console.log('Engine durduruldu.');
  }
}

module.exports = new TradingEngine();
