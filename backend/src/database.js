const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

process.env.TZ = 'Europe/Istanbul';

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('[DB] Data klasörü oluşturuldu:', dbDir);
}

const dbPath = path.join(dbDir, 'trading.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, signal_type TEXT DEFAULT 'BEKLE', score INTEGER DEFAULT 0, risk TEXT DEFAULT 'ORTA', price REAL, fiyat REAL, rsi REAL, macd INTEGER DEFAULT 0, trend TEXT, positive_signals TEXT, negative_signals TEXT, ai_comment TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS scan_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, coin_count INTEGER DEFAULT 0, signal_count INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, signals_found TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS sim_wallet (id INTEGER PRIMARY KEY AUTOINCREMENT, balance REAL DEFAULT 1000, total_pnl REAL DEFAULT 0, total_trades INTEGER DEFAULT 0, winning_trades INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS sim_positions (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, side TEXT DEFAULT 'LONG', quantity REAL, entry_price REAL, current_price REAL, exit_price REAL, stop_loss REAL, take_profit REAL, highest_price REAL, lowest_price REAL, pnl REAL DEFAULT 0, pnl_percent REAL DEFAULT 0, status TEXT DEFAULT 'OPEN', signal_guc TEXT DEFAULT 'NORMAL', trend4H TEXT, trend1D TEXT, score INTEGER DEFAULT 0, machine_confidence REAL DEFAULT 0, close_reason TEXT, opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMP)`);

  // ═══ GERÇEK POZİSYONLAR (K3) ═══
  db.exec(`
    CREATE TABLE IF NOT EXISTS real_positions (
      symbol TEXT PRIMARY KEY,
      side TEXT DEFAULT 'LONG',
      quantity REAL,
      entry_price REAL,
      highest_price REAL,
      lowest_price REAL,
      stop_loss REAL,
      entry_time TEXT,
      machine_confidence REAL DEFAULT 0
    )
  `);

  db.exec(`CREATE TABLE IF NOT EXISTS machine_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, pattern_data TEXT, outcome TEXT, return_pct REAL, similarity REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS machine_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, action TEXT, confidence REAL, reasoning TEXT, expected_return REAL, stop_loss REAL, take_profit REAL, similar_patterns INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS machine_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, signal_timestamp INTEGER, actual_return REAL, max_favorable REAL, max_adverse REAL, profitable INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS machine_weights (id INTEGER PRIMARY KEY AUTOINCREMENT, weights_data TEXT, threshold REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS backtest_results (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, summary TEXT, params TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

  try { db.exec(`ALTER TABLE signals ADD COLUMN machine_confidence REAL DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE signals ADD COLUMN machine_action TEXT DEFAULT 'WAIT'`); } catch(e) {}
  try { db.exec(`ALTER TABLE signals ADD COLUMN machine_reasoning TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE signals ADD COLUMN similar_patterns INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE signals ADD COLUMN expected_return REAL DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE sim_positions ADD COLUMN machine_confidence REAL DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE sim_positions ADD COLUMN take_profit REAL`); } catch(e) {}
  try { db.exec(`ALTER TABLE scan_logs ADD COLUMN machine_accepted INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE scan_logs ADD COLUMN machine_rejected INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE scan_logs ADD COLUMN rejection_reasons TEXT DEFAULT '{}'`); } catch(e) {}

  const defaultSettings = {
    min_volume: '10000000', max_coins: '50', min_score: '40', scan_interval: '20',
    trade_amount_usdt: '100', max_open_positions: '3',
    stop_loss_percent: '2.0', trailing_stop_percent: '0.5', min_profit_percent: '1.5',
    telegram_min_score: '60', telegram_min_machine_confidence: '0.75',
    sim_balance: '1000', machine_confidence_min: '0.70', machine_learning_enabled: 'true',
    long_enabled: 'true',
    short_enabled: 'true', short_confidence_min: '0.85',
    binance_api_key: '', binance_api_secret: '',
    telegram_token: '', telegram_chat_id: '',
    real_trading: 'false', github_sync_enabled: 'false'
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) insertSetting.run(key, value);

  const walletExists = db.prepare('SELECT COUNT(*) as count FROM sim_wallet').get();
  if (walletExists.count === 0) db.prepare('INSERT INTO sim_wallet (balance) VALUES (1000)').run();

  console.log('[DB] ✅ Veritabani hazir:', dbPath);
}

initDatabase();

module.exports = db;
