const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');
const TelegramService = require('./telegram');
const db = require('./database');
const WebSocket = require('ws');

class TradingEngine {
  constructor() {
    this.running = false;
    this.positionInterval = null;
    this.symbolRefreshInterval = null;
    this.btcUpdateInterval = null;
    this.trailingStops = {};
    this.ws = null;
    // Mum bufferları
    this.candle4HBuffers = {};
    this.candle1HBuffers = {};
    this.candle1DBuffers = {};
    this.tickers = {};
    this.closedCandles4H = new Set();
    this.closedCandles1H = new Set();
    // 4H'te aday olan coinler
    this.adaylar = {};
    // BTC trend
    this.btcTrend = { trend4H:'BELIRSIZ', trend1H:'BELIRSIZ', trend1D:'BELIRSIZ', lastUpdate:0 };
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
    const s = this.getSettings();
    if (!s.telegram_token||!s.telegram_chat_id) return null;
    return new TelegramService(s.telegram_token, s.telegram_chat_id);
  }

  saveScanLog(coinCount, signalCount, durationMs, signalsFound=[]) {
    db.prepare(`INSERT INTO scan_logs (coin_count, signal_count, duration_ms, signals_found) VALUES (?, ?, ?, ?)`)
      .run(coinCount, signalCount, durationMs, JSON.stringify(signalsFound));
  }

  // ── BTC TREND GÜNCELLE ────────────────────────────────────
  async updateBTCTrend() {
    try {
      const b = new BinanceService('','');
      const [h4,h1,d1] = await Promise.all([
        b.getKlines('BTCUSDT','4h',200),
        b.getKlines('BTCUSDT','1h',200),
        b.getKlines('BTCUSDT','1d',100)
      ]);
      const t4H = TechnicalAnalysis.analyze4H(h4);
      const t1H = TechnicalAnalysis.analyze1H(h1);
      const t1D = TechnicalAnalysis.analyze1D(d1);
      this.btcTrend = { trend4H:t4H.trend, trend1H:t1H.trend, trend1D:t1D.trend, guclu4H:t4H.guclu, guclu1D:t1D.guclu, lastUpdate:Date.now() };
      this.candle4HBuffers['BTCUSDT'] = h4;
      this.candle1HBuffers['BTCUSDT'] = h1;
      this.candle1DBuffers['BTCUSDT'] = d1;
      console.log(`📊 BTC → 1D:${t1D.trend} | 4H:${t4H.trend} | 1H:${t1H.trend}`);
    } catch(e) { console.error('BTC trend hatası:',e.message); }
  }

  checkBTCDrop() {
    const c = this.candle4HBuffers['BTCUSDT'];
    if (!c||c.length<4) return false;
    const now = parseFloat(c[c.length-1][4]);
    const ago = parseFloat(c[c.length-4][4]);
    const drop = ((now-ago)/ago)*100;
    if (drop < -1.5) { console.log(`⚠️ BTC ani düşüş: ${drop.toFixed(2)}%`); return true; }
    return false;
  }

