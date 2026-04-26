import React, { useState, useEffect } from 'react';
import axios from 'axios';

const TABS = ['Genel', 'İndikatör', 'Risk'];

const F = ({ label, desc, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 13, color: '#a0aec0', marginBottom: 6 }}>
      {label} {desc && <span style={{ fontSize: 11, color: '#4a5568' }}>{desc}</span>}
    </label>
    {children}
  </div>
);

const R2 = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{children}</div>
);

const S = ({ title, children }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{
      fontSize: 12, fontWeight: 700, color: '#60a5fa', marginBottom: 14,
      paddingBottom: 6, borderBottom: '1px solid #1e2736',
      textTransform: 'uppercase', letterSpacing: 1
    }}>{title}</div>
    {children}
  </div>
);

const NumInput = ({ label, desc, step = 1, placeholder, value, onChange }) => (
  <F label={label} desc={desc}>
    <input
      className="form-input"
      type="number"
      step={step}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
    />
  </F>
);

const TextInput = ({ label, desc, type = 'text', placeholder, value, onChange }) => (
  <F label={label} desc={desc}>
    <input
      className="form-input"
      type={type}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
    />
  </F>
);

export default function Settings({ api }) {
  const [tab, setTab] = useState('Genel');
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [telegramTest, setTelegramTest] = useState(null);

  useEffect(() => {
    axios.get(`${api}/api/settings`).then(res => setSettings(res.data));
  }, [api]);

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

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
      setTestResult({ success: true, message: `✅ Bağlantı başarılı! Bakiye: ${res.data.usdtBalance} USDT` });
    } catch (err) {
      setTestResult({ success: false, message: '❌ ' + (err.response?.data?.error || 'Bağlantı hatası') });
    }
    setTesting(false);
  };

  const testTelegram = async () => {
    setTelegramTest(null);
    try {
      await axios.put(`${api}/api/settings`, settings);
      await axios.post(`${api}/api/telegram/test`);
      setTelegramTest({ success: true, message: '✅ Telegram mesajı gönderildi!' });
    } catch (err) {
      setTelegramTest({ success: false, message: '❌ ' + (err.response?.data?.error || 'Gönderme hatası') });
    }
  };

  if (!settings) return <div style={{ padding: 40, color: '#718096' }}>Yükleniyor...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Ayarlar</div>
          <div className="page-sub">Bot parametrelerini yapılandır</div>
        </div>
        <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save}>
          {saved ? '✓ Kaydedildi' : '💾 Kaydet'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#0d1117', padding: 4, borderRadius: 10, border: '1px solid #1e2736' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
            background: tab === t ? '#1a2744' : 'transparent',
            color: tab === t ? '#60a5fa' : '#718096'
          }}>{t}</button>
        ))}
      </div>

      {/* GENEL */}
      {tab === 'Genel' && (
        <div>
          <S title="🔑 Binance API">
            <R2>
              <TextInput label="API Key" placeholder="API Key"
                value={settings.binance_api_key} onChange={v => update('binance_api_key', v)} />
              <TextInput label="API Secret" type="password" placeholder="API Secret"
                value={settings.binance_api_secret} onChange={v => update('binance_api_secret', v)} />
            </R2>
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
          </S>

          <S title="📱 Telegram Bildirimi">
            <R2>
              <TextInput label="Bot Token" type="password" placeholder="1234567890:AAAA..."
                value={settings.telegram_token} onChange={v => update('telegram_token', v)} />
              <TextInput label="Chat ID" placeholder="123456789"
                value={settings.telegram_chat_id} onChange={v => update('telegram_chat_id', v)} />
            </R2>
            <R2>
              <NumInput label="Telegram Min Skor" desc="Bu skorun altı Telegram'a gitmez" placeholder="50"
                value={settings.telegram_min_score} onChange={v => update('telegram_min_score', v)} />
            </R2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={testTelegram}>
                📤 Test Mesajı Gönder
              </button>
              {telegramTest && (
                <span style={{ fontSize: 13, color: telegramTest.success ? '#68d391' : '#fc8181' }}>
                  {telegramTest.message}
                </span>
              )}
            </div>
          </S>

          <S title="🤖 Groq AI">
            <TextInput label="API Key" desc="(Opsiyonel)" type="password" placeholder="gsk_..."
              value={settings.groq_api_key} onChange={v => update('groq_api_key', v)} />
          </S>

          <S title="🔍 Coin Filtresi">
            <R2>
              <NumInput label="Min Hacim (USDT)" placeholder="1000000"
                value={settings.min_volume} onChange={v => update('min_volume', v)} />
              <NumInput label="Max Coin Sayısı" placeholder="50"
                value={settings.max_coins} onChange={v => update('max_coins', v)} />
            </R2>
          </S>

          <S title="⏱️ Tarama">
            <R2>
              <F label="Mum Zaman Dilimi">
                <select className="form-input"
                  value={settings.candle_interval ?? '5m'}
                  onChange={e => update('candle_interval', e.target.value)}>
                  <option value="1m">1 Dakika</option>
                  <option value="3m">3 Dakika</option>
                  <option value="5m">5 Dakika</option>
                  <option value="15m">15 Dakika</option>
                  <option value="30m">30 Dakika</option>
                  <option value="1h">1 Saat</option>
                </select>
              </F>
              <NumInput label="Mum Sayısı" placeholder="50"
                value={settings.candle_limit} onChange={v => update('candle_limit', v)} />
            </R2>
          </S>

          <S title="🤖 Otomatik Alım/Satım">
            <div style={{ background: '#2d1111', border: '1px solid #4a1111', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#fc8181', lineHeight: 1.6 }}>
              ⚠️ Aktif olduğunda sistem gerçek para işlemi yapar!
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="toggle">
                <input type="checkbox"
                  checked={settings.auto_trade_enabled === 'true'}
                  onChange={e => update('auto_trade_enabled', e.target.checked ? 'true' : 'false')} />
                <span className="toggle-slider" />
              </label>
              <span style={{ fontSize: 14, fontWeight: 600, color: settings.auto_trade_enabled === 'true' ? '#68d391' : '#718096' }}>
                {settings.auto_trade_enabled === 'true' ? '🟢 AKTİF' : '🔴 PASİF'}
              </span>
            </div>
          </S>
        </div>
      )}

      {/* İNDİKATÖR */}
      {tab === 'İndikatör' && (
        <div>
          <S title="📊 Genel Sinyal">
            <R2>
              <NumInput label="Min Sinyal Skoru" desc="Bu altı web'de gösterilmez" placeholder="10"
                value={settings.min_score} onChange={v => update('min_score', v)} />
            </R2>
          </S>

          <S title="📈 Momentum (1-3-5 Mum)">
            <div style={{ background: '#0a0e1a', border: '1px solid #1e2736', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#718096', lineHeight: 1.8 }}>
              Fiyatın 1, 3 ve 5 mum öncesine göre değişim hızını ölçer. Ardışık yeşil mumlar ve EMA5&gt;EMA10 ekstra puan alır.
            </div>
            <R2>
              <NumInput label="ROC1 Min Eşik (%)" desc="1 mum değişim eşiği" step={0.1} placeholder="0.2"
                value={settings.momentum_roc1_threshold} onChange={v => update('momentum_roc1_threshold', v)} />
              <NumInput label="ROC3 Min Eşik (%)" desc="3 mum değişim eşiği" step={0.1} placeholder="0.5"
                value={settings.momentum_roc3_threshold} onChange={v => update('momentum_roc3_threshold', v)} />
            </R2>
            <R2>
              <NumInput label="ROC5 Min Eşik (%)" desc="5 mum değişim eşiği" step={0.1} placeholder="1.0"
                value={settings.momentum_roc5_threshold} onChange={v => update('momentum_roc5_threshold', v)} />
            </R2>
          </S>

          <S title="📉 RSI (Göreceli Güç Endeksi)">
            <div style={{ background: '#0a0e1a', border: '1px solid #1e2736', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#718096', lineHeight: 1.8 }}>
              RSI düşükse aşırı satım (alım fırsatı), yüksekse aşırı alım (riskli). İdeal alım bölgesi: 25-50 arası.
            </div>
            <R2>
              <NumInput label="RSI Periyot" desc="Varsayılan: 7" placeholder="7"
                value={settings.rsi_period} onChange={v => update('rsi_period', v)} />
              <NumInput label="Aşırı Satım Eşiği" desc="Altı = güçlü alım sinyali" placeholder="40"
                value={settings.rsi_oversold} onChange={v => update('rsi_oversold', v)} />
            </R2>
            <R2>
              <NumInput label="Aşırı Alım Eşiği" desc="Üstü = alım uygun değil" placeholder="70"
                value={settings.rsi_overbought} onChange={v => update('rsi_overbought', v)} />
            </R2>
          </S>

          <S title="💧 Hacim Analizi">
            <div style={{ background: '#0a0e1a', border: '1px solid #1e2736', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#718096', lineHeight: 1.8 }}>
              Anlık hacmin 20 mum ortalamasına oranı. Yüksek hacim = güçlü hareket. Alım baskısı oranı da hesaplanır.
            </div>
            <R2>
              <NumInput label="Spike Eşiği (x)" desc="Ortalamanın kaç katı" step={0.1} placeholder="2.0"
                value={settings.volume_spike_threshold} onChange={v => update('volume_spike_threshold', v)} />
              <NumInput label="Min Hacim (USDT)" desc="24s min işlem hacmi" placeholder="1000000"
                value={settings.min_volume} onChange={v => update('min_volume', v)} />
            </R2>
          </S>

          <S title="📍 Destek / Direnç">
            <div style={{ background: '#0a0e1a', border: '1px solid #1e2736', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#718096', lineHeight: 1.8 }}>
              Fiyatın son N mumda oluşan destek/direnç bandındaki konumu. Desteğe yakınsa alım, direce yakınsa riskli.
            </div>
            <R2>
              <NumInput label="Bakış Periyotu" desc="Kaç mum geriye bak" placeholder="20"
                value={settings.sr_lookback} onChange={v => update('sr_lookback', v)} />
            </R2>
          </S>
        </div>
      )}

      {/* RİSK */}
      {tab === 'Risk' && (
        <div>
          <S title="💰 İşlem">
            <R2>
              <NumInput label="İşlem Başı Miktar (USDT)" placeholder="100"
                value={settings.trade_amount_usdt} onChange={v => update('trade_amount_usdt', v)} />
              <NumInput label="Max Açık Pozisyon" placeholder="5"
                value={settings.max_open_positions} onChange={v => update('max_open_positions', v)} />
            </R2>
          </S>
          <S title="🎯 Kar / Zarar">
            <R2>
              <NumInput label="Stop Loss (%)" step={0.1} placeholder="0.75"
                value={settings.stop_loss_percent} onChange={v => update('stop_loss_percent', v)} />
              <NumInput label="Trailing Stop (%)" step={0.1} placeholder="0.5"
                value={settings.trailing_stop_percent} onChange={v => update('trailing_stop_percent', v)} />
            </R2>
            <R2>
              <NumInput label="Min Kar (trailing için %)" step={0.1} placeholder="0.5"
                value={settings.min_profit_percent} onChange={v => update('min_profit_percent', v)} />
              <NumInput label="Zaman Stop (dakika)" desc="0 = kapalı" placeholder="60"
                value={settings.time_stop_minutes} onChange={v => update('time_stop_minutes', v)} />
            </R2>
          </S>
          <S title="⚖️ Günlük Limit">
            <R2>
              <NumInput label="Max Günlük Zarar (%)" step={0.1} placeholder="5"
                value={settings.max_daily_loss_percent} onChange={v => update('max_daily_loss_percent', v)} />
              <NumInput label="Max Günlük İşlem" placeholder="20"
                value={settings.max_daily_trades} onChange={v => update('max_daily_trades', v)} />
            </R2>
          </S>
          <S title="💸 Maliyet">
            <R2>
              <NumInput label="Komisyon (%)" step={0.01} placeholder="0.1"
                value={settings.commission_rate} onChange={v => update('commission_rate', v)} />
              <NumInput label="Slippage (%)" step={0.01} placeholder="0.05"
                value={settings.slippage_rate} onChange={v => update('slippage_rate', v)} />
            </R2>
          </S>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save}
          style={{ padding: '12px 32px', fontSize: 15 }}>
          {saved ? '✓ Kaydedildi' : '💾 Ayarları Kaydet'}
        </button>
      </div>
    </div>
  );
}
