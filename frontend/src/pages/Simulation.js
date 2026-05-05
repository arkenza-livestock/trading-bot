import React, { useState, useEffect, useCallback } from 'react';

function Simulation() {
  var [stats, setStats] = useState(null);
  var [trades, setTrades] = useState([]);
  var [coinStats, setCoinStats] = useState([]);
  var [simRunning, setSimRunning] = useState(false);
  var [message, setMessage] = useState('');
  var [loading, setLoading] = useState(true);
  var [activeTab, setActiveTab] = useState('overview');

  var fetchStats = useCallback(async function() {
    try {
      var results = await Promise.all([
        fetch('/api/simulation/stats'),
        fetch('/api/status'),
        fetch('/api/simulation/trades')
      ]);
      var statsData = await results[0].json();
      var statusData = await results[1].json();
      var tradesData = await results[2].json();
      setStats(statsData);
      setSimRunning(statusData.simRunning || false);
      setTrades(tradesData || []);
      var coinMap = {};
      (tradesData || []).forEach(function(t) {
        if (!coinMap[t.symbol]) coinMap[t.symbol] = { symbol: t.symbol, trades: 0, wins: 0, totalPnl: 0, totalPnlPct: 0 };
        coinMap[t.symbol].trades++;
        if (t.pnl > 0) coinMap[t.symbol].wins++;
        coinMap[t.symbol].totalPnl += t.pnl || 0;
        coinMap[t.symbol].totalPnlPct += t.pnl_percent || 0;
      });
      setCoinStats(Object.values(coinMap).sort(function(a, b) { return b.totalPnl - a.totalPnl; }));
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(function() {
    fetchStats();
    var interval = setInterval(fetchStats, 15000);
    return function() { clearInterval(interval); };
  }, [fetchStats]);

  var startSim = async function() {
    setMessage('');
    try { var res = await fetch('/api/simulation/start', { method: 'POST' }); var data = await res.json(); setMessage(data.message); setSimRunning(true); setTimeout(fetchStats, 2000); } catch(e) { setMessage('Hata: ' + e.message); }
  };

  var stopSim = async function() {
    setMessage('');
    try { var res = await fetch('/api/simulation/stop', { method: 'POST' }); var data = await res.json(); setMessage(data.message); setSimRunning(false); } catch(e) { setMessage('Hata: ' + e.message); }
  };

  var resetSim = async function() {
    if (!window.confirm('Simulasyonu SIFIRLAMAK istediginize emin misiniz?')) return;
    try {
      var res = await fetch('/api/simulation/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startBalance: 1000 }) });
      var data = await res.json();
      setMessage(data.message);
      setTrades([]); setCoinStats([]);
      fetchStats();
    } catch(e) { setMessage('Hata: ' + e.message); }
  };

  if (loading) return <div className="loading">Yukleniyor...</div>;

  var fUSD = function(v) { return '$' + (v || 0).toFixed(2); };
  var formatTime = function(timeStr) { if (!timeStr) return '-'; try { return new Date(timeStr + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }); } catch(e) { return timeStr; } };

  var openPositions = trades.filter(function(t) { return t.status === 'OPEN'; });
  var closedTrades = trades.filter(function(t) { return t.status !== 'OPEN'; });
  var allWins = closedTrades.filter(function(t) { return t.pnl > 0; });
  var allLosses = closedTrades.filter(function(t) { return t.pnl < 0; });
  var totalWinAmount = allWins.reduce(function(s, t) { return s + (t.pnl || 0); }, 0);
  var totalLossAmount = Math.abs(allLosses.reduce(function(s, t) { return s + (t.pnl || 0); }, 0));

  return (
    <div className="simulation">
      <h1>Simulasyon</h1>
      <p style={{color:'#64748b', marginBottom:25, fontSize:14}}>Sanal para ile makine ogrenmesi. Gercek islem yapmaz.</p>
      {message && <div className="message">{message}</div>}

      <div className="control-panel">
        <div className="control-box sim-box">
          <div className="control-icon">🧠</div>
          <h3>Simulasyon Motoru</h3>
          <p className="control-desc">Makinenin sinyalleriyle sanal alim-satim yapar.</p>
          <div className="control-buttons">
            {!simRunning ? <button className="btn-start sim" onClick={startSim}>▶ BASLAT</button> : <button className="btn-stop" onClick={stopSim}>⏹ DURDUR</button>}
            <span className={'status-badge ' + (simRunning ? 'online' : 'offline')}><span className={'status-dot ' + (simRunning ? 'active' : 'inactive')}></span>{simRunning ? 'Calisiyor' : 'Durdu'}</span>
          </div>
        </div>
        <div className="control-box">
          <div className="control-icon">📊</div>
          <h3>Ozet</h3>
          <p className="control-desc"><strong>{closedTrades.length}</strong> kapali | <span style={{color:'#22c55e'}}>{allWins.length} kazanan</span> | <span style={{color:'#ef4444'}}>{allLosses.length} kaybeden</span></p>
          <div style={{display:'flex', gap:20, marginTop:10}}><div><div style={{fontSize:11,color:'#64748b'}}>Toplam Kazanc</div><div style={{fontSize:18,fontWeight:700,color:'#22c55e'}}>{fUSD(totalWinAmount)}</div></div><div><div style={{fontSize:11,color:'#64748b'}}>Toplam Kayip</div><div style={{fontSize:18,fontWeight:700,color:'#ef4444'}}>{fUSD(totalLossAmount)}</div></div></div>
        </div>
        <div className="control-box" style={{borderLeft: (stats?.consecutiveLosses||0)>=3?'3px solid #ef4444':'3px solid #22c55e'}}>
          <div className="control-icon">⚠️</div>
          <h3>Risk Durumu</h3>
          <p className="control-desc">Adaptif Esik: <strong>%{stats?.adaptiveThreshold||70}</strong><br/>Pespese Kayip: <strong style={{color:(stats?.consecutiveLosses||0)>=3?'#ef4444':'#22c55e'}}>{stats?.consecutiveLosses||0}</strong></p>
        </div>
      </div>

      <div className="filter-bar">
        <button className={'filter-btn '+(activeTab==='overview'?'active':'')} onClick={function(){setActiveTab('overview');}}>📊 Genel Bakis</button>
        <button className={'filter-btn '+(activeTab==='open'?'active':'')} onClick={function(){setActiveTab('open');}}>📌 Acik Pozisyonlar ({openPositions.length})</button>
        <button className={'filter-btn '+(activeTab==='coins'?'active':'')} onClick={function(){setActiveTab('coins');}}>🪙 Coin Bazli</button>
        <button className={'filter-btn '+(activeTab==='trades'?'active':'')} onClick={function(){setActiveTab('trades');}}>📋 Tum Islemler</button>
      </div>

      {activeTab === 'overview' && (
        <div>
          <div className="card-grid"><div className="card"><div className="card-label">Bakiye</div><div className="card-value">{fUSD(stats?.balance)}</div></div><div className="card"><div className="card-label">Toplam PnL</div><div className={'card-value '+((stats?.totalPnl||0)>=0?'green':'red')}>{fUSD(stats?.totalPnl)} (%{stats?.totalPnlPct||0})</div></div><div className="card"><div className="card-label">Basari</div><div className="card-value green">%{stats?.winRate||0}</div></div><div className="card"><div className="card-label">PF</div><div className="card-value gold">{stats?.profitFactor||'-'}</div></div></div>
          <div className="card-grid"><div className="card"><div className="card-label">Toplam Islem</div><div className="card-value">{stats?.totalTrades||0}</div></div><div className="card"><div className="card-label">Kazanan</div><div className="card-value green">{stats?.wins||0}</div></div><div className="card"><div className="card-label">Kaybeden</div><div className="card-value red">{stats?.losses||0}</div></div><div className="card"><div className="card-label">Acik</div><div className="card-value gold">{stats?.openTrades||0}</div></div></div>
        </div>
      )}

      {activeTab === 'open' && (
        <div>
          <h2>Acik Pozisyonlar ({openPositions.length})</h2>
          <div className="table-container">
            <table>
              <thead><tr><th>Coin</th><th>Yon</th><th>Giris</th><th>Guncel</th><th>Stop</th><th>Hedef</th><th>PnL%</th><th>PnL USDT</th><th>AI</th><th>Acilis</th></tr></thead>
              <tbody>
                {openPositions.map(function(pos,i) { return (<tr key={i} className={(pos.pnl_percent||0)>=0?'row-profit':'row-loss'}><td><strong>{pos.symbol}</strong></td><td><span className="badge badge-buy">LONG</span></td><td>{pos.entry_price?pos.entry_price.toFixed(6):'-'}</td><td>{pos.current_price?pos.current_price.toFixed(6):'-'}</td><td>{pos.stop_loss?pos.stop_loss.toFixed(6):'-'}</td><td>{pos.take_profit?pos.take_profit.toFixed(6):'-'}</td><td style={{color:(pos.pnl_percent||0)>=0?'#22c55e':'#ef4444',fontWeight:600}}>%{(pos.pnl_percent||0).toFixed(2)}</td><td style={{color:(pos.pnl||0)>=0?'#22c55e':'#ef4444',fontWeight:600}}>{(pos.pnl||0).toFixed(4)}</td><td><span className={'badge '+((pos.machine_confidence||0)>=0.80?'badge-buy':(pos.machine_confidence||0)>=0.65?'badge-wait':'badge-sell')}>%{((pos.machine_confidence||0)*100).toFixed(0)}</span></td><td style={{fontSize:11,color:'#94a3b8'}}>{formatTime(pos.opened_at)}</td></tr>); })}
                {openPositions.length===0 && <tr><td colSpan="10" style={{textAlign:'center',color:'#64748b',padding:40}}>Acik pozisyon yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'coins' && (
        <div>
          <h2>Coin Performansi</h2>
          <div className="table-container">
            <table>
              <thead><tr><th>Coin</th><th>Islem</th><th>Kazanan</th><th>Basari</th><th>Toplam PnL</th><th>Ort. PnL%</th></tr></thead>
              <tbody>
                {coinStats.map(function(coin,i) { return (<tr key={i} className={coin.totalPnl>=0?'row-profit':'row-loss'}><td><strong>{coin.symbol}</strong></td><td>{coin.trades}</td><td style={{color:'#22c55e'}}>{coin.wins}</td><td style={{color:coin.wins/coin.trades>=0.5?'#22c55e':'#ef4444',fontWeight:600}}>{coin.trades>0?'%'+(coin.wins/coin.trades*100).toFixed(0):'-'}</td><td style={{color:coin.totalPnl>=0?'#22c55e':'#ef4444',fontWeight:600}}>{fUSD(coin.totalPnl)}</td><td style={{color:coin.totalPnlPct>=0?'#22c55e':'#ef4444'}}>%{coin.totalPnlPct.toFixed(2)}</td></tr>); })}
                {coinStats.length===0 && <tr><td colSpan="6" style={{textAlign:'center',color:'#64748b',padding:40}}>Henuz islem yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'trades' && (
        <div>
          <h2>Tum Islemler ({closedTrades.length})</h2>
          <div className="table-container">
            <table>
              <thead><tr><th>Coin</th><th>Yon</th><th>Giris</th><th>Cikis</th><th>PnL%</th><th>PnL USDT</th><th>Neden</th><th>AI</th><th>Kapanis</th></tr></thead>
              <tbody>
                {closedTrades.slice(-50).reverse().map(function(t,i) { return (<tr key={i} className={t.pnl>=0?'row-profit':'row-loss'}><td><strong>{t.symbol}</strong></td><td><span className="badge badge-buy">LONG</span></td><td>{t.entry_price?t.entry_price.toFixed(6):'-'}</td><td>{t.exit_price?t.exit_price.toFixed(6):'-'}</td><td style={{color:t.pnl>=0?'#22c55e':'#ef4444',fontWeight:600}}>%{t.pnl_percent?t.pnl_percent.toFixed(2):'0'}</td><td style={{color:t.pnl>=0?'#22c55e':'#ef4444',fontWeight:600}}>{t.pnl?t.pnl.toFixed(4):'0'}</td><td><span className="badge badge-wait">{t.close_reason||'KAPALI'}</span></td><td><span className={'badge '+((t.machine_confidence||0)>=0.80?'badge-buy':'badge-wait')}>%{((t.machine_confidence||0)*100).toFixed(0)}</span></td><td style={{fontSize:11,color:'#94a3b8'}}>{formatTime(t.closed_at)}</td></tr>); })}
                {closedTrades.length===0 && <tr><td colSpan="9" style={{textAlign:'center',color:'#64748b',padding:40}}>Kapali islem yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{marginTop:30, textAlign:'right'}}>
        <button className="btn btn-danger" onClick={resetSim}>🔄 Simulasyonu Sifirla</button>
      </div>
    </div>
  );
}

export default Simulation;