  // ── 4H MUM KAPANIŞINDA SETUP TARA ────────────────────────
  async scan4HClose(candleCloseTime) {
    if (this.closedCandles4H.has(candleCloseTime)) return;
    this.closedCandles4H.add(candleCloseTime);
    if (this.closedCandles4H.size>5) {
      const first=this.closedCandles4H.values().next().value;
      this.closedCandles4H.delete(first);
    }

    const settings = this.getSettings();
    const zaman    = new Date().toLocaleTimeString('tr-TR');
    console.log(`\n[${zaman}] ═══ 4H KAPANIŞ — SETUP TARAMASI ═══`);
    console.log(`BTC: 1D:${this.btcTrend.trend1D} | 4H:${this.btcTrend.trend4H} | 1H:${this.btcTrend.trend1H}`);

    const btcDusus    = this.btcTrend.trend4H==='ASAGI'&&this.btcTrend.trend1D==='ASAGI';
    const btcYukselis = this.btcTrend.trend4H==='YUKARI'&&this.btcTrend.guclu1D;
    const btcAniDusus = this.checkBTCDrop();

    let adayCount = 0;
    const symbols = Object.keys(this.candle4HBuffers).filter(s=>s!=='BTCUSDT');

    for (const symbol of symbols) {
      try {
        const candles4H = this.candle4HBuffers[symbol];
        const candles1D = this.candle1DBuffers[symbol]||[];
        const ticker    = this.tickers[symbol];
        if (!candles4H||candles4H.length<52||!ticker) continue;

        const setup = TechnicalAnalysis.analyze4HSetup(candles4H, candles1D, ticker, settings);
        if (!setup||setup.setup==='BEKLE') continue;

        // LONG adayı — BTC düşüşte değilse
        if (setup.setup==='LONG_ADAY') {
          if (btcDusus||btcAniDusus) continue;
          if (this.btcTrend.trend1D==='ASAGI') continue;
          if (['ASAGI','HAFIF_ASAGI'].includes(setup.trend4H)) continue;

          this.adaylar[symbol] = { setup, time:Date.now(), type:'LONG' };
          adayCount++;
          console.log(`🎯 LONG ADAY: ${symbol} | RSI:${setup.rsi} | Div:${setup.divergenceBull} | 4H:${setup.trend4H}`);
        }

        // SHORT adayı — BTC yükselişte güçlü değilse
        else if (setup.setup==='SHORT_ADAY') {
          if (btcYukselis) continue;
          if (['YUKARI','HAFIF_YUKARI'].includes(setup.trend4H)) continue;

          this.adaylar[symbol] = { setup, time:Date.now(), type:'SHORT' };
          adayCount++;
          console.log(`🎯 SHORT ADAY: ${symbol} | RSI:${setup.rsi} | Div:${setup.divergenceBear} | 4H:${setup.trend4H}`);
        }

      } catch(e) { console.error(`${symbol} 4H setup hatası:`,e.message); }
    }

    console.log(`[${zaman}] 4H tarama bitti — ${adayCount} aday`);
    this.saveScanLog(symbols.length, adayCount, 0, Object.keys(this.adaylar));
  }

