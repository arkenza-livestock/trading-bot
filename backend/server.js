const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./src/database');
const simulation = require('./src/simulation');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Frontend build klasörü
const frontendPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendPath));

// ═══════════════════════════════════════════════
// BOT ENGINE (Lazy load - döngüsel bağımlılığı önler)
// ═══════════════════════════════════════════════
let engine = null;
function getEngine() {
  if (!engine) {
    engine = require('./src/engine');
  }
  return engine;
}

// ═══════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════

// ── Bot Durumu ─────────────────────────────────
app.get('/api/status', (req, res) => {
  try {
    const eng = getEngine();
    const stats = simulation.getStats();
    res.json({
      botRunning: eng.running,
      simRunning: eng.running,
      scanCount: eng.scanCount,
      btcTrend: eng.btcTrend,
      stats
    });
  } catch(e) {
    res.json({ botRunning: false, simRunning: false, scanCount: 0, btcTrend: { trend: 'BELIRSIZ' }, stats: {} });
  }
});

// ── Sinyaller ──────────────────────────────────
app.get('/api/signals', (req, res) => {
  try {
    const signals = db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT 100').all();
    res.json(signals);
  } catch(e) {
    res.json([]);
  }
});

// ── Simülasyon İstatistik ──────────────────────
app.get('/api/simulation/stats', (req, res) => {
  try {
    const stats = simulation.getStats();
    res.json(stats);
  } catch(e) {
    res.json({ balance: 0, totalTrades: 0, winRate: 0 });
  }
});

// ── Simülasyon Sıfırla ─────────────────────────
app.post('/api/simulation/reset', (req, res) => {
  try {
    const { startBalance } = req.body;
    simulation.reset(startBalance || 1000);
    res.json({ message: 'Simülasyon sıfırlandı', balance: startBalance || 1000 });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Simülasyon Başlat ──────────────────────────
app.post('/api/simulation/start', (req, res) => {
  try {
    const eng = getEngine();
    if (!eng.running) {
      eng.start().then(() => {
        res.json({ message: '✅ Simülasyon başlatıldı' });
      }).catch(e => {
        res.status(500).json({ error: e.message });
      });
    } else {
      res.json({ message: 'Simülasyon zaten çalışıyor' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Simülasyon Durdur ──────────────────────────
app.post('/api/simulation/stop', (req, res) => {
  try {
    const eng = getEngine();
    if (eng.running) {
      eng.stop();
      res.json({ message: '⏹️ Simülasyon durduruldu' });
    } else {
      res.json({ message: 'Simülasyon zaten durmuş' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Makine Raporu ──────────────────────────────
app.get('/api/machine/report', (req, res) => {
  try {
    const eng = getEngine();
    const stats = simulation.getStats();
    
    if (eng.getMachineReport) {
      res.json(eng.getMachineReport());
    } else {
      res.json({
        bot: {
          running: eng.running,
          scanCount: eng.scanCount,
          btcTrend: eng.btcTrend
        },
        machine: {
          adaptiveThreshold: stats.adaptiveThreshold || 70,
          consecutiveLosses: stats.consecutiveLosses || 0
        },
        performance: {
          signalsGenerated: eng.performance?.signalsGenerated || 0,
          signalsAccepted: eng.performance?.signalsAccepted || 0,
          signalsRejected: eng.performance?.signalsRejected || 0,
          acceptanceRate: eng.performance?.signalsGenerated > 0 
            ? (eng.performance.signalsAccepted / eng.performance.signalsGenerated * 100).toFixed(1) 
            : 0
        },
        simulation: stats
      });
    }
  } catch(e) {
    res.json({ bot: {}, machine: {}, performance: {}, simulation: {} });
  }
});

// ── Backtest ───────────────────────────────────
app.post('/api/backtest', async (req, res) => {
  try {
    const backtest = require('./src/backtest');
    const params = {
      symbols: req.body.symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT'],
      interval: req.body.interval || '4h',
      days: parseInt(req.body.days || 30),
      stopLoss: parseFloat(req.body.stopLoss || 2.0),
      trailingStop: parseFloat(req.body.trailingStop || 0.5),
      minProfit: parseFloat(req.body.minProfit || 1.5),
      commission: parseFloat(req.body.commission || 0.1),
      slippage: parseFloat(req.body.slippage || 0.05),
      minScore: parseInt(req.body.minScore || 50),
      tradeAmount: parseFloat(req.body.tradeAmount || 100),
      maxPositions: parseInt(req.body.maxPositions || 3),
      epochs: parseInt(req.body.epochs || 3),
      trainSplit: parseFloat(req.body.trainSplit || 0.70),
      machineConfidenceMin: parseFloat(req.body.machineConfidenceMin || 0.70),
      enableLearning: req.body.enableLearning !== false
    };

    console.log('[BACKTEST] Başlatılıyor... ' + params.symbols.length + ' coin, ' + params.days + ' gün, ' + params.epochs + ' epoch');
    const results = await backtest.run(params);
    res.json(results);
  } catch(e) {
    console.error('[BACKTEST] Hata:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Ayarlar ────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch(e) {
    res.json({});
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, String(value));
    }
    res.json({ message: '✅ Ayarlar kaydedildi' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Pozisyonlar ────────────────────────────────
app.get('/api/positions', (req, res) => {
  try {
    const positions = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC LIMIT 50").all();
    res.json(positions);
  } catch(e) {
    res.json([]);
  }
});

// ── Tarama Logları ─────────────────────────────
app.get('/api/scan-logs', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT 20').all();
    res.json(logs);
  } catch(e) {
    res.json([]);
  }
});

// ── GERÇEK İŞLEM BAŞLAT ───────────────────────
app.post('/api/bot/start', async (req, res) => {
  try {
    const eng = getEngine();
    if (!eng.running) {
      await eng.start();
      res.json({ message: '🚀 GERÇEK işlem botu başlatıldı!', running: true });
    } else {
      res.json({ message: 'Bot zaten çalışıyor', running: true });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GERÇEK İŞLEM DURDUR ───────────────────────
app.post('/api/bot/stop', (req, res) => {
  try {
    const eng = getEngine();
    if (eng.running) {
      eng.stop();
      res.json({ message: '⏹️ GERÇEK işlem botu durduruldu!', running: false });
    } else {
      res.json({ message: 'Bot zaten durmuş', running: false });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MANUEL TARAMA ─────────────────────────────
app.post('/api/bot/scan', async (req, res) => {
  try {
    const eng = getEngine();
    await eng.updateBTCTrend();
    await eng.scan();
    res.json({ message: '✅ Tarama tamamlandı' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Frontend (React build) ─────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ 
      message: '🚀 Trading Bot API v21', 
      status: 'running',
      endpoints: ['/api/status', '/api/signals', '/api/simulation/stats', '/api/machine/report', '/api/backtest', '/api/settings', '/api/positions'],
      frontend: 'Build bulunamadı. cd frontend && npm run build'
    });
  }
});

// ═══════════════════════════════════════════════
// BAŞLAT
// ═══════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log('📊 Trading Bot v21 — Makine Zekası Aktif');
  
  // Botu otomatik başlat
  const eng = getEngine();
  eng.start().catch(e => {
    console.error('Bot başlatma hatası:', e.message);
  });
});
