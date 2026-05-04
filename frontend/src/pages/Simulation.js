import React, { useState, useEffect, useCallback } from 'react';

function Simulation() {
  const [stats, setStats] = useState(null);
  const [trades, setTrades] = useState([]);
  const [coinStats, setCoinStats] = useState([]);
  const [simRunning, setSimRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

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
        if (!coinMap[t.symbol]) {
          coinMap[t.symbol] = { symbol: t.symbol, trades: 0, wins: 0, totalPnl: 0, totalPnlPct: 0 };
        }
        coinMap[t.symbol].trades++;
        if (t.pnl > 0) coinMap[t.symbol].wins++;
        coinMap[t.symbol].totalPnl += t.pnl || 0;
        coinMap[t.symbol].totalPnlPct += t.pnl_percent || 0;
      });
      setCoinStats(Object.values(coinMap).sort(function(a, b) { return b.totalPnl - a.totalPnl; }));
      
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function() {
    fetchStats();
    var interval = setInterval(fetchStats, 15000);
    return function() { clearInterval(interval); };
  }, [fetchStats]);

  var startSim = async function() {
    setMessage('');
    try {
      var res = await fetch('/api/simulation/start', { method: 'POST' });
      var data = await res.json();
      setMessage(data.message);
      setSimRunning(true);
      setTimeout(fetchStats, 2000);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  var stopSim = async function() {
    setMessage('');
    try {
      var res = await fetch('/api/simulation/stop', { method: 'POST' });
      var data = await res.json();
      setMessage(data.message);
      setSimRunning(false);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  var resetSim = async function() {
    if (!window.confirm('Simulasyonu SIFIRLAMAK istediginize emin misiniz?')) return;
    try {
      var res = await fetch('/api/simulation/reset', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startBalance: 1000 })
      });
      var data = await res.json();
      setMessage(data.message);
      setTrades([]);
      setCoinStats([]);
      fetchStats();
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  if (loading) return <div className="loading">Yukleniyor...</div>;

  var fUSD = function(v) { return '$' + (v || 0).toFixed(2); };
  var formatTime = function(timeStr) {
    if (!timeStr) return '-';
    try { return new Date(timeStr + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }); }
    catch(e) { return timeStr; }
  };

  var openPositions = trades.filter(function(t) { return t.status === 'OPEN'; });
  var closedTrades = trades.filter(function(t) { return t.status !== 'OPEN'; });
  var allWins = closedTrades.filter(function(t) { return t.pnl > 0; });
  var allLosses = closedTrades.filter(function(t) { return t.pnl < 0; });
  var totalWinAmount = allWins.reduce(function(s, t) { return s + (t.pnl || 0); }, 0);
  var totalLossAmount = Math.abs(allLosses.reduce(function(s, t) { return s + (t.pnl || 0); }, 0));

  return (
    <div className="simulation">
      <h1>Simulasyon</h1>
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>
        Sanal para ile makine ogrenmesi. Gercek islem yapmaz.
      </p>

      {message && <div className="message">{message}</div>}

      {/* Kontrol Butonlari */}
      <div className="control-panel">
        <div className="control-box sim-box">
          <div className="control-icon">🧠</div>
          <h3>Simulasyon Motoru</h3>
          <p className="control-desc">Makinenin sinyalleriyle <strong>sanal alim-satim</strong> yapar.</p>
          <div className="control-buttons">
            {!simRunning ? (
              <button className="btn-start sim" onClick={startSim}>▶ BASLAT</button>
            ) : (
              <button className="btn-stop" onClick={stopSim}>⏹ DURDUR</button>
            )}
            <span className={'status-badge ' + (simRunning ? 'online' : 'offline')}>
              <span className={'status-dot ' + (simRunning ? 'active' : 'inactive')}></span>
              {simRunning ? 'Calisiyor' : 'Durdu'}
            </span>
          </div>
        </div>

        <div className="control-box">
          <div className="control-icon">📊</div>
          <h3>Ozet</h3>
          <p className="control-desc">
            <strong>{closedTrades.length}</strong> kapali islem | 
            <span style={{color: '#22c55e'}}> {allWins.length} kazanan</span> | 
            <span style={{color: '#ef4444'}}> {allLosses.length} kaybeden</span>
          </p>
          <div style={{display: 'flex', gap: 20, marginTop: 10}}>
            <div>
              <div style={{fontSize: 11, color: '#64748b'}}>Toplam Kazanc</div>
              <div style={{fontSize: 18, fontWeight: 700, color: '#22c55e'}}>{fUSD(totalWinAmount)}</div>
            </div>
            <div>
              <div style={{fontSize: 11, color: '#64748b'}}>Toplam Kayip</div>
              <div style={{fontSize: 18, fontWeight: 700, color: '#ef4444'}}>{fUSD(totalLossAmount)}</div>
            </div>
          </div>
        </div>

        <div className="control-box" style={{borderLeft: (stats?.consecutiveLosses || 0) >= 3 ? '3px solid #ef4444' : '3px solid #22c55e'}}>
          <div className="control-icon">⚠️</div>
          <h3>Risk Durumu</h3>
          <p className="control-desc">
            Adaptif Esik: <strong>%{stats?.adaptiveThreshold || 70}</strong><br/>
            Pespese Kayip: <strong style={{color: (stats?.consecutiveLosses || 0) >= 3 ? '#ef4444' : '#22c55e'}}>{stats?.consecutiveLosses || 0}</strong>
          </p>
        </div>
      </div>

      {/* Tab Menu */}
      <div className="filter-bar">
        <button className={'filter-btn ' + (activeTab === 'overview' ? 'active' : '')} onClick={function() { setActiveTab('overview'); }}>📊 Genel Bakis</button>
        <button className={'filter-btn ' + (activeTab === 'open' ? 'active' : '')} onClick={function() { setActiveTab('open'); }}>📌 Acik Pozisyonlar ({openPositions.length})</button>
        <button className={'filter-btn ' + (activeTab === 'coins' ? 'active' : '')} onClick={function() { setActiveTab('coins'); }}>🪙 Coin Bazli</button>
        <button className={'filter-btn ' + (activeTab === 'trades' ? 'active' : '')} onClick={function() { setActiveTab('trades'); }}>📋 Tum Islemler</button>
        <button className={'filter-btn ' + (activeTab === 'chart' ? 'active' : '')} onClick={function() { setActiveTab('chart'); }}>📈 PnL Grafigi</button>
      </div>

      {/* GENEL BAKIS */}
      {activeTab === 'overview' && (
        <div>
          <div className="card-grid">
            <div className="card"><div className="card-label">Bakiye</div><div className="card-value">{fUSD(stats?.balance)}</div></div>
            <div className="card"><div className="card-label">Toplam PnL</div><div className={'card-value ' + ((stats?.totalPnl || 0) >= 0 ? 'green' : 'red')}>{fUSD(stats?.totalPnl)} (%{stats?.totalPnlPct || 0})</div></div>
            <div className="card"><div className="card-label">Basari</div><div className="card-value green">%{stats?.winRate || 0}</div></div>
            <div className="card"><div className="card-label">PF</div><div className="card-value gold">{stats?.profitFactor || '-'}</div></div>
          </div>
          <div className="card-grid">
            <div className="card"><div className="card-label">Toplam Islem</div><div className="card-value">{stats?.totalTrades || 0}</div></div>
            <div className="card"><div className="card-label">Kazanan</div><div className="card-value green">{stats?.wins || 0}</div></div>
            <div className="card"><div className="card-label">Kaybeden</div><div className="card-value red">{stats?.losses || 0}</div></div>
            <div className="card"><div className="card-label">Acik</div><div className="card-value gold">{stats?.openTrades || 0}</div></div>
          </div>
        </div>
      )}

      {/* ACIK POZISYONLAR */}
      {activeTab === 'open' && (
        <div>
          <h2>Acik Pozisyonlar ({openPositions.length})</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Yon</th>
                  <th>Giris</th>
                  <th>Guncel</th>
                  <th>Stop</th>
                  <th>Hedef</th>
                  <th>PnL%</th>
                  <th>PnL USDT</th>
                  <th>AI</th>
                  <th>Acilis</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map(function(pos, i) {
                  return (
                    <tr key={i} className={(pos.pnl_percent || 0) >= 0 ? 'row-profit' : 'row-loss'}>
                      <td><strong>{pos.symbol}</strong></td>
                      <td><span className="badge badge-buy">LONG</span></td>
                      <td>{pos.entry_price ? pos.entry_price.toFixed(6) : '-'}</td>
                      <td>{pos.current_price ? pos.current_price.toFixed(6) : '-'}</td>
                      <td>{pos.stop_loss ? pos.stop_loss.toFixed(6) : '-'}</td>
                      <td>{pos.take_profit ? pos.take_profit.toFixed(6) : '-'}</td>
                      <td style={{color: (pos.pnl_percent || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                        %{pos.pnl_percent ? pos.pnl_percent.toFixed(2) : '0.00'}
                      </td>
                      <td style={{color: (pos.pnl || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                        {pos.pnl ? pos.pnl.toFixed(4) : '0.0000'}
                      </td>
                      <td>
                        <span className={'badge ' + ((pos.machine_confidence || 0) >= 0.80 ? 'badge-buy' : (pos.machine_confidence || 0) >= 0.65 ? 'badge-wait' : 'badge-sell')}>
                          %{((pos.machine_confidence || 0) * 100).toFixed(0)}
                        </span>
                      </td>
                      <td style={{fontSize: 11, color: '#94a3b8'}}>{formatTime(pos.opened_at)}</td>
                    </tr>
                  );
                })}
                {openPositions.length === 0 && (
                  <tr><td colSpan="10" style={{textAlign: 'center', color: '#64748b', padding: 40}}>Acik pozisyon yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COIN BAZLI */}
      {activeTab === 'coins' && (
        <div>
          <h2>Coin Performansi</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Coin</th><th>Islem</th><th>Kazanan</th><th>Basari</th><th>Toplam PnL</th><th>Ort. PnL%</th></tr>
              </thead>
              <tbody>
                {coinStats.map(function(coin, i) {
                  return (
                    <tr key={i} className={coin.totalPnl >= 0 ? 'row-profit' : 'row-loss'}>
                      <td><strong>{coin.symbol}</strong></td>
                      <td>{coin.trades}</td>
                      <td style={{color: '#22c55e'}}>{coin.wins}</td>
                      <td style={{color: coin.wins/coin.trades >= 0.5 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                        {coin.trades > 0 ? '%' + (coin.wins/coin.trades*100).toFixed(0) : '-'}
                      </td>
                      <td style={{color: coin.totalPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>{fUSD(coin.totalPnl)}</td>
                      <td style={{color: coin.totalPnlPct >= 0 ? '#22c55e' : '#ef4444'}}>%{coin.totalPnlPct.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {coinStats.length === 0 && (
                  <tr><td colSpan="6" style={{textAlign: 'center', color: '#64748b', padding: 40}}>Henuz islem yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TUM ISLEMLER */}
      {activeTab === 'trades' && (
        <div>
          <h2>Tum Islemler ({closedTrades.length})</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Coin</th><th>Yon</th><th>Giris</th><th>Cikis</th><th>PnL%</th><th>PnL USDT</th><th>Neden</th><th>AI</th><th>Kapanis</th></tr>
              </thead>
              <tbody>
                {closedTrades.slice(-50).reverse().map(function(t, i) {
                  return (
                    <tr key={i} className={t.pnl >= 0 ? 'row-profit' : 'row-loss'}>
                      <td><strong>{t.symbol}</strong></td>
                      <td><span className="badge badge-buy">LONG</span></td>
                      <td>{t.entry_price ? t.entry_price.toFixed(6) : '-'}</td>
                      <td>{t.exit_price ? t.exit_price.toFixed(6) : '-'}</td>
                      <td style={{color: t.pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>%{t.pnl_percent ? t.pnl_percent.toFixed(2) : '0'}</td>
                      <td style={{color: t.pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>{t.pnl ? t.pnl.toFixed(4) : '0'}</td>
                      <td><span className="badge badge-wait">{t.close_reason || 'KAPALI'}</span></td>
                      <td><span className={'badge ' + ((t.machine_confidence || 0) >= 0.80 ? 'badge-buy' : 'badge-wait')}>%{((t.machine_confidence || 0) * 100).toFixed(0)}</span></td>
                      <td style={{fontSize: 11, color: '#94a3b8'}}>{formatTime(t.closed_at)}</td>
                    </tr>
                  );
                })}
                {closedTrades.length === 0 && (
                  <tr><td colSpan="9" style={{textAlign: 'center', color: '#64748b', padding: 40}}>Kapali islem yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PNL GRAFIK */}
      {activeTab === 'chart' && (
        <div>
          <h2>Son Islemler PnL</h2>
          <div style={{background: '#0d1321', border: '1px solid #1a2540', borderRadius: 14, padding: 30, marginBottom: 20}}>
            {closedTrades.slice(-10).length > 0 ? (
              <div style={{display: 'flex', alignItems: 'flex-end', gap: 12, height: 180}}>
                {closedTrades.slice(-10).reverse().map(function(t, i) {
                  var maxAbs = Math.max.apply(null, closedTrades.slice(-10).map(function(x) { return Math.abs(x.pnl_percent || 0); }));
                  var h = Math.max(6, (Math.abs(t.pnl_percent || 0) / Math.max(maxAbs, 1)) * 150);
                  return (
                    <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
                      <span style={{fontSize: 10, color: (t.pnl_percent || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>%{(t.pnl_percent || 0).toFixed(1)}</span>
                      <div style={{width: '100%', maxWidth: 40, height: h, borderRadius: '4px 4px 0 0', background: (t.pnl_percent || 0) >= 0 ? 'linear-gradient(180deg, #22c55e, #166534)' : 'linear-gradient(180deg, #ef4444, #991b1b)'}}></div>
                      <span style={{fontSize: 9, color: '#64748b'}}>{(t.symbol || '').replace('USDT','')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{textAlign: 'center', color: '#64748b', padding: 50}}>Islem yok</div>
            )}
          </div>
        </div>
      )}

      {/* Sifirlama */}
      <div style={{marginTop: 30, textAlign: 'right'}}>
        <button className="btn btn-danger" onClick={resetSim}>🔄 Simulasyonu Sifirla</button>
      </div>
    </div>
  );
}

export default Simulation;
