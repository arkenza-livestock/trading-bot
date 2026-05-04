import React, { useState } from 'react';

function Backtest() {
  const [params, setParams] = useState({
    symbols: 'BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT,BNBUSDT',
    interval: '4h',
    days: 30,
    stopLoss: 2.0,
    trailingStop: 0.5,
    minProfit: 1.5,
    commission: 0.1,
    slippage: 0.05,
    minScore: 50,
    tradeAmount: 100,
    maxPositions: 3,
    epochs: 3,
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

      var body = {};
      body.symbols = symbolArray;
      body.interval = params.interval;
      body.days = parseInt(params.days);
      body.stopLoss = parseFloat(params.stopLoss);
      body.trailingStop = parseFloat(params.trailingStop);
      body.minProfit = parseFloat(params.minProfit);
      body.commission = parseFloat(params.commission);
      body.slippage = parseFloat(params.slippage);
      body.minScore = parseInt(params.minScore);
      body.tradeAmount = parseFloat(params.tradeAmount);
      body.maxPositions = parseInt(params.maxPositions);
      body.epochs = parseInt(params.epochs);
      body.machineConfidenceMin = parseFloat(params.machineConfidenceMin);

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
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>
        v21 - Makine Zekasi + Epoch Egitim
      </p>

      <div className="setting-group">
        <h3>Parametreler</h3>
        <div className="setting-row">
          <label>Coinler (virgulle)</label>
          <input name="symbols" value={params.symbols} onChange={handleChange} style={{width: '100%', maxWidth: 400}} />
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
          <label>Test Suresi (Gun)</label>
          <input name="days" type="number" value={params.days} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Epoch (Tekrar)</label>
          <input name="epochs" type="number" value={params.epochs} onChange={handleChange} />
        </div>
      </div>

      <div className="setting-group">
        <h3>Risk</h3>
        <div className="setting-row">
          <label>Stop Loss (%)</label>
          <input name="stopLoss" type="number" step="0.1" value={params.stopLoss} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Trailing Stop (%)</label>
          <input name="trailingStop" type="number" step="0.1" value={params.trailingStop} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Min Kar (%)</label>
          <input name="minProfit" type="number" step="0.1" value={params.minProfit} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Islem (USDT)</label>
          <input name="tradeAmount" type="number" value={params.tradeAmount} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Max Pozisyon</label>
          <input name="maxPositions" type="number" value={params.maxPositions} onChange={handleChange} />
        </div>
      </div>

      <div className="setting-group">
        <h3>Makine</h3>
        <div className="setting-row">
          <label>AI Guven Esigi</label>
          <input name="machineConfidenceMin" type="number" step="0.05" value={params.machineConfidenceMin} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Min Sinyal Skoru</label>
          <input name="minScore" type="number" value={params.minScore} onChange={handleChange} />
        </div>
      </div>

      <div className="setting-group">
        <h3>Maliyet</h3>
        <div className="setting-row">
          <label>Komisyon (%)</label>
          <input name="commission" type="number" step="0.01" value={params.commission} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Slippage (%)</label>
          <input name="slippage" type="number" step="0.01" value={params.slippage} onChange={handleChange} />
        </div>
      </div>

      <button className="btn" onClick={runBacktest} disabled={loading} 
        style={{marginTop: 20, padding: '14px 40px', fontSize: 16, width: '100%'}}>
        {loading ? 'Calisiyor...' : 'Backtest Calistir'}
      </button>

      {error && (
        <div style={{marginTop: 15, padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 10, color: '#ef4444'}}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{marginTop: 15, padding: 20, textAlign: 'center', color: '#fbbf24'}}>
          Backtest calisiyor... Coin sayisina bagli olarak 1-5 dakika surebilir.
        </div>
      )}

      {results && (
        <div style={{marginTop: 30}}>
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

          <div className="card-grid">
            <div className="card">
              <div className="card-label">Ort. Kazanc</div>
              <div className="card-value green">%{results.summary ? results.summary.avgWin : 0}</div>
            </div>
            <div className="card">
              <div className="card-label">Ort. Kayip</div>
              <div className="card-value red">%{results.summary ? results.summary.avgLoss : 0}</div>
            </div>
            <div className="card">
              <div className="card-label">En Iyi</div>
              <div className="card-value green">%{results.summary ? results.summary.bestTrade : 0}</div>
            </div>
            <div className="card">
              <div className="card-label">En Kotu</div>
              <div className="card-value red">%{results.summary ? results.summary.worstTrade : 0}</div>
            </div>
          </div>

          {results.trades && results.trades.length > 0 && (
            <div>
              <h3>Islemler ({results.trades.length})</h3>
              <div className="table-container">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Backtest;
