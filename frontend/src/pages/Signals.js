import React, { useState, useEffect } from 'react';
import axios from 'axios';

const trSaat = (tarih) => new Date(tarih + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

const TrendBadge = ({ trend }) => {
  const config = {
    'YUKARI':       { color: '#68d391', bg: '#0d2818', emoji: '🟢', label: 'YUKARI' },
    'HAFIF_YUKARI': { color: '#f6ad55', bg: '#2d1f0a', emoji: '📈', label: 'HAFIF YUKARI' },
    'YATAY':        { color: '#a0aec0', bg: '#1a1f2e', emoji: '➡️', label: 'YATAY' },
    'HAFIF_ASAGI':  { color: '#fc8181', bg: '#2d1111', emoji: '📉', label: 'HAFIF AŞAĞI' },
    'ASAGI':        { color: '#fc8181', bg: '#2d1111', emoji: '🔴', label: 'AŞAĞI' },
    'BELIRSIZ':     { color: '#718096', bg: '#1a1f2e', emoji: '❓', label: 'BELİRSİZ' },
  };
  const c = config[trend] || config['BELIRSIZ'];
  return (
    <span style={{ background: c.bg, color: c.color, padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
      {c.emoji} {c.label}
    </span>
  );
};

export default function Signals({ api }) {
  const [signals, setSignals] = useState([]);
  const [filter,  setFilter]  = useState('ALL');
  const [selected,setSelected]= useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${api}/api/signals?limit=100`);
        setSignals(res.data);
      } catch (err) { console.error(err); }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [api]);

  const filtered = filter === 'ALL' ? signals : signals.filter(s => s.signal_type === filter);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Sinyal Geçmişi</div>
          <div className="page-sub">{signals.length} sinyal kaydedildi</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['ALL', 'ALIM', 'SATIS'].map(f => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
              {f === 'ALL' ? 'Tümü' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        {/* Sol — Sinyal Listesi */}
        <div className="card" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Sinyal</th>
                  <th>Skor</th>
                  <th>Fiyat</th>
                  <th>Saat</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#4a5568', padding: 20 }}>Henüz sinyal yok</td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id} onClick={() => setSelected(s)}
                    style={{ cursor: 'pointer', background: selected?.id === s.id ? '#0d1a2d' : '' }}>
                    <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.symbol}</td>
                    <td>
                      <span style={{ color: s.signal_type === 'ALIM' ? '#68d391' : '#fc8181', fontWeight: 700 }}>
                        {s.signal_type === 'ALIM' ? '🚀 ALIM' : '📉 SATIS'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: s.score >= 60 ? '#68d391' : s.score >= 35 ? '#f6ad55' : '#fc8181', fontWeight: 700, fontSize: 15 }}>
                        {s.score}
                      </span>
                    </td>
                    <td style={{ color: '#a0aec0', fontSize: 12 }}>{parseFloat(s.price||0).toFixed(4)}</td>
                    <td style={{ color: '#4a5568', fontSize: 11 }}>{trSaat(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sağ — Sinyal Detayı */}
        <div className="card" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {selected ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>{selected.symbol}</div>
                  <div style={{ fontSize: 12, color: '#718096' }}>{trSaat(selected.created_at)}</div>
                </div>
                <span style={{
                  background: selected.signal_type === 'ALIM' ? '#0d2818' : '#2d1111',
                  color: selected.signal_type === 'ALIM' ? '#68d391' : '#fc8181',
                  padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 700
                }}>
                  {selected.signal_type === 'ALIM' ? '🚀 ALIM' : '📉 SATIS'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                  { label: '💰 Fiyat', value: parseFloat(selected.price||0).toFixed(4) + ' USDT' },
                  { label: '📊 Skor', value: `${selected.score}/100` },
                  { label: '⚠️ Risk', value: selected.risk || '-' },
                  { label: '📉 RSI', value: selected.rsi ? parseFloat(selected.rsi).toFixed(2) : '-' },
                ].map(item => (
                  <div key={item.label} style={{ background: '#0a0e1a', padding: '10px 12px', borderRadius: 8, border: '1px solid #1e2736' }}>
                    <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Pozitif Faktörler */}
              {selected.positive_signals?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#68d391', marginBottom: 8, fontWeight: 700 }}>✅ POZİTİF FAKTÖRLER</div>
                  {selected.positive_signals.map((p, i) => (
                    <div key={i} style={{
                      fontSize: 12, color: '#a0aec0', padding: '5px 8px', marginBottom: 4,
                      background: '#0d2818', borderRadius: 6, borderLeft: '3px solid #68d391'
                    }}>{p}</div>
                  ))}
                </div>
              )}

              {/* Negatif Faktörler */}
              {selected.negative_signals?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#fc8181', marginBottom: 8, fontWeight: 700 }}>⚠️ RİSK FAKTÖRLERİ</div>
                  {selected.negative_signals.map((n, i) => (
                    <div key={i} style={{
                      fontSize: 12, color: '#a0aec0', padding: '5px 8px', marginBottom: 4,
                      background: '#2d1111', borderRadius: 6, borderLeft: '3px solid #fc8181'
                    }}>{n}</div>
                  ))}
                </div>
              )}

              {selected.ai_comment && (
                <div style={{ background: '#0a0e1a', padding: 12, borderRadius: 8, border: '1px solid #1e2736' }}>
                  <div style={{ fontSize: 11, color: '#718096', marginBottom: 6, fontWeight: 700 }}>📋 TEKNİK DETAY</div>
                  <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 2 }}>
                    {selected.ai_comment.split('|').map((item, i) => (
                      <div key={i}>• {item.trim()}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#4a5568', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
              <div>Detay görmek için bir sinyal seçin</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
