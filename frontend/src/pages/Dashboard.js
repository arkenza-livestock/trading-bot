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
      setStats(await statsRes.json());
      setMachineStats(await machineRes.json());
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

  const fUSD = (v) => '$' + (v || 0).toFixed(2);
  const fPCT = (v) => '%' + (v || 0).toFixed(1);

  return (
    <div className="dashboard">
      <h1>📊 Dashboard</h1>
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>Canlı durum ve performans özeti</p>

      {/* BTC Durumu */}
      <div className="btc-status-bar">
        <div className="btc-item">
          <span className="label">₿ BTC Trend</span>
          <span className="value up">{machineStats?.bot?.btcTrend?.trend || 'BELIRSIZ'}</span>
        </div>
        <div className="btc-item">
          <span className="label">RSI</span>
          <span className="value">{machineStats?.bot?.btcTrend?.rsi?.toFixed(1) || '-'}</span>
        </div>
        <div className="btc-item">
          <span className="label">Güç (ADX)</span>
          <span className="value">{machineStats?.bot?.btcTrend?.strength?.toFixed(1) || '-'}</span>
        </div>
        <div className="btc-item">
          <span className="label">Tarama</span>
          <span className="value">#{machineStats?.bot?.scanCount || 0}</span>
        </div>
        <div className="btc-item">
          <span className="label">Fiyat</span>
          <span className="value">${machineStats?.bot?.btcTrend?.fiyat?.toFixed(0) || '-'}</span>
        </div>
      </div>

      {/* Simülasyon Bakiyesi */}
      <h2>💰 Simülasyon Bakiyesi</h2>
      <div className="card-grid">
        <div className="card">
          <div className="card-label">Bakiye</div>
          <div className="card-value">{fUSD(stats?.balance)}</div>
        </div>
        <div className="card">
          <div className="card-label">Toplam PnL</div>
          <div className={`card-value ${(stats?.totalPnl || 0) >= 0 ? 'green' : 'red'}`}>
            {fUSD(stats?.totalPnl)} ({fPCT(stats?.totalPnlPct)})
          </div>
        </div>
        <div className="card">
          <div className="card-label">Başarı Oranı</div>
          <div className="card-value green">{fPCT(stats?.winRate)}</div>
        </div>
        <div className="card">
          <div className="card-label">Profit Factor</div>
          <div className="card-value gold">{stats?.profitFactor || '-'}</div>
        </div>
      </div>

      {/* Makine Zekası */}
      <h2>🧠 Makine Zekası</h2>
      <div className="card-grid">
        <div className="card ai-card">
          <div className="card-label">Adaptif Eşik</div>
          <div className="card-value purple">%{stats?.adaptiveThreshold || 70}</div>
        </div>
        <div className="card ai-card">
          <div className="card-label">Kabul Edilen</div>
          <div className="card-value green">{machineStats?.performance?.signalsAccepted || 0}</div>
        </div>
        <div className="card ai-card">
          <div className="card-label">Reddedilen</div>
          <div className="card-value red">{machineStats?.performance?.signalsRejected || 0}</div>
        </div>
        <div className="card ai-card">
          <div className="card-label">Kabul Oranı</div>
          <div className="card-value gold">%{machineStats?.performance?.acceptanceRate || 0}</div>
        </div>
      </div>

      {/* İşlem Özeti */}
      <h2>📈 İşlem Özeti</h2>
      <div className="card-grid">
        <div className="card">
          <div className="card-label">Toplam İşlem</div>
          <div className="card-value">{stats?.totalTrades || 0}</div>
        </div>
        <div className="card">
          <div className="card-label">Kazanan</div>
          <div className="card-value green">{stats?.wins || 0}</div>
        </div>
        <div className="card">
          <div className="card-label">Kaybeden</div>
          <div className="card-value red">{stats?.losses || 0}</div>
        </div>
        <div className="card">
          <div className="card-label">Açık Pozisyon</div>
          <div className="card-value gold">{stats?.openTrades || 0}</div>
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
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.recentTrades || []).slice(0, 15).map((t, i) => (
              <tr key={i} className={t.pnl >= 0 ? 'row-profit' : 'row-loss'}>
                <td><strong>{t.symbol}</strong></td>
                <td>{t.entry_price?.toFixed(4)}</td>
                <td>{t.exit_price?.toFixed(4) || '-'}</td>
                <td style={{color: t.pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                  {t.pnl?.toFixed(4)} ({t.pnl_percent?.toFixed(2)}%)
                </td>
                <td>{t.close_reason || t.status}</td>
                <td>%{((t.machine_confidence || 0) * 100).toFixed(0)}</td>
              </tr>
            ))}
            {(!stats?.recentTrades || stats.recentTrades.length === 0) && (
              <tr><td colSpan="6" style={{textAlign: 'center', color: '#64748b', padding: 30}}>Henüz işlem yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
