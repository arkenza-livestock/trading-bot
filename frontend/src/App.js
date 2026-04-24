import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Dashboard from './pages/Dashboard';
import Signals from './pages/Signals';
import Positions from './pages/Positions';
import Settings from './pages/Settings';
import CodeEditor from './pages/CodeEditor';
import './App.css';

const API = process.env.REACT_APP_API_URL || '';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [stats, setStats] = useState({});
  const [engineRunning, setEngineRunning] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, engineRes] = await Promise.all([
        axios.get(`${API}/api/stats`),
        axios.get(`${API}/api/engine/status`)
      ]);
      setStats(statsRes.data);
      setEngineRunning(engineRes.data.running);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    const wsUrl = window.location.hostname === 'localhost' ? 'ws://localhost:3001' : `wss://${window.location.host}`;
    try {
      const socket = new WebSocket(wsUrl);
      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'NEW_SIGNAL') {
          addNotification(`🚨 Yeni sinyal: ${msg.data.symbol} (Skor: ${msg.data.score})`);
          fetchStats();
        }
      };
      return () => { clearInterval(interval); socket.close(); };
    } catch(e) {
      return () => clearInterval(interval);
    }
  }, [fetchStats]);

  const addNotification = (text) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, text }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  };

  const toggleEngine = async () => {
    try {
      if (engineRunning) await axios.post(`${API}/api/engine/stop`);
      else await axios.post(`${API}/api/engine/start`);
      setEngineRunning(!engineRunning);
    } catch (err) { console.error(err); }
  };

  const runNow = async () => {
    try {
      await axios.post(`${API}/api/engine/run-now`);
      addNotification('✅ Analiz başlatıldı');
    } catch (err) { console.error(err); }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'signals', label: 'Sinyaller', icon: '🚨' },
    { id: 'positions', label: 'Pozisyonlar', icon: '💼' },
    { id: 'settings', label: 'Ayarlar', icon: '⚙️' },
    { id: 'code', label: 'Kod Editörü', icon: '💻' }
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">₿</span>
          <span className="logo-text">Kripto Bot</span>
        </div>
        <nav className="nav">
          {navItems.map(item => (
            <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="engine-controls">
          <div className={`engine-status ${engineRunning ? 'running' : 'stopped'}`}>
            <span className="status-dot" />
            {engineRunning ? 'Çalışıyor' : 'Durduruldu'}
          </div>
          <button className={`btn-engine ${engineRunning ? 'btn-stop' : 'btn-start'}`} onClick={toggleEngine}>
            {engineRunning ? '⏹ Durdur' : '▶ Başlat'}
          </button>
          <button className="btn-run-now" onClick={runNow}>⚡ Şimdi Çalıştır</button>
        </div>
        <div className="stats-mini">
          <div className="stat-mini">
            <span className="stat-mini-label">Toplam PnL</span>
            <span className={`stat-mini-value ${stats.totalPnl >= 0 ? 'positive' : 'negative'}`}>
              {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl || 0} USDT
            </span>
          </div>
          <div className="stat-mini">
            <span className="stat-mini-label">Kazanma Oranı</span>
            <span className="stat-mini-value positive">{stats.winRate || 0}%</span>
          </div>
          <div className="stat-mini">
            <span className="stat-mini-label">Açık Pozisyon</span>
            <span className="stat-mini-value">{stats.openPositions || 0}</span>
          </div>
        </div>
      </aside>
      <main className="main">
        {page === 'dashboard' && <Dashboard api={API} stats={stats} />}
        {page === 'signals' && <Signals api={API} />}
        {page === 'positions' && <Positions api={API} />}
        {page === 'settings' && <Settings api={API} />}
        {page === 'code' && <CodeEditor api={API} />}
      </main>
      <div className="notifications">
        {notifications.map(n => (
          <div key={n.id} className="notification">{n.text}</div>
        ))}
      </div>
    </div>
  );
}
