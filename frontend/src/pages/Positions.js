import React, { useState, useEffect } from 'react';
import axios from 'axios';

const trSaat = (tarih) => tarih ? new Date(tarih + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '-';

export default function Positions({ api }) {
  const [positions, setPositions] = useState([]);
  const [filter,    setFilter]    = useState('OPEN');
  const [closing,   setClosing]   = useState(null);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [api]);

  const load = async () => {
    try {
      const res = await axios.get(`${api}/api/positions`);
      setPositions(res.data);
    } catch(e) { console.error(e); }
  };

  const closePos = async (id) => {
    if (!window.confirm('Bu pozisyonu kapatmak istiyor musun?')) return;
    setClosing(id);
    try {
      await axios.post(`${api}/api/positions/${id}/close`);
      await load();
    } catch(e) { alert('Hata: ' + e.message); }
    setClosing(null);
  };

  const filtered = filter === 'ALL'
    ? positions
    : positions.filter(p => filter === 'OPEN' ? p.status === 'OPEN' : p.status !== 'OPEN');

  const openPos   = positions.filter(p => p.status === 'OPEN');
  const closedPos = positions.filter(p => p.status !== 'OPEN');
  const totalPnl  = closedPos.reduce((s, p) => s + (p.pnl || 0), 0);
  const wins      = closedPos.filter(p => (p.pnl || 0) > 0);
  const winRate   = closedPos.length > 0 ? (wins.length / closedPos.length * 100).toFixed(1) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💼 Pozisyonlar</div>
          <div className="page-sub">{openPos.length} açık · {closedPos.length} kapalı</div>
        </div>
      </div>

      {/* Özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Açık Pozisyon',  value: openPos.length,   color: '#60a5fa' },
          { label: 'Toplam PnL',     value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT`, color: totalPnl >= 0 ? '#68d391' : '#fc8181' },
          { label: 'Kazanma Oranı',  value: `%${winRate}`,    color: parseFloat(winRate) >= 50 ? '#68d391' : '#f6ad55' },
          { label: 'Toplam İşlem',   value: closedPos.length, color: '#a0aec0' },
        ].map(k => (
          <div key={k.label} style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:8, padding:'14px 16px', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#718096', marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['OPEN','Açık'],['CLOSED','Kapalı'],['ALL','Tümü']].map(([val,label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`btn ${filter === val ? 'btn-primary' : 'btn-ghost'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tablo */}
      <div className="card">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2736' }}>
                {['Coin','Yön','Giriş$','Güncel$','Stop','PnL%','PnL USDT','Durum','Açılış',''].map(h => (
                  <th key={h} style={{ padding:'8px 12px', fontSize:11, color:'#718096', textAlign:'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign:'center', padding:40, color:'#4a5568' }}>
                  {filter === 'OPEN' ? 'Açık pozisyon yok' : 'Kayıt bulunamadı'}
                </td></tr>
              ) : filtered.map((p, i) => (
                <tr key={i} style={{ borderBottom:'1px solid #0d1117',
                  background: (p.pnl||0) >= 0 ? 'rgba(13,40,24,0.2)' : 'rgba(45,17,17,0.2)' }}>
                  <td style={{ padding:'8px 12px', fontWeight:700, color:'#60a5fa' }}>{p.symbol}</td>
                  <td style={{ padding:'8px 12px' }}>
                    <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                      background: p.side==='LONG'?'rgba(49,130,206,0.2)':'rgba(245,158,11,0.2)',
                      color: p.side==='LONG'?'#60a5fa':'#f6ad55' }}>
                      {p.side||'LONG'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 12px', fontSize:12 }}>{parseFloat(p.entry_price||0).toFixed(4)}</td>
                  <td style={{ padding:'8px 12px', fontSize:12 }}>{parseFloat(p.current_price||p.entry_price||0).toFixed(4)}</td>
                  <td style={{ padding:'8px 12px', fontSize:11, color:'#fc8181' }}>{parseFloat(p.stop_loss||0).toFixed(4)}</td>
                  <td style={{ padding:'8px 12px', fontWeight:700,
                    color: (p.pnl_percent||0) >= 0 ? '#68d391' : '#fc8181' }}>
                    {(p.pnl_percent||0) >= 0 ? '+' : ''}{(p.pnl_percent||0).toFixed(2)}%
                  </td>
                  <td style={{ padding:'8px 12px', fontWeight:700, fontSize:13,
                    color: (p.pnl||0) >= 0 ? '#68d391' : '#fc8181' }}>
                    {(p.pnl||0) >= 0 ? '+' : ''}{(p.pnl||0).toFixed(4)}
                  </td>
                  <td style={{ padding:'8px 12px' }}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, fontWeight:600,
                      background: p.status==='OPEN'?'rgba(49,130,206,0.15)':p.status==='TRAILING_STOP'?'rgba(13,40,24,0.5)':'rgba(45,17,17,0.5)',
                      color: p.status==='OPEN'?'#60a5fa':p.status==='TRAILING_STOP'?'#68d391':'#fc8181'
                    }}>{p.status}</span>
                  </td>
                  <td style={{ padding:'8px 12px', fontSize:10, color:'#718096' }}>{trSaat(p.opened_at)}</td>
                  <td style={{ padding:'8px 12px' }}>
                    {p.status === 'OPEN' && (
                      <button onClick={() => closePos(p.id)} disabled={closing === p.id}
                        style={{ padding:'4px 10px', fontSize:11, borderRadius:4, cursor:'pointer',
                          background:'rgba(252,129,129,0.15)', border:'1px solid #fc8181', color:'#fc8181' }}>
                        {closing === p.id ? '...' : 'Kapat'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
