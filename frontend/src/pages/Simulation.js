import React, { useState, useEffect } from 'react';
import axios from 'axios';

const trSaat = (t) => t ? new Date(t).toLocaleString('tr-TR') : '-';
const renk   = (v) => (v||0)>=0 ? '#68d391' : '#fc8181';

const Kart = ({ label, value, color, sub }) => (
  <div style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:8, padding:'14px 16px', textAlign:'center' }}>
    <div style={{ fontSize:11, color:'#718096', marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:20, fontWeight:700, color:color||'#e2e8f0' }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:'#4a5568', marginTop:4 }}>{sub}</div>}
  </div>
);

const GucBadge = ({ guc }) => {
  const map = { GUCLU:['💪','#68d391'], NORMAL:['📊','#f6ad55'], ZAYIF:['⚠️','#a0aec0'] };
  const [icon, color] = map[guc]||['?','#718096'];
  return <span style={{ color, fontSize:11 }}>{icon} {guc}</span>;
};

export default function Simulation({ api }) {
  const [stats,         setStats]         = useState(null);
  const [resetting,     setResetting]     = useState(false);
  const [startBal,      setStartBal]      = useState(1000);
  const [tab,           setTab]           = useState('acik');
  const [engineRunning, setEngineRunning] = useState(false);
  const [toggling,      setToggling]      = useState(false);

  const fetchStats = async () => {
    try {
      const [simRes, statusRes] = await Promise.all([
        axios.get(`${api}/api/simulation/stats`),
        axios.get(`${api}/api/status`)
      ]);
      setStats(simRes.data);
      setEngineRunning(statusRes.data.running||false);
    } catch(e) { console.error(e); }
  };

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 3000);
    return () => clearInterval(iv);
  }, []);

  const toggleEngine = async () => {
    setToggling(true);
    try {
      const endpoint = engineRunning ? '/api/engine/stop' : '/api/engine/start';
      await axios.post(`${api}${endpoint}`);
      setTimeout(fetchStats, 1000);
    } catch(e) { alert('Hata: '+e.message); }
    setToggling(false);
  };

  const reset = async () => {
    if (!window.confirm(`Simülasyonu ${startBal} USDT ile sıfırla?`)) return;
    setResetting(true);
    try {
      await axios.post(`${api}/api/simulation/reset`, { balance:parseFloat(startBal) });
      await fetchStats();
    } catch(e) { alert('Hata: '+e.message); }
    setResetting(false);
  };

  if (!stats) return (
    <div style={{ textAlign:'center', padding:80, color:'#718096' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🎮</div>
      <div style={{ fontSize:15 }}>Simülasyon yükleniyor...</div>
    </div>
  );

  const closed = stats.recentTrades?.filter(t=>t.status!=='OPEN')||[];
  const open   = stats.openPositions||[];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">🎮 Canlı Simülasyon</div>
          <div className="page-sub">Gerçek fiyatlar · Sanal para · Otomatik al/sat</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>

          {/* Engine Başlat/Durdur */}
          <button onClick={toggleEngine} disabled={toggling}
            style={{ padding:'9px 20px', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600,
              background: engineRunning ? 'rgba(252,129,129,0.15)' : 'rgba(104,211,145,0.15)',
              border: engineRunning ? '1px solid #fc8181' : '1px solid #68d391',
              color: engineRunning ? '#fc8181' : '#68d391' }}>
            {toggling ? '...' : engineRunning ? '⏹ Durdur' : '▶ Başlat'}
          </button>

          {/* Sıfırla */}
          <input type="number" value={startBal}
            onChange={e=>setStartBal(e.target.value)}
            style={{ width:80, padding:'8px 10px', background:'#0a0e1a', border:'1px solid #1e2736',
              borderRadius:6, color:'#e2e8f0', fontSize:13 }} />
          <span style={{ color:'#718096', fontSize:12 }}>USDT</span>
          <button onClick={reset} disabled={resetting}
            style={{ padding:'9px 16px', background:'#2d3748', border:'1px solid #4a5568',
              borderRadius:6, color:'#e2e8f0', cursor:'pointer', fontSize:13 }}>
            {resetting ? '...' : '🔄 Sıfırla'}
          </button>
        </div>
      </div>

      {/* Engine durumu banner */}
      <div style={{ background: engineRunning ? 'rgba(13,40,24,0.5)' : 'rgba(45,17,17,0.3)',
        border: `1px solid ${engineRunning?'#276749':'#4a1111'}`,
        borderRadius:8, padding:'10px 16px', marginBottom:16,
        display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:8, height:8, borderRadius:'50%',
          background: engineRunning ? '#68d391' : '#fc8181',
          boxShadow: engineRunning ? '0 0 6px #68d391' : 'none' }} />
        <span style={{ fontSize:13, color: engineRunning ? '#68d391' : '#fc8181', fontWeight:600 }}>
          {engineRunning ? 'Engine çalışıyor — Sinyaller izleniyor, simülasyon aktif' : 'Engine durduruldu — Simülasyon pasif'}
        </span>
      </div>

      {/* Ana metrikler */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:12 }}>
        <Kart label="Sanal Bakiye"
          value={`${(stats.balance||0).toFixed(2)} USDT`}
          color={stats.balance>=(stats.startBalance||1000)?'#68d391':'#fc8181'}
          sub={`Başlangıç: ${stats.startBalance||1000} USDT`} />
        <Kart label="Toplam PnL"
          value={`${(stats.totalPnl||0)>=0?'+':''}${(stats.totalPnl||0).toFixed(2)} USDT`}
          color={renk(stats.totalPnl)}
          sub={`%${(stats.totalPnlPct||0)>=0?'+':''}${(stats.totalPnlPct||0).toFixed(2)}`} />
        <Kart label="Kazanma Oranı"
          value={`%${stats.winRate||0}`}
          color={(stats.winRate||0)>=50?'#68d391':'#fc8181'}
          sub={`${stats.wins||0}K / ${stats.losses||0}K`} />
        <Kart label="Profit Factor"
          value={stats.profitFactor===999?'∞':(stats.profitFactor||0)}
          color={(stats.profitFactor||0)>=1.5?'#68d391':(stats.profitFactor||0)>=1?'#f6ad55':'#fc8181'}
          sub="Kazanç / Kayıp" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <Kart label="Toplam İşlem"  value={stats.totalTrades||0} />
        <Kart label="Açık Pozisyon" value={stats.openTrades||0} color="#60a5fa" />
        <Kart label="Ort. Kazanç"   value={`+%${(stats.avgWin||0).toFixed(2)}`}  color="#68d391" />
        <Kart label="Ort. Kayıp"    value={`%${(stats.avgLoss||0).toFixed(2)}`}   color="#fc8181" />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['acik',`📊 Açık (${open.length})`],['gecmis',`📋 Geçmiş (${closed.length})`]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:'8px 20px', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600,
              background:tab===id?'#2b4c7e':'#0a0e1a',
              border:tab===id?'1px solid #3182ce':'1px solid #1e2736',
              color:tab===id?'#90cdf4':'#718096' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Açık pozisyonlar */}
      {tab==='acik' && (
        <div className="card">
          <div className="card-title">📊 Açık Simülasyon Pozisyonları</div>
          {open.length===0 ? (
            <div style={{ textAlign:'center', padding:50, color:'#718096' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
              <div>Henüz açık pozisyon yok</div>
              <div style={{ fontSize:12, marginTop:8, color:'#4a5568' }}>
                {engineRunning ? 'Sinyal bekleniyor...' : 'Engine\'i başlat ve bekle'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #1e2736' }}>
                    {['Coin','Yön','Güç','Giriş$','Güncel$','Stop','PnL%','PnL USDT','Açılış'].map(h=>(
                      <th key={h} style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {open.map((p,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid #0d1117',
                      background:(p.pnl||0)>=0?'rgba(13,40,24,0.3)':'rgba(45,17,17,0.2)' }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:'#60a5fa', fontSize:12 }}>{p.symbol}</td>
                      <td style={{ padding:'8px 10px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                          background:p.side==='LONG'?'rgba(49,130,206,0.2)':'rgba(245,158,11,0.2)',
                          color:p.side==='LONG'?'#60a5fa':'#f6ad55' }}>{p.side}</span>
                      </td>
                      <td style={{ padding:'8px 10px' }}><GucBadge guc={p.signal_guc} /></td>
                      <td style={{ padding:'8px 10px', fontSize:12 }}>{parseFloat(p.entry_price||0).toFixed(4)}</td>
                      <td style={{ padding:'8px 10px', fontSize:12 }}>{parseFloat(p.current_price||p.entry_price||0).toFixed(4)}</td>
                      <td style={{ padding:'8px 10px', fontSize:11, color:'#fc8181' }}>{parseFloat(p.stop_loss||0).toFixed(4)}</td>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:renk(p.pnl_percent) }}>
                        {(p.pnl_percent||0)>=0?'+':''}{(p.pnl_percent||0).toFixed(2)}%
                      </td>
                      <td style={{ padding:'8px 10px', fontWeight:700, fontSize:12, color:renk(p.pnl) }}>
                        {(p.pnl||0)>=0?'+':''}{(p.pnl||0).toFixed(4)}
                      </td>
                      <td style={{ padding:'8px 10px', fontSize:10, color:'#718096' }}>{trSaat(p.opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Geçmiş işlemler */}
      {tab==='gecmis' && (
        <div className="card">
          <div className="card-title">📋 Kapatılan İşlemler</div>
          {closed.length===0 ? (
            <div style={{ textAlign:'center', padding:50, color:'#718096' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
              <div>Henüz kapatılmış işlem yok</div>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #1e2736' }}>
                    {['Coin','Yön','Güç','Giriş$','Çıkış$','Sebep','4H','PnL%','PnL USDT','Tarih'].map(h=>(
                      <th key={h} style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {closed.map((t,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid #0d1117',
                      background:(t.pnl||0)>=0?'rgba(13,40,24,0.3)':'rgba(45,17,17,0.2)' }}>
                      <td style={{ padding:'7px 10px', fontWeight:700, color:'#60a5fa', fontSize:12 }}>{t.symbol}</td>
                      <td style={{ padding:'7px 10px' }}>
                        <span style={{ padding:'2px 6px', borderRadius:4, fontSize:11, fontWeight:600,
                          background:t.side==='LONG'?'rgba(49,130,206,0.2)':'rgba(245,158,11,0.2)',
                          color:t.side==='LONG'?'#60a5fa':'#f6ad55' }}>{t.side}</span>
                      </td>
                      <td style={{ padding:'7px 10px' }}><GucBadge guc={t.signal_guc} /></td>
                      <td style={{ padding:'7px 10px', fontSize:11 }}>{parseFloat(t.entry_price||0).toFixed(4)}</td>
                      <td style={{ padding:'7px 10px', fontSize:11 }}>{parseFloat(t.exit_price||0).toFixed(4)}</td>
                      <td style={{ padding:'7px 10px' }}>
                        <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, fontWeight:600,
                          background:t.close_reason==='TRAILING_STOP'?'#0d2818':t.close_reason==='STOP_LOSS'?'#2d1111':'#1a2744',
                          color:t.close_reason==='TRAILING_STOP'?'#68d391':t.close_reason==='STOP_LOSS'?'#fc8181':'#60a5fa'
                        }}>{t.close_reason}</span>
                      </td>
                      <td style={{ padding:'7px 10px', fontSize:10, color:'#a0aec0' }}>{t.trend4H||'-'}</td>
                      <td style={{ padding:'7px 10px', fontWeight:700, color:renk(t.pnl_percent) }}>
                        {(t.pnl_percent||0)>=0?'+':''}{(t.pnl_percent||0).toFixed(2)}%
                      </td>
                      <td style={{ padding:'7px 10px', fontWeight:700, fontSize:12, color:renk(t.pnl) }}>
                        {(t.pnl||0)>=0?'+':''}{(t.pnl||0).toFixed(4)}
                      </td>
                      <td style={{ padding:'7px 10px', fontSize:10, color:'#718096' }}>{trSaat(t.closed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
