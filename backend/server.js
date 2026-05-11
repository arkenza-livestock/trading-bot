/**
 * ════════════════════════════════════════════════════════════════════
 *   SERVER.JS - WEB PANEL + MANUEL TARAMA BUTONU
 *   Express.js ile HTTP API ve Web Arayüzü
 * ════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const path = require('path');
const engine = require('./engine');
const simulation = require('./simulation');
const db = require('./database');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════════════════════════════
//  API ENDPOINT'LERİ
// ════════════════════════════════════════════════════════════════════

/**
 * 🟢 MANUEL TARAMA BUTONU
 */
app.post('/api/scan', async (req, res) => {
  try {
    const force = req.body?.force === true;
    
    if (!engine.running) {
      return res.json({ 
        success: false, 
        message: '❌ Bot şu anda çalışmıyor. Önce botu başlatın.' 
      });
    }

    const now = Date.now();
    const lastScan = engine.lastScanTime || 0;
    const minInterval = force ? 0 : 30000;

    if (now - lastScan < minInterval && !force) {
      const waitSec = Math.ceil((minInterval - (now - lastScan)) / 1000);
      return res.json({ 
        success: false, 
        message: `⏳ Lütfen ${waitSec} saniye bekleyin. Acele tarama için "Zorla Tara" butonunu kullanın.` 
      });
    }

    res.json({ 
      success: true, 
      message: '🔍 Tarama başlatıldı! Sonuçlar konsolda görünecek...',
      btcTrend: engine.btcTrend
    });

    console.log('\n🟡 [MANUEL TARAMA] Kullanıcı tarafından başlatıldı...');
    engine.lastScanTime = Date.now();
    
    try {
      await engine.updateBTCTrend();
      await engine.scan();
      console.log('🟢 [MANUEL TARAMA] Tamamlandı!');
    } catch (e) {
      console.error('🔴 [MANUEL TARAMA] Hata:', e.message);
    }

  } catch (e) {
    console.error('[API /scan] Hata:', e.message);
    res.status(500).json({ success: false, message: 'Sunucu hatası: ' + e.message });
  }
});

/**
 * 📊 BOT DURUMU
 */
app.get('/api/status', (req, res) => {
  try {
    const simStats = simulation.getStats();
    const settings = engine.getSettings();
    
    const status = {
      bot: {
        running: engine.running,
        scanCount: engine.scanCount || 0,
        lastScanTime: engine.lastScanTime || null,
        lastScanAgo: engine.lastScanTime ? Math.floor((Date.now() - engine.lastScanTime) / 1000) : null,
        btcTrend: engine.btcTrend || { trend: 'BELIRSIZ', rsi: 50 },
        scanIntervalMin: parseInt(settings.scan_interval || 20),
        realTrading: settings.real_trading === 'true' || settings.real_trading === '1',
        longEnabled: settings.long_enabled === 'true' || settings.long_enabled === '1' || settings.long_enabled === undefined,
        shortEnabled: settings.short_enabled === 'true' || settings.short_enabled === '1'
      },
      machine: {
        adaptiveThreshold: simulation.getAdaptiveThreshold ? 
          (simulation.getAdaptiveThreshold() * 100).toFixed(1) : 70,
        consecutiveLosses: simStats.consecutiveLosses || 0
      },
      performance: {
        signalsGenerated: engine.performance?.signalsGenerated || 0,
        signalsAccepted: engine.performance?.signalsAccepted || 0,
        signalsRejected: engine.performance?.signalsRejected || 0,
        acceptanceRate: engine.performance?.signalsGenerated > 0 ? 
          ((engine.performance.signalsAccepted / engine.performance.signalsGenerated) * 100).toFixed(1) : 0
      },
      simulation: {
        balance: simStats.balance || 0,
        startBalance: simStats.startBalance || 1000,
        totalPnl: simStats.totalPnl || 0,
        totalPnlPct: simStats.totalPnlPct || 0,
        totalTrades: simStats.totalTrades || 0,
        openTrades: simStats.openTrades || 0,
        wins: simStats.wins || 0,
        losses: simStats.losses || 0,
        winRate: simStats.winRate || 0,
        profitFactor: simStats.profitFactor || 0,
        avgWin: simStats.avgWin || 0,
        avgLoss: simStats.avgLoss || 0,
        sharpeRatio: simStats.sharpeRatio || 0,
        maxDrawdown: simStats.maxDrawdown || 0,
        openPositions: simStats.openPositions || [],
        recentTrades: simStats.recentTrades?.slice(0, 10) || []
      },
      realPositions: Object.keys(engine.realPositions || {}).length,
      serverTime: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
    };

    res.json({ success: true, data: status });
  } catch (e) {
    console.error('[API /status] Hata:', e.message);
    res.status(500).json({ success: false, message: 'Durum alınamadı: ' + e.message });
  }
});

/**
 * 📋 SON SİNYALLER
 */
app.get('/api/signals', (req, res) => {
  try {
    const signals = db.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT 50').all();
    res.json({ success: true, data: signals });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Sinyaller alınamadı' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  SERVER BAŞLAT
// ════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(55));
  console.log(`  🌐 WEB PANEL AKTİF: http://localhost:${PORT}`);
  console.log(`  📊 API Durum: http://localhost:${PORT}/api/status`);
  console.log(`  🔍 API Tarama: POST http://localhost:${PORT}/api/scan`);
  console.log('═'.repeat(55) + '\n');
});

module.exports = app;
