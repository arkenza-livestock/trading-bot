import React, { useState } from 'react';
import axios from 'axios';

const trSaat = (tarih) => new Date(tarih).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

const COINS = [
  'TÜMÜ',
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT',
  'LTCUSDT','MATICUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
  'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT'
];

export default function Backtest({ api }) {
  const [params, setParams] = useState({
    symbol:        'TÜMÜ',
    interval:      '15m',
    days:          10,
    stopLoss:      1.5,
    trailingStop:  0.5,
    minProfit:     1.0,
    commission:    0.1,
    slippage:      0.05,
    minScore:      35,
    tradeAmount:   100,
    rsiPeriod:     7,
    rsiOversold:   40,
    rsiOverbought: 70
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, symbol: '' });

  const update = (key, value) => setParams(prev => ({ ...prev, [key]: value }));

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const symbols = params.symbol === 'TÜMÜ'
      ? COINS.filter(c => c !== 'TÜMÜ')
      : [params.symbol];

    setProgress({ current: 0, total: symbols.length, symbol: '' });

    try {
      if (symbols.length === 1) {
        // Tek coin
        const res = await axios.post(`${api}/api/backtest`, { ...params, symbol: symbols[0] });
        setResult(res.data);
      } else {
        // Tüm coinler
        const results = [];
        for (let i = 0; i < symbols.length; i++) {
          const symbol = symbols[i];
          setProgress({ current: i + 1, total: symbols.length, symbol });
          try {
            const res = await axios.post(`${api}/api/backtest`, { ...params, symbol });
            if (res.data.summary.totalTrades > 0) {
              results.push({ symbol, ...res.data });
            }
          } catch (err) {
            console.error(`${symbol} hata:`, err.message);
          }
        }
        // Tüm sonuçları birleştir
        const allTrades = results.flatMap(r => r.trades.map(t => ({ ...t, symbol: r.symbol })));
        const closedTrades = allTrades.filter(t => t.reason !== 'OPEN');
        const wins   = closedTrades.filter(t => t.netPnl > 0);
        const losses = closedTrades.filter(t => t.netPnl <= 0);
        const totalPnl  = allTrades.reduce((s, t) => s + t.netPnl, 0);
        const winRate   = closedTrades.length > 0 ? (wins.length / closedTrades.length * 100) : 0;
        const avgWin    = wins.length   > 0 ? wins.reduce((s,t)   => s + t.netPnlPct, 0) / wins.length   : 0;
        const avgLoss   = losses.length > 0 ? losses.reduce((s,t) => s + t.netPnlPct, 0) / losses.length : 0;
        const grossWin  = Math.abs(wins.reduce((s,t)   => s + t.netPnl, 0));
        const grossLoss = Math.abs(losses.reduce((s,t) => s + t.netPnl, 0));
        const bestTrade  = allTrades.reduce((b, t) => t.netPnlPct > (b?.netPnlPct || -999) ? t : b, null);
        const worstTrade = allTrades.reduce((w, t) => t.netPnlPct < (w?.netPnlPct || 999)  ? t : w, null);

        // Her coin özeti
        const coinSummaries = results.map(r => ({
          symbol:      r.symbol,
          totalTrades: r.summary.totalTrades,
          wins:        r.summary.wins,
          losses:      r.summary.losses,
          winRate:     r.summary.winRate,
          totalPnl:    r.summary.totalPnl,
          profitFactor: r.summary.profitFactor
        })).sort((a, b) => b.totalPnl - a.totalPnl);

        setResult({
          isMulti: true,
          params,
          coinSummaries,
          summary: {
            totalCoins:   results.length,
            totalTrades:  allTrades.length,
            wins:         wins.length,
            losses:       losses.length,
            winRate:      parseFloat(winRate.toFixed(1)),
            totalPnl:     parseFloat(totalPnl.toFixed(4)),
            avgWin:       parseFloat(avgWin.toFixed(2)),
            avgLoss:      parseFloat(avgLoss.toFixed(2)),
            bestTrade:    bestTrade  ? parseFloat(bestTrade.netPnlPct.toFixed(2))  : 0,
            worstTrade:   worstTrade ? parseFloat(worstTrade.netPnlPct.toFixed(2)) : 0,
            profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : 999
          },
          trades: allTrades.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime)).slice(0, 50)
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Backtest hatası');
    }
    setLoading(false);
  };

  const N = ({ k, label, step = 1 }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#718096', marginBottom: 4 }}>{label}</label>
      <input className="form-input" type="number" step={step}
        value={params[k]} onChange={e => update(k, parseFloat(e.target.value))}
        style={{ padding: '8px 10px', fontSize: 13 }} />
    </div>
  );

  const StatCard = ({ label, value, color, sub }) => (
    <div style={{ background: '#0a0e1a', border: '1px solid #1e2736', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#718096', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || '#e2e8f0' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#4a5568', marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🔬 Backtest</div>
          <div className="page-sub">Geçmiş verilerle strateji simülasyonu</div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading} style={{ padding: '10px 28px' }}>
          {loading ? '⏳ Test ediliyor...' : '▶ Backtest Çalıştır'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>

        {/* Sol — Parametreler */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>⚙️ Parametreler</div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#718096', marginBottom: 4 }}>Coin</label>
            <select className="form-input" value={params.symbol} onChange={e => update('symbol', e.target.value)}
              style={{ padding: '8px 10px', fontSize: 13 }}>
              {COINS.map(c => <option key={c} value={c}>{c === 'TÜMÜ' ? '🌐 Tüm Coinler' : c}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#718096', marginBottom: 4 }}>Mum Aralığı</label>
            <select className="form-input" value={params.interval} onChange={e => update('interval', e.target.value)}
              style={{ padding: '8px 10px', fontSize: 13 }}>
              <option value="5m">5 Dakika (~3.5 gün)</option>
              <option value="15m">15 Dakika (~10 gün)</option>
              <option value="30m">30 Dakika (~20 gün)</option>
              <option value="1h">1 Saat (~41 gün)</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#718096', marginBottom: 4 }}>Test Süresi</label>
            <select className="form-input" value={params.days} onChange={e => update('days', parseInt(e.target.value))}
              style={{ padding: '8px 10px', fontSize: 13 }}>
              <option value={3}>3 Gün</option>
              <option value={7}>7 Gün</option>
              <option value={10}>10 Gün</option>
              <option value={14}>14 Gün</option>
              <option value={30}>30 Gün</option>
            </select>
          </div>

          <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, marginBottom: 10, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Risk</div>
          <N k="stopLoss"     label="Stop Loss (%)"             step={0.1} />
          <N k="trailingStop" label="Trailing Stop (%)"          step={0.1} />
          <N k="minProfit"    label="Min Kar (trailing için %)"  step={0.1} />
          <N k="tradeAmount"  label="İşlem Miktarı (USDT)" />

          <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, marginBottom: 10, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Sinyal</div>
          <N k="minScore"      label="Min Sinyal Skoru" />
          <N k="rsiPeriod"     label="RSI Periyot" />
          <N k="rsiOversold"   label="RSI Aşırı Satım" />
          <N k="rsiOverbought" label="RSI Aşırı Alım" />

          <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, marginBottom: 10, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Maliyet</div>
          <N k="commission" label="Komisyon (%)" step={0.01} />
          <N k="slippage"   label="Slippage (%)" step={0.01} />

          <button className="btn btn-primary" onClick={run} disabled={loading}
            style={{ width: '100%', marginTop: 16, padding: '12px', fontSize: 14 }}>
            {loading ? '⏳ Test ediliyor...' : '▶ Backtest Çalıştır'}
          </button>
        </div>

        {/* Sağ — Sonuçlar */}
        <div>
          {error && (
            <div style={{ background: '#2d1111', border: '1px solid #4a1111', borderRadius: 8, padding: 16, color: '#fc8181', marginBottom: 20 }}>
              ❌ {error}
            </div>
          )}

          {loading && (
            <div style={{ background: '#0d1a2d', border: '1px solid #1e3a5f', borderRadius: 8, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#60a5fa', marginBottom: 8 }}>
                {progress.total > 1
                  ? `${progress.current}/${progress.total} coin test ediliyor...`
                  : 'Backtest çalışıyor...'}
              </div>
              {progress.symbol && (
                <div style={{ fontSize: 13, color: '#718096' }}>Şu an: {progress.symbol}</div>
              )}
              {progress.total > 1 && (
                <div style={{ background: '#1a2744', borderRadius: 8, height: 8, marginTop: 16, overflow: 'hidden' }}>
                  <div style={{
                    background: '#60a5fa', height: '100%', borderRadius: 8,
                    width: `${(progress.current / progress.total) * 100}%`,
                    transition: 'width 0.3s'
                  }} />
                </div>
              )}
            </div>
          )}

          {result && !loading && (
            <div>
              {/* Özet */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard label="Toplam İşlem" value={result.summary.totalTrades}
                  sub={result.isMulti ? `${result.summary.totalCoins} coin` : `${result.summary.wins}K / ${result.summary.losses}K`} />
                <StatCard label="Kazanma Oranı" value={`%${result.summary.winRate}`}
                  color={result.summary.winRate >= 50 ? '#68d391' : '#fc8181'} />
                <StatCard label="Toplam PnL"
                  value={`${result.summary.totalPnl >= 0 ? '+' : ''}${result.summary.totalPnl} USDT`}
                  color={result.summary.totalPnl >= 0 ? '#68d391' : '#fc8181'} />
                <StatCard label="Profit Factor"
                  value={result.summary.profitFactor === 999 ? '∞' : result.summary.profitFactor}
                  color={result.summary.profitFactor >= 1.5 ? '#68d391' : result.summary.profitFactor >= 1 ? '#f6ad55' : '#fc8181'}
                  sub="Kazanç/Kayıp" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard label="Ort. Kazanç"   value={`+%${result.summary.avgWin}`}   color="#68d391" />
                <StatCard label="Ort. Kayıp"    value={`%${result.summary.avgLoss}`}    color="#fc8181" />
                <StatCard label="En İyi İşlem"  value={`+%${result.summary.bestTrade}`} color="#68d391" />
                <StatCard label="En Kötü İşlem" value={`%${result.summary.worstTrade}`} color="#fc8181" />
              </div>

              {/* Coin bazlı sonuçlar */}
              {result.isMulti && result.coinSummaries && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-title">📊 Coin Bazlı Sonuçlar</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1e2736' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left',   fontSize: 12, color: '#718096' }}>Coin</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#718096' }}>İşlem</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#718096' }}>Kazanma %</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#718096' }}>PF</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 12, color: '#718096' }}>PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.coinSummaries.map((c, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #0d1117', background: c.totalPnl >= 0 ? 'rgba(13,40,24,0.3)' : 'rgba(45,17,17,0.2)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#e2e8f0' }}>{c.symbol}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#a0aec0' }}>
                              {c.totalTrades} ({c.wins}K/{c.losses}K)
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600,
                              color: c.winRate >= 50 ? '#68d391' : '#fc8181' }}>
                              %{c.winRate}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12,
                              color: c.profitFactor >= 1 ? '#68d391' : '#fc8181' }}>
                              {c.profitFactor === 999 ? '∞' : c.profitFactor}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700,
                              color: c.totalPnl >= 0 ? '#68d391' : '#fc8181' }}>
                              {c.totalPnl >= 0 ? '+' : ''}{c.totalPnl} USDT
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* İşlem Geçmişi */}
              <div className="card">
                <div className="card-title">İşlem Geçmişi ({result.trades.length})</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e2736' }}>
                        {result.isMulti && <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#718096' }}>Coin</th>}
                        <th style={{ padding: '8px 12px', textAlign: 'left',   fontSize: 12, color: '#718096' }}>Giriş</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left',   fontSize: 12, color: '#718096' }}>Çıkış</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 12, color: '#718096' }}>Giriş $</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 12, color: '#718096' }}>Çıkış $</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#718096' }}>Sebep</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#718096' }}>Skor</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#718096' }}>4H</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#718096' }}>1H</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 12, color: '#718096' }}>PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #0d1117', background: t.netPnl >= 0 ? 'rgba(13,40,24,0.3)' : 'rgba(45,17,17,0.3)' }}>
                          {result.isMulti && <td style={{ padding: '8px 12px', fontWeight: 600, color: '#60a5fa', fontSize: 12 }}>{t.symbol}</td>}
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#a0aec0' }}>{trSaat(t.entryTime)}</td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#a0aec0' }}>{trSaat(t.exitTime)}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12, color: '#e2e8f0', textAlign: 'right' }}>{parseFloat(t.entryPrice).toFixed(4)}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12, color: '#e2e8f0', textAlign: 'right' }}>{parseFloat(t.exitPrice).toFixed(4)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                              background: t.reason === 'TRAILING_STOP' ? '#0d2818' : t.reason === 'STOP_LOSS' ? '#2d1111' : '#1a2744',
                              color: t.reason === 'TRAILING_STOP' ? '#68d391' : t.reason === 'STOP_LOSS' ? '#fc8181' : '#60a5fa'
                            }}>{t.reason}</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#f6ad55' }}>{t.score}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, color: '#a0aec0' }}>{t.trend4H || '-'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, color: '#a0aec0' }}>{t.trend1H}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13,
                            color: t.netPnl >= 0 ? '#68d391' : '#fc8181' }}>
                            {t.netPnl >= 0 ? '+' : ''}{t.netPnlPct}%
                            <div style={{ fontSize: 11, fontWeight: 400, color: t.netPnl >= 0 ? '#38a169' : '#e53e3e' }}>
                              {t.netPnl >= 0 ? '+' : ''}{t.netPnl} USDT
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

          {!result && !loading && !error && (
            <div style={{ background: '#0d1a2d', border: '1px solid #1e3a5f', borderRadius: 8, padding: 60, textAlign: 'center', color: '#718096' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔬</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#a0aec0' }}>Backtest Hazır</div>
              <div style={{ fontSize: 13 }}>Sol taraftan parametreleri ayarla ve çalıştır</div>
              <div style={{ fontSize: 12, color: '#4a5568', marginTop: 8 }}>
                "Tüm Coinler" seçeneği 19 coini sırayla test eder
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
