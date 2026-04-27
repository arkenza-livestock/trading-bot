import React, { useState } from 'react';
import axios from 'axios';

const trSaat = (t) => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

const COINS = [
  'TÜMÜ',
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT',
  'LTCUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
  'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT'
];

const StatCard = ({ label, value, color, sub }) => (
  <div style={{ background:'#0a0e1a', border:'1px solid #1e2736', borderRadius:8, padding:'14px 16px', textAlign:'center' }}>
    <div style={{ fontSize:11, color:'#718096', marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:20, fontWeight:700, color:color||'#e2e8f0' }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:'#4a5568', marginTop:4 }}>{sub}</div>}
  </div>
);

export default function Backtest({ api }) {
  const [params, setParams] = useState({
    symbol:'TÜMÜ', interval:'1h', days:30,
    stopLoss:2.0, trailingStop:0.5, minProfit:1.5,
    commission:0.1, slippage:0.05, minScore:40,
    tradeAmount:100, maxPositions:3,
    enableShort:true, optimize:true,
    rsiPeriod:14, rsiOversold:40, rsiOverbought:70
  });
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const update = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await axios.post(`${api}/api/backtest`, params, { timeout: 600000 });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Backtest hatası');
    }
    setLoading(false);
  };

  const N = ({ k, label, step=1 }) => (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:'block', fontSize:12, color:'#718096', marginBottom:4 }}>{label}</label>
      <input className="form-input" type="number" step={step}
        value={params[k]} onChange={e=>update(k, parseFloat(e.target.value))}
        style={{ padding:'8px 10px', fontSize:13 }} />
    </div>
  );

  const Toggle = ({ k, label }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <span style={{ fontSize:12, color:'#718096' }}>{label}</span>
      <div onClick={() => update(k, !params[k])}
        style={{ width:44, height:24, borderRadius:12, cursor:'pointer', position:'relative', transition:'all 0.2s',
          background: params[k] ? '#3182ce' : '#2d3748' }}>
        <div style={{ width:18, height:18, borderRadius:'50%', background:'white', position:'absolute',
          top:3, left: params[k] ? 23 : 3, transition:'all 0.2s' }} />
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🔬 Backtest</div>
          <div className="page-sub">Long + Short • Skor optimizasyonu • Gerçek zamanlı simülasyon</div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading} style={{ padding:'10px 28px' }}>
          {loading ? '⏳ Çalışıyor...' : '▶ Backtest Başlat'}
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20 }}>

        {/* Sol — Parametreler */}
        <div className="card">
          <div className="card-title" style={{ marginBottom:16 }}>⚙️ Parametreler</div>

          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:12, color:'#718096', marginBottom:4 }}>Coin</label>
            <select className="form-input" value={params.symbol} onChange={e=>update('symbol',e.target.value)} style={{ padding:'8px 10px', fontSize:13 }}>
              {COINS.map(c=><option key={c} value={c}>{c==='TÜMÜ'?'🌐 Tüm Coinler':c}</option>)}
            </select>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:12, color:'#718096', marginBottom:4 }}>Mum Aralığı</label>
            <select className="form-input" value={params.interval} onChange={e=>update('interval',e.target.value)} style={{ padding:'8px 10px', fontSize:13 }}>
              <option value="15m">15 Dakika</option>
              <option value="30m">30 Dakika</option>
              <option value="1h">1 Saat</option>
              <option value="4h">4 Saat</option>
            </select>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:12, color:'#718096', marginBottom:4 }}>Test Süresi</label>
            <select className="form-input" value={params.days} onChange={e=>update('days',parseInt(e.target.value))} style={{ padding:'8px 10px', fontSize:13 }}>
              <option value={7}>7 Gün</option>
              <option value={14}>14 Gün</option>
              <option value={30}>30 Gün</option>
              <option value={60}>60 Gün</option>
              <option value={90}>90 Gün</option>
            </select>
          </div>

          <div style={{ fontSize:11, color:'#60a5fa', fontWeight:700, margin:'16px 0 10px', textTransform:'uppercase', letterSpacing:1 }}>Özellikler</div>
          <Toggle k="enableShort" label="Short Pozisyon" />
          <Toggle k="optimize"    label="Skor Optimizasyonu" />

          <div style={{ fontSize:11, color:'#60a5fa', fontWeight:700, margin:'16px 0 10px', textTransform:'uppercase', letterSpacing:1 }}>Risk</div>
          <N k="stopLoss"     label="Stop Loss (%)"            step={0.1} />
          <N k="trailingStop" label="Trailing Stop (%)"         step={0.1} />
          <N k="minProfit"    label="Min Kar (trailing için %)" step={0.1} />
          <N k="tradeAmount"  label="İşlem Miktarı (USDT)" />
          <N k="maxPositions" label="Max Açık Pozisyon" />

          <div style={{ fontSize:11, color:'#60a5fa', fontWeight:700, margin:'16px 0 10px', textTransform:'uppercase', letterSpacing:1 }}>Sinyal</div>
          <N k="minScore"      label="Min Sinyal Skoru" />
          <N k="rsiPeriod"     label="RSI Periyot" />
          <N k="rsiOversold"   label="RSI Aşırı Satım" />
          <N k="rsiOverbought" label="RSI Aşırı Alım" />

          <div style={{ fontSize:11, color:'#60a5fa', fontWeight:700, margin:'16px 0 10px', textTransform:'uppercase', letterSpacing:1 }}>Maliyet</div>
          <N k="commission" label="Komisyon (%)" step={0.01} />
          <N k="slippage"   label="Slippage (%)" step={0.01} />

          <button className="btn btn-primary" onClick={run} disabled={loading}
            style={{ width:'100%', marginTop:16, padding:12, fontSize:14 }}>
            {loading ? '⏳ Çalışıyor...' : '▶ Backtest Başlat'}
          </button>

          {loading && (
            <div style={{ marginTop:10, fontSize:11, color:'#718096', textAlign:'center' }}>
              {params.optimize ? 'Skor optimizasyonu + Simülasyon...' : 'Simülasyon çalışıyor...'}<br/>
              2-5 dakika sürebilir
            </div>
          )}
        </div>

        {/* Sağ — Sonuçlar */}
        <div>
          {error && (
            <div style={{ background:'#2d1111', border:'1px solid #4a1111', borderRadius:8, padding:16, color:'#fc8181', marginBottom:20 }}>
              ❌ {error}
            </div>
          )}

          {loading && (
            <div style={{ background:'#0d1a2d', border:'1px solid #1e3a5f', borderRadius:8, padding:60, textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:16 }}>⚙️</div>
              <div style={{ fontSize:15, fontWeight:600, color:'#60a5fa', marginBottom:8 }}>Simülasyon çalışıyor...</div>
              <div style={{ fontSize:12, color:'#718096' }}>
                {params.optimize && '🔍 Skor optimizasyonu → '} Tüm coinler aynı zaman çizgisinde
              </div>
            </div>
          )}

          {result && !loading && (
            <div>
              {/* Optimizasyon sonuçları */}
              {result.optimization && (
                <div className="card" style={{ marginBottom:16, padding:'12px 16px' }}>
                  <div style={{ fontSize:12, color:'#60a5fa', fontWeight:700, marginBottom:8 }}>🔍 Skor Optimizasyonu Sonuçları</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {result.optimization.results.map((r,i) => (
                      <div key={i} style={{
                        padding:'6px 12px', borderRadius:6, fontSize:11,
                        background: r.minScore===result.params.minScore ? '#0d2818' : '#0a0e1a',
                        border: r.minScore===result.params.minScore ? '1px solid #68d391' : '1px solid #1e2736',
                        color: r.minScore===result.params.minScore ? '#68d391' : '#718096'
                      }}>
                        <div style={{ fontWeight:700 }}>Skor:{r.minScore}</div>
                        <div>PF:{r.profitFactor===999?'∞':r.profitFactor}</div>
                        <div>%{r.winRate} ({r.totalTrades})</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:12, color:'#68d391', marginTop:8 }}>
                    ✅ En iyi skor: <b>{result.params.minScore}</b> (PF:{result.optimization.bestPF===999?'∞':result.optimization.bestPF})
                  </div>
                </div>
              )}

              {/* Özet kartlar */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
                <StatCard label="Toplam İşlem" value={result.summary.totalTrades}
                  sub={`${result.summary.wins}K / ${result.summary.losses}K`} />
                <StatCard label="Kazanma Oranı" value={`%${result.summary.winRate}`}
                  color={result.summary.winRate>=50?'#68d391':'#fc8181'} />
                <StatCard label="Toplam PnL"
                  value={`${result.summary.totalPnl>=0?'+':''}${result.summary.totalPnl} USDT`}
                  color={result.summary.totalPnl>=0?'#68d391':'#fc8181'} />
                <StatCard label="Profit Factor"
                  value={result.summary.profitFactor===999?'∞':result.summary.profitFactor}
                  color={result.summary.profitFactor>=1.5?'#68d391':result.summary.profitFactor>=1?'#f6ad55':'#fc8181'}
                  sub="Kazanç/Kayıp" />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
                <StatCard label="Ort. Kazanç"   value={`+%${result.summary.avgWin}`}   color="#68d391" />
                <StatCard label="Ort. Kayıp"    value={`%${result.summary.avgLoss}`}    color="#fc8181" />
                <StatCard label="Long İşlem"    value={result.summary.longCount||0}   color="#60a5fa" />
                <StatCard label="Short İşlem"   value={result.summary.shortCount||0}  color="#f6ad55" />
              </div>

              {/* Parametreler */}
              <div className="card" style={{ marginBottom:16, padding:'10px 16px' }}>
                <div style={{ fontSize:12, color:'#718096', display:'flex', gap:16, flexWrap:'wrap' }}>
                  <span>⏱️ <b style={{color:'#e2e8f0'}}>{result.params.interval}</b></span>
                  <span>📅 <b style={{color:'#e2e8f0'}}>{result.params.days} gün</b></span>
                  <span>🎯 Min Skor: <b style={{color:'#68d391'}}>{result.params.minScore}</b></span>
                  <span>🛑 Stop: <b style={{color:'#e2e8f0'}}>%{result.params.stopLoss}</b></span>
                  <span>📈 Trailing: <b style={{color:'#e2e8f0'}}>%{result.params.trailingStop}</b></span>
                  <span>💰 Miktar: <b style={{color:'#e2e8f0'}}>{result.params.tradeAmount} USDT</b></span>
                  <span>📊 MaxPos: <b style={{color:'#e2e8f0'}}>{result.params.maxPositions}</b></span>
                  {result.params.enableShort && <span style={{color:'#f6ad55'}}>⬇️ Short Aktif</span>}
                </div>
              </div>

              {/* Coin özeti */}
              {result.coinSummaries?.length>0 && (
                <div className="card" style={{ marginBottom:16 }}>
                  <div className="card-title">📊 Coin Bazlı Sonuçlar</div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #1e2736' }}>
                          <th style={{ padding:'8px 12px', textAlign:'left',   fontSize:12, color:'#718096' }}>Coin</th>
                          <th style={{ padding:'8px 12px', textAlign:'center', fontSize:12, color:'#718096' }}>İşlem</th>
                          <th style={{ padding:'8px 12px', textAlign:'center', fontSize:12, color:'#718096' }}>Kazanma%</th>
                          <th style={{ padding:'8px 12px', textAlign:'right',  fontSize:12, color:'#718096' }}>PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.coinSummaries.map((c,i)=>(
                          <tr key={i} style={{ borderBottom:'1px solid #0d1117',
                            background:c.totalPnl>=0?'rgba(13,40,24,0.3)':'rgba(45,17,17,0.2)' }}>
                            <td style={{ padding:'8px 12px', fontWeight:600, color:'#e2e8f0' }}>{c.symbol}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontSize:12, color:'#a0aec0' }}>
                              {c.totalTrades} ({c.wins}K/{c.losses}K)
                            </td>
                            <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:600,
                              color:c.winRate>=50?'#68d391':'#fc8181' }}>%{c.winRate}</td>
                            <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:700,
                              color:c.totalPnl>=0?'#68d391':'#fc8181' }}>
                              {c.totalPnl>=0?'+':''}{c.totalPnl} USDT
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* İşlem geçmişi */}
              <div className="card">
                <div className="card-title">İşlem Geçmişi ({result.trades.length})</div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid #1e2736' }}>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'left' }}>Coin</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'center' }}>Yön</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'left' }}>Giriş</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'left' }}>Çıkış</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'right' }}>Giriş$</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'right' }}>Çıkış$</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'center' }}>Sebep</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'center' }}>Skor</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'center' }}>4H</th>
                        <th style={{ padding:'8px 10px', fontSize:11, color:'#718096', textAlign:'right' }}>PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t,i)=>(
                        <tr key={i} style={{ borderBottom:'1px solid #0d1117',
                          background:t.netPnl>=0?'rgba(13,40,24,0.3)':'rgba(45,17,17,0.3)' }}>
                          <td style={{ padding:'7px 10px', fontWeight:600, color:'#60a5fa', fontSize:12 }}>{t.symbol}</td>
                          <td style={{ padding:'7px 10px', textAlign:'center' }}>
                            <span style={{ fontSize:11, padding:'2px 6px', borderRadius:4, fontWeight:600,
                              background:t.side==='LONG'?'rgba(49,130,206,0.2)':'rgba(245,158,11,0.2)',
                              color:t.side==='LONG'?'#60a5fa':'#f6ad55' }}>{t.side}</span>
                          </td>
                          <td style={{ padding:'7px 10px', fontSize:10, color:'#a0aec0' }}>{trSaat(t.entryTime)}</td>
                          <td style={{ padding:'7px 10px', fontSize:10, color:'#a0aec0' }}>{trSaat(t.exitTime)}</td>
                          <td style={{ padding:'7px 10px', fontSize:11, color:'#e2e8f0', textAlign:'right' }}>{parseFloat(t.entryPrice).toFixed(4)}</td>
                          <td style={{ padding:'7px 10px', fontSize:11, color:'#e2e8f0', textAlign:'right' }}>{parseFloat(t.exitPrice).toFixed(4)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'center' }}>
                            <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, fontWeight:600,
                              background:t.reason==='TRAILING_STOP'?'#0d2818':t.reason==='STOP_LOSS'?'#2d1111':'#1a2744',
                              color:t.reason==='TRAILING_STOP'?'#68d391':t.reason==='STOP_LOSS'?'#fc8181':'#60a5fa'
                            }}>{t.reason}</span>
                          </td>
                          <td style={{ padding:'7px 10px', textAlign:'center', fontSize:11, color:'#f6ad55' }}>{t.score}</td>
                          <td style={{ padding:'7px 10px', textAlign:'center', fontSize:10, color:'#a0aec0' }}>{t.trend4H||'-'}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, fontSize:12,
                            color:t.netPnl>=0?'#68d391':'#fc8181' }}>
                            {t.netPnl>=0?'+':''}{t.netPnlPct}%
                            <div style={{ fontSize:10, color:t.netPnl>=0?'#38a169':'#e53e3e' }}>
                              {t.netPnl>=0?'+':''}{t.netPnl}$
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!result&&!loading&&!error && (
            <div style={{ background:'#0d1a2d', border:'1px solid #1e3a5f', borderRadius:8, padding:60, textAlign:'center', color:'#718096' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🔬</div>
              <div style={{ fontSize:16, fontWeight:600, marginBottom:8, color:'#a0aec0' }}>Backtest Hazır</div>
              <div style={{ fontSize:13, marginBottom:12 }}>Parametreleri ayarla ve başlat</div>
              <div style={{ fontSize:12, color:'#4a5568', lineHeight:2 }}>
                ✅ Long + Short pozisyon<br/>
                ✅ Skor optimizasyonu (10 farklı eşik test eder)<br/>
                ✅ Tüm coinler aynı zaman çizgisinde<br/>
                ✅ Max {params.maxPositions} pozisyon aynı anda<br/>
                ✅ Zararlı pozisyon koruması<br/>
                ✅ BTC ani düşüş koruması
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
