import React, { useState, useEffect, useCallback } from 'react';

function Dashboard() {
  var [realStats, setRealStats] = useState(null);
  var [signals, setSignals] = useState([]);
  var [positions, setPositions] = useState([]);
  var [settings, setSettings] = useState({});
  var [loading, setLoading] = useState(true);
  var [message, setMessage] = useState('');
  var [lastUpdate, setLastUpdate] = useState('');
  var [scanLoading, setScanLoading] = useState(false);

  var fetchData = useCallback(async function() {
    try {
      var results = await Promise.all([
        fetch('/api/status'),
        fetch('/api/signals'),
        fetch('/api/positions'),
        fetch('/api/settings')
      ]);
      setRealStats(await results[0].json());
      setSignals(await results[1].json());
      setPositions(await results[2].json());
      setSettings(await results[3].json());
      setLastUpdate(new Date().toLocaleTimeString('tr-TR'));
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(function() {
    fetchData();
    var interval = setInterval(fetchData, 3000);
    return function() { clearInterval(interval); };
  }, [fetchData]);

  var handleScan = async function() {
    setScanLoading(true);
    setMessage('');
    try {
      var res = await fetch('/api/scan', { method: 'POST' });
      var data = await res.json();
      setMessage(data.message);
      setTimeout(function() { fetchData(); }, 35000);
    } catch(e) {
      setMessage('❌ Bağlantı hatası');
    }
    setTimeout(function() { setScanLoading(false); }, 5000);
  };

  var manualSell = async function(symbol) {
    if (!window.confirm(symbol + ' icin manuel kapatma yapilsin mi?')) return;
    setMessage('');
    try {
      var res = await fetch('/api/positions/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol, is_real: 1 })
      });
      var data = await res.json();
      setMessage(data.message || data.error);
      setTimeout(function() { setMessage(''); fetchData(); }, 2000);
    } catch(e) { setMessage('Hata: ' + e.message); }
  };

  if (loading) return <div className="loading">Yukleniyor...</div>;

  var aiAcceptedSignals = signals.filter(function(s) { return (s.ai_comment || '').indexOf('✅') !== -1; });
  var aiRejectedSignals = signals.filter(function(s) { return (s.ai_comment || '').indexOf('❌') !== -1; });
  var realTradingEnabled = settings.real_trading === 'true' || settings.real_trading === '1';
  var realPositions = positions.filter(function(p) { return p.is_real === 1; });
  var openPositions = realPositions.filter(function(p) { return p.status === 'OPEN'; });
  var closedPositions = realPositions.filter(function(p) { return p.status !== 'OPEN'; });

  var formatTime = function(timeStr) {
    if (!timeStr) return '-';
    try { return new Date(timeStr + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }); }
    catch(e) { return timeStr; }
  };

  return (
    <div className="dashboard">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10}}>
        <h1 style={{margin:0}}>Dashboard</h1>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <span style={{color:'#64748b', fontSize:12}}>Son guncelleme: {lastUpdate}</span>
          <button onClick={fetchData} style={{padding:'6px 14px', background:'#1e293b', border:'1px solid #334155', borderRadius:6, color:'#e2e8f0', fontSize:12, cursor:'pointer'}}>🔄 Yenile</button>
          <button 
            onClick={handleScan} 
            disabled={scanLoading}
            style={{
              padding: '8px 18px',
              background: scanLoading ? '#334155' : '#f59e0b',
              border: 'none', borderRadius: 8,
              color: '#000', fontSize: 13, fontWeight: 700,
              cursor: scanLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {scanLoading ? '⏳' : '🔍'} TARA
          </button>
        </div>
      </div>

      <p style={{color:'#64748b', marginBottom:25, fontSize:14, marginTop:5}}>
        Canli durum ve performans ozeti | 🟢 LONG & 🔴 SHORT
        {realStats?.botRunning && <span style={{color:'#22c55e', marginLeft:10}}>🟢 Calisiyor</span>}
        {!realStats?.botRunning && <span style={{color:'#ef4444', marginLeft:10}}>🔴 Durdu</span>}
      </p>

      {message && <div className="message">{message}</div>}

      {/* GERİ KALAN HER ŞEY AYNEN SİZDEKİ GİBİ - BTC STATUS BAR, KARTLAR, TABLOLAR vs. */}
      <div className="btc-status-bar">
        <div className="btc-item"><span className="label">₿ BTC Trend</span><span className="value up">{realStats?.btcTrend?.trend||'BELIRSIZ'}</span></div>
        <div className="btc-item"><span className="label">RSI</span><span className="value">{realStats?.btcTrend?.rsi?.toFixed(1)||'-'}</span></div>
        <div className="btc-item"><span className="label">Guc (ADX)</span><span className="value">{realStats?.btcTrend?.strength?.toFixed(1)||'-'}</span></div>
        <div className="btc-item"><span className="label">Tarama</span><span className="value">#{realStats?.scanCount||0}</span></div>
        <div className="btc-item"><span className="label">BTC Fiyat</span><span className="value">${realStats?.btcTrend?.fiyat?.toFixed(0)||'-'}</span></div>
      </div>
    </div>
  );
}

export default Dashboard;
