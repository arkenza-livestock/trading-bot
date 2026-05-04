import React, { useState, useEffect, useCallback } from 'react';

function Dashboard() {
  const [realStats, setRealStats] = useState(null);
  const [signals, setSignals] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  var fetchData = useCallback(async function() {
    try {
      var results = await Promise.all([
        fetch('/api/status'),
        fetch('/api/signals'),
        fetch('/api/settings')
      ]);
      
      setRealStats(await results[0].json());
      setSignals(await results[1].json());
      setSettings(await results[2].json());
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function() {
    fetchData();
    var interval = setInterval(fetchData, 30000);
    return function() { clearInterval(interval); };
  }, [fetchData]);

  if (loading) return <div className="loading">Yukleniyor...</div>;

  var aiAcceptedSignals = signals.filter(function(s) { return (s.ai_comment || '').indexOf('✅') !== -1; });
  var aiRejectedSignals = signals.filter(function(s) { return (s.ai_comment || '').indexOf('❌') !== -1; });
  var realTradingEnabled = settings.real_trading === 'true' || settings.real_trading === '1';

  var formatTime = function(timeStr) {
    if (!timeStr) return '-';
    try { return new Date(timeStr + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }); }
    catch(e) { return timeStr; }
  };

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>
        Canli durum ve performans ozeti
        {realStats?.botRunning && <span style={{color: '#22c55e', marginLeft: 10}}>🟢 Calisiyor</span>}
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
          <span className="label">Guc (ADX)</span>
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

      {/* Gercek Islem Durumu */}
      <h2>Gercek Islem Durumu</h2>
      <div className="card-grid">
        <div className="card">
          <div className="card-label">Gercek Alim</div>
          <div className={'card-value ' + (realTradingEnabled ? 'green' : 'red')}>
            {realTradingEnabled ? 'ACIK ✅' : 'KAPALI ❌'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Bot</div>
          <div className={'card-value ' + (realStats?.botRunning ? 'green' : 'red')}>
            {realStats?.botRunning ? 'AKTIF' : 'DURDU'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Tarama</div>
          <div className="card-value">#{realStats?.scanCount || 0}</div>
        </div>
      </div>

      {/* Acik Pozisyonlar - SADECE GERCEK */}
      <h2>Gercek Islem - Acik Pozisyonlar</h2>
      {!realTradingEnabled && (
        <div style={{
          background: '#1e293b', border: '1px solid #f59e0b', borderRadius: 10,
          padding: 30, marginBottom: 15, textAlign: 'center'
        }}>
          <div style={{fontSize: 40, marginBottom: 10}}>🔒</div>
          <div style={{color: '#fbbf24', fontSize: 14, fontWeight: 600, marginBottom: 5}}>Gercek Alim Kapali</div>
          <div style={{color: '#64748b', fontSize: 13}}>Ayarlar sayfasindan gercek alimi aktif edin.</div>
          <div style={{color: '#64748b', fontSize: 12, marginTop: 8}}>Simulasyon pozisyonlari burada gosterilmez.</div>
        </div>
      )}
      {realTradingEnabled && (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Sembol</th><th>Giris</th><th>Stop</th><th>AI</th><th>Acilis</th></tr>
            </thead>
            <tbody>
              <tr><td colSpan="5" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Gercek alim aktif - Henuz pozisyon yok</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Makine Zekasi */}
      <h2>Makine Zekasi</h2>
      <div className="card-grid">
        <div className="card ai-card">
          <div className="card-label">✅ Kabul Edilen</div>
          <div className="card-value green">{aiAcceptedSignals.length}</div>
        </div>
        <div className="card ai-card">
          <div className="card-label">❌ Reddedilen</div>
          <div className="card-value red">{aiRejectedSignals.length}</div>
        </div>
        <div className="card ai-card">
          <div className="card-label">📋 Kabul Orani</div>
          <div className="card-value gold">
            %{signals.length > 0 ? (aiAcceptedSignals.length / Math.max(1, aiAcceptedSignals.length + aiRejectedSignals.length) * 100).toFixed(0) : 0}
          </div>
        </div>
        <div className="card ai-card">
          <div className="card-label">🔢 Son Tarama</div>
          <div className="card-value purple">{signals.length} sinyal</div>
        </div>
      </div>

      {/* Kabul Edilen Sinyaller */}
      <h2>Makinenin Kabul Ettigi Sinyaller ({aiAcceptedSignals.length})</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr><th>Sembol</th><th>Fiyat</th><th>Puan</th><th>RSI</th><th>Trend</th><th>AI Yorum</th></tr>
          </thead>
          <tbody>
            {aiAcceptedSignals.slice(0, 15).map(function(s, i) {
              return (
                <tr key={i} className="row-buy">
                  <td><strong>{s.symbol}</strong></td>
                  <td>{s.fiyat ? s.fiyat.toFixed(6) : '-'}</td>
                  <td>{s.score || '-'}</td>
                  <td>{s.rsi ? s.rsi.toFixed(1) : '-'}</td>
                  <td><span className="badge badge-buy">{s.trend || '-'}</span></td>
                  <td style={{fontSize: 12, color: '#22c55e', maxWidth: 200}}>{s.ai_comment || '-'}</td>
                </tr>
              );
            })}
            {aiAcceptedSignals.length === 0 && (
              <tr><td colSpan="6" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Kabul edilen sinyal yok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Reddedilen Sinyaller */}
      <h2>Reddedilen ({aiRejectedSignals.length})</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr><th>Sembol</th><th>Fiyat</th><th>Puan</th><th>RSI</th><th>Red Nedeni</th></tr>
          </thead>
          <tbody>
            {aiRejectedSignals.slice(0, 10).map(function(s, i) {
              return (
                <tr key={i} className="row-wait">
                  <td><strong>{s.symbol}</strong></td>
                  <td>{s.fiyat ? s.fiyat.toFixed(6) : '-'}</td>
                  <td>{s.score || '-'}</td>
                  <td>{s.rsi ? s.rsi.toFixed(1) : '-'}</td>
                  <td style={{fontSize: 12, color: '#ef4444'}}>{s.ai_comment || '-'}</td>
                </tr>
              );
            })}
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
