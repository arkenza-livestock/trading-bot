import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Dashboard({ api, stats }) {
  const [signals, setSignals] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, pRes] = await Promise.all([
          axios.get(`${api}/api/signals?limit=10`),
          axios.get(`${api}/api/positions/open`)
        ]);
        setSignals(sRes.data);
        setPositions(pRes.data);
      } catch (err) { console.error(err); }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [api]);

  const getRiskBadge = (risk) => {
    const r = risk?.toUpperCase();
    if (r === 'DUSUK') return <span className="badge badge-dusuk">Düşük</span>;
    if (r === 'ORTA') return <span className="badge badge-orta">Orta</span>;
    return <span className="badge badge-yuksek">Yüksek</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Gerçek zamanlı kripto sinyal takibi</div>
        </div>
        <div style={{ fontSize: 13, color: '#718096' }}>{new Date().toLocaleString('tr-TR')}</div>
      </div>
      <div className="grid-4">
        <div className="stat-card">
          <div className="stat-label">Toplam PnL</div>
          <div className={`stat-value ${stats.totalPnl >= 0 ? 'positive' : 'negative'}`}>{stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl || 0}</div>
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
        <div className="card">
          <div className="card-title">Son Sinyaller</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Coin</th><th>Sinyal</th><th>Skor</th><th>Risk</th><th>Fiyat</th></tr></thead>
              <tbody>
                {signals.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#4a5568', padding: 20 }}>Henüz sinyal yok</td></tr>
                ) : signals.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.symbol}</td>
                    <td><span className={`badge badge-${s.signal_type?.toLowerCase()}`}>{s.signal_type}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: s.score >= 70 ? '#68d391' : s.score >= 50 ? '#f6ad55' : '#fc8181' }}>{s.score}</span>
                        <div className="score-bar" style={{ width: 60 }}>
                          <div className="score-fill" style={{ width: `${Math.max(0, Math.min(100, s.score))}%`, background: s.score >= 70 ? '#68d391' : s.score >= 50 ? '#f6ad55' : '#fc8181' }} />
                        </div>
                      </div>
                    </td>
                    <td>{getRiskBadge(s.risk)}</td>
                    <td style={{ color: '#a0aec0' }}>{parseFloat(s.price).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Açık Pozisyonlar</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Coin</th><th>Giriş</th><th>Anlık</th><th>PnL</th></tr></thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#4a5568', padding: 20 }}>Açık pozisyon yok</td></tr>
                ) : positions.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{p.symbol}</td>
                    <td style={{ color: '#a0aec0' }}>{parseFloat(p.entry_price).toFixed(4)}</td>
                    <td style={{ color: '#a0aec0' }}>{parseFloat(p.current_price || p.entry_price).toFixed(4)}</td>
                    <td className={p.pnl >= 0 ? 'positive' : 'negative'}>
                      {p.pnl >= 0 ? '+' : ''}{parseFloat(p.pnl || 0).toFixed(2)} USDT
                      <br /><span style={{ fontSize: 11 }}>({parseFloat(p.pnl_percent || 0).toFixed(2)}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
