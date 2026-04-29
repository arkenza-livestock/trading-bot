import React, { useState, useEffect } from 'react';

const trSaat = (t) => t ? new Date(t).toLocaleString('tr-TR') : '-';

const StatKart = ({ label, value, color, sub, icon }) => (
  <div style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:10, padding:'16px 20px' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
      <span style={{ fontSize:12, color:'#718096' }}>{label}</span>
      <span style={{ fontSize:20 }}>{icon}</span>
    </div>
    <div style={{ fontSize:22, fontWeight:800, color:color||'#e2e8f0' }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:'#4a5568', marginTop:4 }}>{sub}</div>}
  </div>
);

export default function Dashboard({ api }) {
  const [signals,   setSignals]   = useState([]);
  const [positions, setPositions] = useState([]);
  const [scanLogs,  setScanLogs]  = useState([]);
  const [stats,     setStats]     = useState({ totalPnl:0, winRate:0, openCount:0, totalTrades:0 });
  const [simStats,  setSimStats]  = useState(null);
  const [lastUpdate,setLastUpdate]= useState(null);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [api]);

  const load = async () => {
    try {
      const [sRes, pRes, lRes, stRes] = await Promise.all([
        fetch(`${api}/api/signals`).then(r=>r.json()),
        fetch(`${api}/api/positions/open`).then(r=>r.json()),
        fetch(`${api}/api/scan-logs`).then(r=>r.json()),
        fetch(`${api}/api/status`).then(r=>r.json()),
      ]);
      setSignals(Array.isArray(sRes)?sRes:[]);
      setPositions(Array.isArray(pRes)?pRes:[]);
      setScanLogs(Array.isArray(lRes)?lRes:[]);
      setStats({
        totalPnl:    stRes.totalPnl||0,
        winRate:     stRes.winRate||0,
        openCount:   stRes.openPositions||0,
        totalTrades: stRes.totalTrades||0,
        running:     stRes.running||false
      });
      setLastUpdate(new Date().toLocaleTimeString('tr-TR'));

      // Simülasyon stats
      fetch(`${api}/api/simulation/stats`).then(r=>r.json()).then(setSimStats).catch(()=>{});
    } catch(e) { console.error(e); }
  };

  const lastScan = scanLogs[0];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:'#e2e8f0' }}>📊 Dashboard</div>
          <div style={{ fontSize:12, color:'#718096', marginTop:4 }}>Gerçek zamanlı kripto sinyal takibi</div>
        </div>
        <div style={{ fontSize:11, color:'#4a5568' }}>
          {lastUpdate && `🕐 ${lastUpdate}`}
        </div>
      </div>

      {/* Stat kartlar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <StatKart label="Toplam PnL" icon="💰"
          value={`${(stats.totalPnl||0)>=0?'+':''}${(stats.totalPnl||0).toFixed(2)} USDT`}
          color={(stats.totalPnl||0)>=0?'#68d391':'#fc8181'} />
        <StatKart label="Kazanma Oranı" icon="🎯"
          value={`%${(stats.winRate||0).toFixed(1)}`}
          color={(stats.winRate||0)>=50?'#68d391':'#f6ad55'} />
        <StatKart label="Açık Pozisyon" icon="💼"
          value={stats.openCount||0}
          color="#60a5fa" />
        <StatKart label="Engine" icon="⚡"
          value={stats.running?'Çalışıyor':'Durduruldu'}
          color={stats.running?'#68d391':'#fc8181'} />
      </div>

      {/* Simülasyon özet */}
      {simStats && (
        <div style={{ background:'#0a0e1a', border:'1px solid #1e3a5f', borderRadius:10, padding:'14px 20px', marginBottom:20 }}>
          <div style={{ fontSize:12, color:'#60a5fa', fontWeight:700, marginBottom:10 }}>🎮 Canlı Simülasyon</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            <div>
              <div style={{ fontSize:11, color:'#718096' }}>Bakiye</div>
              <div style={{ fontSize:16, fontWeight:700, color:(simStats.balance||0)>=1000?'#68d391':'#fc8181' }}>
                {(simStats.balance||0).toFixed(2)} USDT
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'#718096' }}>Sim PnL</div>
              <div style={{ fontSize:16, fontWeight:700, color:(simStats.totalPnl||0)>=0?'#68d391':'#fc8181' }}>
                {(simStats.totalPnl||0)>=0?'+':''}{(simStats.totalPnl||0).toFixed(2)} USDT
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'#718096' }}>Kazanma</div>
              <div style={{ fontSize:16, fontWeight:700, color:(simStats.winRate||0)>=50?'#68d391':'#f6ad55' }}>
                %{simStats.winRate||0}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'#718096' }}>Açık Pos.</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#60a5fa' }}>{simStats.openTrades||0}</div>
            </div>
          </div>
        </div>
      )}

      {/* Son tarama */}
      {lastScan && (
        <div style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:10, padding:'12px 20px', marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <span style={{ fontSize:12, color:'#718096' }}>🔍 Son Tarama · </span>
              <span style={{ fontSize:12, color:'#a0aec0' }}>{trSaat(lastScan.created_at)}</span>
            </div>
            <div style={{ fontSize:12, color:'#718096' }}>
              {lastScan.coin_count} coin · {((lastScan.duration_ms||0)/1000).toFixed(1)}s
            </div>
          </div>
          {lastScan.signal_count>0 && (
            <div style={{ marginTop:6, fontSize:12, color:'#68d391' }}>
              ✅ {(lastScan.signals_found||[]).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

        {/* Açık pozisyonlar */}
        <div style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:10, padding:'16px 20px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginBottom:12 }}>
            💼 Açık Pozisyonlar ({positions.length})
          </div>
          {positions.length===0 ? (
            <div style={{ textAlign:'center', padding:20, color:'#4a5568', fontSize:12 }}>Açık pozisyon yok</div>
          ) : (
            <div>
              {positions.slice(0,5).map((p,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #0d1117', fontSize:12 }}>
                  <div>
                    <span style={{ fontWeight:600, color:'#60a5fa' }}>{p.symbol}</span>
                    <span style={{ marginLeft:8, color:p.side==='LONG'?'#60a5fa':'#f6ad55', fontSize:11 }}>{p.side}</span>
                  </div>
                  <span style={{ color:(p.pnl||0)>=0?'#68d391':'#fc8181', fontWeight:600 }}>
                    {(p.pnl||0)>=0?'+':''}{(p.pnl||0).toFixed(2)} USDT
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Son sinyaller */}
        <div style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:10, padding:'16px 20px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginBottom:12 }}>
            🚨 Son Sinyaller
          </div>
          {signals.length===0 ? (
            <div style={{ textAlign:'center', padding:20, color:'#4a5568', fontSize:12 }}>Henüz sinyal yok</div>
          ) : (
            <div>
              {signals.slice(0,5).map((s,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #0d1117', fontSize:12 }}>
                  <div>
                    <span style={{ fontWeight:600, color:'#60a5fa' }}>{s.symbol}</span>
                    <span style={{ marginLeft:8, color:s.signal_type==='ALIM'?'#68d391':'#fc8181', fontSize:11 }}>
                      {s.signal_type==='ALIM'?'🚀':'📉'} {s.signal_type}
                    </span>
                  </div>
                  <span style={{ color:'#718096', fontSize:11 }}>{trSaat(s.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tarama geçmişi */}
      <div style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:10, padding:'16px 20px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginBottom:12 }}>📋 Tarama Geçmişi</div>
        {scanLogs.length===0 ? (
          <div style={{ textAlign:'center', padding:20, color:'#4a5568', fontSize:12 }}>Henüz tarama yok</div>
        ) : (
          <div>
            {scanLogs.slice(0,8).map((l,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #0d1117', fontSize:12, color:'#a0aec0' }}>
                <div>
                  <span style={{ color:'#718096' }}>{trSaat(l.created_at)}</span>
                  <span style={{ marginLeft:12, color:(l.signal_count||0)>0?'#68d391':'#718096' }}>
                    {(l.signal_count||0)>0 ? `✅ ${(l.signals_found||[]).join(', ')}` : '❌ Sinyal yok'}
                  </span>
                </div>
                <span style={{ color:'#4a5568' }}>{l.coin_count} coin · {((l.duration_ms||0)/1000).toFixed(1)}s</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
