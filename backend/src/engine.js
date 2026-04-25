const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');
const db = require('./database');
const WebSocket = require('ws');

class TradingEngine {
  constructor() {
    this.running = false;
    this.interval = null;
    this.positionInterval = null;
    this.trailingStops = {};
    this.ws = null;
    this.candleBuffers = {}; // Her coin için mum tamponu
    this.symbols = [];
  }

  getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  clearOldSignals() {
    db.prepare("DELETE FROM signals WHERE created_at < datetime('now', '-30 minutes')").run();
  }

  saveSignal(analysis) {
    const result = db.prepare(`
      INSERT INTO signals (symbol, signal_type, score, risk, price, rsi, macd, trend, positive_signals, negative_signals, ai_comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysis.symbol, analysis.signal, analysis.score, analysis.risk, analysis.price,
      analysis.rsi, analysis.momentum || 0, 'MOMENTUM',
      JSON.stringify(analysis.positive), JSON.stringify(analysis.negative),
      `Hacim: ${analysis.hacimOran}x | Alım: %${analysis.alimOran?.toFixed(0)} | R/R: ${analysis.riskOdul} | ATR: %${analysis.atrPct}`
    );
    return result.lastInsertRowid;
  }

  // Filtrelenmiş coin listesini çek
  async fetchSymbols() {
    const settings = this.getSettings();
    const binance = new BinanceService('', '');
    const tickers = await binance.getAllTickers();

    const STABLES = new Set([
      'BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT',
      'FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT'
    ]);

    const filtered = tickers
      .filter(t => {
        if (!t.symbol.endsWith('USDT')) return false;
        if (STABLES.has(t.symbol)) return false;
        const vol   = parseFloat(t.quoteVolume) || 0;
        const price = parseFloat(t.lastPrice) || 0;
        return price > 0 && vol >= parseFloat(settings.min_volume || 1000000);
      })
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, parseInt(settings.max_coins || 50));

    return filtered;
  }

  // Her coin için geçmiş mum verisini yükle
  async loadHistoricalCandles(symbols, interval, limit) {
    const binance = new BinanceService('', '');
    console.log(`${symbols.length} coin için geçmiş mum verisi yükleniyor...`);

    for (const ticker of symbols) {
      try {
        const candles = await binance.getKlines(ticker.symbol, interval, limit);
        if (candles && candles.length > 0) {
          this.candleBuffers[ticker.symbol] = {
            candles: candles,
            ticker: ticker
          };
        }
        await new Promise(r => setTimeout(r, 50));
      } catch (err) {
        console.error(`${ticker.symbol} geçmiş veri hatası:`, err.message);
      }
    }
    console.log(`Geçmiş veriler yüklendi. ${Object.keys(this.candleBuffers).length} coin hazır.`);
  }

  // WebSocket ile anlık mum takibi
  startWebSocket(symbols, interval) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Binance combined stream — tek bağlantıda tüm coinler
    const streams = symbols
      .map(s => `${s.symbol.toLowerCase()}@kline_${interval}`)
      .join('/');

    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    console.log(`WebSocket başlatılıyor: ${symbols.length} coin, ${interval} mum`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('✅ WebSocket bağlantısı kuruldu');
    });

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data);
        if (!parsed.data || !parsed.data.k) return;

        const kline = parsed.data.k;
        const symbol = kline.s;
        const isClosed = kline.x; // Mum kapandı mı?

        // Mevcut mumu güncelle
        const newCandle = [
          kline.t, kline.o, kline.h, kline.l, kline.c, kline.v,
          kline.T, kline.q, kline.n, kline.V, kline.Q, kline.B
        ];

        if (this.candleBuffers[symbol]) {
          const buf = this.candleBuffers[symbol];

          if (isClosed) {
            // Mum kapandı — buffer'a ekle
            buf.candles.push(newCandle);
            if (buf.candles.length > 100) buf.candles.shift();

            // Analiz yap
            this.analyzeSymbol(symbol, buf.candles, buf.ticker);
          } else {
            // Mum devam ediyor — son mumu güncelle
            buf.candles[buf.candles.length - 1] = newCandle;
          }
        }
      } catch (err) {
        // Sessizce geç
      }
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket hatası:', err.message);
    });

    this.ws.on('close', () => {
      console.log('WebSocket kapandı, 5 saniye sonra yeniden bağlanıyor...');
      if (this.running) {
        setTimeout(() => this.startWebSocket(symbols, interval), 5000);
      }
    });
  }

  // Tek coin analizi
  async analyzeSymbol(symbol, candles, ticker) {
    try {
      const settings = this.getSettings();

      // Ticker'ı güncelle
      const binance = new BinanceService('', '');
      const freshTicker = await binance.request('GET', '/api/v3/ticker/24hr', { symbol }, false, 1);

      const analysis = TechnicalAnalysis.analyze(candles, freshTicker || ticker, settings);
      if (!analysis) return;

      if (analysis.signal === 'ALIM') {
        // Aynı coin için son 5 dakikada sinyal verildi mi?
        const recentSignal = db.prepare(`
          SELECT id FROM signals 
          WHERE symbol = ? AND created_at > datetime('now', '-5 minutes')
        `).get(symbol);

        if (recentSignal) return; // Çok yakın zamanda sinyal verildi

        console.log(`🚨 ALIM Sinyali: ${symbol} | Skor: ${analysis.score} | RSI: ${analysis.rsi}`);

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
    } catch (err) {
      // Sessizce geç
    }
  }

  // Pozisyon aç
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
      const tradeAmount = parseFloat(settings.trade_amount_usdt || 100);
      const quantity = tradeAmount / (analysis.price * (1 + slippagePct));

      const order = await binance.placeOrder(analysis.symbol, 'BUY', quantity);
      const fillPrice = parseFloat(order.fills?.[0]?.price || analysis.price);
      const fillQty   = parseFloat(order.executedQty);

      const trailingPct = parseFloat(settings.trailing_stop_percent || 0.5);
      const stopLoss    = parseFloat((fillPrice * (1 - parseFloat(settings.stop_loss_percent || 0.75) / 100)).toFixed(8));

      const posResult = db.prepare(`
        INSERT INTO positions (symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, signal_id)
        VALUES (?, 'BUY', ?, ?, ?, ?, 0, ?)
      `).run(analysis.symbol, fillQty, fillPrice, fillPrice, stopLoss, signalId);

      db.prepare(`
        INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id)
        VALUES (?, ?, 'BUY', ?, ?, ?, ?)
      `).run(posResult.lastInsertRowid, analysis.symbol, fillQty, fillPrice, fillQty * fillPrice, order.orderId);

      this.trailingStops[analysis.symbol] = {
        highestPrice: fillPrice,
        entryPrice: fillPrice,
        quantity: fillQty
      };

      console.log(`✅ Pozisyon açıldı: ${analysis.symbol} @ ${fillPrice}`);
      return posResult.lastInsertRowid;

    } catch (err) {
      console.error('Pozisyon açma hatası:', err.message);
      return null;
    }
  }

  checkDailyLimits(settings) {
    const bugun = new Date().toISOString().split('T')[0];
    const gunlukZarar = db.prepare(`
      SELECT COALESCE(SUM(pnl), 0) as toplam 
      FROM positions WHERE date(closed_at) = ? AND pnl < 0
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

  async checkPositions() {
    const settings = this.getSettings();
    if (!settings.binance_api_key || !settings.binance_api_secret) return;

    const positions = db.prepare("SELECT * FROM positions WHERE status = 'OPEN'").all();
    if (!positions.length) return;

    const binance = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
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

        db.prepare('UPDATE positions SET current_price = ?, pnl = ?, pnl_percent = ?, stop_loss = ? WHERE id = ?')
          .run(currentPrice, netPnl, netPnlPct, Math.max(trailingStopPrice, hardStopPrice), pos.id);

        if (timeStopMin > 0) {
          const openedAt = new Date(pos.opened_at).getTime();
          if (Date.now() - openedAt > timeStopMin * 60 * 1000) {
            await this.closePosition(pos, binance, 'TIME_STOP', currentPrice, komisyonPct, slippagePct);
            continue;
          }
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
      const order = await binance.placeOrder(pos.symbol, 'SELL', pos.quantity);
      const sellPrice  = parseFloat(order.fills?.[0]?.price || currentPrice);
      const totalCost  = (komisyonPct + slippagePct) * 2;
      const netPnl     = (sellPrice - pos.entry_price) * pos.quantity - (pos.entry_price * pos.quantity * totalCost);
      const netPnlPct  = ((sellPrice - pos.entry_price) / pos.entry_price * 100) - (totalCost * 100);

      db.prepare("UPDATE positions SET status = ?, current_price = ?, pnl = ?, pnl_percent = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(reason, sellPrice, netPnl, netPnlPct, pos.id);

      db.prepare("INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id) VALUES (?, ?, 'SELL', ?, ?, ?, ?)")
        .run(pos.id, pos.symbol, pos.quantity, sellPrice, sellPrice * pos.quantity, order.orderId);

      delete this.trailingStops[pos.symbol];
      console.log(`${reason}: ${pos.symbol} | Net: %${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT`);
    } catch (err) {
      console.error(`${pos.symbol} kapatma hatası:`, err.message);
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;

    const settings = this.getSettings();
    const interval  = settings.candle_interval || '5m';
    const limit     = parseInt(settings.candle_limit || 50);

    console.log(`Engine başlatılıyor... Interval: ${interval}`);

    try {
      // Coin listesini çek
      const tickers = await this.fetchSymbols();
      this.symbols = tickers;
      console.log(`${tickers.length} coin seçildi`);

      // Geçmiş mum verilerini yükle
      await this.loadHistoricalCandles(tickers, interval, limit);

      // WebSocket başlat
      this.startWebSocket(tickers, interval);

      // Eski sinyalleri temizle
      this.clearOldSignals();

      // Pozisyon kontrolü her 30 saniyede bir
      this.positionInterval = setInterval(() => this.checkPositions(), 30000);

      // Her 1 saatte coin listesini yenile
      this.interval = setInterval(async () => {
        console.log('Coin listesi yenileniyor...');
        const newTickers = await this.fetchSymbols();
        this.symbols = newTickers;
        await this.loadHistoricalCandles(newTickers, interval, limit);
        this.startWebSocket(newTickers, interval);
      }, 60 * 60 * 1000);

      console.log('✅ Engine hazır — WebSocket ile anlık mum takibi aktif');

    } catch (err) {
      console.error('Engine başlatma hatası:', err.message);
      this.running = false;
    }
  }

  stop() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    if (this.interval) clearInterval(this.interval);
    if (this.positionInterval) clearInterval(this.positionInterval);
    this.running = false;
    this.candleBuffers = {};
    console.log('Engine durduruldu.');
  }
}

module.exports = new TradingEngine();
