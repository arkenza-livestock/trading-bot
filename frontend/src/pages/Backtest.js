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
    tradeAmount: 100,
    maxPositions: 3,
    epochs: 1,
    machineConfidenceMin: 0.70
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setParams({ ...params, [e.target.name]: e.target.value });
  };

  const runBacktest = async () => {
    setLoading(true);
    setError('');
    setResults(null);

    try {
      var symbolArray = params.symbols.split(',').map(function(s) { 
        return s.trim(); 
      }).filter(function(s) { 
        return s.length > 0; 
      });

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
        epochs: parseInt(params.epochs),
        machineConfidenceMin: parseFloat(params.machineConfidenceMin)
      };

      var res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Sunucu hatasi: ' + res.status);
      }

      var data = await res.json();
      setResults(data);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  var fUSD = function(v) { return '$' + (v || 0).toFixed(2); };

  return (
    <div className="backtest">
      <h1>Backtest</h1>
      <p style={{color: '#64748b', marginBottom: 15, fontSize: 13}}>
        Tum coinler ayni zaman cizgisi icinde test edilir
      </p>

      <div className="setting-group">
        <h3>Parametreler</h3>
        <div className="setting-row">
          <label>Coin</label>
          <input name="symbols" value={params.symbols} onChange={handleChange} style={{width: '100%', maxWidth: 350}} />
        </div>
        <div className="setting-row">
          <label>Mum Araligi</label>
          <select name="interval" value={params.interval} onChange={handleChange}>
            <option value="1h">1 Saat</option>
            <option value="4h">4 Saat</option>
            <option value="1d">1 Gun</option>
          </select>
        </div>
        <div className="setting-row">
          <label>Test Suresi</label>
          <input name="days" type="number" value={params.days} onChange={handleChange} style={{width: 80}} />
          <span style={{fontSize: 13, color: '#64748b'}}>Gun</span>
        </div>
      </div>

      <div className="setting-group">
        <h3>RISK</h3>
        <div className="setting-row">
          <label>Stop Loss (%)</label>
          <input name="stopLoss" type="number" step="0.1" value={params.stopLoss} onChange={handleChange} style={{width: 80}} />
        </div>
        <div className="setting-row">
          <label>Trailing Stop (%)</label>
          <input name="trailingStop" type="number" step="0.1" value={params.trailingStop} onChange={handleChange} style={{width: 80}} />
        </div>
        <div className="setting-row">
          <label>Min Kar (trailing icin %)</label>
          <input name="minProfit" type="number" step="0.1" value={params.minProfit} onChange={handleChange} style={{width: 80}} />
        </div>
        <div className="setting-row">
          <label>Islem Miktari (USDT)</label>
          <input name="tradeAmount" type="number" value={params.tradeAmount} onChange={handleChange} style={{width: 100}} />
        </div>
        <div className="setting-row">
          <label>Max Acik Pozisyon</label>
          <input name="maxPositions" type="number" value={params.maxPositions} onChange={handleChange} style={{width: 80}} />
        </div>
      </div>

      <div className="setting-group">
        <h3>SINYAL</h3>
        <div className="setting-row">
          <label>Min Sinyal Skoru</label>
          <input name="minScore" type="number" value={params.minScore} onChange={handleChange} style={{width: 80}} />
        </div>
        <div className="setting-row">
          <label>AI Guven Esigi</label>
          <input name="machineConfidenceMin" type="number" step="0.05" value={params.machineConfidenceMin} onChange={handleChange} style={{width: 80}} />
        </div>
      </div>

      <div className="setting-group">
        <h3>MALIYET</h3>
        <div className="setting-row">
          <label>Komisyon (%)</label>
          <input name="commission" type="number" step="0.01" value={params.commission} onChange={handleChange} style={{width: 80}} />
        </div>
        <div className="setting-row">
          <label>Slippage (%)</label>
          <input name="slippage" type="number" step="0.01" value={params.slippage} onChange={handleChange} style={{width: 80}} />
        </div>
      </div>

      <button className="btn" onClick={runBacktest} disabled={loading} 
        style={{marginTop: 15, padding: '14px 0', fontSize: 16, width: '100%'}}>
        {loading ? 'Calisiyor...' : 'Backtest Calistir'}
      </button>

      {error && (
        <div style={{marginTop: 15, padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 10, color: '#ef4444', fontSize: 13}}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{marginTop: 15, padding: 20, textAlign: 'center', color: '#fbbf24'}}>
          Backtest calisiyor... 1-5 dakika surebilir.
        </div>
      )}

      {results && (
        <div style={{marginTop: 25}}>
          <h2>Sonuclar</h2>
          
          <div className="card-grid">
            <div className="card">
              <div className="card-label">Toplam Islem</div>
              <div className="card-value">{results.summary ? results.summary.totalTrades : 0}</div>
            </div>
            <div className="card">
              <div className="card-label">Basari Orani</div>
              <div className={'card-value ' + ((results.summary && results.summary.winRate >= 50) ? 'green' : 'red')}>
                %{results.summary ? results.summary.winRate : 0}
              </div>
            </div>
            <div className="card">
              <div className="card-label">Toplam PnL</div>
              <div className={'card-value ' + ((results.summary && results.summary.totalPnl >= 0) ? 'green' : 'red')}>
                {fUSD(results.summary ? results.summary.totalPnl : 0)}
              </div>
            </div>
            <div className="card">
              <div className="card-label">Profit Factor</div>
              <div className="card-value gold">{results.summary ? results.summary.profitFactor : '-'}</div>
            </div>
          </div>

          {results.trades && results.trades.length > 0 && (
            <div className="table-container" style={{marginTop: 15}}>
              <table>
                <thead>
                  <tr>
                    <th>Sembol</th>
                    <th>Giris</th>
                    <th>Cikis</th>
                    <th>PnL%</th>
                    <th>PnL</th>
                    <th>Neden</th>
                  </tr>
                </thead>
                <tbody>
                  {results.trades.slice(-20).reverse().map(function(trade, i) {
                    return (
                      <tr key={i} className={trade.netPnl >= 0 ? 'row-profit' : 'row-loss'}>
                        <td><strong>{trade.symbol}</strong></td>
                        <td>{trade.entryPrice ? trade.entryPrice.toFixed(4) : '-'}</td>
                        <td>{trade.exitPrice ? trade.exitPrice.toFixed(4) : '-'}</td>
                        <td style={{color: trade.netPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                          %{trade.netPnlPct ? trade.netPnlPct.toFixed(2) : '0'}
                        </td>
                        <td style={{color: trade.netPnl >= 0 ? '#22c55e' : '#ef4444'}}>
                          {trade.netPnl ? trade.netPnl.toFixed(4) : '0'}
                        </td>
                        <td><span className="badge badge-wait">{trade.reason || '-'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Backtest;
