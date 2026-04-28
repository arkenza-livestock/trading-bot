import React, { useState, useEffect } from 'react';

export default function Dashboard({ api }) {
  const [status, setStatus] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);
  const [signals, setSignals] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, lRes] = await Promise.all([
          fetch(`${api}/api/signals`).then(r=>r.json()),
          fetch(`${api}/api/scan-logs`).then(r=>r.json()),
        ]);
        setSignals(sRes);
        setScanLogs(lRes);
      } catch(e) { console.error(e); }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [api]);

  const lastScan = scanLogs[0];
  const trSaat = (t) => t ? new Date(t).toLocaleString('tr-TR') : '-';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📊 Dashboard</div>
          <div className="page-sub">Gerçek zamanlı kripto sinyal takibi</div>
        </div>
      </div>

      {lastScan && (
        <div className="card" style={{ marginBottom:16, padding:'12px 16px' }}>
          <div style={{ fontSize:12, color:'#718096', marginBottom:4 }}>🔍 Son Tarama</div>
          <div style={{ fontSize:12, color:'#a0aec0' }}>{trSaat(lastScan.created_at)}</div>
          <div style={{ fontSize:12, color:'#718096', marginTop:4 }}>
            Taranan: {lastScan.coin_count} coin |
            Sinyal: {lastScan.signal_count} |
            Süre: {((lastScan.duration_ms||0)/1000).toFixed(1)}s
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Son Sinyaller</div>
        {signals.length===0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#718096' }}>Henüz sinyal yok</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2736' }}>
                {['Coin','Sinyal','Skor','Fiyat','Saat'].map(h=>(
                  <th key={h} style={{ padding:'8px 12px', fontSize:11, color:'#718096', textAlign:'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.slice(0,10).map((s,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #0d1117' }}>
                  <td style={{ padding:'8px 12px', fontWeight:600, color:'#60a5fa' }}>{s.symbol}</td>
                  <td style={{ padding:'8px 12px' }}>
                    <span style={{ color:s.signal_type==='ALIM'?'#68d391':'#fc8181', fontWeight:600 }}>
                      {s.signal_type==='ALIM'?'🚀 ALIM':'📉 SATIS'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 12px', color:'#f6ad55' }}>{s.score}</td>
                  <td style={{ padding:'8px 12px', color:'#e2e8f0' }}>{parseFloat(s.price||0).toFixed(4)}</td>
                  <td style={{ padding:'8px 12px', fontSize:11, color:'#718096' }}>{trSaat(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop:16 }}>
        <div className="card-title">Tarama Geçmişi</div>
        {scanLogs.length===0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#718096' }}>Henüz tarama yok</div>
        ) : (
          <div>
            {scanLogs.slice(0,10).map((l,i)=>(
              <div key={i} style={{ padding:'10px 0', borderBottom:'1px solid #0d1117', fontSize:12, color:'#a0aec0' }}>
                <span style={{ color:'#718096' }}>{trSaat(l.created_at)}</span>
                {' · '}
                <span>{l.coin_count} coin</span>
                {' · '}
                <span style={{ color:l.signal_count>0?'#68d391':'#718096' }}>
                  {l.signal_count>0 ? `✅ ${(l.signals_found||[]).join(', ')}` : '❌ Sinyal yok'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
