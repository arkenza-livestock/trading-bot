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

// ── ENGINE ────────────────────────────────────────────────
app.post('/api/engine/start', async (req, res) => {
  try { await engine.start(); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/engine/stop', (req, res) => {
  try { engine.stop(); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/status', (req, res) => {
  try {
    const open   = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='OPEN'").get();
    const pnl    = db.prepare("SELECT COALESCE(SUM(pnl),0) as t FROM positions WHERE status!='OPEN'").get();
    const trades = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status!='OPEN'").get();
    const wins   = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status!='OPEN' AND pnl>0").get();
    res.json({
      running:       engine.running,
      openPositions: open.c,
      totalPnl:      parseFloat((pnl.t||0).toFixed(4)),
      winRate:       trades.c > 0 ? parseFloat((wins.c/trades.c*100).toFixed(1)) : 0,
      btcTrend:      engine.btcTrend || {}
    });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── SİNYALLER ────────────────────────────────────────────
app.get('/api/signals', (req, res) => {
  try {
    const limit   = parseInt(req.query.limit) || 50;
    const signals = db.prepare("SELECT * FROM signals WHERE signal_type='ALIM' ORDER BY score DESC LIMIT ?").all(limit);
    res.json(signals.map(s => ({
      ...s,
      positive_signals: JSON.parse(s.positive_signals || '[]'),
      negative_signals: JSON.parse(s.negative_signals || '[]')
    })));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── POZİSYONLAR ──────────────────────────────────────────
app.get('/api/positions/open', (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM positions WHERE status='OPEN' ORDER BY opened_at DESC").all());
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/positions', (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM positions ORDER BY opened_at DESC LIMIT 100").all());
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/positions/:id/close', (req, res) => {
  try {
    db.prepare("UPDATE positions SET status='MANUAL',closed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── AYARLAR ──────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/settings', (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      const ex = db.prepare('SELECT key FROM settings WHERE key=?').get(key);
      if (ex) db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(value), key);
      else    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key, String(value));
    }
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── SCAN LOGS ────────────────────────────────────────────
app.get('/api/scan-logs', (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT 50").all();
    res.json(logs.map(l => ({ ...l, signals_found: JSON.parse(l.signals_found || '[]') })));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── BACKTEST ─────────────────────────────────────────────
app.post('/api/backtest', async (req, res) => {
  try {
    const backtest = require('./src/backtest');
    const params   = req.body;
    const COINS    = [
      'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
      'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT',
      'LTCUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
      'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT'
    ];
    const symbols = params.symbol === 'TÜMÜ' ? COINS : [params.symbol];
    const result  = await backtest.run({ ...params, symbols });
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── TRADES ───────────────────────────────────────────────
app.get('/api/trades', (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM trades ORDER BY created_at DESC LIMIT 100").all());
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── SİMÜLASYON ───────────────────────────────────────────
const simulation = require('./src/simulation');

app.get('/api/simulation/stats', (req, res) => {
  try { res.json(simulation.getStats()); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/simulation/positions', (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC LIMIT 50").all());
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/simulation/reset', (req, res) => {
  try {
    const { balance=1000 } = req.body;
    simulation.reset(parseFloat(balance));
    res.json({ success:true, balance });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── FRONTEND ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

// ── SUNUCU ───────────────────────────────────────────────
const WebSocket = require('ws');
const http      = require('http');
const server    = http.createServer(app);

global.wss = new WebSocket.Server({ server });
global.wss.on('connection', ws => {
  ws.send(JSON.stringify({ type:'CONNECTED' }));
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📊 Trading Bot v20 — Profesyonel Sinyal Motoru\n`);
});
