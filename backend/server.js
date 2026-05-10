const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, '../frontend/public');

app.use(cors());
app.use(express.json());
app.use(express.static(frontendPath));

const db = require('./src/database');

// ── ENGINE BAŞLAT (DUMMY BINANCE API)
let engine = null;
function getEngine() {
  if (!engine) {
    const TradingEngine = require('./src/engine');
    
    // Dummy Binance API (bot start() için)
    const dummyBinance = {
      get24hrTicker: async () => [],
      getKlines: async () => [],
    };
    
    engine = new TradingEngine(db, dummyBinance, null);
  }
  return engine;
}

// ── Bot Durumu
app.get('/api/status', async (req, res) => {
  try {
    const eng = getEngine();
    const stats = db.getStats();
    res.json({
      running: eng.running,
      scanCount: eng.scanCount,
      ...stats
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Database Stats
app.get('/api/db/stats', (req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

// ── Açık Pozisyonlar
app.get('/api/positions/open', (req, res) => {
  res.json(db.getOpenPositions());
});

// ── Kapalı Pozisyonlar
app.get('/api/positions/closed', (req, res) => {
  res.json(db.getClosedPositions(50));
});

// ── Son Sinyaller
app.get('/api/signals/recent', (req, res) => {
  res.json(db.getRecentSignals(100));
});

// ── Settings
app.get('/api/settings', (req, res) => {
  const settings = {};
  for (const key in db.settings) {
    settings[key] = db.settings[key];
  }
  res.json(settings);
});

// ── Setting Güncelle
app.post('/api/settings/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  db.setSetting(key, value);
  res.json({ success: true, key, value });
});

// ── Bot Başlat
app.post('/api/bot/start', async (req, res) => {
  try {
    const eng = getEngine();
    if (!eng.running) {
      await eng.start();
      res.json({ message: '🚀 Baslatildi!' });
    } else {
      res.json({ message: 'Zaten calisiyor' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bot Durdur
app.post('/api/bot/stop', (req, res) => {
  try {
    const eng = getEngine();
    if (eng.running) {
      eng.stop();
      res.json({ message: '⏹️ Durduruldu' });
    } else {
      res.json({ message: 'Zaten durmus' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Manual Tarama
app.post('/api/bot/scan', async (req, res) => {
  try {
    const eng = getEngine();
    await eng.updateBTCTrend();
    await eng.scan();
    res.json({ message: '✅ Tarama tamamlandi' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ── Frontend (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Server Başlat
app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log('📊 Trading Bot v21 — API Aktif\n');
  
  // Bot'u başlat (hata varsa log et, ama crash'e)
  try {
    const eng = getEngine();
    if (eng.start && typeof eng.start === 'function') {
      eng.start().catch(e => console.error('Bot start error:', e.message));
    } else {
      console.log('[SERVER] Engine.start() not available - using API only');
    }
  } catch(e) {
    console.error('Engine init error:', e.message);
  }
});

module.exports = app;
