import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Settings({ api }) {
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    axios.get(`${api}/api/settings`).then(res => setSettings(res.data));
  }, [api]);

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    try {
      await axios.put(`${api}/api/settings`, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert('Hata: ' + err.message); }
  };

  const testBinance = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${api}/api/binance/test`);
      setTestResult({ success: true, message: `Bağlantı başarılı! Bakiye: ${res.data.usdtBalance} USDT` });
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.error || 'Bağlantı hatası' });
    }
    setTesting(false);
  };

  const Section = ({ title, children }) => (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-title">{title}</div>
      {children}
    </div>
  );

  const Field = ({ label, desc, children }) => (
    <div className="form-group">
      <label className="form-label">
        {label}
        {desc && <span style={{ fontSize: 11, color: '#4a5568', marginLeft: 6 }}>{desc}</span>}
      </label>
      {children}
    </div>
  );

  const Row2 = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{children}</div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Ayarlar</div>
          <div className="page-sub">Bot parametrelerini yapılandır</div>
        </div>
        <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save}>
          {saved ? '✓ Kaydedildi' : 'Kaydet'}
        </button>
      </div>

      <Section title="🔑 Binance API">
        <Row2>
          <Field label="API Key">
            <input className="form-input" type="text" placeholder="API Key" value={settings.binance_api_key || ''} onChange={e => update('binance_api_key', e.target.value)} />
          </Field>
          <Field label="API Secret">
            <input className="form-input" type="password" placeholder="API Secret" value={settings.binance_api_secret || ''} onChange={e => update('binance_api_secret', e.target.value)} />
          </Field>
        </Row2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={testBinance} disabled={testing}>
            {testing ? 'Test ediliyor...' : '🔌 Bağlantı Test Et'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, color: testResult.success ? '#68d391' : '#fc8181' }}>
              {testResult.message}
            </span>
          )}
        </div>
      </Section>

      <Section title="🤖 Groq AI API">
        <Field label="API Key" desc="(AI yorum için opsiyonel)">
          <input className="form-input" type="password" placeholder="gsk_..." value={settings.groq_api_key || ''} onChange={e => update('groq_api_key', e.target.value)} />
        </Field>
      </Section>

      <Section title="🔍 Filtre Kriterleri">
        <Row2>
          <Field label="Minimum Hacim (USDT)">
            <input className="form-input" type="number" value={settings.min_volume || ''} onChange={e => update('min_volume', e.target.value)} />
          </Field>
          <Field label="Maximum Coin Sayısı">
            <input className="form-input" type="number" value={settings.max_coins || ''} onChange={e => update('max_coins', e.target.value)} />
          </Field>
          <Field label="Minimum Değişim (%)">
            <input className="form-input" type="number" value={settings.min_change || ''} onChange={e => update('min_change', e.target.value)} />
          </Field>
          <Field label="Maximum Değişim (%)">
            <input className="form-input" type="number" value={settings.max_change || ''} onChange={e => update('max_change', e.target.value)} />
          </Field>
        </Row2>
      </Section>

      <Section title="📊 İndikatör Eşikleri">
        <Row2>
          <Field label="RSI Aşırı Satım">
            <input className="form-input" type="number" value={settings.rsi_oversold || ''} onChange={e => update('rsi_oversold', e.target.value)} />
          </Field>
          <Field label="RSI Aşırı Alım">
            <input className="form-input" type="number" value={settings.rsi_overbought || ''} onChange={e => update('rsi_overbought', e.target.value)} />
          </Field>
          <Field label="Minimum Sinyal Skoru">
            <input className="form-input" type="number" value={settings.min_score || ''} onChange={e => update('min_score', e.target.value)} />
          </Field>
          <Field label="Kontrol Aralığı (dakika)">
            <input className="form-input" type="number" value={settings.check_interval || ''} onChange={e => update('check_interval', e.target.value)} />
          </Field>
        </Row2>
      </Section>

      <Section title="⚖️ Risk Yönetimi">
        <Row2>
          <Field label="İşlem Başı Miktar (USDT)">
            <input className="form-input" type="number" value={settings.trade_amount_usdt || ''} onChange={e => update('trade_amount_usdt', e.target.value)} />
          </Field>
          <Field label="Max Açık Pozisyon">
            <input className="form-input" type="number" value={settings.max_open_positions || ''} onChange={e => update('max_open_positions', e.target.value)} />
          </Field>
          <Field label="Stop Loss (%)">
            <input className="form-input" type="number" value={settings.stop_loss_percent || ''} onChange={e => update('stop_loss_percent', e.target.value)} />
          </Field>
          <Field label="Take Profit (%)">
            <input className="form-input" type="number" value={settings.take_profit_percent || ''} onChange={e => update('take_profit_percent', e.target.value)} />
          </Field>
        </Row2>
      </Section>

      <Section title="🤖 Otomatik Alım/Satım">
        <div style={{ background: '#2d1111', border: '1px solid #4a1111', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#fc8181', fontWeight: 600, marginBottom: 4 }}>⚠️ DİKKAT</div>
          <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6 }}>
            Otomatik alım/satım aktif olduğunda sistem gerçek para işlemi yapar. Binance API key'inizin Trade yetkisi olduğundan emin olun.
          </div>
        </div>
        <Field label="Otomatik Alım/Satım">
          <div className="toggle-wrap">
            <label className="toggle">
              <input type="checkbox" checked={settings.auto_trade_enabled === 'true'} onChange={e => update('auto_trade_enabled', e.target.checked ? 'true' : 'false')} />
              <span className="toggle-slider" />
            </label>
            <span style={{ fontSize: 13, color: settings.auto_trade_enabled === 'true' ? '#68d391' : '#718096' }}>
              {settings.auto_trade_enabled === 'true' ? 'AKTİF' : 'PASİF'}
            </span>
          </div>
        </Field>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save} style={{ padding: '12px 32px' }}>
          {saved ? '✓ Kaydedildi' : '💾 Ayarları Kaydet'}
        </button>
      </div>
    </div>
  );
}
