import React, { useState, useEffect, useCallback } from 'react';

function Signals() {
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchSignals = useCallback(async function() {
    try {
      const res = await fetch('/api/signals');
      const data = await res.json();
      setSignals(data || []);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(function() {
    fetchSignals();
    var interval = setInterval(fetchSignals, 60000);
    return function() { clearInterval(interval); };
  }, [fetchSignals]);

  var filteredSignals = signals.filter(function(s) {
    if (filter === 'ALL') return true;
    if (filter === 'AI_ACCEPTED') return s.signal_type === 'ALIM' && (s.ai_comment || '').indexOf('✅') !== -1;
    if (filter === 'AI_REJECTED') return (s.ai_comment || '').indexOf('❌') !== -1;
    if (filter === 'ALIM') return s.signal_type === 'ALIM';
    if (filter === 'SATIS') return s.signal_type === 'SATIS';
    return true;
  });

  if (loading) return <div className="loading">Yukleniyor...</div>;

  var aiAccepted = signals.filter(function(s) { return (s.ai_comment || '').indexOf('✅') !== -1; }).length;
  var aiRejected = signals.filter(function(s) { return (s.ai_comment || '').indexOf('❌') !== -1; }).length;

  return (
    <div className="signals">
      <h1>Sinyaller</h1>
      <p style={{color:'#64748b',marginBottom:25,fontSize:14}}>Makinenin urettigi tum sinyaller</p>

      <div className="ai-status-bar">
        <div className="ai-item"><span>Toplam Sinyal</span><span className="ai-value">{signals.length}</span></div>
        <div className="ai-item"><span>✅ Makine Kabul</span><span className="ai-value" style={{color:'#22c55e'}}>{aiAccepted}</span></div>
        <div className="ai-item"><span>❌ Makine Red</span><span className="ai-value" style={{color:'#ef4444'}}>{aiRejected}</span></div>
      </div>

      <div className="filter-bar">
        <button className={'filter-btn '+(filter==='ALL'?'active':'')} onClick={function(){setFilter('ALL');}}>Tumu ({signals.length})</button>
        <button className={'filter-btn '+(filter==='AI_ACCEPTED'?'active':'')} onClick={function(){setFilter('AI_ACCEPTED');}}>✅ AI Kabul ({aiAccepted})</button>
        <button className={'filter-btn '+(filter==='AI_REJECTED'?'active':'')} onClick={function(){setFilter('AI_REJECTED');}}>❌ AI Red ({aiRejected})</button>
        <button className={'filter-btn '+(filter==='ALIM'?'active':'')} onClick={function(){setFilter('ALIM');}}>ALIM</button>
        <button className={'filter-btn '+(filter==='SATIS'?'active':'')} onClick={function(){setFilter('SATIS');}}>SATIS</button>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Sembol</th><th>Fiyat</th><th>Sinyal</th><th>Puan</th><th>RSI</th><th>Trend</th><th>Risk</th><th>Makine Yorumu</th></tr></thead>
          <tbody>
            {filteredSignals.map(function(signal,i){
              var isAiAccepted = (signal.ai_comment||'').indexOf('✅') !== -1;
              var isAiRejected = (signal.ai_comment||'').indexOf('❌') !== -1;
              return (
                <tr key={i} className={signal.signal_type==='ALIM'?'row-buy':signal.signal_type==='SATIS'?'row-sell':'row-wait'}>
                  <td><strong>{signal.symbol}</strong></td>
                  <td>{signal.fiyat?signal.fiyat.toFixed(6):signal.price?signal.price.toFixed(6):'-'}</td>
                  <td><span className={'badge '+(signal.signal_type==='ALIM'?'badge-buy':signal.signal_type==='SATIS'?'badge-sell':'badge-wait')}>{signal.signal_type}</span></td>
                  <td>{signal.score||'-'}</td>
                  <td>{signal.rsi?signal.rsi.toFixed(1):'-'}</td>
                  <td>{signal.trend||'-'}</td>
                  <td><span className={'badge '+(signal.risk==='DUSUK'?'badge-low':signal.risk==='ORTA'?'badge-mid':'badge-high')}>{signal.risk||'ORTA'}</span></td>
                  <td style={{color:isAiAccepted?'#22c55e':isAiRejected?'#ef4444':'#888',fontSize:12,maxWidth:250}}>{signal.ai_comment||'-'}</td>
                </tr>
              );
            })}
            {filteredSignals.length===0 && <tr><td colSpan="8" style={{textAlign:'center',color:'#64748b',padding:30}}>Sinyal bulunamadi</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Signals;
