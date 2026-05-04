import React, { useState, useEffect } from 'react';

function Settings() {
  const [settings, setSettings] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(e => console.error(e));
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      setMessage(data.message || '✅ Kaydedildi');
      setTimeout(() => setMessage(''), 3000);
    } catch(e) {
      setMessage('Hata: ' + e.message);
    }
  };

  const realTrading = settings.real_trading === 'true' || settings.real_trading === '1';
  const githubSync = settings.github_sync_enabled === 'true' || settings.github_sync_enabled === '1';

  return (
    <div className="settings-page">
      <h1>⚙️ Ayarlar</h1>

      {message && <div className="message">{message}</div>}

      {/* GERCEK ALIM */}
      <div className="setting-group" style={{borderLeft: realTrading ? '4px solid #22c55e' : '4px solid #ef4444'}}>
        <h3>💰 GERÇEK ALIM</h3>
        <p style={{color: '#94a3b8', fontSize: 13, marginBottom: 15}}>
          {realTrading 
            ? '🟢 ACIK - Sinyaller gercek isleme donusur!' 
            : '🔴 KAPALI - Sadece sinyal uretilir.'}
        </p>
        <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={realTrading}
              onChange={(e) => handleChange('real_trading', e.target.checked ? 'true' : 'false')}
            />
            <span className="toggle-slider"></span>
          </label>
          <span style={{fontSize: 15, fontWeight: 600, color: realTrading ? '#22c55e' : '#ef4444'}}>
            {realTrading ? 'ACIK' : 'KAPALI'}
          </span>
        </div>
      </div>

      {/* GITHUB SYNC */}
      <div className="setting-group" style={{borderLeft: githubSync ? '4px solid #8b5cf6' : '4px solid #64748b'}}>
        <h3>🔗 GitHub Ogrenme Sync</h3>
        <p style={{color: '#94a3b8', fontSize: 13, marginBottom: 15}}>
          {githubSync 
            ? '🟣 ACIK - Makine ogrendiklerini GitHuba kaydeder. Deploy sonrasi kaybolmaz!' 
            : '⚫ KAPALI - Ogrenmeler sadece bellekte kalir.'}
        </p>
        <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={githubSync}
              onChange={(e) => handleChange('github_sync_enabled', e.target.checked ? 'true' : 'false')}
            />
            <span className="toggle-slider"></span>
          </label>
          <span style={{fontSize: 15, fontWeight: 600, color: githubSync ? '#a78bfa' : '#64748b'}}>
            {githubSync ? 'ACIK' : 'KAPALI'}
          </span>
        </div>
        {!githubSync && (
          <div style={{marginTop: 12, padding: 10, background: 'rgba(100,116,139,0.1)', borderRadius: 8, fontSize: 12, color: '#94a3b8'}}>
            💡 Acmak icin GITHUB_TOKEN ve GITHUB_LEARNING_REPO ortam degiskenlerini tanimlayin.
          </div>
        )}
        {githubSync && (
          <div style={{marginTop: 12, padding: 10, background: 'rgba(139,92,246,0.1)', borderRadius: 8, fontSize: 12, color: '#a78bfa'}}>
            🧠 Makine her 3 taramada bir ogrendiklerini GitHuba kaydeder.
          </div>
        )}
      </div>

      {/* TARAMA */}
      <div className="setting-group">
        <h3>🔍 Tarama Ayarlari</h3>
        <div className="setting-row">
          <label>Tarama Araligi (dk)</label>
          <input type="number" value={settings.scan_interval || '20'} 
            onChange={e => handleChange('scan_interval', e.target.value)} />
        </div>
        <div className="setting-row">
          <label>Maksimum Coin</label>
          <input type="number" value={settings.max_coins || '50'} 
            onChange={e => handleChange('max_coins', e.target.value)} />
        </div>
        <div className="setting-row">
          <label>Minimum Hacim (USDT)</label>
          <input type="number" value={settings.min_volume || '10000000'} 
            onChange={e => handleChange('min_volume', e.target.value)} />
        </div>
      </div>

      {/* SINYAL */}
      <div className="setting-group">
        <h3>📡 Sinyal Ayarlari</h3>
        <div className="setting-row">
          <label>Minimum Puan</label>
          <input type="number" value={settings.min_score || '40'} 
            onChange={e => handleChange('min_score', e.target.value)} />
        </div>
        <div className="setting-row">
          <label>AI Guven Esigi (%)</label>
          <input type="number" step="1" value={settings.machine_confidence_min ? String(parseFloat(settings.machine_confidence_min) * 100) : '70'} 
            onChange={e => handleChange('machine_confidence_min', String(parseFloat(e.target.value) / 100))} />
        </div>
      </div>

      {/* RISK */}
      <div className="setting-group">
        <h3>⚠️ Risk Ayarlari</h3>
        <div className="setting-row">
          <label>Stop Loss (%)</label>
          <input type="number" step="0.1" value={settings.stop_loss_percent || '2.0'} 
            onChange={e => handleChange('stop_loss_percent', e.target.value)} />
        </div>
        <div className="setting-row">
          <label>Trailing Stop (%)</label>
          <input type="number" step="0.1" value={settings.trailing_stop_percent || '0.5'} 
            onChange={e => handleChange('trailing_stop_percent', e.target.value)} />
        </div>
        <div className="setting-row">
          <label>Minimum Kar (%)</label>
          <input type="number" step="0.1" value={settings.min_profit_percent || '1.5'} 
            onChange={e => handleChange('min_profit_percent', e.target.value)} />
        </div>
        <div className="setting-row">
          <label>Islem Mikari (USDT)</label>
          <input type="number" value={settings.trade_amount_usdt || '100'} 
            onChange={e => handleChange('trade_amount_usdt', e.target.value)} />
        </div>
        <div className="setting-row">
          <label>Maksimum Pozisyon</label>
          <input type="number" value={settings.max_open_positions || '3'} 
            onChange={e => handleChange('max_open_positions', e.target.value)} />
        </div>
      </div>

      {/* TELEGRAM */}
      <div className="setting-group">
        <h3>📱 Telegram</h3>
        <div className="setting-row">
          <label>Minimum Bildirim Puani</label>
          <input type="number" value={settings.telegram_min_score || '60'} 
            onChange={e => handleChange('telegram_min_score', e.target.value)} />
        </div>
      </div>

      <button className="btn" onClick={saveSettings} style={{padding: '14px 40px', fontSize: 16, marginTop: 10}}>
        💾 Ayarlari Kaydet
      </button>
    </div>
  );
}

export default Settings;
