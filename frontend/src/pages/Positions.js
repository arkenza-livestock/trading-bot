import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Positions({ api }) {
  const [openPositions, setOpenPositions] = useState([]);
  const [allPositions, setAllPositions] = useState([]);
  const [tab, setTab] = useState('open');
  const [closing, setClosing] = useState(null);

  const load = async () => {
    try {
      const [openRes, allRes] = await Promise.all([
        axios.get(`${api}/api/positions/open`),
        axios.get(`${api}/api/positions`)
      ]);
      setOpenPositions(openRes.data);
      setAllPositions(allRes.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [api]);

  const closePosition = async (id) => {
    if (!window.confirm('Bu pozisyonu kapatmak istediğinize emin misiniz?')) return;
    setClosing(id);
    try {
      const res = await axios.post(`${api}/api/positions/${id}/close`);
      alert(`Pozisyon kapatıldı. PnL: ${res.data.pnl?.toFixed(2)} USDT`);
      load();
    } catch (err) {
      alert('Hata: ' + err.response?.data?.error);
    }
    setClosing(null);
  };

  const getStatusBadge = (status) => {
    if (status === 'OPEN') return <span className="badge badge-open">Açık</span>;
    if (status === 'TAKE_PROFIT') return <span className="badge badge-alim">TP ✓</span>;
    if (status === 'STOP_LOSS') return <span className="badge badge-satis">SL ✗</span>;
    return <span className="badge badge-bekle">{status}</span>;
  };

  const positions = tab === 'open' ? openPositions : allPositions;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Pozisyonlar</div>
          <div className="page-sub">{openPositions.length} açık pozisyon</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${tab === 'open' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('open')}>Açık ({openPositions.length})</button>
          <button className={`btn ${tab === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('all')}>Tümü ({allPositions.length})</button>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Coin</th><th>Durum</th><th>Miktar</th><th>Giriş</th>
                <th>Anlık</th><th>Stop Loss</th><th>Hedef</th><th>PnL</th>
                <th>Tarih</th>{tab === 'open' && <th>İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: '#4a5568', padding: 30 }}>Pozisyon yok</td></tr>
              ) : positions.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{p.symbol}</td>
                  <td>{getStatusBadge(p.status)}</td>
                  <td style={{ color: '#a0aec0' }}>{parseFloat(p.quantity).toFixed(4)}</td>
                  <td style={{ color: '#a0aec0' }}>{parseFloat(p.entry_price).toFixed(4)}</td>
                  <td style={{ color: '#a0aec0' }}>{parseFloat(p.current_price || p.entry_price).toFixed(4)}</td>
                  <td style={{ color: '#fc8181' }}>{parseFloat(p.stop_loss || 0).toFixed(4)}</td>
                  <td style={{ color: '#68d391' }}>{parseFloat(p.take_profit || 0).toFixed(4)}</td>
                  <td>
                    <span className={(p.pnl || 0) >= 0 ? 'positive' : 'negative'}>
                      {(p.pnl || 0) >= 0 ? '+' : ''}{parseFloat(p.pnl || 0).toFixed(2)} USDT
                    </span>
                    <br />
                    <span style={{ fontSize: 11, color: (p.pnl_percent || 0) >= 0 ? '#68d391' : '#fc8181' }}>
                      ({parseFloat(p.pnl_percent || 0).toFixed(2)}%)
                    </span>
                  </td>
                  <td style={{ color: '#4a5568', fontSize: 11 }}>{new Date(p.opened_at).toLocaleString('tr-TR')}</td>
                  {tab === 'open' && (
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => closePosition(p.id)} disabled={closing === p.id}>
                        {closing === p.id ? '...' : 'Kapat'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
