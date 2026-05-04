import React, { useState, useEffect, useCallback } from 'react';

function Simulation() {
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState({
    startBalance: 1000,
    tradeAmount: 100,
    maxPositions: 3,
    stopLoss: 2.0,
    trailingStop: 0.5,
    minProfit: 1.5,
    machineConfidenceMin: 0.70
  });
  const [message, setMessage] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/simulation/stats');
      const data = await res.json();
      setStats(data);
    } catch(e) {
      console.error('Simülasyon verisi alınamadı:', e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleReset = async () => {
    if (!window.confirm('Simülasyonu sıfırlamak istediğinize emin misiniz?')) return;
    try {
      const res = await fetch('/api/simulation/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startBalance: settings.startBalance })
      });
      const data = await res.json();
      setMessage(data.message || 'Simülasyon sıfırlandı');
      fetchStats();
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const formatUsd = (v) => '$' + (v || 0).toFixed(2);

  return (
    <div className="simulation">
      <h1>🧪 Simülasyon Motoru</h1>

      {message && <div className="message">{message}</div>}

      {/* Makine Adaptif Eşik */}
      <div className="ai-status-bar">
        <div className="ai-item">
          <span>🧠 Adaptif Eşik</span>
          <span className="ai-value">%{stats?.adaptiveThreshold || 70}</span>
        </div>
        <div className="ai-item">
          <span>⚠️ Peşpeşe Kayıp</span>
          <span className="ai-value" style={{color: (stats?.consecutiveLosses || 0) >= 3 ? '#ff4444' : '#00ff88'}}>
            {stats?.consecutiveLosses || 0}
          </span>
        </div>
      </div>

      {/* Bakiye Kartları */}
      <div className="card-grid">
        <div className="card">
          <div className="card-title">💰 Bakiye</div>
          <div className="card-value">{formatUsd(stats?.balance)}</div>
        </div>
        <div className="card">
          <div className="card-title">📈 Toplam PnL</div>
          <div className="card-value" style={{color: (stats?.totalPnl || 0) >= 0 ? '#00ff88' : '#ff4444'}}>
            {formatUsd(stats?.totalPnl)} (%{stats?.totalPnlPct || 0})
          </div>
        </div>
        <div className="card">
          <div className="card-title">🏆 Başarı</div>
          <div className="card-value">%{stats?.winRate || 0}</div>
        </div>
        <div className="card">
          <div className="card-title">📊 PF</div>
          <div className="card-value">{stats?.profitFactor || '-'}</div>
        </div>
      </div>

      {/* İşlem Detayları */}
      <div className="card-grid">
        <div className="card">
          <div className="card-title">🔄 Toplam</div>
          <div className="card-value">{stats?.totalTrades || 0}</div>
        </div>
        <div className="card">
          <div className="card-title">✅ Kazanan</div>
          <div className="card-value" style={{color: '#00ff88'}}>{stats?.wins || 0}</div>
        </div>
        <div className="card">
          <div className="card-title">❌ Kaybeden</div>
          <div className="card-value" style={{color: '#ff4444'}}>{stats?.losses || 0}</div>
        </div>
        <div className="card">
          <div className="card-title">📌 Açık</div>
          <div className="card-value">{stats?.openTrades || 0}</div>
        </div>
      </div>

      {/* Ortalama Değerler */}
      <div className="card-grid">
        <div className="card">
          <div className="card-title">📈 Ort. Kazanç</div>
          <div className="card-value" style={{color: '#00ff88'}}>%{stats?.avgWin || 0}</div>
        </div>
        <div className="card">
          <div className="card-title">📉 Ort. Kayıp</div>
          <div className="card-value" style={{color: '#ff4444'}}>%{stats?.avgLoss || 0}</div>
        </div>
      </div>

      {/* Açık Pozisyonlar */}
      <h2>📌 Açık Pozisyonlar</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Giriş</th>
              <th>Şimdi</th>
              <th>PnL%</th>
              <th>Stop</th>
              <th>AI Güven</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.openPositions || []).map((pos, i) => (
              <tr key={i} className={(pos.pnl_percent || 0) >= 0 ? 'profit' : 'loss'}>
                <td><strong>{pos.symbol}</strong></td>
                <td>{pos.entry_price?.toFixed(4)}</td>
                <td>{pos.current_price?.toFixed(4)}</td>
                <td style={{color: (pos.pnl_percent || 0) >= 0 ? '#00ff88' : '#ff4444'}}>
                  %{pos.pnl_percent?.toFixed(2)}
                </td>
                <td>{pos.stop_loss?.toFixed(4)}</td>
                <td>%{((pos.machine_confidence || 0) * 100).toFixed(0)}</td>
              </tr>
            ))}
            {(!stats?.openPositions || stats.openPositions.length === 0) && (
              <tr><td colSpan="6" style={{textAlign: 'center'}}>Açık pozisyon yok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Son İşlemler */}
      <h2>📋 Son İşlemler</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Giriş</th>
              <th>Çıkış</th>
              <th>PnL</th>
              <th>Neden</th>
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.recentTrades || []).slice(0, 10).map((trade, i) => (
              <tr key={i} className={trade.pnl >= 0 ? 'profit' : 'loss'}>
                <td><strong>{trade.symbol}</strong></td>
                <td>{trade.entry_price?.toFixed(4)}</td>
                <td>{trade.exit_price?.toFixed(4) || '-'}</td>
                <td style={{color: trade.pnl >= 0 ? '#00ff88' : '#ff4444'}}>
                  {trade.pnl?.toFixed(4)} (%{trade.pnl_percent?.toFixed(2)})
                </td>
                <td>{trade.close_reason || trade.status}</td>
                <td>%{((trade.machine_confidence || 0) * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ayarlar ve Kontroller */}
      <h2>⚙️ Kontroller</h2>
      <div className="settings-panel">
        <div className="setting-row">
          <label>Başlangıç Bakiyesi (USDT)</label>
          <input type="number" value={settings.startBalance} 
            onChange={e => setSettings({...settings, startBalance: Number(e.target.value)})} />
        </div>
        <button className="btn btn-danger" onClick={handleReset}>
          🔄 Simülasyonu Sıfırla
        </button>
      </div>
    </div>
  );
}

export default Simulation;
