const express = require('express');
const path = require('path');
const engine = require('./src/engine');
const simulation = require('./src/simulation');
const db = require('./src/database');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(express.json());

// React frontend'i serve et (MEVCUT ARAYÜZÜNÜZ)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));
app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

// ════════════════════════════════════════════════
//  API: MANUEL TARAMA (arka planda çalışır)
// ════════════════════════════════════════════════
app.post('/api/scan', async (req, res) => {
  try {
    if (!engine.running) {
      return res.json({ success: false, message: '❌ Bot çalışmıyor' });
    }

    res.json({ success: true, message: '🔍 Tarama başlatıldı!' });
    
    console.log('\n🟡 [MANUEL TARAMA] Başlatıldı...');
    engine.lastScanTime = Date.now();
    
    engine.updateBTCTrend()
      .then(() => engine.scan())
      .then(() => console.log('🟢 [MANUEL TARAMA] Tamamlandı!'))
      .catch(e => console.error('🔴 Hata:', e.message));

  } catch (e) {
    res.status(500).json({ success: false, message: 'Hata: ' + e.message });
  }
});

app.get('/api/status', (req, res) => {
  try {
    const simStats = simulation.getStats();
    res.json({
      success: true,
      data: {
        bot: {
          running: engine.running,
          scanCount: engine.scanCount || 0,
          btcTrend: engine.btcTrend || { trend: 'BELIRSIZ', rsi: 50 }
        },
        simulation: {
          balance: simStats.balance || 0,
          totalPnl: simStats.totalPnl || 0,
          totalTrades: simStats.totalTrades || 0,
          winRate: simStats.winRate || 0
        }
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Hata: ' + e.message });
  }
});

app.get('/api/signals', (req, res) => {
  try {
    const signals = db.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT 50').all();
    res.json({ success: true, data: signals });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Sinyaller alınamadı' });
  }
});

// React Router için fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('═'.repeat(50));
  console.log(`🌐 Panel: http://localhost:${PORT}`);
  console.log(`🔍 API Tarama: POST http://localhost:${PORT}/api/scan`);
  console.log('═'.repeat(50));
});

module.exports = app;
