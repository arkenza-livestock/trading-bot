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
    this.candle4HBuffers = {};
    this.candle1HBuffers = {};
    this.candle1DBuffers = {};
    this.tickers = {};
    this.closedCandles4H = new Set();
    this.closedCandles1H = new Set();
    this.adaylar = {};
    this.currentPrices = {};
    this.btcTrend = { trend4H:'BELIRSIZ', trend1H:'BELIRSIZ', trend1D:'BELIRSIZ', guclu1D:false, lastUpdate:0 };
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
    db.prepare(`INSERT INTO scan_logs (coin_count,signal_count,duration_ms,signals_found) VALUES (?,?,?,?)`)
      .run(coinCount, signalCount, durationMs, JSON.stringify(signalsFound));
  }

  // ── BTC TREND ────────────────────────────────────────────
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
      this.btcTrend = {
        trend4H:t4H.trend, trend1H:t1H.trend, trend1D:t1D.trend,
        guclu4H:t4H.guclu, guclu1D:t1D.guclu, lastUpdate:Date.now()
      };
      this.candle4HBuffers['BTCUSDT']=h4;
      this.candle1HBuffers['BTCUSDT']=h1;
      this.candle1DBuffers['BTCUSDT']=d1;
      console.log(`📊 BTC → 1D:${t1D.trend} | 4H:${t4H.trend} | 1H:${t1H.trend}`);
    } catch(e) { console.error('BTC trend hatası:',e.message); }
  }

  checkBTCDrop() {
    const c = this.candle4HBuffers['BTCUSDT'];
    if (!c||c.length<4) return false;
    const now = parseFloat(c[c.length-1][4]);
    const ago = parseFloat(c[c.length-4][4]);
    const drop = ((now-ago)/ago)*100;
    if (drop<-1.5) { console.log(`⚠️ BTC ani düşüş: ${drop.toFixed(2)}%`); return true; }
    return false;
  }

  // ── SİNYAL SONUCU OLUŞTUR ────────────────────────────────
  buildSignalResult(setup4H, trend1H, candles1H, side, settings) {
    const sinyal = side==='LONG' ? setup4H.longSinyal : setup4H.shortSinyal;
    const price  = setup4H.price;

    let score = 0;
    if      (sinyal==='GUCLU')  score = side==='LONG' ?  90 : -90;
    else if (sinyal==='NORMAL') score = side==='LONG' ?  75 : -75;
    else                        score = side==='LONG' ?  60 : -60;

    let pozisyonMult = 1.0;
    if      (sinyal==='GUCLU')  pozisyonMult = 2.0;
    else if (sinyal==='NORMAL') pozisyonMult = 1.5;
    else                        pozisyonMult = 0.75;

    const atr = setup4H.atr||price*0.02;
    const stopLoss = side==='LONG'
      ? Math.max(parseFloat((price-atr*1.5).toFixed(8)), parseFloat((price*0.98).toFixed(8)))
      : Math.min(parseFloat((price+atr*1.5).toFixed(8)), parseFloat((price*1.02).toFixed(8)));

    const komisyon  = parseFloat(settings.commission_rate||0.1);
    const slippage  = parseFloat(settings.slippage_rate||0.05);
    const minNetKar = (komisyon+slippage)*2+parseFloat(settings.min_profit_percent||1.5);
    const target    = parseFloat((price*(1+minNetKar/100)).toFixed(8));

    const reasons=[];
    if      (sinyal==='GUCLU')  reasons.push(`💪 6/6 Güçlü setup`);
    else if (sinyal==='NORMAL') reasons.push(`📊 5/6 Normal setup`);
    else                        reasons.push(`⚠️ 4/6 Zayıf setup`);
    if (setup4H.divergenceBull&&side==='LONG')  reasons.push('🔀 Pozitif diverjans');
    if (setup4H.divergenceBear&&side==='SHORT') reasons.push('🔀 Negatif diverjans');
    if (setup4H.ichimokuBelow&&side==='LONG')   reasons.push('☁️ Bulut altı');
    if (setup4H.ichimokuAbove&&side==='SHORT')  reasons.push('☁️ Bulut üstü');
    reasons.push(`RSI:${setup4H.rsi} | 4H:${setup4H.trend4H} | 1D:${setup4H.trend1D}`);

    const rsi1H = candles1H ? TechnicalAnalysis.calculateRSI(candles1H.map(c=>parseFloat(c[4])),14) : setup4H.rsi;

    return {
      symbol:   setup4H.symbol, price,
      signal:   side==='LONG'?'ALIM':'SATIS',
      score, risk: sinyal==='GUCLU'?'DUSUK':sinyal==='NORMAL'?'ORTA':'YUKSEK',
      rsi:      setup4H.rsi, rsi4H:setup4H.rsi, rsi1H,
      trend4H:  setup4H.trend4H, trend1D:setup4H.trend1D, trend1H:trend1H.trend,
      longSinyal:  setup4H.longSinyal,
      shortSinyal: setup4H.shortSinyal,
      pozisyonMult,
      macdBullish: setup4H.macdBullish, macdBearish:setup4H.macdBearish,
      macdCrossover:false, macdCrossunder:false,
      ichimokuAbove: setup4H.ichimokuAbove, ichimokuBelow:setup4H.ichimokuBelow,
      divergenceBull:setup4H.divergenceBull, divergenceBear:setup4H.divergenceBear,
      hacimOran: setup4H.hacimOran, alimOran:setup4H.alimOran,
      stopLoss, target, gerekce:reasons[0]||'',
      positive: side==='LONG'?reasons:[],
      negative: side==='SHORT'?reasons:[]
    };
  }

  // ── SİNYAL İŞLE ──────────────────────────────────────────
  async processSignal(result, side, settings) {
    try {
      const existing = db.prepare("SELECT id FROM positions WHERE symbol=? AND status='OPEN'").get(result.symbol);
      if (existing) return;

      const maxPos    = parseInt(settings.max_open_positions||5);
      const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
      if (openCount.count>=maxPos) return;

      const signalId = this.saveSignal(result, side);

      const emoji = side==='LONG'?'🚀':'📉';
      const sinyal = side==='LONG'?result.longSinyal:result.shortSinyal;
      console.log(`\n${emoji} ${side} SİNYAL: ${result.symbol} | Güç:${sinyal} | Skor:${result.score}`);
      console.log(`   4H:${result.trend4H} | 1H:${result.trend1H} | 1D:${result.trend1D}`);
      console.log(`   RSI:${result.rsi4H} | Hacim:${result.hacimOran}x | Stop:${result.stopLoss}`);

      // Simülasyon — her zaman çalışır
      const simulation = require('./simulation');
      simulation.openPosition(result, settings);

      // Gerçek trade
      if (settings.auto_trade_enabled==='true') {
        await this.openPosition(result, signalId, side, settings);
      }

      await this.sendTelegramSignal(result, side, settings);
      this.broadcastSignal(result, side);

    } catch(e) { console.error('processSignal hatası:',e.message); }
  }

  // ── 4H KAPANIŞINDA SETUP TARA ─────────────────────────────
  async scan4HClose(candleCloseTime) {
    if (this.closedCandles4H.has(candleCloseTime)) return;
    this.closedCandles4H.add(candleCloseTime);
    if (this.closedCandles4H.size>5) {
      const first=this.closedCandles4H.values().next().value;
      this.closedCandles4H.delete(first);
    }

    const baslangic = Date.now();
    const settings  = this.getSettings();
    const zaman     = new Date().toLocaleTimeString('tr-TR');
    console.log(`\n[${zaman}] ═══ 4H KAPANIŞ TARAMASI ═══`);
    console.log(`BTC: 1D:${this.btcTrend.trend1D} | 4H:${this.btcTrend.trend4H} | 1H:${this.btcTrend.trend1H}`);

    const btcDusus    = this.btcTrend.trend4H==='ASAGI'&&this.btcTrend.trend1D==='ASAGI';
    const btcYukselis = this.btcTrend.trend4H==='YUKARI'&&this.btcTrend.guclu1D;
    const btcAniDusus = this.checkBTCDrop();

    const maxPos    = parseInt(settings.max_open_positions||5);
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    if (openCount.count>=maxPos) {
      console.log(`Max pozisyon doldu (${openCount.count}/${maxPos})`);
      return;
    }

    db.prepare("DELETE FROM signals").run();
    let signalCount=0;
    const signalsFound=[];
    const symbols=Object.keys(this.candle4HBuffers).filter(s=>s!=='BTCUSDT');

    for (const symbol of symbols) {
      try {
        const candles4H = this.candle4HBuffers[symbol];
        const candles1H = this.candle1HBuffers[symbol];
        const candles1D = this.candle1DBuffers[symbol]||[];
        const ticker    = this.tickers[symbol];
        if (!candles4H||candles4H.length<52||!ticker) continue;

        const setup4H = TechnicalAnalysis.analyze4HSetup(candles4H, candles1D, ticker, settings);
        if (!setup4H||setup4H.setup==='BEKLE') continue;

        const trend1H = candles1H&&candles1H.length>=50
          ? TechnicalAnalysis.analyze1H(candles1H)
          : { trend:'BELIRSIZ' };

        // ── LONG ──────────────────────────────────────────
        if (setup4H.setup==='LONG_ADAY') {
          if (btcDusus||btcAniDusus) continue;
          if (this.btcTrend.trend1D==='ASAGI') continue;
          if (['ASAGI','HAFIF_ASAGI'].includes(setup4H.trend4H)) continue;

          const sinyal = setup4H.longSinyal;

          if (sinyal==='GUCLU') {
            if (['ASAGI','BELIRSIZ'].includes(trend1H.trend)) {
              this.adaylar[symbol]={ setup:setup4H, time:Date.now(), type:'LONG' };
              console.log(`🎯 LONG ADAY (6/6, 1H bekle): ${symbol} RSI:${setup4H.rsi}`);
            } else {
              const result = this.buildSignalResult(setup4H, trend1H, candles1H, 'LONG', settings);
              await this.processSignal(result, 'LONG', settings);
              signalCount++; signalsFound.push(`${symbol}L★`);
            }
          } else if (sinyal==='NORMAL') {
            this.adaylar[symbol]={ setup:setup4H, time:Date.now(), type:'LONG' };
            console.log(`🎯 LONG ADAY (5/6): ${symbol} RSI:${setup4H.rsi}`);
          } else if (sinyal==='ZAYIF') {
            this.adaylar[symbol]={ setup:setup4H, time:Date.now(), type:'LONG', strict:true };
            console.log(`🎯 LONG ADAY (4/6 sıkı): ${symbol} RSI:${setup4H.rsi}`);
          }
        }

        // ── SHORT ─────────────────────────────────────────
        else if (setup4H.setup==='SHORT_ADAY') {
          if (btcYukselis) continue;
          if (['YUKARI','HAFIF_YUKARI'].includes(setup4H.trend4H)) continue;

          const sinyal = setup4H.shortSinyal;

          if (sinyal==='GUCLU') {
            if (['YUKARI','BELIRSIZ'].includes(trend1H.trend)) {
              this.adaylar[symbol]={ setup:setup4H, time:Date.now(), type:'SHORT' };
              console.log(`🎯 SHORT ADAY (6/6, 1H bekle): ${symbol} RSI:${setup4H.rsi}`);
            } else {
              const result = this.buildSignalResult(setup4H, trend1H, candles1H, 'SHORT', settings);
              await this.processSignal(result, 'SHORT', settings);
              signalCount++; signalsFound.push(`${symbol}S★`);
            }
          } else if (sinyal==='NORMAL') {
            this.adaylar[symbol]={ setup:setup4H, time:Date.now(), type:'SHORT' };
            console.log(`🎯 SHORT ADAY (5/6): ${symbol} RSI:${setup4H.rsi}`);
          } else if (sinyal==='ZAYIF') {
            this.adaylar[symbol]={ setup:setup4H, time:Date.now(), type:'SHORT', strict:true };
            console.log(`🎯 SHORT ADAY (4/6 sıkı): ${symbol} RSI:${setup4H.rsi}`);
          }
        }

        const newOpen = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
        if (newOpen.count>=maxPos) break;

      } catch(e) { console.error(`${symbol} 4H hatası:`,e.message); }
    }

    const sure = Date.now()-baslangic;
    console.log(`[${zaman}] 4H bitti (${(sure/1000).toFixed(1)}s) — ${signalCount} sinyal, ${Object.keys(this.adaylar).length} aday`);
    this.saveScanLog(symbols.length, signalCount, sure, signalsFound);
  }

  // ── 1H KAPANIŞINDA GİRİŞ ZAMANLAMASI ─────────────────────
  async scan1HClose(candleCloseTime) {
    if (this.closedCandles1H.has(candleCloseTime)) return;
    this.closedCandles1H.add(candleCloseTime);
    if (this.closedCandles1H.size>10) {
      const first=this.closedCandles1H.values().next().value;
      this.closedCandles1H.delete(first);
    }

    if (Object.keys(this.adaylar).length===0) return;

    const settings  = this.getSettings();
    const maxPos    = parseInt(settings.max_open_positions||5);
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    if (openCount.count>=maxPos) return;

    // Eski adayları temizle
    const simdi = Date.now();
    for (const sym of Object.keys(this.adaylar)) {
      if (simdi-this.adaylar[sym].time>8*60*60*1000) {
        console.log(`⏰ ${sym} adayı süresi doldu`);
        delete this.adaylar[sym];
      }
    }

    const btcDusus    = this.btcTrend.trend4H==='ASAGI'&&this.btcTrend.trend1D==='ASAGI';
    const btcYukselis = this.btcTrend.trend4H==='YUKARI'&&this.btcTrend.guclu1D;
    const btcAniDusus = this.checkBTCDrop();

    for (const symbol of Object.keys(this.adaylar)) {
      try {
        const aday      = this.adaylar[symbol];
        const candles1H = this.candle1HBuffers[symbol];
        if (!candles1H||candles1H.length<52) continue;

        const existing = db.prepare("SELECT id FROM positions WHERE symbol=? AND status='OPEN'").get(symbol);
        if (existing) { delete this.adaylar[symbol]; continue; }

        const closes1H = candles1H.map(c=>parseFloat(c[4]));
        const highs1H  = candles1H.map(c=>parseFloat(c[2]));
        const lows1H   = candles1H.map(c=>parseFloat(c[3]));
        const vols1H   = candles1H.map(c=>parseFloat(c[5]));
        const opens1H  = candles1H.map(c=>parseFloat(c[1]));

        const macd1H    = TechnicalAnalysis.calculateMACD(closes1H);
        const trend1H   = TechnicalAnalysis.analyzeTF(candles1H);
        const hacim1H   = TechnicalAnalysis.hacimAnaliz(closes1H, vols1H);
        const vol1H     = TechnicalAnalysis.volatiliteKontrol(highs1H, lows1H, closes1H);
        const sonYesil  = closes1H[closes1H.length-1]>opens1H[closes1H.length-1];
        const sonKirmizi= closes1H[closes1H.length-1]<opens1H[closes1H.length-1];
        const normalMum = vol1H.normalMum;
        const setup4H   = aday.setup;
        const sinyal    = aday.type==='LONG'?setup4H.longSinyal:setup4H.shortSinyal;

        // ── LONG GİRİŞ ───────────────────────────────────
        if (aday.type==='LONG') {
          if (btcDusus||btcAniDusus) continue;
          let girisOK=false;
          if      (sinyal==='GUCLU')  girisOK=!['ASAGI','BELIRSIZ'].includes(trend1H.trend)&&sonYesil&&normalMum;
          else if (sinyal==='NORMAL') girisOK=macd1H.crossover&&!['ASAGI'].includes(trend1H.trend)&&sonYesil&&normalMum;
          else if (sinyal==='ZAYIF')  girisOK=macd1H.crossover&&hacim1H.spike&&!['ASAGI'].includes(trend1H.trend)&&sonYesil&&normalMum;

          if (girisOK) {
            const result=this.buildSignalResult(setup4H,trend1H,candles1H,'LONG',settings);
            await this.processSignal(result,'LONG',settings);
            delete this.adaylar[symbol];
          } else {
            console.log(`⏳ ${symbol} LONG bekle (${sinyal}): trend=${trend1H.trend} yesil=${sonYesil} cross=${macd1H.crossover}`);
          }
        }

        // ── SHORT GİRİŞ ──────────────────────────────────
        else if (aday.type==='SHORT') {
          if (btcYukselis) continue;
          let girisOK=false;
          if      (sinyal==='GUCLU')  girisOK=!['YUKARI','BELIRSIZ'].includes(trend1H.trend)&&sonKirmizi&&normalMum;
          else if (sinyal==='NORMAL') girisOK=macd1H.crossunder&&!['YUKARI'].includes(trend1H.trend)&&sonKirmizi&&normalMum;
          else if (sinyal==='ZAYIF')  girisOK=macd1H.crossunder&&hacim1H.yuksekHacimKirmizi&&!['YUKARI'].includes(trend1H.trend)&&sonKirmizi&&normalMum;

          if (girisOK) {
            const result=this.buildSignalResult(setup4H,trend1H,candles1H,'SHORT',settings);
            await this.processSignal(result,'SHORT',settings);
            delete this.adaylar[symbol];
          } else {
            console.log(`⏳ ${symbol} SHORT bekle (${sinyal}): trend=${trend1H.trend} kirmizi=${sonKirmizi} cross=${macd1H.crossunder}`);
          }
        }

        const newOpen=db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
        if (newOpen.count>=maxPos) break;

      } catch(e) { console.error(`${symbol} 1H hatası:`,e.message); }
    }
  }

  saveSignal(data, side) {
    try {
      const result = db.prepare(`
        INSERT INTO signals (symbol,signal_type,score,risk,price,rsi,macd,trend,positive_signals,negative_signals,ai_comment)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        data.symbol, side==='SHORT'?'SATIS':'ALIM',
        data.score, data.risk||'ORTA', data.price,
        data.rsi4H||data.rsi||0, data.macdBullish?1:-1,
        `${data.trend1H||'?'}|${data.trend4H||'?'}|${data.trend1D||'?'}`,
        JSON.stringify(data.positive||[]), JSON.stringify(data.negative||[]),
        `${data.longSinyal||data.shortSinyal||'?'} | BTC:${this.btcTrend.trend4H}/${this.btcTrend.trend1D}`
      );
      return result.lastInsertRowid;
    } catch(e) { console.error('Sinyal kayıt hatası:',e.message); return null; }
  }

  async sendTelegramSignal(data, side, settings) {
    try {
      const telegram = this.getTelegram();
      if (!telegram) return;
      const minScore = parseInt(settings.telegram_min_score||50);
      if (Math.abs(data.score||0)<minScore) return;
      const emoji  = side==='SHORT'?'📉':'🚀';
      const sinyal = side==='LONG'?data.longSinyal:data.shortSinyal;
      await telegram.sendMessage(
        `${emoji} <b>${side} — ${data.symbol}</b>\n` +
        `💰 Fiyat: <code>${data.price}</code>\n` +
        `💪 Güç: ${sinyal} | Skor: ${data.score}\n` +
        `📈 4H:${data.trend4H} | 1D:${data.trend1D}\n` +
        `🛑 Stop: <code>${data.stopLoss}</code> | 🎯 Hedef: <code>${data.target}</code>`
      );
    } catch(e) { console.error('Telegram hatası:',e.message); }
  }

  broadcastSignal(data, side) {
    if (!global.wss) return;
    global.wss.clients.forEach(client => {
      if (client.readyState===1) {
        client.send(JSON.stringify({ type:'NEW_SIGNAL', data:{ ...data, signal:side==='SHORT'?'SATIS':'ALIM' } }));
      }
    });
  }

  async openPosition(data, signalId, side, settings) {
    if (settings.auto_trade_enabled!=='true') return null;
    if (!settings.binance_api_key||!settings.binance_api_secret) return null;
    const openCount = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    if (openCount.count>=parseInt(settings.max_open_positions||5)) return null;
    const existing = db.prepare("SELECT id FROM positions WHERE symbol=? AND status='OPEN'").get(data.symbol);
    if (existing) return null;
    try {
      const binance     = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
      const baseAmount  = parseFloat(settings.trade_amount_usdt||100);
      const amount      = parseFloat((baseAmount*(data.pozisyonMult||1)).toFixed(2));
      const orderSide   = side==='SHORT'?'SELL':'BUY';
      const order       = await binance.placeOrder(data.symbol, orderSide, amount/data.price);
      const fillPrice   = parseFloat(order.fills?.[0]?.price||data.price);
      const fillQty     = parseFloat(order.executedQty);
      const stopLoss    = data.stopLoss||(side==='LONG'?fillPrice*0.98:fillPrice*1.02);

      const posResult = db.prepare(`
        INSERT INTO positions (symbol,side,quantity,entry_price,current_price,stop_loss,take_profit,signal_id)
        VALUES (?,?,?,?,?,?,0,?)
      `).run(data.symbol,side,fillQty,fillPrice,fillPrice,stopLoss,signalId);

      db.prepare(`INSERT INTO trades (position_id,symbol,side,quantity,price,total,binance_order_id) VALUES (?,?,?,?,?,?,?)`)
        .run(posResult.lastInsertRowid,data.symbol,orderSide,fillQty,fillPrice,fillQty*fillPrice,order.orderId);

      this.trailingStops[data.symbol]={ highestPrice:fillPrice, lowestPrice:fillPrice, entryPrice:fillPrice, quantity:fillQty, side };
      console.log(`✅ ${side} AÇILDI: ${data.symbol} @ ${fillPrice} | ${amount} USDT`);
      return posResult.lastInsertRowid;
    } catch(e) { console.error('Pozisyon açma hatası:',e.message); return null; }
  }

  async checkPositions() {
    const settings = this.getSettings();
    if (!settings.binance_api_key||!settings.binance_api_secret) return;
    const positions = db.prepare("SELECT * FROM positions WHERE status='OPEN'").all();
    if (!positions.length) return;
    const binance     = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
    const trailingPct = parseFloat(settings.trailing_stop_percent||0.5)/100;
    const minProfPct  = parseFloat(settings.min_profit_percent||1.5)/100;
    const hardStopPct = parseFloat(settings.stop_loss_percent||2.0)/100;
    const komPct      = parseFloat(settings.commission_rate||0.1)/100;
    const slipPct     = parseFloat(settings.slippage_rate||0.05)/100;
    const timeStopMin = parseInt(settings.time_stop_minutes||0);

    for (const pos of positions) {
      try {
        const cur       = await binance.getPrice(pos.symbol);
        const totalCost = (komPct+slipPct)*2;
        const side      = pos.side||'LONG';
        let brutoPnlPct, netPnlPct, netPnl;
        if (side==='SHORT') { brutoPnlPct=((pos.entry_price-cur)/pos.entry_price)*100; }
        else                { brutoPnlPct=((cur-pos.entry_price)/pos.entry_price)*100; }
        netPnlPct = brutoPnlPct-(totalCost*100);
        netPnl    = side==='SHORT'
          ? (pos.entry_price-cur)*pos.quantity-(pos.entry_price*pos.quantity*totalCost)
          : (cur-pos.entry_price)*pos.quantity-(pos.entry_price*pos.quantity*totalCost);

        if (!this.trailingStops[pos.symbol]) {
          this.trailingStops[pos.symbol]={ highestPrice:pos.entry_price, lowestPrice:pos.entry_price, entryPrice:pos.entry_price, quantity:pos.quantity, side };
        }
        const tr = this.trailingStops[pos.symbol];
        let closeReason=null, stopPrice=pos.stop_loss||0;

        if (side==='LONG') {
          if (cur>tr.highestPrice) tr.highestPrice=cur;
          const ts=tr.highestPrice*(1-trailingPct);
          stopPrice=Math.max(ts, pos.entry_price*(1-hardStopPct));
          db.prepare('UPDATE positions SET current_price=?,pnl=?,pnl_percent=?,stop_loss=? WHERE id=?').run(cur,netPnl,netPnlPct,stopPrice,pos.id);
          if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
          else if (brutoPnlPct>=minProfPct*100&&cur<=ts) closeReason='TRAILING_STOP';
        } else {
          if (cur<tr.lowestPrice) tr.lowestPrice=cur;
          const ts=tr.lowestPrice*(1+trailingPct);
          stopPrice=Math.min(ts, pos.entry_price*(1+hardStopPct));
          db.prepare('UPDATE positions SET current_price=?,pnl=?,pnl_percent=?,stop_loss=? WHERE id=?').run(cur,netPnl,netPnlPct,stopPrice,pos.id);
          if (netPnlPct<=-hardStopPct*100) closeReason='STOP_LOSS';
          else if (brutoPnlPct>=minProfPct*100&&cur>=ts) closeReason='TRAILING_STOP';
        }
        if (timeStopMin>0&&Date.now()-new Date(pos.opened_at).getTime()>timeStopMin*60*1000) closeReason='TIME_STOP';
        if (closeReason) await this.closePosition(pos,binance,closeReason,cur,komPct,slipPct,side);
      } catch(e) { console.error(`${pos.symbol} kontrol hatası:`,e.message); }
    }
  }

  async closePosition(pos, binance, reason, cur, komPct, slipPct, side='LONG') {
    try {
      const orderSide = side==='SHORT'?'BUY':'SELL';
      const order     = await binance.placeOrder(pos.symbol, orderSide, pos.quantity);
      const sellPrice = parseFloat(order.fills?.[0]?.price||cur);
      const totalCost = (komPct+slipPct)*2;
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
      const telegram=this.getTelegram();
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
        return price>0&&vol>=parseFloat(settings.min_volume||1000000);
      })
      .sort((a,b)=>parseFloat(b.quoteVolume)-parseFloat(a.quoteVolume))
      .slice(0,parseInt(settings.max_coins||50));
    filtered.forEach(t=>{ this.tickers[t.symbol]=t; });
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

  startWebSocket(symbols) {
    if (this.ws) { try { this.ws.terminate(); } catch(e) {} this.ws=null; }
    const streams = symbols.map(s=>`${s.symbol.toLowerCase()}@kline_1h`).join('/');
    const wsUrl   = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    console.log(`🔌 WebSocket: ${symbols.length} coin`);
    this.ws = new WebSocket(wsUrl);
    this.ws.on('open', ()=>console.log('✅ WebSocket bağlandı'));
    this.ws.on('message', async(data)=>{
      try {
        const parsed = JSON.parse(data);
        if (!parsed.data?.k) return;
        const kline=parsed.data.k, symbol=kline.s, isClosed=kline.x;
        const newCandle=[kline.t,kline.o,kline.h,kline.l,kline.c,kline.v,kline.T,kline.q,kline.n,kline.V,kline.Q,'0'];

        if (!this.candle1HBuffers[symbol]) this.candle1HBuffers[symbol]=[];

        if (isClosed) {
          this.candle1HBuffers[symbol].push(newCandle);
          if (this.candle1HBuffers[symbol].length>200) this.candle1HBuffers[symbol].shift();

          // 4H kapandı mı?
          const closeHour = new Date(parseInt(kline.T)).getUTCHours();
          if (closeHour%4===3) {
            const last4=this.candle1HBuffers[symbol].slice(-4);
            if (last4.length===4) {
              const h4Candle=[
                last4[0][0], last4[0][1],
                Math.max(...last4.map(c=>parseFloat(c[2]))).toString(),
                Math.min(...last4.map(c=>parseFloat(c[3]))).toString(),
                last4[3][4],
                last4.reduce((s,c)=>s+parseFloat(c[5]),0).toString(),
                last4[3][6],'','','','',''
              ];
              if (!this.candle4HBuffers[symbol]) this.candle4HBuffers[symbol]=[];
              this.candle4HBuffers[symbol].push(h4Candle);
              if (this.candle4HBuffers[symbol].length>200) this.candle4HBuffers[symbol].shift();
            }
            await this.scan4HClose(kline.T);
          }

          await this.scan1HClose(kline.T);

        } else {
          // Canlı fiyat güncelle
          const buf=this.candle1HBuffers[symbol];
          if (buf.length>0) buf[buf.length-1]=newCandle;

          // Simülasyon fiyat güncelle
          this.currentPrices[symbol]=parseFloat(kline.c);
          const simulation=require('./simulation');
          simulation.updatePositions(this.currentPrices, this.getSettings());
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
    this.running=true;
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`ENGINE v19 — 4H Setup + 1H Timing + Simülasyon`);
    console.log(`${'═'.repeat(50)}\n`);
    try {
      await this.updateBTCTrend();
      const symbols=await this.fetchSymbols();
      console.log(`${symbols.length} coin seçildi`);
      await this.loadAllCandles(symbols);
      await this.scan4HClose(Date.now());
      this.startWebSocket(symbols);
      this.positionInterval      = setInterval(()=>this.checkPositions(), 30000);
      this.btcUpdateInterval     = setInterval(()=>this.updateBTCTrend(), 4*60*60*1000);
      this.symbolRefreshInterval = setInterval(async()=>{
        console.log('🔄 Yenileniyor...');
        const newSyms=await this.fetchSymbols();
        await this.loadAllCandles(newSyms);
        this.startWebSocket(newSyms);
      }, 60*60*1000);
      console.log('\n✅ Engine hazır!');
      console.log('💪 6/6 GÜÇLÜ → 1H trend uyumlu → direkt sinyal');
      console.log('📊 5/6 NORMAL → 1H MACD crossover bekle');
      console.log('⚠️  4/6 ZAYIF  → 1H crossover + hacim spike bekle');
      console.log('🎮 Simülasyon aktif — sanal para ile gerçek zamanlı\n');
    } catch(e) {
      console.error('Engine başlatma hatası:',e.message);
      this.running=false;
    }
  }

  stop() {
    if (this.ws) { try { this.ws.terminate(); } catch(e) {} this.ws=null; }
    if (this.positionInterval)      clearInterval(this.positionInterval);
    if (this.symbolRefreshInterval) clearInterval(this.symbolRefreshInterval);
    if (this.btcUpdateInterval)     clearInterval(this.btcUpdateInterval);
    this.running=false;
    this.candle4HBuffers={}; this.candle1HBuffers={}; this.candle1DBuffers={};
    this.tickers={}; this.adaylar={}; this.currentPrices={};
    this.closedCandles4H=new Set(); this.closedCandles1H=new Set();
    console.log('Engine durduruldu.');
  }
}

module.exports = new TradingEngine();
