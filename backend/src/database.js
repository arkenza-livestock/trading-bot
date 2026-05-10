const fs = require('fs');
const path = require('path');

/**
 * DATABASE - JSON Based (No sql.js needed)
 * Hızlı, basit, sıkıntısız
 */

class Database {
  constructor(dbDir = './data') {
    this.dir = dbDir;
    this.dataFile = path.join(dbDir, 'trading.json');
    this.settingsFile = path.join(dbDir, 'settings.json');

    // Dizin oluştur
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`[DB] 📁 Data directory: ${dbDir}`);
    }

    // Data yükle
    this.data = this.loadFile(this.dataFile) || {
      wallet: { balance: 1000, total_pnl: 0, total_trades: 0 },
      positions: [],
      signals: [],
      scans: []
    };

    this.settings = this.loadFile(this.settingsFile) || {
      scan_interval: '20',
      max_open_positions: '3',
      trade_amount_usdt: '100',
      trailing_stop_percent: '0.5',
      stop_loss_percent: '2.0',
      analysis_timeframe: '4h',
      real_trading: 'false'
    };

    this.save();
    console.log('[DB] ✅ Database initialized');
  }

  loadFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {
      console.warn(`[DB] Warning loading ${path.basename(filePath)}`);
    }
    return null;
  }

  save() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Save error:', e.message);
    }
  }

  // Settings
  getSetting(key) { return this.settings[key] || null; }
  setSetting(key, value) { this.settings[key] = value; this.save(); }
  setDefaultSettings() { this.save(); }

  // Wallet
  getWallet() { return this.data.wallet || { balance: 1000, total_pnl: 0 }; }
  updateWallet(updates) { 
    this.data.wallet = { ...this.data.wallet, ...updates };
    this.save();
  }

  // Positions
  getOpenPositions() { return this.data.positions.filter(p => p.status === 'OPEN'); }
  getClosedPositions(limit = 50) { return this.data.positions.filter(p => p.status === 'CLOSED').slice(-limit); }
  
  addPosition(pos) {
    pos.id = (this.data.positions.length || 0) + 1;
    pos.status = 'OPEN';
    pos.opened_at = new Date().toISOString();
    this.data.positions.push(pos);
    this.save();
    return pos.id;
  }

  updatePosition(id, updates) {
    const pos = this.data.positions.find(p => p.id === id);
    if (pos) {
      Object.assign(pos, updates);
      if (updates.status === 'CLOSED') pos.closed_at = new Date().toISOString();
      this.save();
    }
  }

  // Signals
  getRecentSignals(limit = 100) { return (this.data.signals || []).slice(-limit); }
  addSignal(signal) {
    if (!this.data.signals) this.data.signals = [];
    signal.created_at = new Date().toISOString();
    this.data.signals.push(signal);
    if (this.data.signals.length > 1000) this.data.signals = this.data.signals.slice(-1000);
    this.save();
  }

  // Stats
  getStats() {
    const closed = this.getClosedPositions(999);
    const wins = closed.filter(p => (p.pnl || 0) > 0);
    const totalPnL = closed.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
    const wallet = this.getWallet();

    return {
      wallet,
      totalTrades: closed.length,
      openTrades: this.getOpenPositions().length,
      wins: wins.length,
      losses: closed.length - wins.length,
      winRate: closed.length > 0 
        ? parseFloat(((wins.length / closed.length) * 100).toFixed(1)) 
        : 0,
      totalPnL: parseFloat(totalPnL.toFixed(4)),
      totalPnLPercent: parseFloat(((totalPnL / (wallet?.balance || 1000)) * 100).toFixed(2))
    };
  }

  // Backup
  backup() {
    try {
      const backupDir = path.join(this.dir, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(this.data, null, 2), 'utf8');
      console.log(`[DB] ✅ Backup: ${timestamp}`);
      return true;
    } catch (e) {
      console.error('[DB] Backup error:', e.message);
      return false;
    }
  }

  clearPositions() { 
    this.data.positions = []; 
    this.data.wallet = { balance: 1000, total_pnl: 0 }; 
    this.save(); 
  }

  close() { 
    this.save(); 
    console.log('[DB] ✅ Closed');
  }
}

module.exports = new Database();
