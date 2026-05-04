import React, { useState, useEffect, useCallback } from 'react';

function Dashboard() {
  const [realStats, setRealStats] = useState(null);
  const [signals, setSignals] = useState([]);
  const [positions, setPositions] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

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

  // Açık pozisyonları ayır
  var openPositions = positions.filter(function(p) { return p.status === 'OPEN'; });
  var realOpenPositions = openPositions.filter(function(p) { return p.is_real === 1; });
  var simOpenPositions = openPositions.filter(function(p) { return p.is_real === 0; });

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

      {/* Islem Durumu */}
      <h2>Islem Durumu</h2>
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
          <div className="card-label">Acik Pozisyon</div>
          <div className="card-value gold">{openPositions.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Tarama</div>
          <div className="card-value">#{realStats?.scanCount || 0}</div>
        </div>
      </div>

      {/* GERCEK POZISYONLAR */}
      <h2>📌 Gercek Islem - Acik Pozisyonlar ({realOpenPositions.length})</h2>
      {!realTradingEnabled && (
        <div style={{
          background: '#1e293b', border: '1px solid #f59e0b', borderRadius: 10,
          padding: 25, marginBottom: 15, textAlign: 'center'
        }}>
          <div style={{fontSize: 35, marginBottom: 8}}>🔒</div>
          <div style={{color: '#fbbf24', fontSize: 14, fontWeight: 600}}>Gercek Alim Kapali</div>
          <div style={{color: '#64748b', fontSize: 12, marginTop: 5}}>Ayarlar sayfasindan gercek alimi aktif edin.</div>
        </div>
      )}
      {realTradingEnabled && realOpenPositions.length > 0 && (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Sembol</th><th>Giris</th><th>Anlik</th><th>PnL%</th><th>Stop</th><th>Hedef</th><th>AI</th><th>Acilis</th></tr>
            </thead>
            <tbody>
              {realOpenPositions.map(function(pos, i) {
                return (
                  <tr key={i} className={(pos.pnl_percent || 0) >= 0 ? 'row-profit' : 'row-loss'}>
                    <td><strong>{pos.symbol}</strong> <span className="badge badge-buy" style={{fontSize: 9}}>GERCEK</span></td>
                    <td>{pos.entry_price ? pos.entry_price.toFixed(6) : '-'}</td>
                    <td>{pos.current_price ? pos.current_price.toFixed(6) : '-'}</td>
                    <td style={{color: (pos.pnl_percent || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>%{(pos.pnl_percent || 0).toFixed(2)}</td>
                    <td>{pos.stop_loss ? pos.stop_loss.toFixed(6) : '-'}</td>
                    <td>{pos.take_profit ? pos.take_profit.toFixed(6) : '-'}</td>
                    <td>%{((pos.machine_confidence || 0) * 100).toFixed(0)}</td>
                    <td style={{fontSize: 11, color: '#94a3b8'}}>{formatTime(pos.opened_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {realTradingEnabled && realOpenPositions.length === 0 && (
        <div className="table-container">
          <table>
            <thead><tr><th>Sembol</th><th>Giris</th><th>Anlik</th><th>PnL%</th><th>Stop</th><th>Hedef</th><th>AI</th><th>Acilis</th></tr></thead>
            <tbody>
              <tr><td colSpan="8" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Gercek alim aktif - Henuz acik pozisyon yok</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* SIMULASYON POZISYONLARI (bilgi amacli) */}
      {simOpenPositions.length > 0 && (
        <div style={{marginTop: 20}}>
          <h2>🧪 Simulasyon Acik Pozisyonlari ({simOpenPositions.length})</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Sembol</th><th>Giris</th><th>Anlik</th><th>PnL%</th><th>Stop</th><th>AI</th><th>Acilis</th></tr>
              </thead>
              <tbody>
                {simOpenPositions.slice(0, 10).map(function(pos, i) {
                  return (
                    <tr key={i} className={(pos.pnl_percent || 0) >= 0 ? 'row-profit' : 'row-loss'}>
                      <td><strong>{pos.symbol}</strong></td>
                      <td>{pos.entry_price ? pos.entry_price.toFixed(6) : '-'}</td>
                      <td>{pos.current_price ? pos.current_price.toFixed(6) : '-'}</td>
                      <td style={{color: (pos.pnl_percent || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>%{(pos.pnl_percent || 0).toFixed(2)}</td>
                      <td>{pos.stop_loss ? pos.stop_loss.toFixed(6) : '-'}</td>
                      <td>%{((pos.machine_confidence || 0) * 100).toFixed(0)}</td>
                      <td style={{fontSize: 11, color: '#94a3b8'}}>{formatTime(pos.opened_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
