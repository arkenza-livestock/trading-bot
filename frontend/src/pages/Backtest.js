import React, { useState } from 'react';

function Backtest() {
  const [params, setParams] = useState({
    symbols: 'BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT,BNBUSDT',
    interval: '1h',
    days: 30,
    stopLoss: 2.0,
    trailingStop: 0.5,
    minProfit: 1.5,
    commission: 0.1,
    slippage: 0.05,
    minScore: 50,
    rsiPeriod: 7,
    rsiOversold: 40,
    rsiOverbought: 70,
    tradeAmount: 100,
    maxPositions: 3
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = function(e) {
    setParams({ ...params, [e.target.name]: e.target.value });
  };

  const runBacktest = async function() {
    setLoading(true);
    setError('');
    setResults(null);
    try {
      var symbolArray = params.symbols.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
      var body = {
        symbols: symbolArray,
        interval: params.interval,
        days: parseInt(params.days),
        stopLoss: parseFloat(params.stopLoss),
        trailingStop: parseFloat(params.trailingStop),
        minProfit: parseFloat(params.minProfit),
        commission: parseFloat(params.commission),
        slippage: parseFloat(params.slippage),
        minScore: parseInt(params.minScore),
        tradeAmount: parseFloat(params.tradeAmount),
        maxPositions: parseInt(params.maxPositions),
        epochs: 1,
        machineConfidenceMin: 0.70
      };
      var res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Sunucu hatasi: ' + res.status);
      var data = await res.json();
      setResults(data);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  var Row = function(props) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '13px 0',
        borderBottom: '1px solid #111827'
      }}>
        <span style={{color: '#cbd5e1', fontSize: 14, fontWeight: 500}}>{props.label}</span>
        <span style={{color: '#94a3b8', fontSize: 14}}>{props.children}</span>
      </div>
    );
  };

  return (
    <div style={{maxWidth: 480, padding: '32px 20px', margin: '0 auto'}}>
      
      <h1 style={{fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#f1f5f9'}}>Backtest</h1>
      <p style={{color: '#64748b', marginBottom: 30, fontSize: 13}}>
        Tum coinler ayni zaman cizgisi icinde test edilir
      </p>

      <div style={{
        background: '#0d1321',
        border: '1px solid #1a2540',
        borderRadius: 14,
        padding: '20px 22px',
        marginBottom: 16
      }}>
        <h3 style={{fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1}}>Parametreler</h3>
        <Row label="Coin"><span style={{color: '#64748b'}}>Tum Coinler</span></Row>
        <Row label="Mum Araligi">
          <select name="interval" value={params.interval} onChange={handleChange}
            style={{background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 10px', fontSize: 13}}>
            <option value="1h">1 Saat</option>
            <option value="4h">4 Saat</option>
            <option value="1d">1 Gun</option>
          </select>
        </Row>
        <Row label="Test Suresi">
          <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
            <input name="days" type="number" value={params.days} onChange={handleChange} 
              style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
            <span style={{color: '#64748b', fontSize: 13}}>Gun</span>
          </span>
        </Row>
      </div>

      <div style={{
        background: '#0d1321',
        border: '1px solid #1a2540',
        borderRadius: 14,
        padding: '20px 22px',
        marginBottom: 16
      }}>
        <h3 style={{fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1}}>RISK</h3>
        <Row label="Stop Loss (%)">
          <input name="stopLoss" type="number" step="0.1" value={params.stopLoss} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="Trailing Stop (%)">
          <input name="trailingStop" type="number" step="0.1" value={params.trailingStop} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="Min Kar (trailing icin %)">
          <input name="minProfit" type="number" step="0.1" value={params.minProfit} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="Islem Miktari (USDT)">
          <input name="tradeAmount" type="number" value={params.tradeAmount} onChange={handleChange} 
            style={{width: 80, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="Max Acik Pozisyon">
          <input name="maxPositions" type="number" value={params.maxPositions} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
      </div>

      <div style={{
        background: '#0d1321',
        border: '1px solid #1a2540',
        borderRadius: 14,
        padding: '20px 22px',
        marginBottom: 16
      }}>
        <h3 style={{fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1}}>SINYAL</h3>
        <Row label="Min Sinyal Skoru">
          <input name="minScore" type="number" value={params.minScore} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="RSI Periyot">
          <input name="rsiPeriod" type="number" value={params.rsiPeriod} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="RSI Asiri Satim">
          <input name="rsiOversold" type="number" value={params.rsiOversold} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="RSI Asiri Alim">
          <input name="rsiOverbought" type="number" value={params.rsiOverbought} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
      </div>

      <div style={{
        background: '#0d1321',
        border: '1px solid #1a2540',
        borderRadius: 14,
        padding: '20px 22px',
        marginBottom: 16
      }}>
        <h3 style={{fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1}}>MALIYET</h3>
        <Row label="Komisyon (%)">
          <input name="commission" type="number" step="0.01" value={params.commission} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
        <Row label="Slippage (%)">
          <input name="slippage" type="number" step="0.01" value={params.slippage} onChange={handleChange} 
            style={{width: 60, background: '#0a0e17', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 8px', fontSize: 13, textAlign: 'center'}} />
        </Row>
      </div>

      <button onClick={runBacktest} disabled={loading} style={{
        marginTop: 8,
        padding: '14px 0',
        fontSize: 15,
        fontWeight: 600,
        width: '100%',
        background: loading ? '#1a1a2e' : '#1e293b',
        border: '1px solid #334155',
        borderRadius: 10,
        color: loading ? '#64748b' : '#e2e8f0',
        cursor: loading ? 'not-allowed' : 'pointer'
      }}>
        {loading ? 'Calisiyor...' : 'Backtest Calistir'}
      </button>

      {error && (
        <div style={{marginTop: 15, padding: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 13}}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{marginTop: 15, padding: 30, textAlign: 'center', color: '#fbbf24', background: '#0d1321', border: '1px solid #1a2540', borderRadius: 10}}>
          Backtest calisiyor... 1-5 dakika surebilir.
        </div>
      )}

      {results && (
        <div style={{marginTop: 25}}>
          <h2 style={{fontSize: 16, marginBottom: 15, color: '#94a3b8'}}>Sonuclar</h2>
          <div className="card-grid" style={{gridTemplateColumns: 'repeat(2, 1fr)'}}>
            <div className="card"><div className="card-label">Toplam Islem</div><div className="card-value" style={{fontSize: 24}}>{results.summary ? results.summary.totalTrades : 0}</div></div>
            <div className="card"><div className="card-label">Basari Orani</div><div className="card-value green" style={{fontSize: 24}}>%{results.summary ? results.summary.winRate : 0}</div></div>
            <div className="card"><div className="card-label">Toplam PnL</div><div className="card-value green" style={{fontSize: 24}}>${results.summary ? (results.summary.totalPnl || 0).toFixed(2) : '0.00'}</div></div>
            <div className="card"><div className="card-label">Profit Factor</div><div className="card-value gold" style={{fontSize: 24}}>{results.summary ? results.summary.profitFactor : '-'}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Backtest;
