 const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../data/trading.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    score INTEGER NOT NULL,
    risk TEXT NOT NULL,
    price REAL NOT NULL,
    rsi REAL,
    macd REAL,
    trend TEXT,
    positive_signals TEXT,
    negative_signals TEXT,
    ai_comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    entry_price REAL NOT NULL,
    current_price REAL,
    stop_loss REAL,
    take_profit REAL,
    pnl REAL DEFAULT 0,
    pnl_percent REAL DEFAULT 0,
    status TEXT DEFAULT 'OPEN',
    signal_id INTEGER,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    binance_order_id TEXT,
    status TEXT DEFAULT 'FILLED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const defaultSettings = {
  min_volume: '5000000',
  min_change: '-50',
  max_change: '50',
  max_coins: '100',
  min_score: '50',
  rsi_oversold: '35',
  rsi_overbought: '65',
  trade_amount_usdt: '100',
  max_open_positions: '5',
  stop_loss_percent: '3',
  take_profit_percent: '5',
  auto_trade_enabled: 'false',
  binance_api_key: '',
  binance_api_secret: '',
  groq_api_key: '',
  check_interval: '20'
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

module.exports = db;
