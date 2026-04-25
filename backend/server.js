const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = require('./src/database');
const engine = require('./src/engine');
const BinanceService = require('./src/binance');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
global.wss = wss;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── AYARLAR ──────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (settings.binance_api_secret) settings.binance_api_secret = '••••••••';
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  for (const [key, value] of Object.entries(req.body)) {
    if (key === 'binance_api_secret' && value === '••••••••') continue;
    stmt.run(key, String(value));
  }
  engine.stop();
  setTimeout(() => engine.start(), 1000);
  res.json({ success: true });
});

// ── KOD EDİTÖRÜ ──────────────────────────────────────────────
const CODE_FILES = {
  engine: path.join(__dirname, 'src/engine.js'),
  analysis: path.join(__dirname, 'src/analysis.js'),
  binance: path.join(__dirname, 'src/binance.js')
};

app.get('/api/code/:file', (req, res) => {
  const filePath = CODE_FILES[req.params.file];
  if (!filePath) return res.status(404).json({ error: 'Dosya bulunamadı' });
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/code/:file', (req, res) => {
  const filePath = CODE_FILES[req.params.file];
  if (!filePath) return res.status(404).json({ error: 'Dosya bulunamadı' });
  try {
    const backupPath = filePath + '.backup';
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, req.body.content, 'utf8');
    Object.keys(require.cache).forEach(key => {
      if (key.includes('/src/')) delete require.cache[key];
    });
    engine.stop();
    setTimeout(() => engine.start(), 2000);
    res.json({ success: true, message: 'Kod kaydedildi ve sistem yeniden başlatıldı' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SİNYALLER ────────────────────────────────────────────────
app.get('/api/signals', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const signals = db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(signals.map(s => ({
    ...s,
    positive_signals: JSON.parse(s.positive_signals || '[]'),
    negative_signals: JSON.parse(s.negative_signals || '[]')
  })));
});

// ── TARAMA LOGLARI ────────────────────────────────────────────
app.get('/api/scan-logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT 50').all();
  res.json(logs.map(l => ({
    ...l,
    signals_found: JSON.parse(l.signals_found || '[]')
  })));
});

// ── İSTATİSTİKLER ────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const totalPnl   = db.prepare("SELECT COALESCE(SUM(pnl),0) as total FROM positions WHERE status != 'OPEN'").get();
  const wins       = db.prepare("SELECT COUNT(*) as count FROM positions WHERE pnl > 0 AND status != 'OPEN'").get();
  const losses     = db.prepare("SELECT COUNT(*) as count FROM positions WHERE pnl <= 0 AND status != 'OPEN'").get();
  const open       = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'OPEN'").get();
  const signals    = db.prepare("SELECT COUNT(*) as count FROM signals").get();
  const lastScan   = db.prepare("SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT 1").get();
  const total      = wins.count + losses.count;

  res.json({
    totalPnl:      parseFloat((totalPnl.total || 0).toFixed(2)),
    winRate:       total > 0 ? parseFloat(((wins.count / total) * 100).toFixed(1)) : 0,
    wins:          wins.count,
    losses:        losses.count,
    openPositions: open.count,
    totalSignals:  signals.count,
    lastScan:      lastScan || null
  });
});

// ── POZİSYONLAR ──────────────────────────────────────────────
app.get('/api/positions', (req, res) => {
  res.json(db.prepare('SELECT * FROM positions ORDER BY opened_at DESC').all());
});

app.get('/api/positions/open', (req, res) => {
  res.json(db.prepare("SELECT * FROM positions WHERE status = 'OPEN' ORDER BY opened_at DESC").all());
});

app.post('/api/positions/:id/close', async (req, res) => {
  const pos = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!pos || pos.status !== 'OPEN') return res.status(400).json({ error: 'Pozisyon bulunamadı' });
  const settings = engine.getSettings();
  if (!settings.binance_api_key) return res.status(400).json({ error: 'API key yok' });
  try {
    const binance = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
    const order = await binance.placeOrder(pos.symbol, 'SELL', pos.quantity);
    const sellPrice = parseFloat(order.fills?.[0]?.price || pos.current_price);
    const pnl = (sellPrice - pos.entry_price) * pos.quantity;
    const pnlPct = ((sellPrice - pos.entry_price) / pos.entry_price) * 100;
    db.prepare("UPDATE positions SET status='MANUAL_CLOSE', current_price=?, pnl=?, pnl_percent=?, closed_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(sellPrice, pnl, pnlPct, pos.id);
    res.json({ success: true, pnl, pnlPercent: pnlPct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TRADE GEÇMİŞİ ────────────────────────────────────────────
app.get('/api/trades', (req, res) => {
  res.json(db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT 100').all());
});

// ── ENGINE KONTROL ────────────────────────────────────────────
app.post('/api/engine/start', (req, res) => { engine.start(); res.json({ success: true, running: true }); });
app.post('/api/engine/stop',  (req, res) => { engine.stop();  res.json({ success: true, running: false }); });
app.post('/api/engine/run-now', (req, res) => { engine.runAnalysis(); res.json({ success: true }); });
app.get('/api/engine/status', (req, res) => { res.json({ running: engine.running }); });

// ── BİNANCE TEST ─────────────────────────────────────────────
app.post('/api/binance/test', async (req, res) => {
  const settings = engine.getSettings();
  if (!settings.binance_api_key) return res.status(400).json({ error: 'API key girilmemiş' });
  try {
    const binance = new BinanceService(settings.binance_api_key, settings.binance_api_secret);
    const balance = await binance.getUSDTBalance();
    res.json({ success: true, usdtBalance: balance });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(express.static(path.join(__dirname, '../frontend/build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/build/index.html')));

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'CONNECTED' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
  engine.start();
});
