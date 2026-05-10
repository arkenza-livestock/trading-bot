/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   DATABASE.JS - PROFESYONELsqlite3 VERİTABANI (sql.js - Pure JS)
 *   
 *   💼 Features:
 *   - Gerçek SQL database
 *   - ACID transactions
 *   - Indexes support
 *   - Full query support
 *   - Persistent storage
 *   - No native dependency (Pure JavaScript)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
  constructor(dbPath = './data/trading.db') {
    this.dbPath = dbPath;
    this.dir = path.dirname(dbPath);
    this.db = null;
    this.SQL = null;
    this.initialized = false;

    // Senkron başlangıç yerine async kullan
    this.initAsync();
  }

  /**
   * DATABASE'İ ASYNC BAŞLAT
   */
  async initAsync() {
    try {
      // Dizin oluştur
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true });
        console.log(`[DB] 📁 Dizin oluşturuldu: ${this.dir}`);
      }

      // SQL.js'i başlat
      this.SQL = await initSqlJs();

      // Veritabanını yükle veya oluştur
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        console.log(`[DB] ✅ Database yüklendi: ${this.dbPath}`);
      } else {
        this.db = new this.SQL.Database();
        console.log(`[DB] ✅ Yeni database oluşturuldu: ${this.dbPath}`);
      }

      // Tabloları oluştur
      this.initializeTables();

      // İlk kaydı oluştur (wallet)
      this.ensureWalletExists();

      // Kaydı yap
      this.save();

      this.initialized = true;
      console.log(`[DB] ✅ DATABASE HAZIR - Professional SQLite`);
    } catch (e) {
      console.error('[DB] ❌ Database başlatma hatası:', e.message);
      process.exit(1);
    }
  }

  /**
   * TABLOLARI OLUŞTUR
   */
  initializeTables() {
    try {
      // Sim wallet
      this.db.run(`
        CREATE TABLE IF NOT EXISTS sim_wallet (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          balance REAL DEFAULT 1000,
          total_pnl REAL DEFAULT 0,
          total_trades INTEGER DEFAULT 0,
          winning_trades INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Sim positions
      this.db.run(`
        CREATE TABLE IF NOT EXISTS sim_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL UNIQUE,
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
          opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          closed_at DATETIME,
          processed_feedback INTEGER DEFAULT 0
        )
      `);

      // Scan logs
      this.db.run(`
        CREATE TABLE IF NOT EXISTS scan_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          coin_count INTEGER,
          signal_count INTEGER,
          duration_ms INTEGER,
          machine_accepted INTEGER,
          machine_rejected INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Settings
      this.db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Real positions
      this.db.run(`
        CREATE TABLE IF NOT EXISTS real_positions (
          symbol TEXT PRIMARY KEY,
          side TEXT,
          quantity REAL,
          entry_price REAL,
          highest_price REAL,
          lowest_price REAL,
          stop_loss REAL,
          entry_time DATETIME,
          machine_confidence REAL
        )
      `);

      // Signals
      this.db.run(`
        CREATE TABLE IF NOT EXISTS signals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT,
          signal_type TEXT,
          score INTEGER,
          risk TEXT,
          price REAL,
          rsi REAL,
          trend TEXT,
          positive_signals TEXT,
          negative_signals TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Machine patterns
      this.db.run(`
        CREATE TABLE IF NOT EXISTS machine_patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT,
          pattern_data TEXT,
          outcome TEXT,
          return_pct REAL,
          similarity REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Machine weights
      this.db.run(`
        CREATE TABLE IF NOT EXISTS machine_weights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          weights_data TEXT,
          threshold REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[DB] ✅ 8 tablo oluşturuldu');
    } catch (e) {
      console.error('[DB] Tablo oluşturma hatası:', e.message);
    }
  }

  /**
   * İLK WALLET'I OLUŞTUR
   */
  ensureWalletExists() {
    try {
      const result = this.db.exec('SELECT * FROM sim_wallet LIMIT 1');
      if (!result || result.length === 0 || result[0].values.length === 0) {
        this.db.run('INSERT INTO sim_wallet (balance, total_pnl, total_trades) VALUES (?, ?, ?)', [1000, 0, 0]);
      }
    } catch (e) {
      console.warn('[DB] Wallet ensure hatası:', e.message);
    }
  }

  /**
   * VERITABANINI DOSYAYA KAYDET
   */
  save() {
    try {
      if (!this.db) return false;
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      return true;
    } catch (e) {
      console.error('[DB] Save hatası:', e.message);
      return false;
    }
  }

  /**
   * PREPARE (SQL statement hazırla)
   */
  prepare(sql) {
    if (!this.db) return null;
    return {
      run: (...params) => {
        try {
          this.db.run(sql, params);
          this.save();
        } catch (e) {
          console.error('[DB] Run hatası:', e.message);
        }
      },
      get: (...params) => {
        try {
          const result = this.db.exec(sql, params);
          if (result && result[0] && result[0].values && result[0].values.length > 0) {
            const columns = result[0].columns;
            const values = result[0].values[0];
            const row = {};
            columns.forEach((col, i) => {
              row[col] = values[i];
            });
            return row;
          }
          return null;
        } catch (e) {
          console.error('[DB] Get hatası:', e.message);
          return null;
        }
      },
      all: (...params) => {
        try {
          const result = this.db.exec(sql, params);
          if (result && result[0]) {
            const columns = result[0].columns;
            return result[0].values.map(values => {
              const row = {};
              columns.forEach((col, i) => {
                row[col] = values[i];
              });
              return row;
            });
          }
          return [];
        } catch (e) {
          console.error('[DB] All hatası:', e.message);
          return [];
        }
      }
    };
  }

  /**
   * AYAR AL
   */
  getSetting(key) {
    const stmt = this.prepare('SELECT value FROM settings WHERE key = ?');
    if (!stmt) return null;
    const result = stmt.get(key);
    return result ? result.value : null;
  }

  /**
   * AYAR SET ET
   */
  setSetting(key, value) {
    const stmt = this.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    if (stmt) stmt.run(key, value);
  }

  /**
   * BAŞLANGIÇ AYARLARI SET ET
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
      if (!this.getSetting(key)) {
        this.setSetting(key, value);
      }
    }

    console.log('[DB] ✅ Başlangıç ayarları set edildi');
  }

  /**
   * CÜZDAN BİLGİSİ AL
   */
  getWallet() {
    const stmt = this.prepare('SELECT * FROM sim_wallet ORDER BY id DESC LIMIT 1');
    if (!stmt) return { balance: 1000, total_pnl: 0, total_trades: 0 };
    return stmt.get() || { balance: 1000, total_pnl: 0, total_trades: 0 };
  }

  /**
   * AÇIK POZİSYONLAR
   */
  getOpenPositions() {
    const stmt = this.prepare("SELECT * FROM sim_positions WHERE status = 'OPEN'");
    if (!stmt) return [];
    return stmt.all() || [];
  }

  /**
   * KAPALI POZİSYONLAR
   */
  getClosedPositions(limit = 50) {
    const stmt = this.prepare("SELECT * FROM sim_positions WHERE status = 'CLOSED' ORDER BY closed_at DESC LIMIT ?");
    if (!stmt) return [];
    return stmt.all(limit) || [];
  }

  /**
   * SON SİNYALLER
   */
  getRecentSignals(limit = 100) {
    const stmt = this.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?');
    if (!stmt) return [];
    return stmt.all(limit) || [];
  }

  /**
   * SON TARAMALAR
   */
  getRecentScans(limit = 100) {
    const stmt = this.prepare('SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT ?');
    if (!stmt) return [];
    return stmt.all(limit) || [];
  }

  /**
   * İSTATİSTİKLER
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
      console.error('[DB] Stats hatası:', e.message);
      return null;
    }
  }

  /**
   * BACKUP AL
   */
  backup() {
    try {
      const backupDir = path.join(this.dir, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `backup-${timestamp}.db`);
      
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(backupFile, buffer);
      
      console.log(`[DB] ✅ Backup alındı: ${backupFile}`);
      return true;
    } catch (e) {
      console.error('[DB] Backup hatası:', e.message);
      return false;
    }
  }

  /**
   * POZİSYONLARI SİL
   */
  clearPositions() {
    try {
      this.db.run('DELETE FROM sim_positions');
      this.db.run('DELETE FROM sim_wallet');
      this.db.run('INSERT INTO sim_wallet (balance, total_pnl, total_trades) VALUES (?, ?, ?)', [1000, 0, 0]);
      this.save();
      console.log('[DB] ⚠️  Pozisyonlar silindi');
    } catch (e) {
      console.error('[DB] Clear hatası:', e.message);
    }
  }

  /**
   * KAPAT
   */
  close() {
    try {
      this.save();
      if (this.db) this.db.close();
      console.log('[DB] ✅ Database kapatıldı');
    } catch (e) {
      console.error('[DB] Close hatası:', e.message);
    }
  }
}

// Singleton
let dbInstance = null;

async function getDatabase(dbPath = './data/trading.db') {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(dbPath);
    // Async init'in bitmesini bekle
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (dbInstance.initialized) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }
  return dbInstance;
}

module.exports = { getDatabase, DatabaseManager };
