const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./src/database');
const simulation = require('./src/simulation');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendPath));

let engine = null;
function getEngine() {
  if (!engine) engine = require('./src/engine');
  return engine;
}

// ── Bot Durumu (Gerçek Bakiye Eklendi)
app.get('/api/status', async (req, res) => {
  try {
    const eng = getEngine();
    const stats = simulation.getStats();
    let realBalance = 0;
    if (eng && eng.running) {
      try {
        const binance = require('./src/binance');
        realBalance = await binance.getBalance('USDT');
      } catch(e) {}
    }
    res.json({
      botRunning: eng.running,
      simRunning: eng.running,
      scanCount: eng.scanCount,
      btcTrend: eng.btcTrend,
      realBalance: realBalance,
      stats
    });
  } catch(e) {
    res.json({ botRunning: false, simRunning: false, scanCount: 0, btcTrend: { trend:'BELIRSIZ' }, realBalance: 0, stats:{} });
  }
});

// ── Sinyaller
app.get('/api/signals', (req, res) => {
  try { res.json(db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT 100').all()); } catch(e) { res.json([]); }
});

// ── Simülasyon İstatistik
app.get('/api/simulation/stats', (req, res) => {
  try { res.json(simulation.getStats()); } catch(e) { res.json({ balance:0, totalTrades:0, winRate:0 }); }
});

// ── Simülasyon İşlemler
app.get('/api/simulation/trades', (req, res) => {
  try { res.json(db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC LIMIT 200").all()); } catch(e) { res.json([]); }
});

// ── Simülasyon Sıfırla
app.post('/api/simulation/reset', (req, res) => {
  try { const b = req.body.startBalance; simulation.reset(b||1000); res.json({ message:'✅ Sifirlandi' }); } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Simülasyon Başlat
app.post('/api/simulation/start', (req, res) => {
  try {
    const eng = getEngine();
    if (!eng.running) eng.start().then(()=>res.json({ message:'✅ Baslatildi' })).catch(e=>res.status(500).json({ error:e.message }));
    else res.json({ message:'Zaten calisiyor' });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Simülasyon Durdur
app.post('/api/simulation/stop', (req, res) => {
  try {
    const eng = getEngine();
    if (eng.running) { eng.stop(); res.json({ message:'⏹️ Durduruldu' }); }
    else res.json({ message:'Zaten durmus' });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Makine Raporu
app.get('/api/machine/report', (req, res) => {
  try {
    const eng = getEngine();
    const stats = simulation.getStats();
    if (eng.getMachineReport) return res.json(eng.getMachineReport());
    res.json({
      bot:{ running:eng.running, scanCount:eng.scanCount, btcTrend:eng.btcTrend },
      machine:{ adaptiveThreshold:stats.adaptiveThreshold||70, consecutiveLosses:stats.consecutiveLosses||0 },
      performance:{ signalsGenerated:eng.performance?.signalsGenerated||0, signalsAccepted:eng.performance?.signalsAccepted||0, signalsRejected:eng.performance?.signalsRejected||0, acceptanceRate:eng.performance?.signalsGenerated>0?(eng.performance.signalsAccepted/eng.performance.signalsGenerated*100).toFixed(1):0 },
      simulation:stats
    });
  } catch(e) { res.json({ bot:{}, machine:{}, performance:{}, simulation:{} }); }
});

// ── Backtest
app.post('/api/backtest', async (req, res) => {
  try {
    const backtest = require('./src/backtest');
    const p = {
      symbols: req.body.symbols || ['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT','BNBUSDT'],
      interval: req.body.interval||'4h', days: parseInt(req.body.days||30),
      stopLoss: parseFloat(req.body.stopLoss||2), trailingStop: parseFloat(req.body.trailingStop||0.5),
      minProfit: parseFloat(req.body.minProfit||1.5), commission: parseFloat(req.body.commission||0.1),
      slippage: parseFloat(req.body.slippage||0.05), minScore: parseInt(req.body.minScore||50),
      tradeAmount: parseFloat(req.body.tradeAmount||100), maxPositions: parseInt(req.body.maxPositions||3),
      epochs: parseInt(req.body.epochs||3), machineConfidenceMin: parseFloat(req.body.machineConfidenceMin||0.70),
      longEnabled: req.body.longEnabled !== false,
      shortEnabled: req.body.shortEnabled !== false,
      shortConfMin: parseFloat(req.body.shortConfMin || 0.85)
    };
    res.json(await backtest.run(p));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Ayarlar
app.get('/api/settings', (req, res) => {
  try { const s={}; db.prepare('SELECT key,value FROM settings').all().forEach(r=>s[r.key]=r.value); res.json(s); } catch(e) { res.json({}); }
});
app.post('/api/settings', (req, res) => {
  try {
    const s=db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
    for (const [k,v] of Object.entries(req.body)) s.run(k,String(v));
    res.json({ message:'✅ Kaydedildi' });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Pozisyonlar (Gerçek + Simülasyon)
app.get('/api/positions', (req, res) => {
  try {
    const eng = getEngine();
    const simData = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC LIMIT 50").all().map(p=>({...p,is_real:0}));
    const realData = [];
    if (eng && eng.realPositions) {
      Object.keys(eng.realPositions).forEach(sym => {
        const pos = eng.realPositions[sym];
        const cp = eng.prices[pos.symbol] || pos.entryPrice;
        const pnlPct = pos.side === 'SHORT' ? ((pos.entryPrice-cp)/pos.entryPrice)*100 : ((cp-pos.entryPrice)/pos.entryPrice)*100;
        const pnl = pos.side === 'SHORT' ? (pos.entryPrice-cp)*pos.quantity : (cp-pos.entryPrice)*pos.quantity;
        realData.push({
          id:0, symbol:pos.symbol, side:pos.side||'LONG', quantity:pos.quantity,
          entry_price:pos.entryPrice, current_price:cp, exit_price:null,
          stop_loss:pos.stopLoss, take_profit:pos.takeProfit,
          highest_price:pos.highestPrice||pos.entryPrice, lowest_price:pos.lowestPrice||pos.entryPrice,
          pnl:pnl, pnl_percent:pnlPct, status:'OPEN', signal_guc:'GERCEK',
          trend4H:'-', trend1D:'-', score:0, machine_confidence:pos.machineConfidence||0,
          close_reason:null, opened_at:pos.entryTime, closed_at:null, is_real:1
        });
      });
    }
    res.json([...realData,...simData]);
  } catch(e) { res.json([]); }
});

// ── Manuel Satış
app.post('/api/positions/close', async (req, res) => {
  try {
    const { symbol, is_real } = req.body;
    if (!symbol) return res.status(400).json({ error:'Sembol gerekli' });
    if (is_real === 1 || is_real === '1') {
      const eng = getEngine();
      if (!eng || !eng.realPositions || !eng.realPositions[symbol]) return res.status(404).json({ error:'Pozisyon bulunamadi' });
      const pos = eng.realPositions[symbol];
      const cp = eng.prices[symbol] || pos.entryPrice;
      const side = pos.side || 'LONG';
      let sellResult;
      if (side === 'SHORT') {
        sellResult = await require('./src/binance').realBuy(symbol, pos.quantity * cp, cp);
      } else {
        sellResult = await require('./src/binance').realSell(symbol, pos.quantity);
      }
      if (sellResult) {
        try {
          const settings = {}; db.prepare('SELECT key,value FROM settings').all().forEach(r=>settings[r.key]=r.value);
          if (settings.telegram_token && settings.telegram_chat_id) {
            const TelegramService = require('./src/telegram');
            const tg = new TelegramService(settings.telegram_token, settings.telegram_chat_id);
            const pnl = side==='SHORT' ? (pos.entryPrice-cp)*pos.quantity : (cp-pos.entryPrice)*pos.quantity;
            const pnlPct = side==='SHORT' ? ((pos.entryPrice-cp)/pos.entryPrice)*100 : ((cp-pos.entryPrice)/pos.entryPrice)*100;
            const emoji = pnl>=0?'✅ KAR':'❌ ZARAR';
            const isaret = pnl>=0?'+':'';
            tg.sendMessage(`${emoji} — ${symbol}\n━━━━━━━━━━━━━━━━━━\n💰 Giris: ${pos.entryPrice.toFixed(6)}\n💰 Cikis: ${cp.toFixed(6)}\n${pnl>=0?'📈 Kar':'📉 Zarar'}: ${isaret}%${pnlPct.toFixed(2)} (${isaret}${pnl.toFixed(4)} USDT)\n🛑 Neden: MANUEL_KAPATMA\n🕐 ${new Date().toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}`).catch(()=>{});
          }
        } catch(e) {}
        delete eng.realPositions[symbol];
        res.json({ message:'✅ '+symbol+' manuel kapatildi', price:cp });
      } else { res.status(500).json({ error:'Kapatma basarisiz' }); }
    } else {
      const pos = db.prepare("SELECT * FROM sim_positions WHERE symbol=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1").get(symbol);
      if (!pos) return res.status(404).json({ error:'Pozisyon bulunamadi' });
      const cp = pos.current_price || pos.entry_price;
      simulation.closePosition(pos, cp, 'MANUEL_KAPATMA');
      res.json({ message:'✅ '+symbol+' simülasyon pozisyonu kapatildi' });
    }
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Tarama Logları
app.get('/api/scan-logs', (req, res) => {
  try { res.json(db.prepare('SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT 20').all()); } catch(e) { res.json([]); }
});

// ── Bot Başlat
app.post('/api/bot/start', async (req, res) => {
  try { const eng=getEngine(); if(!eng.running){ await eng.start(); res.json({ message:'🚀 Baslatildi!' }); } else res.json({ message:'Zaten calisiyor' }); } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Bot Durdur
app.post('/api/bot/stop', (req, res) => {
  try { const eng=getEngine(); if(eng.running){ eng.stop(); res.json({ message:'⏹️ Durduruldu' }); } else res.json({ message:'Zaten durmus' }); } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Manuel Tarama
app.post('/api/bot/scan', async (req, res) => {
  try { const eng=getEngine(); await eng.updateBTCTrend(); await eng.scan(); res.json({ message:'✅ Tarama tamamlandi' }); } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Frontend
app.get('*', (req, res) => {
  const ip = path.join(frontendPath,'index.html');
  if (fs.existsSync(ip)) res.sendFile(ip);
  else res.json({ message:'🚀 Trading Bot API v21', status:'running' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log('📊 Trading Bot v21 — Makine Zekasi Aktif\n');
  getEngine().start().catch(e => console.error('Bot baslatma hatasi:', e.message));
});
