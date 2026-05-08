import React, { useState, useEffect, useCallback } from 'react';

function Dashboard() {
  var [realStats, setRealStats] = useState(null);
  var [signals, setSignals] = useState([]);
  var [positions, setPositions] = useState([]);
  var [settings, setSettings] = useState({});
  var [loading, setLoading] = useState(true);
  var [message, setMessage] = useState('');
  var [lastUpdate, setLastUpdate] = useState('');

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

  var manualScan = async function() {
    setMessage('🔄 Tarama başlatıldı...');
    try {
      var res = await fetch('/api/bot/scan', { method: 'POST' });
      var data = await res.json();
      setMessage(data.message || '✅ Tarama tamamlandı');
      fetchData();
      setTimeout(function() { setMessage(''); }, 3000);
    } catch(e) { setMessage('Hata: ' + e.message); }
  };

  if (loading) return <div className="loading">Yukleniyor...</div>;

  var longSignals = signals.filter(function(s) { return s.signal_type === 'ALIM'; });
  var shortSignals = signals.filter(function(s) { return s.signal_type === 'SATIS'; });
  var allAccepted = signals.filter(function(s) { return s.signal_type === 'ALIM' || s.signal_type === 'SATIS'; });
  var allRejected = signals.filter(function(s) { return s.signal_type !== 'ALIM' && s.signal_type !== 'SATIS'; });
  var realTradingEnabled = settings.real_trading === 'true' || settings.real_trading === '1';
  var realPositions = positions.filter(function(p) { return p.is_real === 1; });
  var openLongPositions = realPositions.filter(function(p) { return p.status === 'OPEN' && (p.side || 'LONG') === 'LONG'; });
  var openShortPositions = realPositions.filter(function(p) { return p.status === 'OPEN' && p.side === 'SHORT'; });
  var openAllPositions = realPositions.filter(function(p) { return p.status === 'OPEN'; });
  var btcRegime = realStats?.btcTrend?.regime || 'RANGING';

  var formatTime = function(timeStr) {
    if (!timeStr) return '-';
    try { return new Date(timeStr + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }); }
    catch(e) { return timeStr; }
  };

  return (
    <div className="dashboard">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10}}>
        <h1 style={{margin:0}}>Dashboard</h1>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{color:'#64748b', fontSize:12}}>Son guncelleme: {lastUpdate}</span>
          <button onClick={fetchData} style={{padding:'6px 12px', background:'#1e293b', border:'1px solid #334155', borderRadius:6, color:'#e2e8f0', fontSize:12, cursor:'pointer'}}>🔄</button>
          <button onClick={manualScan} style={{padding:'6px 14px', background:'#7c3aed', border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer'}}>⚡ TARA</button>
        </div>
      </div>
      <p style={{color:'#64748b', marginBottom:25, fontSize:14, marginTop:5}}>
        🟢 LONG & 🔴 SHORT | Adaptif Cift Motor | Rejim: {btcRegime}
        {realStats?.botRunning && <span style={{color:'#22c55e', marginLeft:10}}>🟢 Calisiyor</span>}
        {!realStats?.botRunning && <span style={{color:'#ef4444', marginLeft:10}}>🔴 Durdu</span>}
      </p>

      {message && <div className="message">{message}</div>}

      <div className="btc-status-bar">
        <div className="btc-item"><span className="label">₿ BTC Trend</span><span className="value up">{realStats?.btcTrend?.trend||'BELIRSIZ'}</span></div>
        <div className="btc-item"><span className="label">RSI</span><span className="value">{realStats?.btcTrend?.rsi?.toFixed(1)||'-'}</span></div>
        <div className="btc-item"><span className="label">Rejim</span><span className="value" style={{color: btcRegime === 'RALLY' ? '#22c55e' : btcRegime === 'DOWNTREND' ? '#ef4444' : '#f59e0b'}}>{btcRegime}</span></div>
        <div className="btc-item"><span className="label">Tarama</span><span className="value">#{realStats?.scanCount||0}</span></div>
        <div className="btc-item"><span className="label">BTC Fiyat</span><span className="value">${realStats?.btcTrend?.fiyat?.toFixed(0)||'-'}</span></div>
      </div>

      <h2>🏦 Gercek Cuzdan (Binance)</h2>
      <div className="card-grid" style={{gridTemplateColumns: 'repeat(2, 1fr)'}}>
        <div className="card" style={{borderLeft: '4px solid #f59e0b'}}>
          <div className="card-label">USDT Bakiyesi</div>
          <div className="card-value gold">${realStats?.realBalance ? realStats.realBalance.toFixed(2) : '0.00'}</div>
        </div>
        <div className="card">
          <div className="card-label">Gercek Alim</div>
          <div className={'card-value '+(realTradingEnabled?'green':'red')}>{realTradingEnabled?'ACIK ✅':'KAPALI ❌'}</div>
        </div>
      </div>

      <h2>Islem Durumu</h2>
      <div className="card-grid">
        <div className="card"><div className="card-label">Bot</div><div className={'card-value '+(realStats?.botRunning?'green':'red')}>{realStats?.botRunning?'AKTIF':'DURDU'}</div></div>
        <div className="card"><div className="card-label">🟢 LONG Acik</div><div className="card-value green">{openLongPositions.length}</div></div>
        <div className="card"><div className="card-label">🔴 SHORT Acik</div><div className="card-value red">{openShortPositions.length}</div></div>
        <div className="card"><div className="card-label">Tarama</div><div className="card-value">#{realStats?.scanCount||0}</div></div>
      </div>

      <h2>📊 Performans Metrikleri</h2>
      <div className="card-grid">
        <div className="card"><div className="card-label">📈 Sharpe Orani</div><div className="card-value gold">{realStats?.stats?.sharpeRatio || '-'}</div></div>
        <div className="card"><div className="card-label">📉 Max Drawdown</div><div className="card-value red">%{realStats?.stats?.maxDrawdown || '0.0'}</div></div>
      </div>

      <h2>📌 Acik Pozisyonlar ({openAllPositions.length})</h2>
      {!realTradingEnabled && (
        <div style={{background:'#1e293b', border:'1px solid #f59e0b', borderRadius:10, padding:25, marginBottom:15, textAlign:'center'}}>
          <div style={{fontSize:35, marginBottom:8}}>🔒</div>
          <div style={{color:'#fbbf24', fontSize:14, fontWeight:600}}>Gercek Alim Kapali</div>
          <div style={{color:'#64748b', fontSize:12, marginTop:5}}>Ayarlar sayfasindan gercek alimi aktif edin.</div>
        </div>
      )}
      {realTradingEnabled && openAllPositions.length > 0 && (
        <div className="table-container">
          <table>
            <thead><tr><th>Sembol</th><th>Yon</th><th>Giris</th><th>Anlik</th><th>PnL%</th><th>Stop</th><th>AI</th><th>Acilis</th><th>Islem</th></tr></thead>
            <tbody>
              {openAllPositions.map(function(pos, i) {
                var side = pos.side || 'LONG'; var isLong = side === 'LONG';
                var pnlColor = (pos.pnl_percent||0) >= 0 ? '#22c55e' : '#ef4444';
                return (
                  <tr key={i} className={(pos.pnl_percent||0)>=0?'row-profit':'row-loss'}>
                    <td><strong>{pos.symbol}</strong></td>
                    <td><span className={'badge ' + (isLong?'badge-buy':'badge-sell')}>{side}</span></td>
                    <td>{pos.entry_price?pos.entry_price.toFixed(6):'-'}</td>
                    <td>{pos.current_price?pos.current_price.toFixed(6):'-'}</td>
                    <td style={{color:pnlColor,fontWeight:600}}>%{(pos.pnl_percent||0).toFixed(2)}</td>
                    <td>{pos.stop_loss?pos.stop_loss.toFixed(6):'-'}</td>
                    <td>%{((pos.machine_confidence||0)*100).toFixed(0)}</td>
                    <td style={{fontSize:11,color:'#94a3b8'}}>{formatTime(pos.opened_at)}</td>
                    <td><button onClick={function(){manualSell(pos.symbol);}} style={{padding:'6px 14px', background:'#dc2626', border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer'}}>SAT</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {realTradingEnabled && openAllPositions.length === 0 && (
        <div className="table-container">
          <table><thead><tr><th>Sembol</th><th>Yon</th><th>Giris</th><th>Anlik</th><th>PnL%</th><th>Stop</th><th>AI</th><th>Acilis</th><th>Islem</th></tr></thead>
          <tbody><tr><td colSpan="9" style={{textAlign:'center',color:'#64748b',padding:30}}>Gercek alim aktif - Henuz acik pozisyon yok</td></tr></tbody></table>
        </div>
      )}

      <h2>Sinyal Ozeti</h2>
      <div className="card-grid">
        <div className="card ai-card"><div className="card-label">🟢 LONG Sinyal</div><div className="card-value green">{longSignals.length}</div></div>
        <div className="card ai-card" style={{borderLeft:'3px solid #ef4444'}}><div className="card-label">🔴 SHORT Sinyal</div><div className="card-value red">{shortSignals.length}</div></div>
        <div className="card ai-card"><div className="card-label">❌ Reddedilen</div><div className="card-value" style={{color:'#64748b'}}>{allRejected.length}</div></div>
        <div className="card ai-card"><div className="card-label">🔢 Son Tarama</div><div className="card-value purple">{signals.length} sinyal</div></div>
      </div>

      <h2>Kabul Edilen Sinyaller ({allAccepted.length})</h2>
      <div className="table-container">
        <table>
          <thead><tr><th>Sembol</th><th>Yon</th><th>Fiyat</th><th>Puan</th><th>RSI</th><th>Kural Durumu</th></tr></thead>
          <tbody>
            {allAccepted.slice(0,15).map(function(s,i){
              var isLong = s.signal_type === 'ALIM';
              return (
                <tr key={i} className={isLong?'row-buy':'row-sell'}>
                  <td><strong>{s.symbol}</strong></td>
                  <td><span className={'badge '+(isLong?'badge-buy':'badge-sell')}>{s.signal_type}</span></td>
                  <td>{s.fiyat?s.fiyat.toFixed(6):'-'}</td>
                  <td>{s.score||'-'}</td>
                  <td>{s.rsi?s.rsi.toFixed(1):'-'}</td>
                  <td style={{fontSize:12,color: isLong?'#22c55e':'#ef4444',maxWidth:300}}>{s.ai_comment||'-'}</td>
                </tr>
              );
            })}
            {allAccepted.length===0&&<tr><td colSpan="6" style={{textAlign:'center',color:'#64748b',padding:30}}>Kabul edilen sinyal yok</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Reddedilen ({allRejected.length})</h2>
      <div className="table-container">
        <table>
          <thead><tr><th>Sembol</th><th>Fiyat</th><th>Puan</th><th>RSI</th><th>Red Nedeni</th></tr></thead>
          <tbody>
            {allRejected.slice(0,10).map(function(s,i){return (<tr key={i} className="row-wait"><td><strong>{s.symbol}</strong></td><td>{s.fiyat?s.fiyat.toFixed(6):'-'}</td><td>{s.score||'-'}</td><td>{s.rsi?s.rsi.toFixed(1):'-'}</td><td style={{fontSize:12,color:'#ef4444'}}>{s.ai_comment||'-'}</td></tr>);})}
            {allRejected.length===0&&<tr><td colSpan="5" style={{textAlign:'center',color:'#64748b',padding:30}}>Reddedilen sinyal yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
