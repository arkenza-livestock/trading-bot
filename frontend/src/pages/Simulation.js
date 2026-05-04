import React, { useState, useEffect, useCallback } from 'react';

function Simulation() {
  const [stats, setStats] = useState(null);
  const [trades, setTrades] = useState([]);
  const [coinStats, setCoinStats] = useState([]);
  const [simRunning, setSimRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, statusRes, tradesRes] = await Promise.all([
        fetch('/api/simulation/stats'),
        fetch('/api/status'),
        fetch('/api/simulation/trades')
      ]);
      const statsData = await statsRes.json();
      const statusData = await statusRes.json();
      const tradesData = await tradesRes.json();
      
      setStats(statsData);
      setSimRunning(statusData.simRunning || false);
      setTrades(tradesData || []);
      
      // Coin bazlı performans hesapla
      const coinMap = {};
      (tradesData || []).forEach(t => {
        if (!coinMap[t.symbol]) {
          coinMap[t.symbol] = { symbol: t.symbol, trades: 0, wins: 0, totalPnl: 0, totalPnlPct: 0 };
        }
        coinMap[t.symbol].trades++;
        if (t.pnl > 0) coinMap[t.symbol].wins++;
        coinMap[t.symbol].totalPnl += t.pnl || 0;
        coinMap[t.symbol].totalPnlPct += t.pnl_percent || 0;
      });
      setCoinStats(Object.values(coinMap).sort((a, b) => b.totalPnl - a.totalPnl));
      
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const startSim = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/simulation/start', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
      setSimRunning(true);
      setTimeout(fetchStats, 2000);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const stopSim = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/simulation/stop', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
      setSimRunning(false);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const resetSim = async () => {
    if (!window.confirm('Simülasyonu SIFIRLAMAK istediğinize emin misiniz? Tüm işlem geçmişi silinir.')) return;
    try {
      const res = await fetch('/api/simulation/reset', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startBalance: 1000 })
      });
      const data = await res.json();
      setMessage(data.message);
      setTrades([]);
      setCoinStats([]);
      fetchStats();
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  if (loading) return <div className="loading">⏳ Yükleniyor...</div>;

  const fUSD = (v) => '$' + (v || 0).toFixed(2);
  const fPCT = (v) => '%' + (v || 0).toFixed(1);

  // Son 10 işlem için mini grafik verisi
  const last10Trades = trades.slice(-10).reverse();
  const maxAbsPnl = Math.max(...last10Trades.map(t => Math.abs(t.pnl_percent || 0)), 1);

  // Kazanç dağılımı
  const allWins = trades.filter(t => t.pnl > 0);
  const allLosses = trades.filter(t => t.pnl < 0);
  const totalWinAmount = allWins.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalLossAmount = Math.abs(allLosses.reduce((s, t) => s + (t.pnl || 0), 0));

  return (
    <div className="simulation">
      <h1>🧪 Simülasyon</h1>
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>
        Sanal para ile makine öğrenmesi. Gerçek işlem yapmaz.
      </p>

      {message && <div className="message">{message}</div>}

      {/* Kontrol Butonları */}
      <div className="control-panel">
        <div className="control-box sim-box">
          <div className="control-icon">🧠</div>
          <h3>Simülasyon Motoru</h3>
          <p className="control-desc">
            Makinenin sinyalleriyle <strong>sanal alım-satım</strong> yapar.
          </p>
          <div className="control-buttons">
            {!simRunning ? (
              <button className="btn-start sim" onClick={startSim}>▶️ BAŞLAT</button>
            ) : (
              <button className="btn-stop" onClick={stopSim}>⏹️ DURDUR</button>
            )}
            <span className={`status-badge ${simRunning ? 'online' : 'offline'}`}>
              <span className={`status-dot ${simRunning ? 'active' : 'inactive'}`}></span>
              {simRunning ? 'Çalışıyor' : 'Durdu'}
            </span>
          </div>
        </div>

        <div className="control-box">
          <div className="control-icon">📊</div>
          <h3>Özet</h3>
          <p className="control-desc">
            <strong>{trades.length}</strong> işlem | 
            <span style={{color: '#22c55e'}}> {allWins.length} kazanan</span> | 
            <span style={{color: '#ef4444'}}> {allLosses.length} kaybeden</span>
          </p>
          <div style={{display: 'flex', gap: 20, marginTop: 10}}>
            <div>
              <div style={{fontSize: 11, color: '#64748b'}}>Toplam Kazanç</div>
              <div style={{fontSize: 18, fontWeight: 700, color: '#22c55e'}}>{fUSD(totalWinAmount)}</div>
            </div>
            <div>
              <div style={{fontSize: 11, color: '#64748b'}}>Toplam Kayıp</div>
              <div style={{fontSize: 18, fontWeight: 700, color: '#ef4444'}}>{fUSD(totalLossAmount)}</div>
            </div>
          </div>
        </div>

        <div className="control-box" style={{borderLeft: (stats?.consecutiveLosses || 0) >= 3 ? '3px solid #ef4444' : '3px solid #22c55e'}}>
          <div className="control-icon">⚠️</div>
          <h3>Risk Durumu</h3>
          <p className="control-desc">
            Adaptif Eşik: <strong>%{stats?.adaptiveThreshold || 70}</strong><br/>
            Peşpeşe Kayıp: <strong style={{color: (stats?.consecutiveLosses || 0) >= 3 ? '#ef4444' : '#22c55e'}}>
              {stats?.consecutiveLosses || 0}
            </strong>
          </p>
          {(stats?.consecutiveLosses || 0) >= 3 && (
            <div style={{color: '#ef4444', fontSize: 12, marginTop: 8}}>🔴 Makine otomatik korumada!</div>
          )}
        </div>
      </div>

      {/* Tab Menü */}
      <div className="filter-bar">
        <button className={`filter-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          📊 Genel Bakış
        </button>
        <button className={`filter-btn ${activeTab === 'coins' ? 'active' : ''}`} onClick={() => setActiveTab('coins')}>
          🪙 Coin Bazlı
        </button>
        <button className={`filter-btn ${activeTab === 'trades' ? 'active' : ''}`} onClick={() => setActiveTab('trades')}>
          📋 İşlemler
        </button>
        <button className={`filter-btn ${activeTab === 'chart' ? 'active' : ''}`} onClick={() => setActiveTab('chart')}>
          📈 PnL Grafiği
        </button>
      </div>

      {/* GENEL BAKIŞ */}
      {activeTab === 'overview' && (
        <>
          <div className="card-grid">
            <div className="card">
              <div className="card-label">💰 Bakiye</div>
              <div className="card-value">{fUSD(stats?.balance)}</div>
            </div>
            <div className="card">
              <div className="card-label">📈 Toplam PnL</div>
              <div className={`card-value ${(stats?.totalPnl || 0) >= 0 ? 'green' : 'red'}`}>
                {fUSD(stats?.totalPnl)} ({fPCT(stats?.totalPnlPct)})
              </div>
            </div>
            <div className="card">
              <div className="card-label">🏆 Başarı</div>
              <div className="card-value green">{fPCT(stats?.winRate)}</div>
            </div>
            <div className="card">
              <div className="card-label">📊 PF</div>
              <div className="card-value gold">{stats?.profitFactor || '-'}</div>
            </div>
          </div>

          <div className="card-grid">
            <div className="card">
              <div className="card-label">🔄 Toplam İşlem</div>
              <div className="card-value">{stats?.totalTrades || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">✅ Kazanan</div>
              <div className="card-value green">{stats?.wins || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">❌ Kaybeden</div>
              <div className="card-value red">{stats?.losses || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">📌 Açık</div>
              <div className="card-value gold">{stats?.openTrades || 0}</div>
            </div>
          </div>

          <div className="card-grid">
            <div className="card">
              <div className="card-label">📈 Ort. Kazanç</div>
              <div className="card-value green">%{stats?.avgWin || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">📉 Ort. Kayıp</div>
              <div className="card-value red">%{stats?.avgLoss || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">🔝 En İyi</div>
              <div className="card-value green">%{stats?.bestTrade || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">🔻 En Kötü</div>
              <div className="card-value red">%{stats?.worstTrade || 0}</div>
            </div>
          </div>

          {/* Açık Pozisyonlar */}
          <h2>📌 Açık Pozisyonlar</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Sembol</th><th>Giriş</th><th>Anlık</th><th>PnL%</th><th>Stop</th><th>Hedef</th><th>AI</th></tr>
              </thead>
              <tbody>
                {(stats?.openPositions || []).map((pos, i) => (
                  <tr key={i} className={(pos.pnl_percent || 0) >= 0 ? 'row-profit' : 'row-loss'}>
                    <td><strong>{pos.symbol}</strong></td>
                    <td>{pos.entry_price?.toFixed(6)}</td>
                    <td>{pos.current_price?.toFixed(6)}</td>
                    <td style={{color: (pos.pnl_percent || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                      %{pos.pnl_percent?.toFixed(2)}
                    </td>
                    <td>{pos.stop_loss?.toFixed(6)}</td>
                    <td>{pos.take_profit?.toFixed(6) || '-'}</td>
                    <td>%{((pos.machine_confidence || 0) * 100).toFixed(0)}</td>
                  </tr>
                ))}
                {(!stats?.openPositions || stats.openPositions.length === 0) && (
                  <tr><td colSpan="7" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Açık pozisyon yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* COİN BAZLI */}
      {activeTab === 'coins' && (
        <>
          <h2>🪙 Coin Performansı</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Sembol</th><th>İşlem</th><th>Kazanan</th><th>Başarı</th><th>Toplam PnL</th><th>Ort. PnL%</th></tr>
              </thead>
              <tbody>
                {coinStats.map((coin, i) => (
                  <tr key={i} className={coin.totalPnl >= 0 ? 'row-profit' : 'row-loss'}>
                    <td><strong>{coin.symbol}</strong></td>
                    <td>{coin.trades}</td>
                    <td style={{color: '#22c55e'}}>{coin.wins}</td>
                    <td style={{color: coin.wins/coin.trades >= 0.5 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                      {coin.trades > 0 ? '%' + (coin.wins/coin.trades*100).toFixed(0) : '-'}
                    </td>
                    <td style={{color: coin.totalPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                      {fUSD(coin.totalPnl)}
                    </td>
                    <td style={{color: coin.totalPnlPct >= 0 ? '#22c55e' : '#ef4444'}}>
                      %{coin.totalPnlPct.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {coinStats.length === 0 && (
                  <tr><td colSpan="6" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Henüz işlem yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* İŞLEMLER */}
      {activeTab === 'trades' && (
        <>
          <h2>📋 Tüm İşlemler ({trades.length})</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Sembol</th><th>Giriş</th><th>Çıkış</th><th>PnL</th><th>PnL%</th><th>Neden</th><th>AI</th></tr>
              </thead>
              <tbody>
                {trades.slice(-50).reverse().map((t, i) => (
                  <tr key={i} className={t.pnl >= 0 ? 'row-profit' : 'row-loss'}>
                    <td><strong>{t.symbol}</strong></td>
                    <td>{t.entry_price?.toFixed(6)}</td>
                    <td>{t.exit_price?.toFixed(6) || '-'}</td>
                    <td style={{color: t.pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                      {fUSD(t.pnl)}
                    </td>
                    <td style={{color: t.pnl >= 0 ? '#22c55e' : '#ef4444'}}>
                      %{t.pnl_percent?.toFixed(2)}
                    </td>
                    <td><span className={`badge ${t.close_reason === 'TAKE_PROFIT' || t.close_reason === 'TRAILING_STOP' ? 'badge-buy' : t.close_reason === 'STOP_LOSS' || t.close_reason === 'HARD_STOP' ? 'badge-sell' : 'badge-wait'}`}>{t.close_reason || t.status}</span></td>
                    <td>%{((t.machine_confidence || 0) * 100).toFixed(0)}</td>
                  </tr>
                ))}
                {trades.length === 0 && (
                  <tr><td colSpan="7" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Henüz işlem yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* PNL GRAFİĞİ */}
      {activeTab === 'chart' && (
        <>
          <h2>📈 Son 10 İşlem PnL Grafiği</h2>
          <div style={{background: '#0d1321', border: '1px solid #1a2540', borderRadius: 14, padding: 30, marginBottom: 20}}>
            {last10Trades.length > 0 ? (
              <div style={{display: 'flex', alignItems: 'flex-end', gap: 12, height: 200, paddingTop: 20}}>
                {last10Trades.map((t, i) => {
                  const height = Math.max(8, (Math.abs(t.pnl_percent || 0) / maxAbsPnl) * 160);
                  return (
                    <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8}}>
                      <span style={{fontSize: 10, color: (t.pnl_percent || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                        %{(t.pnl_percent || 0).toFixed(1)}
                      </span>
                      <div style={{
                        width: '100%',
                        maxWidth: 40,
                        height,
                        borderRadius: '6px 6px 0 0',
                        background: (t.pnl_percent || 0) >= 0 
                          ? 'linear-gradient(180deg, #22c55e, #166534)' 
                          : 'linear-gradient(180deg, #ef4444, #991b1b)',
                        transition: 'all 0.3s'
                      }}></div>
                      <span style={{fontSize: 9, color: '#64748b'}}>{t.symbol?.replace('USDT','')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{textAlign: 'center', color: '#64748b', padding: 50}}>Henüz işlem yok</div>
            )}
          </div>

          {/* Kazanç/Kayıp Dağılımı */}
          <div className="card-grid">
            <div className="card" style={{textAlign: 'center'}}>
              <div className="card-label">Kazanç/Kayıp Oranı</div>
              <div style={{display: 'flex', height: 20, borderRadius: 10, overflow: 'hidden', marginTop: 10}}>
                <div style={{
                  width: stats?.winRate + '%',
                  background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                  transition: 'all 0.5s'
                }}></div>
                <div style={{
                  width: (100 - (stats?.winRate || 0)) + '%',
                  background: 'linear-gradient(90deg, #dc2626, #991b1b)'
                }}></div>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#64748b'}}>
                <span style={{color: '#22c55e'}}>%{stats?.winRate || 0} Kazanç</span>
                <span style={{color: '#ef4444'}}>%{(100 - (stats?.winRate || 0)).toFixed(1)} Kayıp</span>
              </div>
            </div>
            <div className="card">
              <div className="card-label">💰 Toplam Kazanç</div>
              <div className="card-value green">{fUSD(totalWinAmount)}</div>
            </div>
            <div className="card">
              <div className="card-label">💸 Toplam Kayıp</div>
              <div className="card-value red">{fUSD(totalLossAmount)}</div>
            </div>
          </div>
        </>
      )}

      {/* Sıfırlama */}
      <div style={{marginTop: 30, textAlign: 'right'}}>
        <button className="btn btn-danger" onClick={resetSim}>
          🔄 Simülasyonu Sıfırla
        </button>
      </div>
    </div>
  );
}

export default Simulation;
