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

      const body = {
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

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Sunucu hatası: ' + res.status);
      }

      const data = await res.json();
      setResults(data);
    } catch(e) {
      setError('❌ ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fUSD = (v) => '$' + (v || 0).toFixed(2);

  return (
    <div className="backtest">
      <h1>🧪 Backtest</h1>
      <p style={{color: '#64748b', marginBottom: 25, fontSize: 14}}>
        v21 - Makine Zekası + Epoch Eğitim
      </p>

      {/* Parametreler */}
      <h2>📊 SEMBOLLER</h2>
      <div className="setting-group">
        <div className="setting-row">
          <label>Coinler (virgülle)</label>
          <input name="symbols" value={params.symbols} onChange={handleChange} style={{width: '100%', maxWidth: 400}} />
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
          <label>Epoch (Tekrar)</label>
          <input name="epochs" type="number" value={params.epochs} onChange={handleChange} />
        </div>
      </div>

      <h2>⚠️ RİSK</h2>
      <div className="setting-group">
        <div className="setting-row">
          <label>Stop Loss (%)</label>
          <input name="stopLoss" type="number" step="0.1" value={params.stopLoss} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Trailing Stop (%)</label>
          <input name="trailingStop" type="number" step="0.1" value={params.trailingStop} onChange={handleChange} />
        </div>
        <div className="setting-row">
          <label>Min Kâr (%)</label>
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
      <div className="setting-group">
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
      <div className="setting-group">
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
        {loading ? '⏳ Çalışıyor... (Bu işlem dakikalar sürebilir)' : '🚀 Backtest Çalıştır'}
      </button>

      {error && (
        <div style={{marginTop: 15, padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 10, color: '#ef4444'}}>
          {error}
        </div>
      )}

      {/* Sonuçlar */}
      {results && (
        <div style={{marginTop: 30}}>
          <h2>📈 Sonuçlar</h2>
          
          <div className="card-grid">
            <div className="card">
              <div className="card-label">Toplam İşlem</div>
              <div className="card-value">{results.summary?.totalTrades || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">Başarı Oranı</div>
              <div className={`card-value ${(results.summary?.winRate || 0) >= 50 ? 'green' : 'red'}`}>
                %{results.summary?.winRate || 0}
              </div>
            </div>
            <div className="card">
              <div className="card-label">Toplam PnL</div>
              <div className={`card-value ${(results.summary?.totalPnl || 0) >= 0 ? 'green' : 'red'}`}>
                {fUSD(results.summary?.totalPnl)}
              </div>
            </div>
            <div className="card">
              <div className="card-label">Profit Factor</div>
              <div className="card-value gold">{results.summary?.profitFactor || '-'}</div>
            </div>
            <div className="card">
              <div className="card-label">Sharpe</div>
              <div className="card-value purple">{results.summary?.sharpeRatio || '-'}</div>
            </div>
            <div className="card">
              <div className="card-label">Ort. Kazanç</div>
              <div className="card-value green">%{results.summary?.avgWin || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">Ort. Kayıp</div>
              <div className="card-value red">%{results.summary?.avgLoss || 0}</div>
            </div>
            <div className="card">
              <div className="card-label">En İyi / En Kötü</div>
              <div className="card-value" style={{fontSize: 16}}>
                <span style={{color: '#22c55e'}}>%{results.summary?.bestTrade || 0}</span>
                <span style={{color: '#64748b', margin: '0 6px'}}>/</span>
                <span style={{color: '#ef4444'}}>%{results.summary?.worstTrade || 0}</span>
              </div>
            </div>
          </div>

          {/* İşlemler Tablosu */}
          <h3>📋 Son İşlemler ({results.trades?.length || 0})</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Sembol</th>
                  <th>Giriş</th>
                  <th>Çıkış</th>
                  <th>PnL%</th>
                  <th>PnL</th>
                  <th>Neden</th>
                  <th>AI</th>
                </tr>
              </thead>
              <tbody>
                {(results.trades || []).slice(-30).reverse().map((trade, i) => (
                  <tr key={i} className={trade.netPnl >= 0 ? 'row-profit' : 'row-loss'}>
                    <td><strong>{trade.symbol}</strong></td>
                    <td>{trade.entryPrice?.toFixed(4)}</td>
                    <td>{trade.exitPrice?.toFixed(4)}</td>
                    <td style={{color: trade.netPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600}}>
                      %{trade.netPnlPct?.toFixed(2)}
                    </td>
                    <td style={{color: trade.netPnl >= 0 ? '#22c55e' : '#ef4444'}}>
                      {trade.netPnl?.toFixed(4)}
                    </td>
                    <td>
                      <span className={`badge ${trade.reason === 'TAKE_PROFIT' || trade.reason === 'TRAILING_STOP' ? 'badge-buy' : trade.reason === 'STOP_LOSS' ? 'badge-sell' : 'badge-wait'}`}>
                        {trade.reason}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${(trade.machineConfidence || 0) >= 0.80 ? 'badge-buy' : (trade.machineConfidence || 0) >= 0.65 ? 'badge-wait' : 'badge-sell'}`}>
                        %{((trade.machineConfidence || 0) * 100).toFixed(0)}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!results.trades || results.trades.length === 0) && (
                  <tr><td colSpan="7" style={{textAlign: 'center', color: '#64748b', padding: 40}}>İşlem bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Backtest;
