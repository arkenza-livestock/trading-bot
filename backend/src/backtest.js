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
      const symbolArray = params.symbols.split(',').map(s => s.trim()).filter(s => s);

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Backtest başarısız');
      }

      const data = await res.json();
      setResults(data);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="backtest">
      <h1>🧪 Backtest</h1>
      <p style={{color: '#9ca3af', marginBottom: 20}}>
        v21 - Makine Zekası + Epoch Eğitim
      </p>

      {/* Parametreler */}
      <div className="card-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'}}>
        <div className="setting-row">
          <label>Coinler</label>
          <input name="symbols" value={params.symbols} onChange={handleChange} style={{width: '100%'}} />
        </div>
        <div className="setting-row">
          <label>Mum Aralığı</label>
          <select name="interval" value={params.interval} onChange={handleChange}>
            <option value="1h">1 Saat</option>
            <option value="4h">4 Saat</option>
            <option value="1d">1 Gün</option>
          </select>
        </div>
        <div className="setting-row">
          <label>Test Süresi (Gün)</label>
          <input name="days" type="number" value={params.days} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Epoch</label>
          <input name="epochs" type="number" value={params.epochs} onChange={handleChange} />
        </div>
      </div>

      <h2>📊 RİSK</h2>
      <div className="card-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'}}>
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
          <label>İşlem (USDT)</label>
          <input name="tradeAmount" type="number" value={params.tradeAmount} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Max Pozisyon</label>
          <input name="maxPositions" type="number" value={params.maxPositions} onChange={handleChange} />
        </div>
      </div>

      <h2>🧠 MAKİNE</h2>
      <div className="card-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'}}>
        <div className="setting-row">
          <label>AI Güven Eşiği</label>
          <input name="machineConfidenceMin" type="number" step="0.05" value={params.machineConfidenceMin} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Min Sinyal Skoru</label>
          <input name="minScore" type="number" value={params.minScore} onChange={handleChange} />
        </div>
      </div>

      <h2>💰 MALİYET</h2>
      <div className="card-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'}}>
        <div className="setting-row">
          <label>Komisyon (%)</label>
          <input name="commission" type="number" step="0.01" value={params.commission} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Slippage (%)</label>
          <input name="slippage" type="number" step="0.01" value={params.slippage} onChange={handleChange} />
        </div>
      </div>

      <button className="btn" onClick={runBacktest} disabled={loading} style={{marginTop: 20, padding: '12px 30px', fontSize: 16}}>
        {loading ? '⏳ Çalışıyor...' : '🚀 Backtest Çalıştır'}
      </button>

      {error && <div className="message" style={{marginTop: 15, color: '#ff4444'}}>❌ {error}</div>}

      {/* Sonuçlar */}
      {results && (
        <div style={{marginTop: 30}}>
          <h2>📈 Sonuçlar</h2>
          
          <div className="card-grid">
            <div className="card">
              <div className="card-title">Toplam İşlem</div>
              <div className="card-value">{results.summary?.totalTrades || 0}</div>
            </div>
            <div className="card">
              <div className="card-title">Başarı Oranı</div>
              <div className="card-value" style={{color: (results.summary?.winRate || 0) >= 50 ? '#00ff88' : '#ff4444'}}>
                %{results.summary?.winRate || 0}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Toplam PnL</div>
              <div className="card-value" style={{color: (results.summary?.totalPnl || 0) >= 0 ? '#00ff88' : '#ff4444'}}>
                ${results.summary?.totalPnl?.toFixed(2) || '0'}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Profit Factor</div>
              <div className="card-value">{results.summary?.profitFactor || '-'}</div>
            </div>
            <div className="card">
              <div className="card-title">Sharpe</div>
              <div className="card-value">{results.summary?.sharpeRatio || '-'}</div>
            </div>
            <div className="card">
              <div className="card-title">Ort. Kazanç</div>
              <div className="card-value" style={{color: '#00ff88'}}>%{results.summary?.avgWin || 0}</div>
            </div>
            <div className="card">
              <div className="card-title">Ort. Kayıp</div>
              <div className="card-value" style={{color: '#ff4444'}}>%{results.summary?.avgLoss || 0}</div>
            </div>
            <div className="card">
              <div className="card-title">En İyi</div>
              <div className="card-value" style={{color: '#00ff88'}}>%{results.summary?.bestTrade || 0}</div>
            </div>
          </div>

          {/* İşlemler Tablosu */}
          <h3>Son İşlemler</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Sembol</th>
                  <th>Giriş</th>
                  <th>Çıkış</th>
                  <th>PnL%</th>
                  <th>Neden</th>
                  <th>AI Güven</th>
                </tr>
              </thead>
              <tbody>
                {(results.trades || []).slice(0, 20).map((trade, i) => (
                  <tr key={i} className={trade.netPnl >= 0 ? 'profit' : 'loss'}>
                    <td><strong>{trade.symbol}</strong></td>
                    <td>{trade.entryPrice?.toFixed(4)}</td>
                    <td>{trade.exitPrice?.toFixed(4)}</td>
                    <td style={{color: trade.netPnl >= 0 ? '#00ff88' : '#ff4444'}}>
                      %{trade.netPnlPct?.toFixed(2)}
                    </td>
                    <td>{trade.reason}</td>
                    <td>%{((trade.machineConfidence || 0) * 100).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Backtest;
