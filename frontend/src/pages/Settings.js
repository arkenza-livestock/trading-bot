import React, { useState, useEffect } from 'react';

function Settings() {
  const [settings, setSettings] = useState({});
  const [message, setMessage] = useState('');

  useEffect(function() {
    fetch('/api/settings')
      .then(function(r) { return r.json(); })
      .then(function(data) { setSettings(data); })
      .catch(function(e) { console.error(e); });
  }, []);

  var handleChange = function(key, value) {
    setSettings(function(prev) { return { ...prev, [key]: value }; });
  };

  var saveSettings = async function() {
    setMessage('');
    try {
      var res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      var data = await res.json();
      setMessage(data.message || 'Kaydedildi');
      setTimeout(function() { setMessage(''); }, 3000);
    } catch(e) { setMessage('Hata: ' + e.message); }
  };

  var realTrading = settings.real_trading === 'true' || settings.real_trading === '1';
  var longEnabled = settings.long_enabled === 'true' || settings.long_enabled === '1' || settings.long_enabled === undefined;
  var shortEnabled = settings.short_enabled === 'true' || settings.short_enabled === '1';
  var githubSync = settings.github_sync_enabled === 'true' || settings.github_sync_enabled === '1';

  var Row = function(props) {
    return (
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 0',borderBottom:'1px solid #111827'}}>
        <span style={{color:'#cbd5e1',fontSize:14,fontWeight:500}}>{props.label}</span>
        {props.children}
      </div>
    );
  };

  return (
    <div style={{maxWidth:500,padding:'32px 20px',margin:'0 auto'}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:4,color:'#f1f5f9'}}>Ayarlar</h1>
      <p style={{color:'#64748b',marginBottom:30,fontSize:13}}>Adaptif Cift Motor | LONG & SHORT</p>
      {message && <div style={{marginBottom:20,padding:14,background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:10,color:'#22c55e',fontSize:13}}>{message}</div>}

      {/* GERCEK ALIM */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderLeft:realTrading?'4px solid #22c55e':'4px solid #ef4444',borderRadius:14,padding:'22px 22px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><h3 style={{fontSize:14,fontWeight:600,color:'#f1f5f9',marginBottom:4}}>GERCEK ALIM</h3><p style={{color:'#64748b',fontSize:12,margin:0}}>{realTrading?'ACIK - Sinyaller gercek isleme donusur':'KAPALI - Sadece sinyal uretilir'}</p></div>
          <label className="toggle-switch"><input type="checkbox" checked={realTrading} onChange={function(e){handleChange('real_trading',e.target.checked?'true':'false');}} /><span className="toggle-slider"></span></label>
        </div>
      </div>

      {/* LONG AYARLARI */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderLeft:longEnabled?'4px solid #22c55e':'4px solid #334155',borderRadius:14,padding:'22px 22px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><h3 style={{fontSize:14,fontWeight:600,color:'#f1f5f9',marginBottom:4}}>🟢 LONG Islemleri</h3><p style={{color:'#64748b',fontSize:12,margin:0}}>{longEnabled?'ACIK - Adaptif 12 kural ile LONG sinyaller':'KAPALI - LONG sinyaller pas gecilir'}</p></div>
          <label className="toggle-switch"><input type="checkbox" checked={longEnabled} onChange={function(e){handleChange('long_enabled',e.target.checked?'true':'false');}} /><span className="toggle-slider"></span></label>
        </div>
      </div>

      {/* SHORT AYARLARI */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderLeft:shortEnabled?'4px solid #ef4444':'4px solid #334155',borderRadius:14,padding:'22px 22px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div><h3 style={{fontSize:14,fontWeight:600,color:'#f1f5f9',marginBottom:4}}>🔴 SHORT Islemleri</h3><p style={{color:'#64748b',fontSize:12,margin:0}}>{shortEnabled?'ACIK - Adaptif 8 kural ile SHORT sinyaller':'KAPALI - SHORT sinyaller pas gecilir'}</p></div>
          <label className="toggle-switch"><input type="checkbox" checked={shortEnabled} onChange={function(e){handleChange('short_enabled',e.target.checked?'true':'false');}} /><span className="toggle-slider"></span></label>
        </div>
        {shortEnabled && (
          <div style={{marginTop:10,padding:10,background:'rgba(239,68,68,0.08)',borderRadius:8,fontSize:11,color:'#fca5a5'}}>
            🔴 SHORT sinyalleri bagimsiz motor ile uretilir. Piyasa rejimine gore kural seti otomatik degisir.
          </div>
        )}
      </div>

      {/* GITHUB SYNC */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderLeft:githubSync?'4px solid #8b5cf6':'4px solid #334155',borderRadius:14,padding:'22px 22px',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><h3 style={{fontSize:14,fontWeight:600,color:'#f1f5f9',marginBottom:4}}>GitHub Ogrenme Sync</h3><p style={{color:'#64748b',fontSize:12,margin:0}}>{githubSync?'ACIK - Makine ogrendiklerini GitHubda saklar':'KAPALI - Ogrenmeler bellekte kalir'}</p></div>
          <label className="toggle-switch"><input type="checkbox" checked={githubSync} onChange={function(e){handleChange('github_sync_enabled',e.target.checked?'true':'false');}} /><span className="toggle-slider"></span></label>
        </div>
      </div>

      {/* BINANCE API */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderLeft:'4px solid #f59e0b',borderRadius:14,padding:'20px 22px',marginBottom:16}}>
        <h3 style={{fontSize:13,fontWeight:600,color:'#94a3b8',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Binance API</h3>
        <Row label="API Key"><input type="password" value={settings.binance_api_key||''} onChange={function(e){handleChange('binance_api_key',e.target.value);}} placeholder="API Key..." style={{width:220,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:12,textAlign:'left'}} /></Row>
        <Row label="Secret Key"><input type="password" value={settings.binance_api_secret||''} onChange={function(e){handleChange('binance_api_secret',e.target.value);}} placeholder="Secret Key..." style={{width:220,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:12,textAlign:'left'}} /></Row>
      </div>

      {/* TARAMA */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderRadius:14,padding:'20px 22px',marginBottom:16}}>
        <h3 style={{fontSize:13,fontWeight:600,color:'#94a3b8',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Tarama Ayarlari</h3>
        <Row label="Analiz Mum Araligi">
          <select value={settings.analysis_timeframe || '4h'} onChange={function(e){ handleChange('analysis_timeframe', e.target.value); }} style={{background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 10px',fontSize:13}}>
            <option value="1h">1 Saat</option>
            <option value="4h">4 Saat</option>
            <option value="1d">1 Gun</option>
          </select>
        </Row>
        <Row label="Tarama Araligi (dk)"><input type="number" value={settings.scan_interval||'20'} onChange={function(e){handleChange('scan_interval',e.target.value);}} style={{width:70,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
        <Row label="Maksimum Coin"><input type="number" value={settings.max_coins||'120'} onChange={function(e){handleChange('max_coins',e.target.value);}} style={{width:70,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
        <Row label="Minimum Hacim (USDT)"><input type="number" value={settings.min_volume||'5000000'} onChange={function(e){handleChange('min_volume',e.target.value);}} style={{width:120,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
      </div>

      {/* RISK */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderRadius:14,padding:'20px 22px',marginBottom:16}}>
        <h3 style={{fontSize:13,fontWeight:600,color:'#94a3b8',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Risk Ayarlari</h3>
        <Row label="Stop Loss (%)"><input type="number" step="0.1" value={settings.stop_loss_percent||'2.0'} onChange={function(e){handleChange('stop_loss_percent',e.target.value);}} style={{width:70,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
        <Row label="Trailing Stop (%)"><input type="number" step="0.1" value={settings.trailing_stop_percent||'0.5'} onChange={function(e){handleChange('trailing_stop_percent',e.target.value);}} style={{width:70,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
        <Row label="Minimum Kar (%)"><input type="number" step="0.1" value={settings.min_profit_percent||'1.5'} onChange={function(e){handleChange('min_profit_percent',e.target.value);}} style={{width:70,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
        <Row label="Islem Miktari (USDT)"><input type="number" value={settings.trade_amount_usdt||'100'} onChange={function(e){handleChange('trade_amount_usdt',e.target.value);}} style={{width:90,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
        <Row label="Maksimum Pozisyon"><input type="number" value={settings.max_open_positions||'3'} onChange={function(e){handleChange('max_open_positions',e.target.value);}} style={{width:70,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:13,textAlign:'center'}} /></Row>
      </div>

      {/* TELEGRAM */}
      <div style={{background:'#0d1321',border:'1px solid #1a2540',borderRadius:14,padding:'20px 22px',marginBottom:16}}>
        <h3 style={{fontSize:13,fontWeight:600,color:'#94a3b8',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Telegram</h3>
        <Row label="Bot Token"><input type="text" value={settings.telegram_token||''} onChange={function(e){handleChange('telegram_token',e.target.value);}} placeholder="123456:ABCdef..." style={{width:200,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:12,textAlign:'left'}} /></Row>
        <Row label="Chat ID"><input type="text" value={settings.telegram_chat_id||''} onChange={function(e){handleChange('telegram_chat_id',e.target.value);}} placeholder="-100123456" style={{width:160,background:'#0a0e17',border:'1px solid #334155',borderRadius:6,color:'#e2e8f0',padding:'6px 8px',fontSize:12,textAlign:'left'}} /></Row>
      </div>

      <button onClick={saveSettings} style={{marginTop:8,padding:'14px 0',fontSize:15,fontWeight:600,width:'100%',background:'#1e293b',border:'1px solid #334155',borderRadius:10,color:'#e2e8f0',cursor:'pointer'}}>Ayarlari Kaydet</button>
    </div>
  );
}

export default Settings;