  // ── 1H MUM KAPANIŞINDA GİRİŞ ZAMANLAMASI ─────────────────
  async scan1HClose(candleCloseTime) {
    if (this.closedCandles1H.has(candleCloseTime)) return;
    this.closedCandles1H.add(candleCloseTime);
    if (this.closedCandles1H.size>10) {
      const first=this.closedCandles1H.values().next().value;
      this.closedCandles1H.delete(first);
    }

    // Aday yoksa tarama
    if (Object.keys(this.adaylar).length===0) return;

    const settings  = this.getSettings();
    const zaman     = new Date().toLocaleTimeString('tr-TR');
    const maxPos    = parseInt(settings.max_open_positions||5);
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    if (openCount.count>=maxPos) return;

    console.log(`[${zaman}] 1H kapanış — ${Object.keys(this.adaylar).length} aday kontrol ediliyor`);

    // Eski adayları temizle (8 saatten eski)
    const now8h = Date.now()-8*60*60*1000;
    for (const sym of Object.keys(this.adaylar)) {
      if (this.adaylar[sym].time < now8h) {
        console.log(`⏰ ${sym} adayı süresi doldu`);
        delete this.adaylar[sym];
      }
    }

    const btcDusus    = this.btcTrend.trend4H==='ASAGI'&&this.btcTrend.trend1D==='ASAGI';
    const btcYukselis = this.btcTrend.trend4H==='YUKARI'&&this.btcTrend.guclu1D;
    const btcAniDusus = this.checkBTCDrop();

    let signalCount = 0;

    for (const symbol of Object.keys(this.adaylar)) {
      try {
        const aday     = this.adaylar[symbol];
        const candles1H= this.candle1HBuffers[symbol];
        if (!candles1H||candles1H.length<52) continue;

        // Zaten açık pozisyon varsa atla
        const existing = db.prepare("SELECT id FROM positions WHERE symbol=? AND status='OPEN'").get(symbol);
        if (existing) continue;

        // 1H giriş zamanlaması
        const timing = TechnicalAnalysis.analyze1HTiming(candles1H, aday.setup, settings);
        if (!timing||timing.signal==='BEKLE') continue;

        // ── LONG GİRİŞ ───────────────────────────────────
        if (timing.signal==='ALIM' && aday.type==='LONG') {
          if (btcDusus||btcAniDusus) continue;

          signalCount++;
          console.log(`🚀 LONG SİNYAL: ${symbol} | Skor:${timing.score} | 1H:${timing.trend1H} | 4H:${aday.setup.trend4H}`);

          const signalId = this.saveSignal({ ...timing, ...aday.setup }, 'LONG');
          await this.sendTelegramSignal(timing, aday.setup, 'LONG', settings);
          this.broadcastSignal({ ...timing, signal:'ALIM' });

          if (settings.auto_trade_enabled==='true') {
            await this.openPosition(timing, aday.setup, signalId, 'LONG', settings);
          }

          delete this.adaylar[symbol];
        }

        // ── SHORT GİRİŞ ──────────────────────────────────
        else if (timing.signal==='SATIS' && aday.type==='SHORT') {
          if (btcYukselis) continue;

          signalCount++;
          console.log(`📉 SHORT SİNYAL: ${symbol} | Skor:${timing.score} | 1H:${timing.trend1H} | 4H:${aday.setup.trend4H}`);

          const signalId = this.saveSignal({ ...timing, ...aday.setup }, 'SHORT');
          await this.sendTelegramSignal(timing, aday.setup, 'SHORT', settings);
          this.broadcastSignal({ ...timing, signal:'SATIS' });

          if (settings.auto_trade_enabled==='true') {
            await this.openPosition(timing, aday.setup, signalId, 'SHORT', settings);
          }

          delete this.adaylar[symbol];
        }

        const newOpen = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
        if (newOpen.count>=maxPos) break;

      } catch(e) { console.error(`${symbol} 1H timing hatası:`,e.message); }
    }

    if (signalCount>0) console.log(`[${zaman}] ${signalCount} sinyal üretildi`);
  }

