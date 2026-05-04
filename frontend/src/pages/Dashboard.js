import React, { useState, useEffect, useCallback } from 'react';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [machineStats, setMachineStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [botRunning, setBotRunning] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [message, setMessage] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, machineRes] = await Promise.all([
        fetch('/api/simulation/stats'),
        fetch('/api/machine/report')
      ]);
      const statsData = await statsRes.json();
      const machineData = await machineRes.json();
      setStats(statsData);
      setMachineStats(machineData);
    } catch(e) {
      console.error('Veri çekme hatası:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setBotRunning(data.botRunning || false);
      setSimRunning(data.simRunning || false);
    } catch(e) {}
  }, []);

  useEffect(() => {
    fetchData();
    fetchStatus();
    const interval = setInterval(() => {
      fetchData();
      fetchStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, fetchStatus]);

  const startBot = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/bot/start', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
      setBotRunning(true);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const stopBot = async () => {
    setMessage('');
    if (!window.confirm('GERÇEK işlem botunu durdurmak istediğinize emin misiniz?')) return;
    try {
      const res = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
      setBotRunning(false);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const startSim = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/simulation/start', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
      setSimRunning(true);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const stopSim = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/simulation/stop', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
      setSimRunning(false);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const manualScan = async () => {
    setMessage('Tarama başlatıldı...');
    try {
      const res = await fetch('/api/bot/scan', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
      fetchData();
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  if (loading) return <div className="loading">⏳ Yükleniyor...</div>;

  const formatUsd = (v) => '$' + (v || 0).toFixed(2);
  const formatPct = (v) => '%' + (v || 0).toFixed(1);

  return (
    <div className="dashboard">
      <h1>📊 Trading Bot Dashboard</h1>

      {message && <div className="message">{message}</div>}

      {/* ═══════════════════════════════════════════ */}
      {/* KONTROL BUTONLARI */}
      {/* ═══════════════════════════════════════════ */}
      <div className="control-panel">
        {/* GERÇEK İŞLEM */}
        <div className="control-box real-box">
          <h3>💰 GERÇEK İŞLEM</h3>
          <p style={{fontSize: 12, color: '#9ca3af'}}>Binance API ile canlı alım-satım</p>
          <div className="control-buttons">
            {!botRunning ? (
              <button className="btn btn-success" onClick={startBot}>
                ▶️ BAŞLAT
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopBot}>
                ⏹️ DURDUR
              </button>
            )}
            <span className={`status-dot ${botRunning ? 'online' : 'offline'}`}>
              {botRunning ? '🟢 Çalışıyor' : '🔴 Durdu'}
            </span>
          </div>
        </div>

        {/* SİMÜLASYON */}
        <div className="control-box sim-box">
          <h3>🧪 SİMÜLASYON</h3>
          <p style={{fontSize: 12, color: '#9ca3af'}}>Sanal para ile öğrenme modu</p>
          <div className="control-buttons">
            {!simRunning ? (
              <button className="btn btn-sim" onClick={startSim}>
                ▶️ SİMÜLASYONU BAŞLAT
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopSim}>
                ⏹️ SİMÜLASYONU DURDUR
              </button>
            )}
            <span className={`status-dot ${simRunning ? 'online' : 'offline'}`}>
              {simRunning ? '🟢 Çalışıyor' : '🔴 Durdu'}
            </span>
          </div>
        </div>

        {/* MANUEL TARAMA */}
        <div className="control-box scan-box">
          <h3>🔍 MANUEL TARAMA</h3>
          <p style={{fontSize: 12, color: '#9ca3af'}}>Hemen şimdi piyasayı tara</p>
          <button className="btn" onClick={manualScan}>
            🔄 HEMEN TARA
          </button>
        </div>
      </div>

      {/* BTC Durumu */}
      <div className="ai-status-bar">
        <div className="ai-item">
          <span>₿ BTC Trend</span>
          <span className="ai-value">{machineStats?.bot?.btcTrend?.trend || 'BELIRSIZ'}</span>
        </div>
        <div className="ai-item">
          <span>📊 BTC RSI</span>
          <span className="ai-value">{machineStats?.bot?.btcTrend?.rsi?.toFixed(1) || '-'}</span>
        </div>
        <div className="ai-item">
          <span>💪 BTC Güç</span>
          <span className="ai-value">{machineStats?.bot?.btcTrend?.strength?.toFixed(1) || '-'}</span>
        </div>
        <div className="ai-item">
          <span>🔢 Tarama</span>
          <span className="ai-value">#{machineStats?.bot?.scanCount || 0}</span>
        </div>
      </div>

      {/* Bakiye Kartları */}
      <h2>💰 Simülasyon Bakiyesi</h2>
      <div className="card-grid">
        <div className="card">
          <div className="card-title">Bakiye</div>
          <div className="card-value">{formatUsd(stats?.balance)}</div>
        </div>
        <div className="card">
          <div className="card-title">Toplam PnL</div>
          <div className="card-value" style={{color: (stats?.totalPnl || 0) >= 0 ? '#00ff88' : '#ff4444'}}>
            {formatUsd(stats?.totalPnl)} ({formatPct(stats?.totalPnlPct)})
          </div>
        </div>
        <div className="card">
          <div className="card-title">Başarı Oranı</div>
          <div className="card-value">{formatPct(stats?.winRate)}</div>
        </div>
        <div className="card">
          <div className="card-title">Profit Factor</div>
          <div className="card-value">{stats?.profitFactor || '-'}</div>
        </div>
      </div>

      {/* Makine Zekası Kartları */}
      <h2>🧠 Makine Zekası</h2>
      <div className="card-grid">
        <div className="card ai-card">
          <div className="card-title">🎯 Adaptif Eşik</div>
          <div className="card-value">%{stats?.adaptiveThreshold || 70}</div>
        </div>
        <div className="card ai-card">
          <div className="card-title">✅ Kabul Edilen</div>
          <div className="card-value" style={{color: '#00ff88'}}>{machineStats?.performance?.signalsAccepted || 0}</div>
        </div>
        <div className="card ai-card">
          <div className="card-title">❌ Reddedilen</div>
          <div className="card-value" style={{color: '#ff4444'}}>{machineStats?.performance?.signalsRejected || 0}</div>
        </div>
        <div className="card ai-card">
          <div className="card-title">📋 Kabul Oranı</div>
          <div className="card-value">%{machineStats?.performance?.acceptanceRate || 0}</div>
        </div>
      </div>

      {/* Son İşlemler */}
      <h2>📋 Son İşlemler</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Giriş</th>
              <th>Çıkış</th>
              <th>PnL</th>
              <th>Neden</th>
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.recentTrades || []).slice(0, 10).map((trade, i) => (
              <tr key={i} className={trade.pnl >= 0 ? 'profit' : 'loss'}>
                <td><strong>{trade.symbol}</strong></td>
                <td>{trade.entry_price?.toFixed(4)}</td>
                <td>{trade.exit_price?.toFixed(4) || '-'}</td>
                <td style={{color: trade.pnl >= 0 ? '#00ff88' : '#ff4444'}}>
                  {trade.pnl?.toFixed(4)} (%{trade.pnl_percent?.toFixed(2)})
                </td>
                <td>{trade.close_reason || trade.status}</td>
                <td>%{((trade.machine_confidence || 0) * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
