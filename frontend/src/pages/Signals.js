import React, { useState, useEffect, useCallback } from 'react';

function Signals() {
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/signals');
      const data = await res.json();
      setSignals(data || []);
    } catch(e) {
      console.error('Sinyaller alınamadı:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const filteredSignals = signals.filter(s => {
    if (filter === 'ALL') return true;
    if (filter === 'AI_ACCEPTED') return s.signal_type === 'ALIM' && (s.ai_comment || '').includes('✅');
    if (filter === 'AI_REJECTED') return (s.ai_comment || '').includes('❌');
    if (filter === 'ALIM') return s.signal_type === 'ALIM';
    if (filter === 'SATIS') return s.signal_type === 'SATIS';
    return true;
  });

  if (loading) return <div className="loading">⏳ Sinyaller yükleniyor...</div>;

  const aiAccepted = signals.filter(s => (s.ai_comment || '').includes('✅')).length;
  const aiRejected = signals.filter(s => (s.ai_comment || '').includes('❌')).length;

  return (
    <div className="signals">
      <h1>📡 Sinyaller</h1>

      {/* AI Özet */}
      <div className="ai-status-bar">
        <div className="ai-item">
          <span>🤖 Toplam Sinyal</span>
          <span className="ai-value">{signals.length}</span>
        </div>
        <div className="ai-item">
          <span>✅ Makine Kabul</span>
          <span className="ai-value" style={{color: '#00ff88'}}>{aiAccepted}</span>
        </div>
        <div className="ai-item">
          <span>❌ Makine Red</span>
          <span className="ai-value" style={{color: '#ff4444'}}>{aiRejected}</span>
        </div>
        <div className="ai-item">
          <span>📋 Kabul Oranı</span>
          <span className="ai-value">%{signals.length > 0 ? ((aiAccepted / (aiAccepted + aiRejected || 1)) * 100).toFixed(0) : 0}</span>
        </div>
      </div>

      {/* Filtreler */}
      <div className="filter-bar">
        <button className={`btn ${filter === 'ALL' ? 'btn-active' : ''}`} onClick={() => setFilter('ALL')}>
          Tümü ({signals.length})
        </button>
        <button className={`btn ${filter === 'AI_ACCEPTED' ? 'btn-active' : ''}`} onClick={() => setFilter('AI_ACCEPTED')}>
          ✅ AI Kabul ({aiAccepted})
        </button>
        <button className={`btn ${filter === 'AI_REJECTED' ? 'btn-active' : ''}`} onClick={() => setFilter('AI_REJECTED')}>
          ❌ AI Red ({aiRejected})
        </button>
        <button className={`btn ${filter === 'ALIM' ? 'btn-active' : ''}`} onClick={() => setFilter('ALIM')}>
          📈 ALIM
        </button>
        <button className={`btn ${filter === 'SATIS' ? 'btn-active' : ''}`} onClick={() => setFilter('SATIS')}>
          📉 SATIS
        </button>
      </div>

      {/* Sinyal Tablosu */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Fiyat</th>
              <th>Sinyal</th>
              <th>Puan</th>
              <th>RSI</th>
              <th>Trend</th>
              <th>Risk</th>
              <th>Makine Yorumu</th>
            </tr>
          </thead>
          <tbody>
            {filteredSignals.map((signal, i) => {
              const isAiAccepted = (signal.ai_comment || '').includes('✅');
              const isAiRejected = (signal.ai_comment || '').includes('❌');
              
              return (
                <tr key={i} className={
                  signal.signal_type === 'ALIM' ? 'row-buy' : 
                  signal.signal_type === 'SATIS' ? 'row-sell' : 'row-wait'
                }>
                  <td><strong>{signal.symbol}</strong></td>
                  <td>{signal.fiyat?.toFixed(6) || signal.price?.toFixed(6)}</td>
                  <td>
                    <span className={`badge ${
                      signal.signal_type === 'ALIM' ? 'badge-buy' : 
                      signal.signal_type === 'SATIS' ? 'badge-sell' : 'badge-wait'
                    }`}>
                      {signal.signal_type}
                    </span>
                  </td>
                  <td>{signal.score || '-'}</td>
                  <td>{signal.rsi?.toFixed(1) || '-'}</td>
                  <td>{signal.trend || '-'}</td>
                  <td>
                    <span className={`badge ${
                      signal.risk === 'DUSUK' ? 'badge-low' : 
                      signal.risk === 'ORTA' ? 'badge-mid' : 'badge-high'
                    }`}>
                      {signal.risk || 'ORTA'}
                    </span>
                  </td>
                  <td style={{
                    color: isAiAccepted ? '#00ff88' : isAiRejected ? '#ff4444' : '#888',
                    fontSize: '12px',
                    maxWidth: '250px'
                  }}>
                    {signal.ai_comment || '-'}
                  </td>
                </tr>
              );
            })}
            {filteredSignals.length === 0 && (
              <tr><td colSpan="8" style={{textAlign: 'center'}}>Sinyal bulunamadı</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Signals;
