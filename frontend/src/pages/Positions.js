import React, { useState, useEffect, useCallback } from 'react';

function Positions() {
  var [positions, setPositions] = useState([]);
  var [filter, setFilter] = useState('OPEN');
  var [loading, setLoading] = useState(true);
  var [summary, setSummary] = useState({ openCount:0, closedCount:0, totalPnl:0, winRate:0, totalTrades:0 });
  var [message, setMessage] = useState('');

  var fetchPositions = useCallback(async function() {
    try {
      var res = await fetch('/api/positions');
      var allPositions = await res.json();
      
      var realPositions = allPositions.filter(function(p) { return p.is_real === 1; });
      setPositions(realPositions);

      var open = realPositions.filter(function(p) { return p.status === 'OPEN'; });
      var closed = realPositions.filter(function(p) { return p.status !== 'OPEN'; });
      var totalPnl = closed.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
      var wins = closed.filter(function(p) { return p.pnl > 0; }).length;
      
      setSummary({
        openCount: open.length,
        closedCount: closed.length,
        totalPnl: totalPnl,
        winRate: closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : 0,
        totalTrades: closed.length
      });
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(function() {
    fetchPositions();
    var interval = setInterval(fetchPositions, 20000);
    return function() { clearInterval(interval); };
  }, [fetchPositions]);

  var manualSell = async function(symbol) {
    if (!window.confirm(symbol + ' icin manuel kapatma yapilsin mi?')) return;
    setMessage('');
    try {
      var res = await fetch('/api/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol, is_real: 1 })
      });
      var data = await res.json();
      setMessage(data.message || data.error);
      setTimeout(function() { setMessage(''); fetchPositions(); }, 2000);
    } catch(e) { setMessage('Hata: ' + e.message); }
  };

  if (loading) return <div className="loading">Yukleniyor...</div>;

  var filteredPositions = positions.filter(function(p) {
    if (filter === 'OPEN') return p.status === 'OPEN';
    if (filter === 'CLOSED') return p.status !== 'OPEN';
    if (filter === 'LONG') return p.side === 'LONG';
    if (filter === 'SHORT') return p.side === 'SHORT';
    return true;
  });

  var formatTime = function(timeStr) {
    if (!timeStr) return '-';
    try { return new Date(timeStr + 'Z').toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }); }
    catch(e) { return timeStr; }
  };

  return (
    <div className="positions">
      <h1>📊 Pozisyonlar</h1>
      <p style={{color:'#64748b', marginBottom:25, fontSize:14}}>
        Gercek islem pozisyonlari | 🟢 LONG & 🔴 SHORT
      </p>

      {message && <div className="message">{message}</div>}

      <div className="card-grid">
        <div className="card"><div className="card-label">📌 Acik Pozisyon</div><div className="card-value gold">{summary.openCount}</div></div>
        <div className="card"><div className="card-label">💰 Toplam PnL</div><div className={'card-value '+(summary.totalPnl>=0?'green':'red')}>${summary.totalPnl.toFixed(2)}</div></div>
        <div className="card"><div className="card-label">🏆 Kazanma Orani</div><div className="card-value green">%{summary.winRate}</div></div>
        <div className="card"><div className="card-label">🔄 Toplam Islem</div><div className="card-value">{summary.totalTrades}</div></div>
      </div>

      <div className="filter-bar">
        <button className={'filter-btn '+(filter==='OPEN'?'active':'')} onClick={function(){setFilter('OPEN');}}>📌 Acik ({summary.openCount})</button>
        <button className={'filter-btn '+(filter==='CLOSED'?'active':'')} onClick={function(){setFilter('CLOSED');}}>✅ Kapali ({summary.closedCount})</button>
        <button className={'filter-btn '+(filter==='LONG'?'active':'')} onClick={function(){setFilter('LONG');}}>🟢 LONG</button>
        <button className={'filter-btn '+(filter==='SHORT'?'active':'')} onClick={function(){setFilter('SHORT');}}>🔴 SHORT</button>
        <button className={'filter-btn '+(filter==='ALL'?'active':'')} onClick={function(){setFilter('ALL');}}>📋 Tumu ({positions.length})</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Coin</th><th>Yon</th><th>Giris</th><th>Guncel</th><th>Cikis</th><th>Stop</th>
              <th>PnL%</th><th>PnL USDT</th><th>Durum</th><th>Tarih</th><th>Islem</th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.map(function(pos, i) {
              var side = pos.side || 'LONG';
              var isLong = side === 'LONG';
              var pnlPct = pos.pnl_percent || 0;
              var pnl = pos.pnl || 0;
              return (
                <tr key={i} className={pnl>=0?'row-profit':'row-loss'}>
                  <td><strong>{pos.symbol}</strong></td>
                  <td><span className={'badge ' + (isLong?'badge-buy':'badge-sell')}>{side}</span></td>
                  <td>{pos.entry_price?pos.entry_price.toFixed(6):'-'}</td>
                  <td>{pos.current_price?pos.current_price.toFixed(6):'-'}</td>
                  <td>{pos.exit_price?pos.exit_price.toFixed(6):'-'}</td>
                  <td>{pos.stop_loss?pos.stop_loss.toFixed(6):'-'}</td>
                  <td style={{color:pnlPct>=0?'#22c55e':'#ef4444',fontWeight:600}}>%{pnlPct.toFixed(2)}</td>
                  <td style={{color:pnl>=0?'#22c55e':'#ef4444',fontWeight:600}}>{pnl.toFixed(4)}</td>
                  <td><span className={'badge '+(pos.status==='OPEN'?'badge-buy':pnl>=0?'badge-buy':'badge-sell')}>{pos.status==='OPEN'?'ACIK':pos.close_reason||'KAPALI'}</span></td>
                  <td style={{fontSize:11,color:'#94a3b8'}}>{formatTime(pos.opened_at||pos.closed_at)}</td>
                  <td>
                    {pos.status === 'OPEN' && (
                      <button onClick={function(){manualSell(pos.symbol);}} style={{
                        padding:'6px 14px', background:'#dc2626', border:'none', borderRadius:6,
                        color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer'
                      }}>KAPAT</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredPositions.length === 0 && (
              <tr><td colSpan="11" style={{textAlign:'center',color:'#64748b',padding:40}}>
                {filter==='OPEN'?'📌 Acik gercek pozisyon yok':filter==='CLOSED'?'✅ Kapali gercek pozisyon yok':filter==='LONG'?'🟢 LONG pozisyon yok':filter==='SHORT'?'🔴 SHORT pozisyon yok':'📋 Henuz gercek pozisyon yok'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Positions;
