import React, { useState, useEffect, useCallback } from 'react';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [machineStats, setMachineStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, machineRes] = await Promise.all([
        fetch('/api/simulation/stats'),
        fetch('/api/machine/report')
      ]);
      const statsData = await statsRes.json();
      const machineData = await machineRes.json();
      setStats(statsData);
      setMachineStats(machineData);
    } catch(e) {
      console.error('Veri çekme hatası:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <div className="loading">⏳ Yükleniyor...</div>;

  const formatUsd = (v) => '$' + (v || 0).toFixed(2);
  const formatPct = (v) => '%' + (v || 0).toFixed(1);

  return (
    <div className="dashboard">
      <h1>📊 Trading Bot Dashboard</h1>

      {/* Bakiye Kartları */}
      <div className="card-grid">
        <div className="card">
          <div className="card-title">💰 Bakiye</div>
          <div className="card-value">{formatUsd(stats?.balance)}</div>
        </div>
        <div className="card">
          <div className="card-title">📈 Toplam PnL</div>
          <div className="card-value" style={{color: (stats?.totalPnl || 0) >= 0 ? '#00ff88' : '#ff4444'}}>
            {formatUsd(stats?.totalPnl)} ({formatPct(stats?.totalPnlPct)})
          </div>
        </div>
        <div className="card">
          <div className="card-title">🏆 Başarı Oranı</div>
          <div className="card-value">{formatPct(stats?.winRate)}</div>
        </div>
        <div className="card">
          <div className="card-title">📊 Profit Factor</div>
          <div className="card-value">{stats?.profitFactor || '-'}</div>
        </div>
      </div>

      {/* Makine Zekası Kartları */}
      <h2>🧠 Makine Zekası</h2>
      <div className="card-grid">
        <div className="card ai-card">
          <div className="card-title">🎯 Adaptif Eşik</div>
          <div className="card-value">%{machineStats?.adaptiveThreshold || 70}</div>
        </div>
        <div className="card ai-card">
          <div className="card-title">✅ Kabul Edilen</div>
          <div className="card-value" style={{color: '#00ff88'}}>{machineStats?.signalsAccepted || 0}</div>
        </div>
        <div className="card ai-card">
          <div className="card-title">❌ Reddedilen</div>
          <div className="card-value" style={{color: '#ff4444'}}>{machineStats?.signalsRejected || 0}</div>
        </div>
        <div className="card ai-card">
          <div className="card-title">📋 Kabul Oranı</div>
          <div className="card-value">%{machineStats?.acceptanceRate || 0}</div>
        </div>
      </div>

      {/* İşlem Özeti */}
      <div className="card-grid">
        <div className="card">
          <div className="card-title">🔄 Toplam İşlem</div>
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
          <div className="card-title">📌 Açık Pozisyon</div>
          <div className="card-value">{stats?.openTrades || 0}</div>
        </div>
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
              <th>AI Güven</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.recentTrades || []).slice(0, 10).map((trade, i) => (
              <tr key={i} className={trade.pnl >= 0 ? 'profit' : 'loss'}>
                <td><strong>{trade.symbol}</strong></td>
                <td>{trade.entry_price?.toFixed(4)}</td>
                <td>{trade.exit_price?.toFixed(4) || '-'}</td>
                <td style={{color: trade.pnl >= 0 ? '#00ff88' : '#ff4444'}}>
                  {trade.pnl?.toFixed(4)} ({trade.pnl_percent?.toFixed(2)}%)
                </td>
                <td>{trade.close_reason || trade.status}</td>
                <td>%{((trade.machine_confidence || 0) * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
