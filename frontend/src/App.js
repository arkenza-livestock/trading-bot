import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Signals from './pages/Signals';
import Positions from './pages/Positions';
import Backtest from './pages/Backtest';
import Settings from './pages/Settings';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const NAV = [
  { id:'dashboard',  icon:'📊', label:'Dashboard' },
  { id:'signals',    icon:'🚨', label:'Sinyaller' },
  { id:'positions',  icon:'💼', label:'Pozisyonlar' },
  { id:'backtest',   icon:'🔬', label:'Backtest' },
  { id:'settings',   icon:'⚙️', label:'Ayarlar' },
];

export default function App() {
  const [activePage,   setActivePage]   = useState('dashboard');
  const [engineStatus, setEngineStatus] = useState('stopped');
  const [totalPnl,     setTotalPnl]     = useState(0);
  const [winRate,      setWinRate]      = useState(0);
  const [openPos,      setOpenPos]      = useState(0);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 5000);
    return () => clearInterval(iv);
  }, []);

  const fetchStatus = async () => {
    try {
      const res  = await fetch(`${API_URL}/api/status`);
      const data = await res.json();
      setEngineStatus(data.running ? 'running' : 'stopped');
      setTotalPnl(data.totalPnl||0);
      setWinRate(data.winRate||0);
      setOpenPos(data.openPositions||0);
    } catch(e) {}
  };

  const toggleEngine = async () => {
    try {
      const endpoint = engineStatus==='running' ? '/api/engine/stop' : '/api/engine/start';
      await fetch(`${API_URL}${endpoint}`, { method:'POST' });
      setTimeout(fetchStatus, 1000);
    } catch(e) {}
  };

  return (
    <div style={{ display:'flex', height:'100vh', background:'#060b14', color:'#e2e8f0', fontFamily:'system-ui,sans-serif' }}>

      {/* Sol menü */}
      <div style={{ width:200, background:'#0a0e1a', borderRight:'1px solid #1e2736', display:'flex', flexDirection:'column', padding:'20px 0' }}>

        {/* Logo */}
        <div style={{ padding:'0 20px 24px', borderBottom:'1px solid #1e2736' }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#60a5fa', letterSpacing:1 }}>⚡ CryptoBot</div>
          <div style={{ fontSize:11, color:'#4a5568', marginTop:4 }}>v19 · 4H Setup + 1H Timing</div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 0' }}>
          {NAV.map(item => (
            <div key={item.id}
              onClick={() => setActivePage(item.id)}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:500,
                color: activePage===item.id ? '#90cdf4' : '#718096',
                background: activePage===item.id ? 'rgba(49,130,206,0.1)' : 'transparent',
                borderLeft: activePage===item.id ? '3px solid #3182ce' : '3px solid transparent',
                transition:'all 0.15s'
              }}>
              <span style={{ fontSize:16 }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </nav>

        {/* Engine kontrolü */}
        <div style={{ padding:'16px 20px', borderTop:'1px solid #1e2736' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <div style={{ width:8, height:8, borderRadius:'50%',
              background:engineStatus==='running'?'#68d391':'#fc8181',
              boxShadow:engineStatus==='running'?'0 0 6px #68d391':'none' }} />
            <span style={{ fontSize:12, color:engineStatus==='running'?'#68d391':'#fc8181', fontWeight:600 }}>
              {engineStatus==='running' ? 'Çalışıyor' : 'Durduruldu'}
            </span>
          </div>
          <button onClick={toggleEngine}
            style={{
              width:'100%', padding:'9px', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600,
              background: engineStatus==='running' ? 'rgba(252,129,129,0.15)' : 'rgba(104,211,145,0.15)',
              border: engineStatus==='running' ? '1px solid #fc8181' : '1px solid #68d391',
              color: engineStatus==='running' ? '#fc8181' : '#68d391'
            }}>
            {engineStatus==='running' ? '⏹ Durdur' : '▶ Başlat'}
          </button>
        </div>

        {/* Özet metrikler */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid #1e2736' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:11, color:'#718096' }}>Toplam PnL</span>
            <span style={{ fontSize:11, fontWeight:700, color:totalPnl>=0?'#68d391':'#fc8181' }}>
              {totalPnl>=0?'+':''}{totalPnl.toFixed(2)} USDT
            </span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:11, color:'#718096' }}>Kazanma</span>
            <span style={{ fontSize:11, fontWeight:700, color:winRate>=50?'#68d391':'#f6ad55' }}>
              %{winRate.toFixed(1)}
            </span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, color:'#718096' }}>Açık Pos.</span>
            <span style={{ fontSize:11, fontWeight:700, color:'#60a5fa' }}>{openPos}</span>
          </div>
        </div>
      </div>

      {/* Sağ içerik */}
      <div style={{ flex:1, overflow:'auto', padding:24 }}>
        {activePage==='dashboard' && <Dashboard  api={API_URL} />}
        {activePage==='signals'   && <Signals    api={API_URL} />}
        {activePage==='positions' && <Positions  api={API_URL} />}
        {activePage==='backtest'  && <Backtest   api={API_URL} />}
        {activePage==='settings'  && <Settings   api={API_URL} />}
      </div>
    </div>
  );
}
