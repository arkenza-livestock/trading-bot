const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./src/database');
const engine = require('./src/engine');
const simulation = require('./src/simulation');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

// ═══════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════

// ── Bot Durumu ─────────────────────────────────
app.get('/api/status', (req, res) => {
  const stats = simulation.getStats();
  res.json({
    running: engine.running,
    scanCount: engine.scanCount,
    btcTrend: engine.btcTrend,
    stats
  });
});

// ── Sinyaller ──────────────────────────────────
app.get('/api/signals', (req, res) => {
  const signals = db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT 100').all();
  res.json(signals);
});

// ── Simülasyon ─────────────────────────────────
app.get('/api/simulation/stats', (req, res) => {
  const stats = simulation.getStats();
  res.json(stats);
});

app.post('/api/simulation/reset', (req, res) => {
  const { startBalance } = req.body;
  simulation.reset(startBalance || 1000);
  res.json({ message: 'Simülasyon sıfırlandı', balance: startBalance || 1000 });
});

// ── Makine Raporu ──────────────────────────────
app.get('/api/machine/report', (req, res) => {
  if (engine.getMachineReport) {
    res.json(engine.getMachineReport());
  } else {
    const stats = simulation.getStats();
    res.json({
      adaptiveThreshold: stats.adaptiveThreshold || 70,
      signalsAccepted: engine.performance?.signalsAccepted || 0,
      signalsRejected: engine.performance?.signalsRejected || 0,
      acceptanceRate: engine.performance?.signalsGenerated > 0 
        ? (engine.performance.signalsAccepted / engine.performance.signalsGenerated * 100).toFixed(1) 
        : 0,
      simulation: stats
    });
  }
});

// ── Backtest ───────────────────────────────────
app.post('/api/backtest/run', async (req, res) => {
  try {
    const backtest = require('./src/backtest');
    const params = req.body;
    const results = await backtest.run(params);
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Ayarlar ────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const settings = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(settings)) {
    stmt.run(key, String(value));
  }
  res.json({ message: 'Ayarlar kaydedildi' });
});

// ── Pozisyonlar ────────────────────────────────
app.get('/api/positions', (req, res) => {
  const positions = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC LIMIT 50").all();
  res.json(positions);
});

// ── Tarama Logları ─────────────────────────────
app.get('/api/scan-logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT 20').all();
  res.json(logs);
});

// ── Bot Kontrol ────────────────────────────────
app.post('/api/bot/start', async (req, res) => {
  if (!engine.running) {
    await engine.start();
    res.json({ message: 'Bot başlatıldı', running: true });
  } else {
    res.json({ message: 'Bot zaten çalışıyor', running: true });
  }
});

app.post('/api/bot/stop', (req, res) => {
  if (engine.running) {
    engine.stop();
    res.json({ message: 'Bot durduruldu', running: false });
  } else {
    res.json({ message: 'Bot zaten durmuş', running: false });
  }
});

app.post('/api/bot/scan', async (req, res) => {
  try {
    await engine.updateBTCTrend();
    await engine.scan();
    res.json({ message: 'Tarama tamamlandı' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Frontend (React build) ─────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

// ═══════════════════════════════════════════════
// BAŞLAT
// ═══════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log('📊 Trading Bot v20 — Profesyonel Sinyal Motoru');
  
  // Botu otomatik başlat
  engine.start().catch(e => {
    console.error('Bot başlatma hatası:', e.message);
  });
});
