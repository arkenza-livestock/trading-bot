/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   DATABASE.JS - SQLite VERİTABANI YÖNETİMİ
 *   
 *   📊 Tablolar:
 *   - sim_wallet: Simülasyon cüzdanı
 *   - sim_positions: Açık/kapalı pozisyonlar
 *   - scan_logs: Tarama logları
 *   - settings: Bot ayarları
 * ═══════════════════════════════════════════════════════════════════════════
 */

const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
  constructor(dbPath = './data/trading.db') {
    try {
      // Database dosyasını aç/oluştur
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');

      console.log(`[DB] ✅ Database hazır: ${dbPath}`);

      // Tabloları oluştur
      this.initializeTables();
    } catch (e) {
      console.error('[DB] Bağlantı hatası:', e.message);
      process.exit(1);
    }
  }

  /**
   * Veritabanı tablolarını oluştur
   */
  initializeTables() {
    try {
      // Simülasyon cüzdanı
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sim_wallet (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          balance REAL DEFAULT 1000,
          total_pnl REAL DEFAULT 0,
          total_trades INTEGER DEFAULT 0,
          winning_trades INTEGER DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Simülasyon pozisyonları
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sim_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          side TEXT NOT NULL,
          quantity REAL NOT NULL,
          entry_price REAL NOT NULL,
          current_price REAL NOT NULL,
          stop_loss REAL,
          take_profit REAL,
          highest_price REAL,
          lowest_price REAL,
          signal_confidence REAL,
          risk_reward_ratio REAL,
          pnl REAL,
          pnl_percent REAL,
          status TEXT DEFAULT 'OPEN',
          close_reason TEXT,
          opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          closed_at TIMESTAMP
        )
      `);

      // Tarama logları
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS scan_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          coin_count INTEGER,
          signal_count INTEGER,
          duration_ms INTEGER,
          machine_accepted INTEGER,
          machine_rejected INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Bot ayarları
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE,
          value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Real pozisyonlar
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS real_positions (
          symbol TEXT PRIMARY KEY,
          side TEXT,
          quantity REAL,
          entry_price REAL,
          highest_price REAL,
          lowest_price REAL,
          stop_loss REAL,
          entry_time TIMESTAMP,
          machine_confidence REAL
        )
      `);

      // Sinyaller (geçmiş)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS signals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT,
          signal_type TEXT,
          score INTEGER,
          risk TEXT,
          price REAL,
          fiyat REAL,
          rsi REAL,
          trend TEXT,
          positive_signals TEXT,
          negative_signals TEXT,
          ai_comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[DB] ✅ Tablolar oluşturuldu');
    } catch (e) {
      console.error('[DB] Tablo oluşturma hatası:', e.message);
    }
  }

  /**
   * Database nesnesi döndür (direct SQL erişim için)
   */
  getConnection() {
    return this.db;
  }

  /**
   * Prepare metodu (SQL hazırlama)
   */
  prepare(sql) {
    return this.db.prepare(sql);
  }

  /**
   * Transaction başlat
   */
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  /**
   * Başlangıç ayarlarını set et
   */
  setDefaultSettings() {
    const defaults = {
      'scan_interval': '20',
      'max_open_positions': '3',
      'trade_amount_usdt': '100',
      'trailing_stop_percent': '0.5',
      'min_profit_percent': '1.5',
      'stop_loss_percent': '2.0',
      'analysis_timeframe': '4h',
      'real_trading': 'false',
      'telegram_enabled': 'false'
    };

    for (const [key, value] of Object.entries(defaults)) {
      try {
        this.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
          .run(key, value);
      } catch (e) {
        // Zaten varsa, geç
      }
    }

    console.log('[DB] ✅ Başlangıç ayarları set edildi');
  }

  /**
   * Ayar al
   */
  getSetting(key) {
    try {
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Ayar set et
   */
  setSetting(key, value) {
    try {
      this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run(key, value);
    } catch (e) {
      console.error('[DB] Setting kaydedilemedi:', e.message);
    }
  }

  /**
   * Cüzdan bilgisi al
   */
  getWallet() {
    try {
      return this.db.prepare('SELECT * FROM sim_wallet ORDER BY id DESC LIMIT 1').get() 
        || { balance: 1000, total_pnl: 0, total_trades: 0 };
    } catch (e) {
      return { balance: 1000, total_pnl: 0, total_trades: 0 };
    }
  }

  /**
   * Açık pozisyonları getir
   */
  getOpenPositions() {
    try {
      return this.db.prepare("SELECT * FROM sim_positions WHERE status = 'OPEN'").all() || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Kapalı pozisyonları getir
   */
  getClosedPositions(limit = 50) {
    try {
      return this.db.prepare("SELECT * FROM sim_positions WHERE status = 'CLOSED' ORDER BY closed_at DESC LIMIT ?")
        .all(limit) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Son sinyalleri getir
   */
  getRecentSignals(limit = 100) {
    try {
      return this.db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?')
        .all(limit) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Son taramaları getir
   */
  getRecentScans(limit = 100) {
    try {
      return this.db.prepare('SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT ?')
        .all(limit) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Backup al
   */
  backup(backupPath = './data/trading.backup.db') {
    try {
      const fs = require('fs');
      const src = this.db.name;
      const dest = backupPath;

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`[DB] ✅ Backup alındı: ${dest}`);
        return true;
      }
    } catch (e) {
      console.error('[DB] Backup hatası:', e.message);
    }
    return false;
  }

  /**
   * Veritabanını kapat
   */
  close() {
    try {
      if (this.db) {
        this.db.close();
        console.log('[DB] ✅ Veritabanı kapatıldı');
      }
    } catch (e) {
      console.error('[DB] Kapatma hatası:', e.message);
    }
  }

  /**
   * Vacuum (optimize)
   */
  optimize() {
    try {
      this.db.exec('VACUUM');
      console.log('[DB] ✅ Veritabanı optimize edildi');
    } catch (e) {
      console.error('[DB] Optimize hatası:', e.message);
    }
  }

  /**
   * Tüm pozisyonları sil (test için)
   */
  clearPositions() {
    try {
      this.db.prepare("DELETE FROM sim_positions").run();
      this.db.prepare("DELETE FROM sim_wallet").run();
      console.log('[DB] ⚠️  Tüm pozisyonlar silindi');
    } catch (e) {
      console.error('[DB] Silme hatası:', e.message);
    }
  }

  /**
   * İstatistikleri al
   */
  getStats() {
    try {
      const wallet = this.getWallet();
      const closedPositions = this.getClosedPositions(999);
      const openPositions = this.getOpenPositions();

      const wins = closedPositions.filter(p => (p.pnl || 0) > 0);
      const totalPnL = closedPositions.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);

      return {
        wallet: wallet,
        totalTrades: closedPositions.length,
        openTrades: openPositions.length,
        wins: wins.length,
        losses: closedPositions.length - wins.length,
        winRate: closedPositions.length > 0 
          ? parseFloat(((wins.length / closedPositions.length) * 100).toFixed(1)) 
          : 0,
        totalPnL: parseFloat(totalPnL.toFixed(4)),
        totalPnLPercent: parseFloat(((totalPnL / (wallet?.balance || 1000)) * 100).toFixed(2))
      };
    } catch (e) {
      return null;
    }
  }
}

// Singleton instance
let dbInstance = null;

function getDatabase(dbPath) {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(dbPath);
  }
  return dbInstance;
}

module.exports = getDatabase();
