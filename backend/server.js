const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./src/database');
const engine  = require('./src/engine');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/build')));

// ── SİMÜLASYON ───────────────────────────────────────────
const simulation = require('./src/simulation');

app.get('/api/simulation/stats', (req, res) => {
  try { res.json(simulation.getStats()); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/simulation/positions', (req, res) => {
  try {
    const all = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC LIMIT 50").all();
    res.json(all);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/simulation/reset', (req, res) => {
  try {
    const { balance=1000 } = req.body;
    simulation.reset(parseFloat(balance));
    res.json({ success:true, balance });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── ENGINE ────────────────────────────────────────────────
app.post('/api/engine/start', async (req, res) => {
  try {
    await engine.start();
    res.json({ success:true, message:'Engine başlatıldı' });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/engine/stop', (req, res) => {
  try {
    engine.stop();
    res.json({ success:true, message:'Engine durduruldu' });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/status', (req, res) => {
  try {
    const openPositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status='OPEN'").get();
    const pnlResult     = db.prepare("SELECT COALESCE(SUM(pnl),0) as total FROM positions WHERE status!='OPEN'").get();
    const trades        = db.prepare("SELECT COUNT(*) as total FROM positions WHERE status!='OPEN'").get();
    const wins          = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status!='OPEN' AND pnl>0").get();
    const winRate       = trades.total>0 ? (wins.count/trades.total*100) : 0;
    res.json({
      running:       engine.running,
      openPositions: openPositions.count,
      totalPnl:      parseFloat((pnlResult.total||0).toFixed(4)),
      winRate:       parseFloat(winRate.toFixed(1)),
      btcTrend:      engine.btcTrend||{}
    });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── SİNYALLER ────────────────────────────────────────────
app.get('/api/signals', (req, res) => {
  try {
    const limit   = parseInt(req.query.limit)||50;
    const signals = db.prepare("SELECT * FROM signals ORDER BY created_at DESC LIMIT ?").all(limit);
    res.json(signals.map(s => ({
      ...s,
      positive_signals: JSON.parse(s.positive_signals||'[]'),
      negative_signals: JSON.parse(s.negative_signals||'[]')
    })));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── POZİSYONLAR ──────────────────────────────────────────
app.get('/api/positions/open', (req, res) => {
  try {
    const positions = db.prepare("SELECT * FROM positions WHERE status='OPEN' ORDER BY opened_at DESC").all();
    res.json(positions);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/positions', (req, res) => {
  try {
    const positions = db.prepare("SELECT * FROM positions ORDER BY opened_at DESC LIMIT 100").all();
    res.json(positions);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/positions/:id/close', async (req, res) => {
  try {
    const pos = db.prepare("SELECT * FROM positions WHERE id=?").get(req.params.id);
    if (!pos) return res.status(404).json({ error:'Pozisyon bulunamadı' });
    db.prepare("UPDATE positions SET status='MANUAL',closed_at=CURRENT_TIMESTAMP WHERE id=?").run(pos.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── AYARLAR ──────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    const rows     = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(settings);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      const existing = db.prepare('SELECT key FROM settings WHERE key=?').get(key);
      if (existing) {
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(value), key);
      } else {
        db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key, String(value));
      }
    }
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── SCAN LOGS ────────────────────────────────────────────
app.get('/api/scan-logs', (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT 50").all();
    res.json(logs.map(l => ({
      ...l,
      signals_found: JSON.parse(l.signals_found||'[]')
    })));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── BACKTEST ─────────────────────────────────────────────
app.post('/api/backtest', async (req, res) => {
  try {
    const backtestEngine = require('./src/backtest');
    const params = req.body;
    const COINS  = [
      'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
      'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT',
      'LTCUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
      'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT'
    ];
    const symbols = params.symbol==='TÜMÜ' ? COINS : [params.symbol];
    const result  = await backtestEngine.run({ ...params, symbols });
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── TRADES ───────────────────────────────────────────────
app.get('/api/trades', (req, res) => {
  try {
    const trades = db.prepare("SELECT * FROM trades ORDER BY created_at DESC LIMIT 100").all();
    res.json(trades);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── FRONTEND ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

// ── SUNUCU BAŞLAT ─────────────────────────────────────────
const WebSocket = require('ws');
const http      = require('http');
const server    = http.createServer(app);

global.wss = new WebSocket.Server({ server });
global.wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type:'CONNECTED', message:'WebSocket bağlandı' }));
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📊 Trading Bot v19 — 4H Setup + 1H Timing + Simülasyon\n`);
});
