import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Settings({ api }) {
  const [settings, setSettings] = useState({});
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    load();
  }, [api]);

  const load = async () => {
    try {
      const res = await axios.get(`${api}/api/settings`);
      setSettings(res.data);
    } catch(e) { console.error(e); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.post(`${api}/api/settings`, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch(e) { alert('Hata: ' + e.message); }
    setSaving(false);
  };

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const Input = ({ label, k, type='number', step, placeholder }) => (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:12, color:'#718096', marginBottom:5 }}>{label}</label>
      <input
        className="form-input"
        type={type}
        step={step}
        placeholder={placeholder}
        value={settings[k]||''}
        onChange={e => set(k, e.target.value)}
        style={{ padding:'9px 12px', fontSize:13, width:'100%' }}
      />
    </div>
  );

  const Toggle = ({ label, k, desc }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'12px 0', borderBottom:'1px solid #0d1117' }}>
      <div>
        <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:500 }}>{label}</div>
        {desc && <div style={{ fontSize:11, color:'#4a5568', marginTop:3 }}>{desc}</div>}
      </div>
      <div onClick={() => set(k, settings[k]==='true'?'false':'true')}
        style={{ width:44, height:24, borderRadius:12, cursor:'pointer', transition:'all 0.2s',
          background: settings[k]==='true' ? '#3182ce' : '#2d3748',
          position:'relative' }}>
        <div style={{ position:'absolute', top:3, transition:'all 0.2s',
          left: settings[k]==='true' ? 22 : 3,
          width:18, height:18, borderRadius:'50%', background:'white' }} />
      </div>
    </div>
  );

  const Section = ({ title, color='#60a5fa', children }) => (
    <div className="card" style={{ marginBottom:16 }}>
      <div style={{ fontSize:12, color, fontWeight:700, marginBottom:16,
        textTransform:'uppercase', letterSpacing:1 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">⚙️ Ayarlar</div>
          <div className="page-sub">Bot konfigürasyonu</div>
        </div>
        <button onClick={save} disabled={saving}
          className="btn btn-primary"
          style={{ padding:'10px 28px', fontSize:14 }}>
          {saving ? '⏳ Kaydediliyor...' : saved ? '✅ Kaydedildi!' : '💾 Kaydet'}
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Sol */}
        <div>
          <Section title="🤖 Engine">
            <Toggle k="auto_trade_enabled" label="Otomatik İşlem"
              desc="Gerçek para ile otomatik al/sat" />
            <div style={{ marginTop:14 }}>
              <Input label="Taranacak Max Coin" k="max_coins" />
              <Input label="Min Hacim (USDT)" k="min_volume" />
              <Input label="Min Sinyal Skoru" k="min_score" />
            </div>
          </Section>

          <Section title="💰 İşlem">
            <Input label="İşlem Miktarı (USDT)" k="trade_amount_usdt" />
            <Input label="Max Açık Pozisyon" k="max_open_positions" />
            <Input label="Komisyon (%)" k="commission_rate" step="0.01" />
            <Input label="Slippage (%)" k="slippage_rate" step="0.01" />
          </Section>

          <Section title="🎮 Simülasyon">
            <Input label="Başlangıç Bakiyesi (USDT)" k="sim_balance" />
          </Section>
        </div>

        {/* Sağ */}
        <div>
          <Section title="🛡️ Risk Yönetimi">
            <Input label="Stop Loss (%)" k="stop_loss_percent" step="0.1" />
            <Input label="Trailing Stop (%)" k="trailing_stop_percent" step="0.1" />
            <Input label="Min Kar % (trailing için)" k="min_profit_percent" step="0.1" />
            <Input label="Zaman Stop (dakika, 0=kapalı)" k="time_stop_minutes" />
          </Section>

          <Section title="📊 Teknik Analiz">
            <Input label="RSI Periyot" k="rsi_period" />
            <Input label="S/R Lookback" k="sr_lookback" />
          </Section>

          <Section title="📱 Telegram">
            <Input label="Bot Token" k="telegram_token" type="text" placeholder="123456:ABC..." />
            <Input label="Chat ID" k="telegram_chat_id" type="text" placeholder="-1001234..." />
            <Input label="Min Skor (bildirim için)" k="telegram_min_score" />
          </Section>

          <Section title="🔑 Binance API">
            <Input label="API Key" k="binance_api_key" type="text" placeholder="API Key" />
            <Input label="API Secret" k="binance_api_secret" type="text" placeholder="API Secret" />
          </Section>
        </div>
      </div>

      <div style={{ textAlign:'right', marginTop:8 }}>
        <button onClick={save} disabled={saving}
          className="btn btn-primary"
          style={{ padding:'12px 40px', fontSize:15 }}>
          {saving ? '⏳ Kaydediliyor...' : saved ? '✅ Kaydedildi!' : '💾 Kaydet'}
        </button>
      </div>
    </div>
  );
}
