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

  CREATE TABLE IF NOT EXISTS scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coin_count INTEGER DEFAULT 0,
    signal_count INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    signals_found TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const defaultSettings = {
  min_volume: '1000000',
  min_change: '-50',
  max_change: '50',
  max_coins: '50',
  min_score: '10',
  rsi_period: '7',
  rsi_oversold: '50',
  rsi_overbought: '75',
  candle_interval: '5m',
  candle_limit: '50',
  sr_lookback: '20',
  trade_amount_usdt: '100',
  max_open_positions: '5',
  stop_loss_percent: '0.75',
  take_profit_percent: '1.5',
  trailing_stop_percent: '0.5',
  min_profit_percent: '0.5',
  time_stop_minutes: '60',
  max_daily_loss_percent: '5',
  max_daily_trades: '20',
  commission_rate: '0.1',
  slippage_rate: '0.05',
  auto_trade_enabled: 'false',
  binance_api_key: '',
  binance_api_secret: '',
  groq_api_key: '',
  telegram_token: '',
  telegram_chat_id: '',
  check_interval: '5'
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

module.exports = db;
