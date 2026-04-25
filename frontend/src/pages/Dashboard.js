import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Dashboard({ api, stats }) {
  const [signals, setSignals] = useState([]);
  const [positions, setPositions] = useState([]);
  const [scanLogs, setScanLogs] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, pRes, lRes] = await Promise.all([
          axios.get(`${api}/api/signals?limit=10`),
          axios.get(`${api}/api/positions/open`),
          axios.get(`${api}/api/scan-logs`)
        ]);
        setSignals(sRes.data);
        setPositions(pRes.data);
        setScanLogs(lRes.data);
      } catch (err) { console.error(err); }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [api]);

  const lastScan = scanLogs[0];

  const getRiskBadge = (risk) => {
    const r = risk?.toUpperCase();
    if (r === 'DUSUK') return <span className="badge badge-dusuk">Düşük</span>;
    if (r === 'ORTA')  return <span className="badge badge-orta">Orta</span>;
    return <span className="badge badge-yuksek">Yüksek</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Gerçek zamanlı kripto sinyal takibi</div>
        </div>
        <div style={{ fontSize: 12, color: '#718096', textAlign: 'right' }}>
          {new Date().toLocaleString('tr-TR')}
        </div>
      </div>

      {/* Son Tarama Durumu */}
      <div style={{ background: '#0d1a2d', border: '1px solid #1e3a5f', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <div>
            <div style={{ fontSize: 12, color: '#718096' }}>Son Tarama</div>
            <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
              {lastScan ? new Date(lastScan.created_at).toLocaleString('tr-TR') : 'Henüz tarama yok'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#718096' }}>Taranan Coin</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>{lastScan?.coin_count || 0}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#718096' }}>Bulunan Sinyal</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: lastScan?.signal_count > 0 ? '#68d391' : '#fc8181' }}>
              {lastScan?.signal_count || 0}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#718096' }}>Süre</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f6ad55' }}>
              {lastScan ? `${(lastScan.duration_ms / 1000).toFixed(1)}s` : '-'}
            </div>
          </div>
        </div>
        {lastScan?.signal_count > 0 && lastScan?.signals_found?.length > 0 && (
          <div style={{ fontSize: 12, color: '#68d391' }}>
            ✅ {lastScan.signals_found.join(' · ')}
          </div>
        )}
        {lastScan?.signal_count === 0 && (
          <div style={{ fontSize: 12, color: '#fc8181' }}>❌ Sinyal bulunamadı</div>
        )}
      </div>

      {/* İstatistik Kartları */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Toplam PnL</div>
          <div className={`stat-value ${stats.totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl || 0}
          </div>
          <div className="stat-sub">USDT</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Kazanma Oranı</div>
          <div className="stat-value positive">{stats.winRate || 0}%</div>
          <div className="stat-sub">{stats.wins || 0}W / {stats.losses || 0}L</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Açık Pozisyon</div>
          <div className="stat-value">{stats.openPositions || 0}</div>
          <div className="stat-sub">Aktif işlem</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Toplam Sinyal</div>
          <div className="stat-value">{stats.totalSignals || 0}</div>
          <div className="stat-sub">Tüm zamanlar</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Son Sinyaller */}
        <div className="card">
          <div className="card-title">Son Sinyaller</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Coin</th><th>Skor</th><th>Risk</th><th>Fiyat</th><th>Saat</th>
                </tr>
              </thead>
              <tbody>
                {signals.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#4a5568', padding: 20 }}>Henüz sinyal yok</td></tr>
                ) : signals.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.symbol}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: s.score >= 60 ? '#68d391' : s.score >= 35 ? '#f6ad55' : '#fc8181', fontWeight: 700 }}>
                          {s.score}
                        </span>
                        <div className="score-bar" style={{ width: 50 }}>
                          <div className="score-fill" style={{
                            width: `${Math.max(0, Math.min(100, s.score))}%`,
                            background: s.score >= 60 ? '#68d391' : s.score >= 35 ? '#f6ad55' : '#fc8181'
                          }} />
                        </div>
                      </div>
                    </td>
                    <td>{getRiskBadge(s.risk)}</td>
                    <td style={{ color: '#a0aec0', fontSize: 12 }}>{parseFloat(s.price).toFixed(6)}</td>
                    <td style={{ color: '#4a5568', fontSize: 11 }}>
                      {new Date(s.created_at).toLocaleTimeString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tarama Geçmişi */}
        <div className="card">
          <div className="card-title">Tarama Geçmişi</div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {scanLogs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#4a5568', padding: 20 }}>Henüz tarama yok</div>
            ) : scanLogs.map(log => (
              <div key={log.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderBottom: '1px solid #111827',
                background: log.signal_count > 0 ? '#0d2818' : 'transparent'
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                    {new Date(log.created_at).toLocaleString('tr-TR')}
                  </div>
                  {log.signal_count > 0 && log.signals_found?.length > 0 && (
                    <div style={{ fontSize: 11, color: '#68d391', marginTop: 2 }}>
                      ✅ {log.signals_found.join(' · ')}
                    </div>
                  )}
                  {log.signal_count === 0 && (
                    <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>❌ Sinyal yok</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#60a5fa' }}>{log.coin_count} coin</div>
                  <div style={{ fontSize: 11, color: '#718096' }}>{(log.duration_ms / 1000).toFixed(1)}s</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Açık Pozisyonlar */}
      {positions.length > 0 && (
        <div className="card">
          <div className="card-title">Açık Pozisyonlar</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Coin</th><th>Giriş</th><th>Anlık</th><th>Stop</th><th>PnL</th><th>Süre</th></tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{p.symbol}</td>
                    <td style={{ color: '#a0aec0', fontSize: 12 }}>{parseFloat(p.entry_price).toFixed(6)}</td>
                    <td style={{ color: '#a0aec0', fontSize: 12 }}>{parseFloat(p.current_price || p.entry_price).toFixed(6)}</td>
                    <td style={{ color: '#fc8181', fontSize: 12 }}>{parseFloat(p.stop_loss || 0).toFixed(6)}</td>
                    <td>
                      <span className={(p.pnl || 0) >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 700 }}>
                        {(p.pnl || 0) >= 0 ? '+' : ''}{parseFloat(p.pnl || 0).toFixed(2)} USDT
                      </span>
                      <br />
                      <span style={{ fontSize: 11, color: (p.pnl_percent || 0) >= 0 ? '#68d391' : '#fc8181' }}>
                        %{parseFloat(p.pnl_percent || 0).toFixed(2)}
                      </span>
                    </td>
                    <td style={{ color: '#4a5568', fontSize: 11 }}>
                      {Math.floor((Date.now() - new Date(p.opened_at).getTime()) / 60000)} dk
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