  saveSignal(data, side) {
    try {
      const result = db.prepare(`
        INSERT INTO signals (symbol, signal_type, score, risk, price, rsi, macd, trend, positive_signals, negative_signals, ai_comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.symbol, side==='SHORT'?'SATIS':'ALIM', data.score, data.risk||'ORTA',
        data.price, data.rsi1H||data.rsi||0, data.macdCrossover?1:-1,
        `${data.trend1H||'?'}|${data.trend4H||'?'}|${data.trend1D||'?'}`,
        JSON.stringify(data.positive||[]), JSON.stringify(data.negative||[]),
        `Setup:${data.setup4H} | BTC:${this.btcTrend.trend4H}/${this.btcTrend.trend1D}`
      );
      return result.lastInsertRowid;
    } catch(e) { console.error('Sinyal kayıt hatası:',e.message); return null; }
  }

  async sendTelegramSignal(timing, setup, side, settings) {
    try {
      const telegram = this.getTelegram();
      if (!telegram) return;
      const minScore = parseInt(settings.telegram_min_score||50);
      if (Math.abs(timing.score)<minScore) return;
      const emoji = side==='SHORT'?'📉':'🚀';
      const msg = `${emoji} <b>${side} SİNYAL — ${timing.symbol}</b>\n` +
        `💰 Fiyat: <code>${timing.price}</code>\n` +
        `📊 Skor: ${timing.score}\n` +
        `🔍 RSI: ${timing.rsi1H} | Hacim: ${timing.hacimOran}x\n` +
        `📈 1H:${timing.trend1H} | 4H:${setup.trend4H} | 1D:${setup.trend1D}\n` +
        `☁️ Ichimoku: ${setup.ichimokuAbove?'Bulut üstü':setup.ichimokuBelow?'Bulut altı':'Bulut içi'}\n` +
        `🔀 Diverjans: ${side==='LONG'?setup.divergenceBull:setup.divergenceBear?'✅':'❌'}\n` +
        `🛑 Stop: <code>${timing.stopLoss}</code>\n` +
        `🎯 Hedef: <code>${timing.target}</code>\n` +
        (timing.reasons||[]).map(r=>`• ${r}`).join('\n');
      await telegram.sendMessage(msg);
    } catch(e) { console.error('Telegram hatası:',e.message); }
  }

  broadcastSignal(data) {
    if (!global.wss) return;
    global.wss.clients.forEach(client => {
      if (client.readyState===1) client.send(JSON.stringify({ type:'NEW_SIGNAL', data }));
    });
  }

  async openPosition(timing, setup, signalId, side, settings) {
    if (settings.auto_trade_enabled!=='true') return null;
    if (!settings.binance_api_key||!settings.binance_api_secret) return null;
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    if (openCount.count>=parseInt(settings.max_open_positions||5)) return null;
    const existing = db.prepare("SELECT id FROM positions WHERE symbol=? AND status='OPEN'").get(timing.symbol);
    if (existing) return null;
    try {
      const binance     = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
      const baseAmount  = parseFloat(settings.trade_amount_usdt||100);
      const skor        = Math.abs(timing.score);
      let mult = skor>=90?2.0:skor>=80?1.5:skor>=70?1.25:1.0;
      if (side==='LONG'&&this.btcTrend.trend4H==='YUKARI') mult=Math.min(2.0,mult*1.1);
      if (side==='SHORT'&&this.btcTrend.trend4H==='ASAGI') mult=Math.min(2.0,mult*1.1);
      mult=Math.min(2.0,Math.max(0.5,mult));
      const tradeAmount = parseFloat((baseAmount*mult).toFixed(2));
      const orderSide   = side==='SHORT'?'SELL':'BUY';
      const quantity    = tradeAmount/timing.price;
      const order       = await binance.placeOrder(timing.symbol, orderSide, quantity);
      const fillPrice   = parseFloat(order.fills?.[0]?.price||timing.price);
      const fillQty     = parseFloat(order.executedQty);
      const stopLoss    = timing.stopLoss || (side==='LONG'
        ? parseFloat((fillPrice*(1-parseFloat(settings.stop_loss_percent||2)/100)).toFixed(8))
        : parseFloat((fillPrice*(1+parseFloat(settings.stop_loss_percent||2)/100)).toFixed(8)));

      const posResult = db.prepare(`
        INSERT INTO positions (symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, signal_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).run(timing.symbol, side, fillQty, fillPrice, fillPrice, stopLoss, signalId);

      db.prepare(`INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id) VALUES (?,?,?,?,?,?,?)`)
        .run(posResult.lastInsertRowid, timing.symbol, orderSide, fillQty, fillPrice, fillQty*fillPrice, order.orderId);

      this.trailingStops[timing.symbol] = { highestPrice:fillPrice, lowestPrice:fillPrice, entryPrice:fillPrice, quantity:fillQty, side };

      console.log(`✅ ${side} açıldı: ${timing.symbol} @ ${fillPrice} | ${tradeAmount} USDT`);

      const telegram = this.getTelegram();
      if (telegram) {
        const emoji = side==='SHORT'?'📉':'🚀';
        await telegram.sendMessage(`${emoji} <b>${side} AÇILDI — ${timing.symbol}</b>\n💰 ${fillPrice} | ${tradeAmount} USDT | Stop: ${stopLoss}`);
      }
      return posResult.lastInsertRowid;
    } catch(e) { console.error('Pozisyon hatası:',e.message); return null; }
  }

  async checkPositions() {
    const settings = this.getSettings();
    if (!settings.binance_api_key||!settings.binance_api_secret) return;
    const positions = db.prepare("SELECT * FROM positions WHERE status='OPEN'").all();
    if (!positions.length) return;
    const binance      = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
    const trailingPct  = parseFloat(settings.trailing_stop_percent||0.5)/100;
    const minProfitPct = parseFloat(settings.min_profit_percent||1.5)/100;
    const hardStopPct  = parseFloat(settings.stop_loss_percent||2.0)/100;
    const komisyonPct  = parseFloat(settings.commission_rate||0.1)/100;
    const slippagePct  = parseFloat(settings.slippage_rate||0.05)/100;
    const timeStopMin  = parseInt(settings.time_stop_minutes||0);

    for (const pos of positions) {
      try {
        const currentPrice = await binance.getPrice(pos.symbol);
        const totalCost    = (komisyonPct+slippagePct)*2;
        const side         = pos.side||'LONG';
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
          this.trailingStops[pos.symbol]={ highestPrice:pos.entry_price, lowestPrice:pos.entry_price, entryPrice:pos.entry_price, quantity:pos.quantity, side };
        }
        const trailing = this.trailingStops[pos.symbol];
        let closeReason=null;

        if (side==='LONG') {
          if (currentPrice>trailing.highestPrice) trailing.highestPrice=currentPrice;
          const trailingStop = trailing.highestPrice*(1-trailingPct);
          const hardStop     = pos.entry_price*(1-hardStopPct);
          const stopPrice    = Math.max(trailingStop,hardStop);
          db.prepare('UPDATE positions SET current_price=?,pnl=?,pnl_percent=?,stop_loss=? WHERE id=?')
            .run(currentPrice,netPnl,netPnlPct,stopPrice,pos.id);
          if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
          else if (brutoPnlPct>=minProfitPct*100&&currentPrice<=trailingStop) closeReason='TRAILING_STOP';
        } else {
          if (currentPrice<trailing.lowestPrice) trailing.lowestPrice=currentPrice;
          const trailingStop = trailing.lowestPrice*(1+trailingPct);
          const hardStop     = pos.entry_price*(1+hardStopPct);
          const stopPrice    = Math.min(trailingStop,hardStop);
          db.prepare('UPDATE positions SET current_price=?,pnl=?,pnl_percent=?,stop_loss=? WHERE id=?')
            .run(currentPrice,netPnl,netPnlPct,stopPrice,pos.id);
          if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
          else if (brutoPnlPct>=minProfitPct*100&&currentPrice>=trailingStop) closeReason='TRAILING_STOP';
        }

        if (timeStopMin>0&&Date.now()-new Date(pos.opened_at).getTime()>timeStopMin*60*1000) closeReason='TIME_STOP';

        if (closeReason) await this.closePosition(pos,binance,closeReason,currentPrice,komisyonPct,slippagePct,side);
      } catch(e) { console.error(`${pos.symbol} kontrol hatası:`,e.message); }
    }
  }

