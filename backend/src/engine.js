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
    this.trailingStops = {};
    this.ws = null;
    this.candleBuffers = {};
    this.candle1HBuffers = {};
    this.candle4HBuffers = {};
    this.tickers = {};
    this.lastSignalTime = {};
    this.closedCandles = new Set();
    this.btcTrend = { trend1H:'BELIRSIZ', trend4H:'BELIRSIZ', lastUpdate:0 };
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

  saveScanLog(coinCount, signalCount, durationMs, signalsFound=[]) {
    db.prepare(`INSERT INTO scan_logs (coin_count, signal_count, duration_ms, signals_found) VALUES (?, ?, ?, ?)`)
      .run(coinCount, signalCount, durationMs, JSON.stringify(signalsFound));
  }

  saveSignal(analysis, side) {
    const result = db.prepare(`
      INSERT INTO signals (symbol, signal_type, score, risk, price, rsi, macd, trend, positive_signals, negative_signals, ai_comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysis.symbol,
      side === 'SHORT' ? 'SATIS' : 'ALIM',
      analysis.score,
      analysis.risk,
      analysis.price,
      analysis.rsi,
      analysis.macdBullish ? 1 : -1,
      `${analysis.trend1H||'?'}|${analysis.trend4H||'?'}`,
      JSON.stringify(analysis.positive),
      JSON.stringify(analysis.negative),
      `Long:${analysis.longSkor} Short:${analysis.shortSkor} | BTC:${this.btcTrend.trend4H}`
    );
    return result.lastInsertRowid;
  }

  calculatePositionSize(analysis, settings, side) {
    const baseAmount = parseFloat(settings.trade_amount_usdt || 100);
    const skor = side === 'SHORT' ? Math.abs(analysis.shortSkor||50) : (analysis.longSkor||50);
    const trend4H = analysis.trend4H || 'BELIRSIZ';
    const btc4H   = this.btcTrend.trend4H;

    let mult = 1.0;
    if      (skor >= 80) mult = 2.0;
    else if (skor >= 65) mult = 1.5;
    else if (skor >= 55) mult = 1.25;
    else                 mult = 1.0;

    if (side === 'LONG') {
      if (trend4H === 'YUKARI' && this.btcTrend.trend4H === 'YUKARI') mult = Math.min(2.0, mult*1.2);
      else if (trend4H === 'YUKARI') mult = Math.min(2.0, mult*1.1);
      if (btc4H === 'YUKARI') mult = Math.min(2.0, mult*1.05);
    } else {
      if (['ASAGI','HAFIF_ASAGI'].includes(trend4H)) mult = Math.min(2.0, mult*1.1);
      if (btc4H === 'ASAGI') mult = Math.min(2.0, mult*1.1);
    }

    mult = Math.min(2.0, Math.max(0.5, mult));
    const finalAmount = parseFloat((baseAmount * mult).toFixed(2));
    console.log(`💰 ${side} pozisyon: ${finalAmount} USDT (${mult.toFixed(2)}x) | Skor:${skor} | 4H:${trend4H}`);
    return finalAmount;
  }

  checkDailyLimits(settings) {
    const bugun = new Date().toISOString().split('T')[0];
    const gunlukZarar = db.prepare(`SELECT COALESCE(SUM(pnl),0) as toplam FROM positions WHERE date(closed_at)=? AND pnl<0`).get(bugun);
    const gunlukIslem = db.prepare(`SELECT COUNT(*) as count FROM positions WHERE date(opened_at)=?`).get(bugun);
    const maxZarar = parseFloat(settings.max_daily_loss_percent || 5);
    const maxIslem = parseInt(settings.max_daily_trades || 20);
    const bakiye   = parseFloat(settings.trade_amount_usdt || 100) * parseInt(settings.max_open_positions || 5);
    const zararPct = Math.abs(gunlukZarar.toplam) / bakiye * 100;
    if (zararPct >= maxZarar) { console.log(`⛔ Günlük zarar limiti: %${zararPct.toFixed(2)}`); return false; }
    if (gunlukIslem.count >= maxIslem) { console.log(`⛔ Günlük işlem limiti: ${gunlukIslem.count}`); return false; }
    return true;
  }

  async fetchSymbols() {
    const settings = this.getSettings();
    const binance  = new BinanceService('', '');
    const tickers  = await binance.getAllTickers();
    const STABLES  = new Set(['BUSDUSDT','USDCUSDT','TUSDUSDT','USDTUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','EURUSDT','AEURUSDT']);
    const filtered = tickers
      .filter(t => {
        if (!t.symbol.endsWith('USDT')) return false;
        if (STABLES.has(t.symbol)) return false;
        const vol=parseFloat(t.quoteVolume)||0, price=parseFloat(t.lastPrice)||0;
        return price>0 && vol>=parseFloat(settings.min_volume||1000000);
      })
      .sort((a,b) => {
        const sA=parseFloat(a.quoteVolume)*Math.abs(parseFloat(a.priceChangePercent));
        const sB=parseFloat(b.quoteVolume)*Math.abs(parseFloat(b.priceChangePercent));
        return sB-sA;
      })
      .slice(0, parseInt(settings.max_coins||50));
    filtered.forEach(t => { this.tickers[t.symbol]=t; });
    return filtered;
  }

  async loadHistoricalCandles(symbols, interval, limit) {
    const binance = new BinanceService('','');
    console.log(`${symbols.length} coin için ${interval} mumlar yükleniyor...`);
    for (const ticker of symbols) {
      try {
        const candles = await binance.getKlines(ticker.symbol, interval, limit);
        if (candles&&candles.length>0) this.candleBuffers[ticker.symbol]=candles;
        await new Promise(r=>setTimeout(r,60));
      } catch(err) { console.error(`${ticker.symbol} veri hatası:`,err.message); }
    }
    console.log(`✅ ${interval} mumlar hazır`);
  }

  async load1HCandles(symbols) {
    const binance = new BinanceService('','');
    for (const ticker of symbols) {
      try {
        const candles = await binance.getKlines(ticker.symbol,'1h',200);
        if (candles&&candles.length>0) this.candle1HBuffers[ticker.symbol]=candles;
        await new Promise(r=>setTimeout(r,60));
      } catch(err) { console.error(`${ticker.symbol} 1H hatası:`,err.message); }
    }
    console.log(`✅ 1H mumlar hazır`);
  }

  async load4HCandles(symbols) {
    const binance = new BinanceService('','');
    for (const ticker of symbols) {
      try {
        const candles = await binance.getKlines(ticker.symbol,'4h',200);
        if (candles&&candles.length>0) this.candle4HBuffers[ticker.symbol]=candles;
        await new Promise(r=>setTimeout(r,60));
      } catch(err) { console.error(`${ticker.symbol} 4H hatası:`,err.message); }
    }
    console.log(`✅ 4H mumlar hazır`);
  }

  async updateBTCTrend() {
    try {
      const binance = new BinanceService('','');
      const [btc1H,btc4H] = await Promise.all([
        binance.getKlines('BTCUSDT','1h',200),
        binance.getKlines('BTCUSDT','4h',200)
      ]);
      const t1H = TechnicalAnalysis.analyze1H(btc1H);
      const t4H = TechnicalAnalysis.analyze4H(btc4H);
      this.btcTrend = { trend1H:t1H.trend, trend4H:t4H.trend, adx1H:t1H.adx, adx4H:t4H.adx, lastUpdate:Date.now() };
      console.log(`📊 BTC → 1H:${t1H.trend}(ADX:${t1H.adx}) | 4H:${t4H.trend}(ADX:${t4H.adx})`);
    } catch(err) { console.error('BTC trend hatası:',err.message); }
  }

  checkBTCDrop() {
    const btcCandles = this.candleBuffers['BTCUSDT'];
    if (!btcCandles||btcCandles.length<4) return false;
    const btcNow  = parseFloat(btcCandles[btcCandles.length-1][4]);
    const btc3ago = parseFloat(btcCandles[btcCandles.length-4][4]);
    const drop    = ((btcNow-btc3ago)/btc3ago)*100;
    if (drop < -1.0) { console.log(`⚠️ BTC ${drop.toFixed(2)}% düştü`); return true; }
    return false;
  }

  checkZararliPozisyon() {
    const pozisyonlar = db.prepare("SELECT * FROM positions WHERE status='OPEN'").all();
    if (!pozisyonlar.length) return false;
    const zararli = pozisyonlar.filter(p=>(p.pnl_percent||0)<-0.5);
    if (zararli.length>0) {
      console.log(`⚠️ ${zararli.length} zararlı pozisyon: ${zararli.map(p=>`${p.symbol}(%${p.pnl_percent?.toFixed(1)})`).join(', ')}`);
      return true;
    }
    return false;
  }

  async scanAllCoins(candleCloseTime) {
    if (this.closedCandles.has(candleCloseTime)) return;
    this.closedCandles.add(candleCloseTime);
    if (this.closedCandles.size>10) {
      const first=this.closedCandles.values().next().value;
      this.closedCandles.delete(first);
    }

    const baslangic = Date.now();
    const settings  = this.getSettings();
    const zaman     = new Date().toLocaleTimeString('tr-TR');
    const telegramMinScore = parseInt(settings.telegram_min_score||50);
    const btc4H = this.btcTrend.trend4H;
    const btc1H = this.btcTrend.trend1H;

    // 1 — BTC ani düşüş → sadece long dur, short devam
    const btcAniDusus = this.checkBTCDrop();
    if (btcAniDusus && btc4H==='ASAGI'&&btc1H==='ASAGI') {
      console.log(`[${zaman}] ⛔ BTC ani düşüş + trend aşağı — tüm alımlar durdu`);
      this.saveScanLog(0,0,0,[]);
      return;
    }

    // 2 — Zararlı pozisyon varsa yeni alım yapma
    if (this.checkZararliPozisyon()) {
      console.log(`[${zaman}] ⛔ Zararlı pozisyon — yeni alım durdu`);
      this.saveScanLog(0,0,0,[]);
      return;
    }

    // 3 — Max pozisyon
    const maxPositions = parseInt(settings.max_open_positions||5);
    const openCount    = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    if (openCount.count>=maxPositions) {
      console.log(`[${zaman}] Max pozisyon doldu (${openCount.count}/${maxPositions})`);
      this.saveScanLog(0,0,Date.now()-baslangic,[]);
      return;
    }

    const btcDusus    = btc4H==='ASAGI'&&btc1H==='ASAGI';
    const btcYukselis = btc4H==='YUKARI';

    console.log(`[${zaman}] Tarama — BTC:${btc4H}/${btc1H} | Açık:${openCount.count}/${maxPositions}`);
    db.prepare("DELETE FROM signals").run();

    let signalCount=0;
    const signalsFound=[];
    const symbols=Object.keys(this.candleBuffers);

    for (const symbol of symbols) {
      try {
        const candles   = this.candleBuffers[symbol];
        const candles1H = this.candle1HBuffers[symbol];
        const candles4H = this.candle4HBuffers[symbol];
        const ticker    = this.tickers[symbol];
        if (!candles||candles.length<52||!ticker) continue;

        const analysis = TechnicalAnalysis.analyze(candles, ticker, settings);
        if (!analysis) continue;
        if (analysis.signal==='BEKLE') continue;

        // 4H trend hesapla
        const trend4H = TechnicalAnalysis.analyze4H(candles4H);
        const trend1H = TechnicalAnalysis.analyze1H(candles1H);
        analysis.trend4H = trend4H.trend;
        analysis.trend1H = trend1H.trend;

        // ── LONG FİLTRELERİ ──────────────────────────────
        if (analysis.signal==='ALIM') {
          // BTC korumaları
          if (btcDusus||btcAniDusus) continue;

          // 4H konfirmasyon — LONG için yükseliş şart
          if (['ASAGI','HAFIF_ASAGI','BELIRSIZ'].includes(trend4H.trend)) {
            console.log(`⛔ ${symbol} LONG — 4H ${trend4H.trend}`);
            continue;
          }
          if (trend4H.trend==='YATAY'&&(analysis.longSkor||0)<55) {
            console.log(`⛔ ${symbol} LONG — 4H YATAY, skor yetersiz`);
            continue;
          }

          // 1H konfirmasyon
          if (['ASAGI','BELIRSIZ'].includes(trend1H.trend)) {
            console.log(`⛔ ${symbol} LONG — 1H ${trend1H.trend}`);
            continue;
          }

          const minScore = parseFloat(settings.min_score||40);
          if ((analysis.longSkor||0)<minScore) continue;

          const now=Date.now(), lastTime=this.lastSignalTime[symbol]||0;
          if (now-lastTime<5*60*1000) continue;
          this.lastSignalTime[symbol]=now;

          signalCount++;
          signalsFound.push(`${symbol}L(${analysis.longSkor})`);
          console.log(`🚀 LONG: ${symbol} | Long:${analysis.longSkor} | 4H:${trend4H.trend} | 1H:${trend1H.trend} | BTC:${btc4H}`);

          const signalId = this.saveSignal(analysis, 'LONG');

          const telegram = this.getTelegram();
          if (telegram && (analysis.longSkor||0)>=telegramMinScore) {
            await telegram.sendSignal({ ...analysis, signal:'ALIM', score:analysis.longSkor });
          }

          if (global.wss) {
            global.wss.clients.forEach(client => {
              if (client.readyState===1) client.send(JSON.stringify({ type:'NEW_SIGNAL', data:{ ...analysis, signal:'ALIM' } }));
            });
          }

          if (settings.auto_trade_enabled==='true') {
            await this.openPosition(analysis, signalId, 'LONG');
          }
        }

        // ── SHORT FİLTRELERİ ──────────────────────────────
        else if (analysis.signal==='SATIS') {
          // 4H konfirmasyon — SHORT için düşüş şart
          if (['YUKARI','HAFIF_YUKARI','BELIRSIZ'].includes(trend4H.trend)) {
            console.log(`⛔ ${symbol} SHORT — 4H ${trend4H.trend}`);
            continue;
          }
          if (trend4H.trend==='YATAY'&&Math.abs(analysis.shortSkor||0)<55) {
            console.log(`⛔ ${symbol} SHORT — 4H YATAY, skor yetersiz`);
            continue;
          }

          // 1H konfirmasyon
          if (['YUKARI'].includes(trend1H.trend)) {
            console.log(`⛔ ${symbol} SHORT — 1H YUKARI`);
            continue;
          }

          // BTC yükselişte yatay 4H'de short yapma
          if (btcYukselis&&trend4H.trend==='YATAY') continue;

          const minScore = parseFloat(settings.min_score||40);
          if (Math.abs(analysis.shortSkor||0)<minScore) continue;

          const now=Date.now(), lastTime=this.lastSignalTime[symbol]||0;
          if (now-lastTime<5*60*1000) continue;
          this.lastSignalTime[symbol]=now;

          signalCount++;
          signalsFound.push(`${symbol}S(${analysis.shortSkor})`);
          console.log(`📉 SHORT: ${symbol} | Short:${analysis.shortSkor} | 4H:${trend4H.trend} | 1H:${trend1H.trend} | BTC:${btc4H}`);

          const signalId = this.saveSignal(analysis, 'SHORT');

          const telegram = this.getTelegram();
          if (telegram && Math.abs(analysis.shortSkor||0)>=telegramMinScore) {
            await telegram.sendSignal({ ...analysis, signal:'SATIS', score:analysis.shortSkor });
          }

          if (global.wss) {
            global.wss.clients.forEach(client => {
              if (client.readyState===1) client.send(JSON.stringify({ type:'NEW_SIGNAL', data:{ ...analysis, signal:'SATIS' } }));
            });
          }

          if (settings.auto_trade_enabled==='true') {
            await this.openPosition(analysis, signalId, 'SHORT');
          }
        }

        // Max pozisyon kontrolü
        const newOpen = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
        if (newOpen.count>=maxPositions) break;

      } catch(err) { console.error(`${symbol} analiz hatası:`,err.message); }
    }

    const sure = Date.now()-baslangic;
    this.saveScanLog(symbols.length, signalCount, sure, signalsFound);
    const mesaj = signalCount>0 ? `✅ ${signalCount}: ${signalsFound.join(',')}` : `❌ Sinyal yok`;
    console.log(`[${zaman}] Tarama bitti (${(sure/1000).toFixed(1)}s) — ${mesaj}`);
  }

  startWebSocket(symbols, interval) {
    if (this.ws) { try { this.ws.terminate(); } catch(e) {} this.ws=null; }
    const streams = symbols.map(s=>`${s.symbol.toLowerCase()}@kline_${interval}`).join('/');
    const wsUrl   = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    console.log(`🔌 WebSocket: ${symbols.length} coin, ${interval}`);
    this.ws = new WebSocket(wsUrl);
    this.ws.on('open', ()=>console.log('✅ WebSocket bağlandı'));
    this.ws.on('message', async(data)=>{
      try {
        const parsed = JSON.parse(data);
        if (!parsed.data?.k) return;
        const kline=parsed.data.k, symbol=kline.s, isClosed=kline.x;
        const newCandle=[kline.t,kline.o,kline.h,kline.l,kline.c,kline.v,kline.T,kline.q,kline.n,kline.V,kline.Q,'0'];
        if (!this.candleBuffers[symbol]) return;
        if (isClosed) {
          this.candleBuffers[symbol].push(newCandle);
          if (this.candleBuffers[symbol].length>100) this.candleBuffers[symbol].shift();
          await this.scanAllCoins(kline.T);
        } else {
          const buf=this.candleBuffers[symbol];
          buf[buf.length-1]=newCandle;
        }
      } catch(err) {}
    });
    this.ws.on('error', (err)=>console.error('WebSocket hatası:',err.message));
    this.ws.on('close', ()=>{
      console.log('⚠️ WebSocket kapandı');
      if (this.running) {
        setTimeout(async()=>{
          const syms=await this.fetchSymbols();
          this.startWebSocket(syms, this.getSetting('candle_interval')||'5m');
        }, 5000);
      }
    });
  }

  async openPosition(analysis, signalId, side='LONG') {
    const settings = this.getSettings();
    if (settings.auto_trade_enabled!=='true') return null;
    if (!settings.binance_api_key||!settings.binance_api_secret) return null;
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    if (openCount.count>=parseInt(settings.max_open_positions||5)) return null;
    const existing = db.prepare("SELECT id FROM positions WHERE symbol=? AND status='OPEN'").get(analysis.symbol);
    if (existing) return null;
    if (!this.checkDailyLimits(settings)) return null;
    try {
      const binance     = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
      const slippagePct = parseFloat(settings.slippage_rate||0.05)/100;
      const tradeAmount = this.calculatePositionSize(analysis, settings, side);
      const quantity    = tradeAmount/(analysis.price*(1+slippagePct));
      const orderSide   = side==='SHORT' ? 'SELL' : 'BUY';
      const order       = await binance.placeOrder(analysis.symbol, orderSide, quantity);
      const fillPrice   = parseFloat(order.fills?.[0]?.price||analysis.price);
      const fillQty     = parseFloat(order.executedQty);
      const stopLoss    = side==='LONG'
        ? parseFloat((fillPrice*(1-parseFloat(settings.stop_loss_percent||2.0)/100)).toFixed(8))
        : parseFloat((fillPrice*(1+parseFloat(settings.stop_loss_percent||2.0)/100)).toFixed(8));

      const posResult = db.prepare(`
        INSERT INTO positions (symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, signal_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).run(analysis.symbol, side, fillQty, fillPrice, fillPrice, stopLoss, signalId);

      db.prepare(`INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id) VALUES (?,?,?,?,?,?,?)`)
        .run(posResult.lastInsertRowid, analysis.symbol, orderSide, fillQty, fillPrice, fillQty*fillPrice, order.orderId);

      this.trailingStops[analysis.symbol] = { highestPrice:fillPrice, lowestPrice:fillPrice, entryPrice:fillPrice, quantity:fillQty, side };

      console.log(`✅ ${side} açıldı: ${analysis.symbol} @ ${fillPrice} | ${tradeAmount} USDT`);

      const telegram = this.getTelegram();
      if (telegram) {
        const emoji = side==='SHORT' ? '📉' : '🚀';
        await telegram.sendMessage(
          `${emoji} <b>${side} POZİSYON — ${analysis.symbol}</b>\n` +
          `💰 Fiyat: <code>${fillPrice}</code>\n` +
          `💵 Miktar: <b>${tradeAmount} USDT</b>\n` +
          `🛑 Stop: <code>${stopLoss}</code>\n` +
          `📊 Skor: ${side==='SHORT'?analysis.shortSkor:analysis.longSkor} | 4H:${analysis.trend4H} | 1H:${analysis.trend1H}`
        );
      }
      return posResult.lastInsertRowid;
    } catch(err) {
      console.error('Pozisyon açma hatası:',err.message);
      return null;
    }
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
        const side         = pos.side || 'LONG';

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
          this.trailingStops[pos.symbol] = { highestPrice:pos.entry_price, lowestPrice:pos.entry_price, entryPrice:pos.entry_price, quantity:pos.quantity, side };
        }

        const trailing = this.trailingStops[pos.symbol];

        let closeReason = null;

        if (side==='LONG') {
          if (currentPrice>trailing.highestPrice) trailing.highestPrice=currentPrice;
          const trailingStopPrice = trailing.highestPrice*(1-trailingPct);
          const hardStopPrice     = pos.entry_price*(1-hardStopPct);
          const stopPrice         = Math.max(trailingStopPrice, hardStopPrice);
          db.prepare('UPDATE positions SET current_price=?, pnl=?, pnl_percent=?, stop_loss=? WHERE id=?')
            .run(currentPrice, netPnl, netPnlPct, stopPrice, pos.id);
          if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
          else if (brutoPnlPct>=minProfitPct*100&&currentPrice<=trailingStopPrice) closeReason='TRAILING_STOP';
        } else {
          // SHORT
          if (currentPrice<trailing.lowestPrice) trailing.lowestPrice=currentPrice;
          const trailingStopPrice = trailing.lowestPrice*(1+trailingPct);
          const hardStopPrice     = pos.entry_price*(1+hardStopPct);
          const stopPrice         = Math.min(trailingStopPrice, hardStopPrice);
          db.prepare('UPDATE positions SET current_price=?, pnl=?, pnl_percent=?, stop_loss=? WHERE id=?')
            .run(currentPrice, netPnl, netPnlPct, stopPrice, pos.id);
          if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
          else if (brutoPnlPct>=minProfitPct*100&&currentPrice>=trailingStopPrice) closeReason='TRAILING_STOP';
        }

        if (timeStopMin>0&&Date.now()-new Date(pos.opened_at).getTime()>timeStopMin*60*1000) closeReason='TIME_STOP';

        if (closeReason) {
          await this.closePosition(pos, binance, closeReason, currentPrice, komisyonPct, slippagePct, side);
        }
      } catch(err) { console.error(`${pos.symbol} kontrol hatası:`,err.message); }
    }
  }

  async closePosition(pos, binance, reason, currentPrice, komisyonPct, slippagePct, side='LONG') {
    try {
      const orderSide = side==='SHORT' ? 'BUY' : 'SELL';
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
      db.prepare("UPDATE positions SET status=?, current_price=?, pnl=?, pnl_percent=?, closed_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(reason, sellPrice, netPnl, netPnlPct, pos.id);
      db.prepare("INSERT INTO trades (position_id, symbol, side, quantity, price, total, binance_order_id) VALUES (?,?,?,?,?,?,?)")
        .run(pos.id, pos.symbol, orderSide, pos.quantity, sellPrice, sellPrice*pos.quantity, order.orderId);
      delete this.trailingStops[pos.symbol];
      console.log(`${reason}[${side}]: ${pos.symbol} | Net:%${netPnlPct.toFixed(2)} | ${netPnl.toFixed(4)} USDT`);
      const telegram = this.getTelegram();
      if (telegram) await telegram.sendPositionClosed(pos.symbol, `${reason}[${side}]`, netPnlPct, netPnl);
    } catch(err) { console.error(`${pos.symbol} kapatma hatası:`,err.message); }
  }

  async runAnalysis() {}

  async start() {
    if (this.running) return;
    this.running = true;
    const settings = this.getSettings();
    const interval  = settings.candle_interval||'5m';
    const limit     = parseInt(settings.candle_limit||50);
    console.log(`Engine başlatılıyor... Interval: ${interval}`);
    try {
      const symbols = await this.fetchSymbols();
      console.log(`${symbols.length} coin seçildi`);
      await this.updateBTCTrend();
      await this.loadHistoricalCandles(symbols, interval, limit);
      await this.load1HCandles(symbols);
      await this.load4HCandles(symbols);
      this.startWebSocket(symbols, interval);
      this.positionInterval      = setInterval(()=>this.checkPositions(), 30000);
      this.symbolRefreshInterval = setInterval(async()=>{
        console.log('🔄 Yenileniyor...');
        await this.updateBTCTrend();
        const newSymbols = await this.fetchSymbols();
        await this.loadHistoricalCandles(newSymbols, interval, limit);
        await this.load1HCandles(newSymbols);
        await this.load4HCandles(newSymbols);
        this.startWebSocket(newSymbols, interval);
      }, 60*60*1000);
      setInterval(()=>this.updateBTCTrend(), 4*60*60*1000);
      console.log('✅ Engine hazır — Ağırlıklı Puan + 4H Konfirmasyon + Long/Short aktif');
    } catch(err) {
      console.error('Engine başlatma hatası:',err.message);
      this.running = false;
    }
  }

  stop() {
    if (this.ws) { try { this.ws.terminate(); } catch(e) {} this.ws=null; }
    if (this.positionInterval) clearInterval(this.positionInterval);
    if (this.symbolRefreshInterval) clearInterval(this.symbolRefreshInterval);
    this.running = false;
    this.candleBuffers={};
    this.candle1HBuffers={};
    this.candle4HBuffers={};
    this.tickers={};
    this.closedCandles=new Set();
    console.log('Engine durduruldu.');
  }
}

module.exports = new TradingEngine();
