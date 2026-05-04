import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Signals from './pages/Signals';
import Positions from './pages/Positions';
import Simulation from './pages/Simulation';
import Backtest from './pages/Backtest';
import Settings from './pages/Settings';
import './App.css';

function App() {
  const [botRunning, setBotRunning] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(function() {
    fetch('/api/status')
      .then(function(r) { return r.json(); })
      .then(function(data) { setBotRunning(data.botRunning || false); })
      .catch(function() {});
  }, []);

  var toggleBot = async function() {
    setMessage('');
    if (botRunning) {
      try {
        var res = await fetch('/api/bot/stop', { method: 'POST' });
        var data = await res.json();
        setMessage(data.message);
        setBotRunning(false);
      } catch(e) {
        setMessage('Hata: ' + e.message);
      }
    } else {
      try {
        var res = await fetch('/api/bot/start', { method: 'POST' });
        var data = await res.json();
        setMessage(data.message);
        setBotRunning(true);
      } catch(e) {
        setMessage('Hata: ' + e.message);
      }
    }
    setTimeout(function() { setMessage(''); }, 3000);
  };

  return (
    <Router>
      <div className="app">
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/signals">Sinyaller</NavLink>
          <NavLink to="/positions">Pozisyonlar</NavLink>
          <NavLink to="/simulation">Simulasyon</NavLink>
          <NavLink to="/backtest">Backtest</NavLink>
          <NavLink to="/settings">Ayarlar</NavLink>
        </nav>

        {message && (
          <div style={{
            textAlign: 'center',
            padding: '10px',
            background: botRunning ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: botRunning ? '#22c55e' : '#ef4444',
            fontSize: 13,
            fontWeight: 500
          }}>
            {message}
          </div>
        )}

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>

        {/* ALT KONTROL BAR */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#0a0f1a',
          borderTop: '1px solid #1a2540',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 15,
          zIndex: 1000
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: botRunning ? '#22c55e' : '#ef4444',
            boxShadow: botRunning ? '0 0 10px rgba(34,197,94,0.5)' : '0 0 10px rgba(239,68,68,0.5)'
          }}></span>
          <span style={{color: '#94a3b8', fontSize: 13, fontWeight: 500}}>
            {botRunning ? 'Bot Calisiyor' : 'Bot Durdu'}
          </span>
          <button onClick={toggleBot} style={{
            padding: '10px 28px',
            borderRadius: 8,
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            background: botRunning 
              ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
              : 'linear-gradient(135deg, #16a34a, #15803d)',
            color: '#fff',
            boxShadow: botRunning 
              ? '0 4px 15px rgba(220,38,38,0.3)'
              : '0 4px 15px rgba(22,163,74,0.3)'
          }}>
            {botRunning ? '⏹ DURDUR' : '▶ BASLAT'}
          </button>
        </div>

        {/* Alt bar boşluğu */}
        <div style={{height: 60}}></div>
      </div>
    </Router>
  );
}

export default App;
