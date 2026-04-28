const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../data/trading.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── TABLOLAR ──────────────────────────────────────────────

db.prepare(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  risk TEXT DEFAULT 'ORTA',
  price REAL NOT NULL,
  rsi REAL,
  macd INTEGER,
  trend TEXT,
  positive_signals TEXT,
  negative_signals TEXT,
  ai_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  side TEXT DEFAULT 'LONG',
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  current_price REAL,
  stop_loss REAL,
  take_profit REAL DEFAULT 0,
  pnl REAL DEFAULT 0,
  pnl_percent REAL DEFAULT 0,
  status TEXT DEFAULT 'OPEN',
  signal_id INTEGER,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  total REAL NOT NULL,
  binance_order_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (position_id) REFERENCES positions(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coin_count INTEGER DEFAULT 0,
  signal_count INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  signals_found TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// ── SİMÜLASYON TABLOLARI ─────────────────────────────────

db.prepare(`CREATE TABLE IF NOT EXISTS sim_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  side TEXT DEFAULT 'LONG',
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  current_price REAL,
  exit_price REAL,
  stop_loss REAL,
  highest_price REAL,
  lowest_price REAL,
  pnl REAL DEFAULT 0,
  pnl_percent REAL DEFAULT 0,
  status TEXT DEFAULT 'OPEN',
  signal_guc TEXT,
  trend4H TEXT,
  trend1D TEXT,
  score INTEGER DEFAULT 0,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  close_reason TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS sim_wallet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  balance REAL DEFAULT 1000,
  total_pnl REAL DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Simülasyon cüzdanı başlat
const simWallet = db.prepare('SELECT id FROM sim_wallet').get();
if (!simWallet) db.prepare('INSERT INTO sim_wallet (balance) VALUES (1000)').run();

// ── VARSAYILAN AYARLAR ────────────────────────────────────
const defaults = {
  candle_interval:        '1h',
  candle_limit:           '200',
  min_score:              '40',
  min_volume:             '1000000',
  max_coins:              '50',
  max_open_positions:     '5',
  trade_amount_usdt:      '100',
  stop_loss_percent:      '2.0',
  trailing_stop_percent:  '0.5',
  min_profit_percent:     '1.5',
  commission_rate:        '0.1',
  slippage_rate:          '0.05',
  auto_trade_enabled:     'false',
  telegram_token:         '',
  telegram_chat_id:       '',
  telegram_min_score:     '50',
  binance_api_key:        '',
  binance_api_secret:     '',
  max_daily_loss_percent: '5',
  max_daily_trades:       '20',
  time_stop_minutes:      '0',
  sr_lookback:            '20',
  rsi_period:             '14',
  sim_balance:            '1000',
  sim_enabled:            'true'
};

for (const [key, value] of Object.entries(defaults)) {
  const existing = db.prepare('SELECT key FROM settings WHERE key=?').get(key);
  if (!existing) db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key, value);
}

module.exports = db;