  async closePosition(pos, binance, reason, currentPrice, komisyonPct, slippagePct, side='LONG') {
    try {
      const orderSide = side==='SHORT'?'BUY':'SELL';
      const order     = await binance.placeOrder(pos.symbol, orderSide, pos.quantity);
      const sellPrice = parseFloat(order.fills?.[0]?.price||currentPrice);
      const totalCost = (komisyonPct+slippagePct)*2;
      let netPnl, netPnlPct;
      if (side==='SHORT') {
        netPnl    = (pos.entry_price-sellPrice)*pos.quantity-(pos.entry_price*pos.quantity*totalCost);
        netPnlPct = ((pos.entry_price-sellPrice)/pos.entry_price*100)-(totalCost*100);
      } else {
        netPnl    = (sellPrice-pos.entry_price)*pos.quantity-(pos.entry_price*pos.quantity*totalCost);
        netPnlPct = ((sellPrice-pos.entry_price)/pos.entry_price*100)-(totalCost*100);
      }
      db.prepare("UPDATE positions SET status=?,current_price=?,pnl=?,pnl_percent=?,closed_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(reason,sellPrice,netPnl,netPnlPct,pos.id);
      db.prepare("INSERT INTO trades (position_id,symbol,side,quantity,price,total,binance_order_id) VALUES (?,?,?,?,?,?,?)")
        .run(pos.id,pos.symbol,orderSide,pos.quantity,sellPrice,sellPrice*pos.quantity,order.orderId);
      delete this.trailingStops[pos.symbol];
      console.log(`${reason}[${side}]: ${pos.symbol} | %${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT`);
      const telegram = this.getTelegram();
      if (telegram) await telegram.sendPositionClosed(pos.symbol,`${reason}[${side}]`,netPnlPct,netPnl);
    } catch(e) { console.error(`${pos.symbol} kapatma hatası:`,e.message); }
  }

  async fetchSymbols() {
    const settings = this.getSettings();
    const binance  = new BinanceService('','');
    const tickers  = await binance.getAllTickers();
    const STABLES  = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT']);
    const filtered = tickers
      .filter(t => {
        if (!t.symbol.endsWith('USDT')) return false;
        if (STABLES.has(t.symbol)) return false;
        const vol=parseFloat(t.quoteVolume)||0, price=parseFloat(t.lastPrice)||0;
        return price>0 && vol>=parseFloat(settings.min_volume||1000000);
      })
      .sort((a,b) => parseFloat(b.quoteVolume)-parseFloat(a.quoteVolume))
      .slice(0,parseInt(settings.max_coins||30));
    filtered.forEach(t => { this.tickers[t.symbol]=t; });
    return filtered;
  }

  async loadAllCandles(symbols) {
    const binance = new BinanceService('','');
    console.log(`${symbols.length} coin için mumlar yükleniyor...`);
    for (const ticker of symbols) {
      try {
        const [h4,h1,d1] = await Promise.all([
          binance.getKlines(ticker.symbol,'4h',200),
          binance.getKlines(ticker.symbol,'1h',200),
          binance.getKlines(ticker.symbol,'1d',100)
        ]);
        if (h4&&h4.length>0) this.candle4HBuffers[ticker.symbol]=h4;
        if (h1&&h1.length>0) this.candle1HBuffers[ticker.symbol]=h1;
        if (d1&&d1.length>0) this.candle1DBuffers[ticker.symbol]=d1;
        await new Promise(r=>setTimeout(r,100));
      } catch(e) { console.error(`${ticker.symbol}:`,e.message); }
    }
    console.log(`✅ Mumlar hazır`);
  }

  startWebSocket(symbols, interval='1h') {
    if (this.ws) { try { this.ws.terminate(); } catch(e) {} this.ws=null; }
    // Hem 4H hem 1H WebSocket — 1H kullan, 4H'i hesapla
    const streams = symbols.map(s=>`${s.symbol.toLowerCase()}@kline_1h`).join('/');
    const wsUrl   = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    console.log(`🔌 WebSocket: ${symbols.length} coin (1H stream)`);
    this.ws = new WebSocket(wsUrl);
    this.ws.on('open', ()=>console.log('✅ WebSocket bağlandı'));
    this.ws.on('message', async(data)=>{
      try {
        const parsed = JSON.parse(data);
        if (!parsed.data?.k) return;
        const kline=parsed.data.k, symbol=kline.s, isClosed=kline.x;
        const newCandle=[kline.t,kline.o,kline.h,kline.l,kline.c,kline.v,kline.T,kline.q,kline.n,kline.V,kline.Q,'0'];

        // 1H buffer güncelle
        if (!this.candle1HBuffers[symbol]) this.candle1HBuffers[symbol]=[];
        if (isClosed) {
          this.candle1HBuffers[symbol].push(newCandle);
          if (this.candle1HBuffers[symbol].length>200) this.candle1HBuffers[symbol].shift();

          // 4H buffer güncelle — her 4 1H mumda bir 4H kapanır
          const h1Len = this.candle1HBuffers[symbol].length;
          if (h1Len>=4) {
            const last4 = this.candle1HBuffers[symbol].slice(-4);
            const h4Candle = [
              last4[0][0],
              last4[0][1],
              Math.max(...last4.map(c=>parseFloat(c[2]))).toString(),
              Math.min(...last4.map(c=>parseFloat(c[3]))).toString(),
              last4[3][4],
              last4.reduce((s,c)=>s+parseFloat(c[5]),0).toString(),
              last4[3][6],'','','','',''
            ];
            if (!this.candle4HBuffers[symbol]) this.candle4HBuffers[symbol]=[];
            // 4H kapandı mı? UTC saate göre kontrol
            const closeHour = new Date(parseInt(kline.T)).getUTCHours();
            if (closeHour%4===3) { // 03, 07, 11, 15, 19, 23 UTC
              this.candle4HBuffers[symbol].push(h4Candle);
              if (this.candle4HBuffers[symbol].length>200) this.candle4HBuffers[symbol].shift();
              // 4H kapandı → setup tara
              await this.scan4HClose(kline.T);
            }
          }

          // Her 1H kapanışında giriş zamanlaması
          await this.scan1HClose(kline.T);

        } else {
          const buf = this.candle1HBuffers[symbol];
          if (buf.length>0) buf[buf.length-1]=newCandle;
        }
      } catch(e) {}
    });
    this.ws.on('error', (e)=>console.error('WebSocket hatası:',e.message));
    this.ws.on('close', ()=>{
      console.log('⚠️ WebSocket kapandı');
      if (this.running) {
        setTimeout(async()=>{
          const syms=await this.fetchSymbols();
          this.startWebSocket(syms);
        }, 5000);
      }
    });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`ENGINE v19 BAŞLATILIYOR`);
    console.log(`Strateji: 4H Setup + 1H Timing`);
    console.log(`${'═'.repeat(50)}\n`);
    try {
      await this.updateBTCTrend();
      const symbols = await this.fetchSymbols();
      console.log(`${symbols.length} coin seçildi`);
      await this.loadAllCandles(symbols);
      this.startWebSocket(symbols);
      // İlk 4H tarama
      await this.scan4HClose(Date.now());
      // Pozisyon kontrol — her 30 saniye
      this.positionInterval = setInterval(()=>this.checkPositions(), 30000);
      // BTC trend güncelle — her 4 saatte
      this.btcUpdateInterval = setInterval(()=>this.updateBTCTrend(), 4*60*60*1000);
      // Sembol listesi yenile — her saat
      this.symbolRefreshInterval = setInterval(async()=>{
        console.log('🔄 Sembol listesi yenileniyor...');
        const newSyms = await this.fetchSymbols();
        await this.loadAllCandles(newSyms);
        this.startWebSocket(newSyms);
      }, 60*60*1000);
      console.log('\n✅ Engine hazır!');
      console.log('4H kapanışında setup taranır');
      console.log('1H kapanışında giriş zamanlaması yapılır\n');
    } catch(e) {
      console.error('Engine başlatma hatası:',e.message);
      this.running=false;
    }
  }

  stop() {
    if (this.ws) { try { this.ws.terminate(); } catch(e) {} this.ws=null; }
    if (this.positionInterval) clearInterval(this.positionInterval);
    if (this.symbolRefreshInterval) clearInterval(this.symbolRefreshInterval);
    if (this.btcUpdateInterval) clearInterval(this.btcUpdateInterval);
    this.running=false;
    this.candle4HBuffers={}; this.candle1HBuffers={}; this.candle1DBuffers={};
    this.tickers={}; this.adaylar={};
    this.closedCandles4H=new Set(); this.closedCandles1H=new Set();
    console.log('Engine durduruldu.');
  }
}

module.exports = new TradingEngine();
