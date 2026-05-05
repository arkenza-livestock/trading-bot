import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Signals from './pages/Signals';
import Positions from './pages/Positions';
import Simulation from './pages/Simulation';
import Backtest from './pages/Backtest';
import Settings from './pages/Settings';
import './App.css';

function App() {
  var [page, setPage] = useState('dashboard');
  var [botRunning, setBotRunning] = useState(false);
  var [message, setMessage] = useState('');

  useEffect(function() {
    fetch('/api/status')
      .then(function(r) { return r.json(); })
      .then(function(data) { setBotRunning(data.botRunning || false); })
      .catch(function() {});
  }, []);

  var toggleBot = async function() {
    setMessage('');
    if (botRunning) {
      try { var res = await fetch('/api/bot/stop', { method: 'POST' }); var data = await res.json(); setMessage(data.message); setBotRunning(false); } catch(e) { setMessage('Hata: ' + e.message); }
    } else {
      try { var res = await fetch('/api/bot/start', { method: 'POST' }); var data = await res.json(); setMessage(data.message); setBotRunning(true); } catch(e) { setMessage('Hata: ' + e.message); }
    }
    setTimeout(function() { setMessage(''); }, 3000);
  };

  var navStyle = function(name) {
    return {
      color: page === name ? '#fff' : '#64748b', textDecoration: 'none', fontSize: 14,
      fontWeight: page === name ? 600 : 500, padding: '10px 18px', borderRadius: 8,
      background: page === name ? '#1e293b' : 'transparent', cursor: 'pointer', border: 'none'
    };
  };

  return (
    <div className="app">
      <nav>
        <button onClick={function(){setPage('dashboard');}} style={navStyle('dashboard')}>Dashboard</button>
        <button onClick={function(){setPage('signals');}} style={navStyle('signals')}>Sinyaller</button>
        <button onClick={function(){setPage('positions');}} style={navStyle('positions')}>Pozisyonlar</button>
        <button onClick={function(){setPage('simulation');}} style={navStyle('simulation')}>Simulasyon</button>
        <button onClick={function(){setPage('backtest');}} style={navStyle('backtest')}>Backtest</button>
        <button onClick={function(){setPage('settings');}} style={navStyle('settings')}>Ayarlar</button>
      </nav>

      {message && (
        <div style={{textAlign:'center', padding:'10px', background: botRunning?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)', color: botRunning?'#22c55e':'#ef4444', fontSize:13, fontWeight:500}}>{message}</div>
      )}

      <div style={{paddingBottom:70}}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'signals' && <Signals />}
        {page === 'positions' && <Positions />}
        {page === 'simulation' && <Simulation />}
        {page === 'backtest' && <Backtest />}
        {page === 'settings' && <Settings />}
      </div>

      <div style={{position:'fixed', bottom:0, left:0, right:0, background:'#0a0f1a', borderTop:'1px solid #1a2540', padding:'12px 20px', display:'flex', justifyContent:'center', alignItems:'center', gap:15, zIndex:1000}}>
        <span style={{width:10, height:10, borderRadius:'50%', background: botRunning?'#22c55e':'#ef4444', boxShadow: botRunning?'0 0 10px rgba(34,197,94,0.5)':'0 0 10px rgba(239,68,68,0.5)'}}></span>
        <span style={{color:'#94a3b8', fontSize:13, fontWeight:500}}>{botRunning ? 'Bot Calisiyor' : 'Bot Durdu'}</span>
        <button onClick={toggleBot} style={{padding:'10px 28px', borderRadius:8, border:'none', fontSize:14, fontWeight:600, cursor:'pointer', background: botRunning?'linear-gradient(135deg, #dc2626, #b91c1c)':'linear-gradient(135deg, #16a34a, #15803d)', color:'#fff'}}>{botRunning ? '⏹ DURDUR' : '▶ BASLAT'}</button>
      </div>
    </div>
  );
}

export default App;
