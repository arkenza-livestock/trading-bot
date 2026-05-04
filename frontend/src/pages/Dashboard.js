import React, { useState, useEffect, useCallback } from 'react';

function Dashboard() {
  const [realStats, setRealStats] = useState(null);
  const [positions, setPositions] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, posRes, sigRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/positions'),
        fetch('/api/signals')
      ]);
      
      const status = await statusRes.json();
      const posData = await posRes.json();
      const sigData = await sigRes.json();
      
      setRealStats(status);
      setPositions(posData || []);
      setSignals(sigData || []);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <div className="loading">⏳ Yükleniyor...</div>;

  const openPositions = positions.filter(p => p.status === 'OPEN');
  const aiAcceptedSignals = signals.filter(s => (s.ai_comment || '').includes('✅'));
  const aiRejectedSignals = signals.filter(s => (s.ai_comment || '').includes('❌'));

  return (
    <div className="dashboard">
      <h1>📊 Dashboard</h1>
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>
        Canlı durum ve performans özeti
        {realStats?.botRunning && <span style={{color: '#22c55e', marginLeft: 10}}>🟢 Çalışıyor</span>}
        {!realStats?.botRunning && <span style={{color: '#ef4444', marginLeft: 10}}>🔴 Durdu</span>}
      </p>

      {/* BTC Durumu */}
      <div className="btc-status-bar">
        <div className="btc-item">
          <span className="label">₿ BTC Trend</span>
          <span className="value up">{realStats?.btcTrend?.trend || 'BELIRSIZ'}</span>
        </div>
        <div className="btc-item">
          <span className="label">RSI</span>
          <span className="value">{realStats?.btcTrend?.rsi?.toFixed(1) || '-'}</span>
        </div>
        <div className="btc-item">
          <span className="label">Güç (ADX)</span>
          <span className="value">{realStats?.btcTrend?.strength?.toFixed(1) || '-'}</span>
        </div>
        <div className="btc-item">
          <span className="label">Tarama</span>
          <span className="value">#{realStats?.scanCount || 0}</span>
        </div>
        <div className="btc-item">
          <span className="label">BTC Fiyat</span>
          <span className="value">${realStats?.btcTrend?.fiyat?.toFixed(0) || '-'}</span>
        </div>
      </div>

      {/* Gerçek İşlem Özeti */}
      <h2>💰 Gerçek İşlem</h2>
      <div className="card-grid">
        <div className="card">
          <div className="card-label">📌 Açık Pozisyon</div>
          <div className="card-value gold">{openPositions.length}</div>
        </div>
        <div className="card">
          <div className="card-label">🟢 Çalışma</div>
          <div className={`card-value ${realStats?.botRunning ? 'green' : 'red'}`}>
            {realStats?.botRunning ? 'AKTİF' : 'DURDU'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">🔢 Tarama</div>
          <div className="card-value">#{realStats?.scanCount || 0}</div>
        </div>
        <div className="card">
          <div className="card-label">⚙️ Gerçek Alım</div>
          <div className="card-value gold">
            {realStats?.realTrading ? 'AÇIK' : 'KAPALI'}
          </div>
        </div>
      </div>

      {/* Açık Pozisyonlar */}
      <h2>📌 Açık Pozisyonlar ({openPositions.length})</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Giriş</th>
              <th>Anlık</th>
              <th>PnL%</th>
              <th>Stop</th>
              <th>Hedef</th>
              <th>AI Güven</th>
            </tr>
          </thead>
          <tbody>
            {openPositions.map((pos, i) => (
              <tr key={i} className={(pos.pnl_percent || 0) >= 0 ? 'row-profit' : 'row-loss'}>
                <td><strong>{pos.symbol}</strong></td>
                <td>{pos.entry_price?.toFixed(6)}</td>
                <td>{pos.current_price?.toFixed(6)}</td>
                <td style={{color: (pos.pnl_percent || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                  %{pos.pnl_percent?.toFixed(2)}
                </td>
                <td>{pos.stop_loss?.toFixed(6)}</td>
                <td>{pos.take_profit?.toFixed(6) || '-'}</td>
                <td>
                  <span className={`badge ${(pos.machine_confidence || 0) >= 0.80 ? 'badge-buy' : (pos.machine_confidence || 0) >= 0.65 ? 'badge-wait' : 'badge-sell'}`}>
                    %{((pos.machine_confidence || 0) * 100).toFixed(0)}
                  </span>
                </td>
              </tr>
            ))}
            {openPositions.length === 0 && (
              <tr><td colSpan="7" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Açık pozisyon yok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Makine Zekası */}
      <h2>🧠 Makine Zekası</h2>
      <div className="card-grid">
        <div className="card ai-card">
          <div className="card-label">Kabul Edilen</div>
          <div className="card-value green">{aiAcceptedSignals.length}</div>
        </div>
        <div className="card ai-card">
          <div className="card-label">Reddedilen</div>
          <div className="card-value red">{aiRejectedSignals.length}</div>
        </div>
        <div className="card ai-card">
          <div className="card-label">Kabul Oranı</div>
          <div className="card-value gold">
            %{signals.length > 0 ? (aiAcceptedSignals.length / Math.max(1, aiAcceptedSignals.length + aiRejectedSignals.length) * 100).toFixed(0) : 0}
          </div>
        </div>
        <div className="card ai-card">
          <div className="card-label">Son Tarama</div>
          <div className="card-value purple">{signals.length} sinyal</div>
        </div>
      </div>

      {/* Kabul Edilen Sinyaller */}
      <h2>✅ Makine Kabul Edilen ({aiAcceptedSignals.length})</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Fiyat</th>
              <th>Puan</th>
              <th>RSI</th>
              <th>Trend</th>
              <th>AI Yorum</th>
            </tr>
          </thead>
          <tbody>
            {aiAcceptedSignals.slice(0, 10).map((s, i) => (
              <tr key={i} className="row-buy">
                <td><strong>{s.symbol}</strong></td>
                <td>{s.fiyat?.toFixed(6)}</td>
                <td>{s.score || '-'}</td>
                <td>{s.rsi?.toFixed(1) || '-'}</td>
                <td><span className="badge badge-buy">{s.trend || '-'}</span></td>
                <td style={{fontSize: 12, color: '#22c55e', maxWidth: 200}}>{s.ai_comment || '-'}</td>
              </tr>
            ))}
            {aiAcceptedSignals.length === 0 && (
              <tr><td colSpan="6" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Kabul edilen sinyal yok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Reddedilen Sinyaller Özet */}
      <h2>❌ Reddedilen ({aiRejectedSignals.length})</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Fiyat</th>
              <th>Puan</th>
              <th>RSI</th>
              <th>Red Nedeni</th>
            </tr>
          </thead>
          <tbody>
            {aiRejectedSignals.slice(0, 10).map((s, i) => (
              <tr key={i} className="row-wait">
                <td><strong>{s.symbol}</strong></td>
                <td>{s.fiyat?.toFixed(6)}</td>
                <td>{s.score || '-'}</td>
                <td>{s.rsi?.toFixed(1) || '-'}</td>
                <td style={{fontSize: 12, color: '#ef4444'}}>{s.ai_comment || '-'}</td>
              </tr>
            ))}
            {aiRejectedSignals.length === 0 && (
              <tr><td colSpan="5" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Reddedilen sinyal yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
