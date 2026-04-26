import React, { useState, useEffect } from 'react';
import axios from 'axios';

const trSaat = (tarih) => new Date(tarih + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

export default function Signals({ api }) {
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);

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
          {['ALL', 'ALIM', 'BEKLE', 'SATIS'].map(f => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
              {f === 'ALL' ? 'Tümü' : f}
            </button>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <div className="card" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Coin</th><th>Sinyal</th><th>Skor</th><th>Fiyat</th><th>Tarih</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} onClick={() => setSelected(s)} style={{ cursor: 'pointer', background: selected?.id === s.id ? '#0d1a2d' : '' }}>
                    <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.symbol}</td>
                    <td><span className={`badge badge-${s.signal_type?.toLowerCase()}`}>{s.signal_type}</span></td>
                    <td><span style={{ color: s.score >= 70 ? '#68d391' : s.score >= 50 ? '#f6ad55' : '#fc8181', fontWeight: 600 }}>{s.score}</span></td>
                    <td style={{ color: '#a0aec0' }}>{parseFloat(s.price).toFixed(6)}</td>
                    <td style={{ color: '#4a5568', fontSize: 11 }}>{trSaat(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          {selected ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>{selected.symbol}</div>
                  <div style={{ fontSize: 13, color: '#718096' }}>{trSaat(selected.created_at)}</div>
                </div>
                <span className={`badge badge-${selected.signal_type?.toLowerCase()}`} style={{ fontSize: 14, padding: '6px 12px' }}>{selected.signal_type}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Fiyat', value: parseFloat(selected.price).toFixed(6) + ' USDT' },
                  { label: 'Skor', value: selected.score + '/100' },
                  { label: 'Risk', value: selected.risk },
                  { label: 'RSI', value: selected.rsi?.toFixed(2) },
                  { label: 'MACD', value: selected.macd?.toFixed(6) },
                  { label: 'Trend', value: selected.trend },
                ].map(item => (
                  <div key={item.label} style={{ background: '#0a0e1a', padding: '10px 12px', borderRadius: 8, border: '1px solid #1e2736' }}>
                    <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{item.value}</div>
                  </div>
                ))}
              </div>
              {selected.positive_signals?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#68d391', marginBottom: 6, fontWeight: 600 }}>✅ POZİTİF SİNYALLER</div>
                  {selected.positive_signals.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#a0aec0', padding: '3px 0', borderBottom: '1px solid #111827' }}>• {p}</div>
                  ))}
                </div>
              )}
              {selected.negative_signals?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#fc8181', marginBottom: 6, fontWeight: 600 }}>⚠️ RİSK FAKTÖRLERİ</div>
                  {selected.negative_signals.map((n, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#a0aec0', padding: '3px 0', borderBottom: '1px solid #111827' }}>• {n}</div>
                  ))}
                </div>
              )}
              {selected.ai_comment && (
                <div style={{ background: '#0a0e1a', padding: 12, borderRadius: 8, border: '1px solid #1e2736' }}>
                  <div style={{ fontSize: 11, color: '#718096', marginBottom: 6 }}>📊 DETAY</div>
                  <div style={{ fontSize: 13, color: '#a0aec0', lineHeight: 1.6 }}>{selected.ai_comment}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#4a5568', padding: 40 }}>Detay görmek için bir sinyal seçin</div>
          )}
        </div>
      </div>
    </div>
  );
}
