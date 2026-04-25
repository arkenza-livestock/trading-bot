const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');
const TelegramService = require('./telegram');
const db = require('./database');

class TradingEngine {
  constructor() {
    this.running = false;
    this.interval = null;
    this.positionInterval = null;
    this.trailingStops = {};
  }

  getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  getTelegram() {
    const settings = this.getSettings();
    if (!settings.telegram_token || !settings.telegram_chat_id) return null;
    return new TelegramService(settings.telegram_token, settings.telegram_chat_id);
  }

  clearOldSignals() {
    db.prepare("DELETE FROM signals WHERE created_at < datetime('now', '-30 minutes')").run();
  }

  saveScanLog(coinCount, signalCount, durationMs, signalsFound = []) {
    db.prepare(`
      INSERT INTO scan_logs (coin_count, signal_count, duration_ms, signals_found)
      VALUES (?, ?, ?, ?)
    `).run(coinCount, signalCount, durationMs, JSON.stringify(signalsFound));
  }

  saveSignal(analysis) {
    const result = db.prepare(`
      INSERT INTO signals (symbol, signal_type, score, risk, price, rsi, macd, trend, positive_signals, negative_signals, ai_comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysis.symbol, analysis.signal, analysis.score, analysis.risk, analysis.price,
      analysis.rsi, analysis.momentum || 0, 'MOMENTUM',
      JSON.stringify(analysis.positive), JSON.stringify(analysis.negative),
      `Hacim:${analysis.hacimOran}x | Alım:%${analysis.alimOran?.toFixed(0)} | R/R:${analysis.riskOdul} | ATR:%${analysis.atrPct}`
    );
    return result.lastInsertRowid;
  }

  checkDailyLimits(settings) {
    const bugun = new Date().toISOString().split('T')[0];
    const gunlukZarar = db.prepare(`
      SELECT COALESCE(SUM(pnl), 0) as toplam FROM positions WHERE date(closed_at) = ? AND pnl < 0
    `).get(bugun);
    const gunlukIslem = db.prepare(`
      SELECT COUNT(*) as count FROM positions WHERE date(opened_at) = ?
    `).get(bugun);
    const maxZarar = parseFloat(settings.max_daily_loss_percent || 5);
    const maxIslem = parseInt(settings.max_daily_trades || 20);
    const bakiye   = parseFloat(settings.trade_amount_usdt || 100) * parseInt(settings.max_open_positions || 5);
    const zararPct = Math.abs(gunlukZarar.toplam) / bakiye * 100;
    if (zararPct >= maxZarar) { console.log(`⛔ Günlük zarar limiti: %${zararPct.toFixed(2)}`); return false; }
    if (gunlukIslem.count >= maxIslem) { console.log(`⛔ Günlük işlem limiti: ${gunlukIslem.count}`); return false; }
    return true;
  }

  async openPosition(analysis, signalId) {
    const settings = this.getSettings();
    if (settings.auto_trade_enabled !== 'true') return null;
    if (!settings.binance_api_key || !settings.binance_api_secret) return null;
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'OPEN'").get();
    if (openCount.count >= parseInt(settings.max_open_positions || 5)) return null;
    const existing = db.prepare("SELECT id FROM positions WHERE symbol = ? AND status = 'OPEN'").get(analysis.symbol);
    if (existing) return null;
    if (!this.checkDailyLimits(settings)) return null;
    try {
      const binance = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
      const slippagePct = parseFloat(settings.slippage_rate || 0.05) / 100;
      const quantity = parseFloat(settings.trade_amount_usdt || 100) / (analysis.price * (1 + slippagePct));
      const order = await binance.placeOrder(analysis.symbol, 'BUY', quantity);
      const fillPrice = parseFloat(order.fills?.[0]?.price || analysis.price);
      const fillQty   = parseFloat(order.executedQty);
      const stopLoss  = parseFloat((fillPrice * (1 - parseFloat(settings.stop_loss_percent || 0.75) / 100)).toFixed(8));
      const posResult = db.prepare(`
        INSERT INTO positions (symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, signal_id)
        VALUES (?, 'BUY', ?, ?, ?, ?, 0, ?)
      `).run(analysis.symbol, fillQty, fillPrice, fillPrice, stopLoss, signalId);
      db.prepare(`
        INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id)
        VALUES (?, ?, 'BUY', ?, ?, ?, ?)
      `).run(posResult.lastInsertRowid, analysis.symbol, fillQty, fillPrice, fillQty * fillPrice, order.orderId);
      this.trailingStops[analysis.symbol] = { highestPrice: fillPrice, entryPrice: fillPrice, quantity: fillQty };
      console.log(`✅ Pozisyon açıldı: ${analysis.symbol} @ ${fillPrice}`);

      // Telegram bildirimi
      const telegram = this.getTelegram();
      if (telegram) {
        await telegram.sendMessage(
          `✅ <b>POZİSYON AÇILDI — ${analysis.symbol}</b>\n` +
          `💰 Fiyat: <code>${fillPrice}</code>\n` +
          `🛑 Stop: <code>${stopLoss}</code>\n` +
          `📊 Skor: ${analysis.score}`
        );
      }

      return posResult.lastInsertRowid;
    } catch (err) {
      console.error('Pozisyon açma hatası:', err.message);
      return null;
    }
  }

  async checkPositions() {
    const settings = this.getSettings();
    if (!settings.binance_api_key || !settings.binance_api_secret) return;
    const positions = db.prepare("SELECT * FROM positions WHERE status = 'OPEN'").all();
    if (!positions.length) return;

    const binance      = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
    const trailingPct  = parseFloat(settings.trailing_stop_percent || 0.5) / 100;
    const minProfitPct = parseFloat(settings.min_profit_percent || 0.5) / 100;
    const hardStopPct  = parseFloat(settings.stop_loss_percent || 0.75) / 100;
    const komisyonPct  = parseFloat(settings.commission_rate || 0.1) / 100;
    const slippagePct  = parseFloat(settings.slippage_rate || 0.05) / 100;
    const timeStopMin  = parseInt(settings.time_stop_minutes || 0);

    for (const pos of positions) {
      try {
        const currentPrice = await binance.getPrice(pos.symbol);
        const brutoPnlPct  = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
        const totalCost    = (komisyonPct + slippagePct) * 2;
        const netPnlPct    = brutoPnlPct - (totalCost * 100);
        const netPnl       = (currentPrice - pos.entry_price) * pos.quantity - (pos.entry_price * pos.quantity * totalCost);

        if (!this.trailingStops[pos.symbol]) {
          this.trailingStops[pos.symbol] = { highestPrice: pos.entry_price, entryPrice: pos.entry_price, quantity: pos.quantity };
        }
        const trailing = this.trailingStops[pos.symbol];
        if (currentPrice > trailing.highestPrice) trailing.highestPrice = currentPrice;

        const trailingStopPrice = parseFloat((trailing.highestPrice * (1 - trailingPct)).toFixed(8));
        const hardStopPrice     = parseFloat((pos.entry_price * (1 - hardStopPct)).toFixed(8));

        db.prepare('UPDATE positions SET current_price=?, pnl=?, pnl_percent=?, stop_loss=? WHERE id=?')
          .run(currentPrice, netPnl, netPnlPct, Math.max(trailingStopPrice, hardStopPrice), pos.id);

        if (timeStopMin > 0 && Date.now() - new Date(pos.opened_at).getTime() > timeStopMin * 60 * 1000) {
          await this.closePosition(pos, binance, 'TIME_STOP', currentPrice, komisyonPct, slippagePct);
          continue;
        }
        if (netPnlPct <= -(hardStopPct * 100)) {
          await this.closePosition(pos, binance, 'STOP_LOSS', currentPrice, komisyonPct, slippagePct);
          continue;
        }
        if (brutoPnlPct >= minProfitPct * 100 && currentPrice <= trailingStopPrice) {
          await this.closePosition(pos, binance, 'TRAILING_STOP', currentPrice, komisyonPct, slippagePct);
          continue;
        }
      } catch (err) {
        console.error(`${pos.symbol} kontrol hatası:`, err.message);
      }
    }
  }

  async closePosition(pos, binance, reason, currentPrice, komisyonPct, slippagePct) {
    try {
      const order     = await binance.placeOrder(pos.symbol, 'SELL', pos.quantity);
      const sellPrice = parseFloat(order.fills?.[0]?.price || currentPrice);
      const totalCost = (komisyonPct + slippagePct) * 2;
      const netPnl    = (sellPrice - pos.entry_price) * pos.quantity - (pos.entry_price * pos.quantity * totalCost);
      const netPnlPct = ((sellPrice - pos.entry_price) / pos.entry_price * 100) - (totalCost * 100);

      db.prepare("UPDATE positions SET status=?, current_price=?, pnl=?, pnl_percent=?, closed_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(reason, sellPrice, netPnl, netPnlPct, pos.id);
      db.prepare("INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id) VALUES (?,?,'SELL',?,?,?,?)")
        .run(pos.id, pos.symbol, pos.quantity, sellPrice, sellPrice * pos.quantity, order.orderId);
      delete this.trailingStops[pos.symbol];

      console.log(`${reason}: ${pos.symbol} | Net:%${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT`);

      // Telegram bildirimi
      const telegram = this.getTelegram();
      if (telegram) {
        await telegram.sendPositionClosed(pos.symbol, reason, netPnlPct, netPnl);
      }

    } catch (err) {
      console.error(`${pos.symbol} kapatma hatası:`, err.message);
    }
  }

  async runAnalysis() {
    const baslangic = Date.now();
    console.log(`[${new Date().toLocaleTimeString('tr-TR')}] Analiz başlatılıyor...`);
    const settings = this.getSettings();

    try {
      const binance = new BinanceService('', '');
      const tickers = await binance.getAllTickers();
      const STABLES = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT']);

      const filtered = tickers
        .filter(t => {
          if (!t.symbol.endsWith('USDT')) return false;
          if (STABLES.has(t.symbol)) return false;
          const vol   = parseFloat(t.quoteVolume) || 0;
          const price = parseFloat(t.lastPrice) || 0;
          return price > 0 && vol >= parseFloat(settings.min_volume || 1000000);
        })
        .sort((a, b) => {
          const sA = parseFloat(a.quoteVolume) * Math.abs(parseFloat(a.priceChangePercent));
          const sB = parseFloat(b.quoteVolume) * Math.abs(parseFloat(b.priceChangePercent));
          return sB - sA;
        })
        .slice(0, parseInt(settings.max_coins || 50));

      console.log(`[${new Date().toLocaleTimeString('tr-TR')}] ${filtered.length} coin analiz ediliyor...`);
      this.clearOldSignals();

      const interval = settings.candle_interval || '5m';
      const limit    = parseInt(settings.candle_limit || 50);
      let signalCount = 0;
      const signalsFound = [];
      const telegram = this.getTelegram();

      for (const ticker of filtered) {
        try {
          const candles  = await binance.getKlines(ticker.symbol, interval, limit);
          if (!candles || candles.length < 20) continue;
          const analysis = TechnicalAnalysis.analyze(candles, ticker, settings);
          if (!analysis) continue;

          if (analysis.signal === 'ALIM') {
            signalCount++;
            signalsFound.push(`${analysis.symbol}(${analysis.score})`);
            const signalId = this.saveSignal(analysis);

            // Telegram sinyal bildirimi
            if (telegram) await telegram.sendSignal(analysis);

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
          await new Promise(r => setTimeout(r, 80));
        } catch (err) {
          console.error(`${ticker.symbol} hata:`, err.message);
        }
      }

      const sure = Date.now() - baslangic;
      this.saveScanLog(filtered.length, signalCount, sure, signalsFound);

      const mesaj = signalCount > 0
        ? `✅ ${signalCount} sinyal: ${signalsFound.join(', ')}`
        : `❌ Sinyal bulunamadı`;

      console.log(`[${new Date().toLocaleTimeString('tr-TR')}] Tarama bitti (${(sure/1000).toFixed(1)}s) — ${filtered.length} coin — ${mesaj}`);

      await this.checkPositions();

    } catch (err) {
      console.error('Analiz hatası:', err.message);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const intervalMin = parseInt(this.getSetting('check_interval') || 5);
    const intervalMs  = intervalMin * 60 * 1000;
    this.runAnalysis();
    this.interval = setInterval(() => this.runAnalysis(), intervalMs);
    this.positionInterval = setInterval(() => this.checkPositions(), 30000);
    console.log(`Engine başlatıldı. Tarama: ${intervalMin} dakika | Pozisyon: 30 saniye`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.positionInterval) clearInterval(this.positionInterval);
    this.running = false;
    console.log('Engine durduruldu.');
  }
}

module.exports = new TradingEngine();
