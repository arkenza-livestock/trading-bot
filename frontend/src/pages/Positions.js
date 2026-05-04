import React, { useState, useEffect, useCallback } from 'react';

function Positions() {
  const [positions, setPositions] = useState([]);
  const [filter, setFilter] = useState('OPEN');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalPnl: 0, winRate: 0, totalTrades: 0 });

  const fetchPositions = useCallback(async () => {
    try {
      const [posRes, statusRes] = await Promise.all([
        fetch('/api/positions'),
        fetch('/api/status')
      ]);
      const posData = await posRes.json();
      const statusData = await statusRes.json();
      
      setPositions(posData || []);
      
      // Sadece gerçek pozisyonları göster
      const realPositions = (posData || []).filter(p => p.status !== 'OPEN' || p.close_reason);
      const allClosed = (posData || []).filter(p => p.status !== 'OPEN');
      
      // Özet (gerçek işlem olunca dolacak)
      const totalPnl = allClosed.reduce((s, p) => s + (p.pnl || 0), 0);
      const wins = allClosed.filter(p => p.pnl > 0).length;
      
      setSummary({
        openCount: (posData || []).filter(p => p.status === 'OPEN').length,
        closedCount: allClosed.length,
        totalPnl: totalPnl,
        winRate: allClosed.length > 0 ? ((wins / allClosed.length) * 100).toFixed(1) : 0,
        totalTrades: allClosed.length
      });
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 20000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  if (loading) return <div className="loading">⏳ Yükleniyor...</div>;

  const filteredPositions = positions.filter(p => {
    if (filter === 'OPEN') return p.status === 'OPEN';
    if (filter === 'CLOSED') return p.status !== 'OPEN';
    return true;
  });

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    try {
      const d = new Date(timeStr + 'Z');
      return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    } catch(e) {
      return timeStr;
    }
  };

  return (
    <div className="positions">
      <h1>📊 Pozisyonlar</h1>
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>
        Gerçek işlem pozisyonları
      </p>

      {/* Özet Kartları */}
      <div className="card-grid">
        <div className="card">
          <div className="card-label">📌 Açık Pozisyon</div>
          <div className="card-value gold">{summary.openCount}</div>
        </div>
        <div className="card">
          <div className="card-label">💰 Toplam PnL</div>
          <div className={`card-value ${summary.totalPnl >= 0 ? 'green' : 'red'}`}>
            ${summary.totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="card">
          <div className="card-label">🏆 Kazanma Oranı</div>
          <div className="card-value green">%{summary.winRate}</div>
        </div>
        <div className="card">
          <div className="card-label">🔄 Toplam İşlem</div>
          <div className="card-value">{summary.totalTrades}</div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="filter-bar">
        <button className={`filter-btn ${filter === 'OPEN' ? 'active' : ''}`} onClick={() => setFilter('OPEN')}>
          📌 Açık ({summary.openCount})
        </button>
        <button className={`filter-btn ${filter === 'CLOSED' ? 'active' : ''}`} onClick={() => setFilter('CLOSED')}>
          ✅ Kapalı ({summary.closedCount})
        </button>
        <button className={`filter-btn ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
          📋 Tümü ({positions.length})
        </button>
      </div>

      {/* Pozisyon Tablosu */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Coin</th>
              <th>Yön</th>
              <th>Giriş</th>
              <th>Güncel</th>
              <th>Çıkış</th>
              <th>Stop</th>
              <th>PnL%</th>
              <th>PnL USDT</th>
              <th>Durum</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.map((pos, i) => {
              const pnlPct = pos.pnl_percent || 0;
              const pnl = pos.pnl || 0;
              return (
                <tr key={i} className={pnl >= 0 ? 'row-profit' : 'row-loss'}>
                  <td><strong>{pos.symbol}</strong></td>
                  <td>
                    <span className={`badge ${pos.side === 'LONG' ? 'badge-buy' : 'badge-sell'}`}>
                      {pos.side || 'LONG'}
                    </span>
                  </td>
                  <td>{pos.entry_price?.toFixed(6)}</td>
                  <td>{pos.current_price?.toFixed(6)}</td>
                  <td>{pos.exit_price?.toFixed(6) || '-'}</td>
                  <td>{pos.stop_loss?.toFixed(6)}</td>
                  <td style={{color: pnlPct >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                    %{pnlPct.toFixed(2)}
                  </td>
                  <td style={{color: pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                    {pnl.toFixed(4)}
                  </td>
                  <td>
                    <span className={`badge ${pos.status === 'OPEN' ? 'badge-buy' : pos.pnl >= 0 ? 'badge-buy' : 'badge-sell'}`}>
                      {pos.status === 'OPEN' ? 'AÇIK' : pos.close_reason || 'KAPALI'}
                    </span>
                  </td>
                  <td style={{fontSize: 11, color: '#94a3b8'}}>
                    {formatTime(pos.opened_at || pos.closed_at)}
                  </td>
                </tr>
              );
            })}
            {filteredPositions.length === 0 && (
              <tr><td colSpan="10" style={{textAlign: 'center', color: '#64748b', padding: 40}}>
                {filter === 'OPEN' ? '📌 Açık pozisyon yok (Gerçek alım aktif değil)' : 
                 filter === 'CLOSED' ? '✅ Kapalı pozisyon yok' : 
                 '📋 Henüz pozisyon yok'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Positions;
