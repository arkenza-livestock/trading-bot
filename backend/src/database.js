const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Türkiye saat dilimi
process.env.TZ = 'Europe/Istanbul';

// Data klasörü yoksa oluştur
const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('[DB] Data klasörü oluşturuldu:', dbDir);
}

const dbPath = path.join(dbDir, 'trading.db');
const db = new Database(dbPath);

// WAL modu - daha hızlı okuma/yazma
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ═══════════════════════════════════════════════════════════
// TABLOLARI OLUŞTUR / GÜNCELLE
// ═══════════════════════════════════════════════════════════

function initDatabase() {
  // Ayarlar
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sinyaller
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      signal_type TEXT DEFAULT 'BEKLE',
      score INTEGER DEFAULT 0,
      risk TEXT DEFAULT 'ORTA',
      price REAL,
      fiyat REAL,
      rsi REAL,
      macd INTEGER DEFAULT 0,
      trend TEXT,
      positive_signals TEXT,
      negative_signals TEXT,
      ai_comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tarama logları
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coin_count INTEGER DEFAULT 0,
      signal_count INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      signals_found TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Simülasyon cüzdan
  db.exec(`
    CREATE TABLE IF NOT EXISTS sim_wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance REAL DEFAULT 1000,
      total_pnl REAL DEFAULT 0,
      total_trades INTEGER DEFAULT 0,
      winning_trades INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Simülasyon pozisyonlar
  db.exec(`
    CREATE TABLE IF NOT EXISTS sim_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      side TEXT DEFAULT 'LONG',
      quantity REAL,
      entry_price REAL,
      current_price REAL,
      exit_price REAL,
      stop_loss REAL,
      take_profit REAL,
      highest_price REAL,
      lowest_price REAL,
      pnl REAL DEFAULT 0,
      pnl_percent REAL DEFAULT 0,
      status TEXT DEFAULT 'OPEN',
      signal_guc TEXT DEFAULT 'NORMAL',
      trend4H TEXT,
      trend1D TEXT,
      score INTEGER DEFAULT 0,
      machine_confidence REAL DEFAULT 0,
      close_reason TEXT,
      opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP
    )
  `);

  // Makine öğrenme - desenler
  db.exec(`
    CREATE TABLE IF NOT EXISTS machine_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      pattern_data TEXT,
      outcome TEXT,
      return_pct REAL,
      similarity REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Makine öğrenme - sinyaller
  db.exec(`
    CREATE TABLE IF NOT EXISTS machine_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      action TEXT,
      confidence REAL,
      reasoning TEXT,
      expected_return REAL,
      stop_loss REAL,
      take_profit REAL,
      similar_patterns INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Makine öğrenme - geri bildirim
  db.exec(`
    CREATE TABLE IF NOT EXISTS machine_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      signal_timestamp INTEGER,
      actual_return REAL,
      max_favorable REAL,
      max_adverse REAL,
      profitable INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Makine öğrenme - ağırlıklar
  db.exec(`
    CREATE TABLE IF NOT EXISTS machine_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weights_data TEXT,
      threshold REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Backtest sonuçları
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      summary TEXT,
      params TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ═══════════════════════════════════════════════
  // MIGRATION: Eski tablolara yeni sütunlar ekle
  // ═══════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════
  // VARSAYILAN AYARLAR
  // ═══════════════════════════════════════════════

  const defaultSettings = {
    min_volume: '10000000',
    max_coins: '50',
    min_score: '40',
    scan_interval: '20',
    trade_amount_usdt: '100',
    max_open_positions: '3',
    stop_loss_percent: '2.0',
    trailing_stop_percent: '0.5',
    min_profit_percent: '1.5',
    telegram_min_score: '60',
    telegram_min_machine_confidence: '0.75',
    sim_balance: '1000',
    machine_confidence_min: '0.70',
    machine_learning_enabled: 'true',
    binance_api_key: '',
    binance_api_secret: '',
    telegram_token: '',
    telegram_chat_id: '',
    real_trading: 'false',
    github_sync_enabled: 'false'
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // İlk cüzdan
  const walletExists = db.prepare('SELECT COUNT(*) as count FROM sim_wallet').get();
  if (walletExists.count === 0) {
    db.prepare('INSERT INTO sim_wallet (balance) VALUES (1000)').run();
  }

  console.log('[DB] ✅ Veritabani hazir:', dbPath);
}

// ═══════════════════════════════════════════════
// MAKİNE ÖĞRENMESİ İÇİN YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════

function saveMachinePattern(symbol, patternData, outcome, returnPct, similarity) {
  return db.prepare('INSERT INTO machine_patterns (symbol, pattern_data, outcome, return_pct, similarity) VALUES (?,?,?,?,?)')
    .run(symbol, JSON.stringify(patternData), outcome, returnPct, similarity);
}

function saveMachineSignal(symbol, action, confidence, reasoning, expectedReturn, stopLoss, takeProfit, similarPatterns) {
  return db.prepare('INSERT INTO machine_signals (symbol, action, confidence, reasoning, expected_return, stop_loss, take_profit, similar_patterns) VALUES (?,?,?,?,?,?,?,?)')
    .run(symbol, action, confidence, reasoning, expectedReturn, stopLoss, takeProfit, similarPatterns);
}

function saveMachineFeedback(symbol, signalTimestamp, actualReturn, maxFavorable, maxAdverse) {
  return db.prepare('INSERT INTO machine_feedback (symbol, signal_timestamp, actual_return, max_favorable, max_adverse, profitable) VALUES (?,?,?,?,?,?)')
    .run(symbol, signalTimestamp, actualReturn, maxFavorable, maxAdverse, actualReturn > 0 ? 1 : 0);
}

function saveMachineWeights(weightsData, threshold) {
  return db.prepare('INSERT INTO machine_weights (weights_data, threshold) VALUES (?,?)')
    .run(JSON.stringify(weightsData), threshold);
}

function getLatestMachineWeights() {
  return db.prepare('SELECT * FROM machine_weights ORDER BY id DESC LIMIT 1').get();
}

function getMachineFeedbackStats(limit = 50) {
  const feedback = db.prepare('SELECT * FROM machine_feedback ORDER BY id DESC LIMIT ?').all(limit);
  const total = feedback.length;
  const wins = feedback.filter(f => f.profitable === 1).length;
  const avgReturn = total > 0 ? feedback.reduce((s, f) => s + f.actual_return, 0) / total : 0;
  return { total, wins, losses: total - wins, winRate: total > 0 ? (wins/total*100).toFixed(1) : 0, avgReturn: avgReturn.toFixed(2) };
}

function clearMachineData() {
  db.prepare('DELETE FROM machine_patterns').run();
  db.prepare('DELETE FROM machine_signals').run();
  db.prepare('DELETE FROM machine_feedback').run();
  db.prepare('DELETE FROM machine_weights').run();
  console.log('[DB] Makine verileri temizlendi');
}

// Başlat
initDatabase();

// Export
module.exports = db;
module.exports.saveMachinePattern = saveMachinePattern;
module.exports.saveMachineSignal = saveMachineSignal;
module.exports.saveMachineFeedback = saveMachineFeedback;
module.exports.saveMachineWeights = saveMachineWeights;
module.exports.getLatestMachineWeights = getLatestMachineWeights;
module.exports.getMachineFeedbackStats = getMachineFeedbackStats;
module.exports.clearMachineData = clearMachineData;
