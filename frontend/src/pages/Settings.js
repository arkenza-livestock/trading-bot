import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const TABS = ['Genel', 'İndikatör', 'Risk'];

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

  const F = ({ label, desc, children }) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, color: '#a0aec0', marginBottom: 6 }}>
        {label} {desc && <span style={{ fontSize: 11, color: '#4a5568' }}>{desc}</span>}
      </label>
      {children}
    </div>
  );

  const N = ({ k, label, desc, step = 1, placeholder }) => (
    <F label={label} desc={desc}>
      <input
        className="form-input"
        type="number"
        step={step}
        placeholder={placeholder}
        value={settings[k] ?? ''}
        onChange={e => update(k, e.target.value)}
      />
    </F>
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

      {/* Sekmeler */}
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
              <F label="API Key">
                <input
                  className="form-input"
                  type="text"
                  placeholder="API Key"
                  value={settings.binance_api_key ?? ''}
                  onChange={e => update('binance_api_key', e.target.value)}
                />
              </F>
              <F label="API Secret">
                <input
                  className="form-input"
                  type="password"
                  placeholder="API Secret"
                  value={settings.binance_api_secret ?? ''}
                  onChange={e => update('binance_api_secret', e.target.value)}
                />
              </F>
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
              <F label="Bot Token">
                <input
                  className="form-input"
                  type="password"
                  placeholder="1234567890:AAAA..."
                  value={settings.telegram_token ?? ''}
                  onChange={e => update('telegram_token', e.target.value)}
                />
              </F>
              <F label="Chat ID">
                <input
                  className="form-input"
                  type="text"
                  placeholder="123456789"
                  value={settings.telegram_chat_id ?? ''}
                  onChange={e => update('telegram_chat_id', e.target.value)}
                />
              </F>
            </R2>
            <R2>
              <N k="telegram_min_score" label="Telegram Min Skor" desc="Bu skorun altı Telegram'a gitmez" placeholder="50" />
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
            <F label="API Key" desc="(Opsiyonel)">
              <input
                className="form-input"
                type="password"
                placeholder="gsk_..."
                value={settings.groq_api_key ?? ''}
                onChange={e => update('groq_api_key', e.target.value)}
              />
            </F>
          </S>

          <S title="🔍 Coin Filtresi">
            <R2>
              <N k="min_volume" label="Min Hacim (USDT)" placeholder="1000000" />
              <N k="max_coins" label="Max Coin Sayısı" placeholder="50" />
            </R2>
          </S>

          <S title="⏱️ Tarama">
            <R2>
              <F label="Mum Zaman Dilimi">
                <select
                  className="form-input"
                  value={settings.candle_interval ?? '5m'}
                  onChange={e => update('candle_interval', e.target.value)}
                >
                  <option value="1m">1 Dakika</option>
                  <option value="3m">3 Dakika</option>
                  <option value="5m">5 Dakika</option>
                  <option value="15m">15 Dakika</option>
                  <option value="30m">30 Dakika</option>
                  <option value="1h">1 Saat</option>
                </select>
              </F>
              <N k="candle_limit" label="Mum Sayısı" placeholder="50" />
            </R2>
          </S>

          <S title="🤖 Otomatik Alım/Satım">
            <div style={{ background: '#2d1111', border: '1px solid #4a1111', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#fc8181', lineHeight: 1.6 }}>
              ⚠️ Aktif olduğunda sistem gerçek para işlemi yapar!
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.auto_trade_enabled === 'true'}
                  onChange={e => update('auto_trade_enabled', e.target.checked ? 'true' : 'false')}
                />
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
          <S title="📊 Sinyal">
            <R2>
              <N k="min_score" label="Min Sinyal Skoru" desc="Web'de göster" placeholder="10" />
            </R2>
          </S>
          <S title="📈 RSI">
            <R2>
              <N k="rsi_period" label="RSI Periyot" placeholder="7" />
              <N k="rsi_oversold" label="RSI Aşırı Satım" placeholder="50" />
            </R2>
            <R2>
              <N k="rsi_overbought" label="RSI Aşırı Alım" placeholder="75" />
            </R2>
          </S>
          <S title="📍 Destek/Direnç">
            <R2>
              <N k="sr_lookback" label="Bakış Periyotu" placeholder="20" />
            </R2>
          </S>
        </div>
      )}

      {/* RİSK */}
      {tab === 'Risk' && (
        <div>
          <S title="💰 İşlem">
            <R2>
              <N k="trade_amount_usdt" label="İşlem Başı Miktar (USDT)" placeholder="100" />
              <N k="max_open_positions" label="Max Açık Pozisyon" placeholder="5" />
            </R2>
          </S>
          <S title="🎯 Kar / Zarar">
            <R2>
              <N k="stop_loss_percent" label="Stop Loss (%)" step={0.1} placeholder="0.75" />
              <N k="trailing_stop_percent" label="Trailing Stop (%)" step={0.1} placeholder="0.5" />
            </R2>
            <R2>
              <N k="min_profit_percent" label="Min Kar (trailing için %)" step={0.1} placeholder="0.5" />
              <N k="time_stop_minutes" label="Zaman Stop (dakika)" desc="0 = kapalı" placeholder="60" />
            </R2>
          </S>
          <S title="⚖️ Günlük Limit">
            <R2>
              <N k="max_daily_loss_percent" label="Max Günlük Zarar (%)" step={0.1} placeholder="5" />
              <N k="max_daily_trades" label="Max Günlük İşlem" placeholder="20" />
            </R2>
          </S>
          <S title="💸 Maliyet">
            <R2>
              <N k="commission_rate" label="Komisyon (%)" step={0.01} placeholder="0.1" />
              <N k="slippage_rate" label="Slippage (%)" step={0.01} placeholder="0.05" />
            </R2>
          </S>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button
          className={`btn ${saved ? 'btn-success' : 'btn-primary'}`}
          onClick={save}
          style={{ padding: '12px 32px', fontSize: 15 }}
        >
          {saved ? '✓ Kaydedildi' : '💾 Ayarları Kaydet'}
        </button>
      </div>
    </div>
  );
}
