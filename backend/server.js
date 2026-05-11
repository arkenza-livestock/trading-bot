const express = require('express');
const path = require('path');
const fs = require('fs');

// Mevcut dizindeki tüm .js dosyalarını listele
console.log('\n📁 /app/backend/ içindeki dosyalar:');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js'));
files.forEach(f => console.log('   - ' + f));
console.log('');

// Modülleri dene-yükle
let engine, simulation, db;

try {
  engine = require('./engine');
  console.log('✅ engine.js yüklendi');
} catch(e) {
  console.log('❌ engine.js bulunamadı, alternatifler deneniyor...');
  try { engine = require('./Engine'); console.log('✅ Engine.js yüklendi'); } catch(e) {}
  try { engine = require('./trading'); console.log('✅ trading.js yüklendi'); } catch(e) {}
  try { engine = require('./bot'); console.log('✅ bot.js yüklendi'); } catch(e) {}
  try { engine = require('./index'); console.log('✅ index.js yüklendi'); } catch(e) {}
  try { engine = require('./main'); console.log('✅ main.js yüklendi'); } catch(e) {}
}

try {
  simulation = require('./simulation');
  console.log('✅ simulation.js yüklendi');
} catch(e) {
  console.log('❌ simulation.js bulunamadı');
  try { simulation = require('./Simulation'); console.log('✅ Simulation.js yüklendi'); } catch(e) {}
}

try {
  db = require('./database');
  console.log('✅ database.js yüklendi');
} catch(e) {
  console.log('❌ database.js bulunamadı');
  try { db = require('./Database'); console.log('✅ Database.js yüklendi'); } catch(e) {}
  try { db = require('./db'); console.log('✅ db.js yüklendi'); } catch(e) {}
}

// Eksik modül kontrolü
if (!engine) {
  console.error('\n🔴 HATA: engine modülü yüklenemedi!');
  console.error('Lütfen /app/backend/ içindeki ana bot dosyasının gerçek adını söyleyin.');
  process.exit(1);
}

if (!simulation) {
  console.error('\n🔴 HATA: simulation modülü yüklenemedi!');
  process.exit(1);
}

if (!db) {
  console.error('\n🔴 HATA: database modülü yüklenemedi!');
  process.exit(1);
}

console.log('\n✅ Tüm modüller başarıyla yüklendi!\n');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/scan', async (req, res) => {
  try {
    const force = req.body?.force === true;
    
    if (!engine.running) {
      return res.json({ success: false, message: '❌ Bot çalışmıyor' });
    }

    const now = Date.now();
    const lastScan = engine.lastScanTime || 0;
    const minInterval = force ? 0 : 30000;

    if (now - lastScan < minInterval && !force) {
      const waitSec = Math.ceil((minInterval - (now - lastScan)) / 1000);
      return res.json({ success: false, message: `⏳ ${waitSec} saniye bekleyin` });
    }

    res.json({ success: true, message: '🔍 Tarama başlatıldı!' });
    
    console.log('\n🟡 [MANUEL TARAMA] Başlatıldı...');
    engine.lastScanTime = Date.now();
    
    engine.updateBTCTrend()
      .then(() => engine.scan())
      .then(() => console.log('🟢 [MANUEL TARAMA] Tamamlandı!'))
      .catch(e => console.error('🔴 [MANUEL TARAMA] Hata:', e.message));

  } catch (e) {
    res.status(500).json({ success: false, message: 'Hata: ' + e.message });
  }
});

app.get('/api/status', (req, res) => {
  try {
    const simStats = simulation.getStats();
    const settings = engine.getSettings();
    
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

app.listen(PORT, () => {
  console.log('═'.repeat(50));
  console.log(`🌐 Panel: http://localhost:${PORT}`);
  console.log(`🔍 Tarama: POST http://localhost:${PORT}/api/scan`);
  console.log('═'.repeat(50));
});

module.exports = app;
