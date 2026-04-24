import React, { useState, useEffect } from 'react';
import axios from 'axios';

const TABS = ['Genel', 'İndikatör Eşikleri', 'Risk Yönetimi'];

export default function Settings({ api }) {
  const [tab, setTab] = useState('Genel');
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

  const Row3 = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>{children}</div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #1e2736' }}>{title}</div>
      {children}
    </div>
  );

  const NumInput = ({ k, label, desc, min, max, step = 1 }) => (
    <Field label={label} desc={desc}>
      <input className="form-input" type="number" min={min} max={max} step={step}
        value={settings[k] || ''} onChange={e => update(k, e.target.value)} />
    </Field>
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

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#0d1117', padding: 4, borderRadius: 10, border: '1px solid #1e2736' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: tab === t ? '#1a2744' : 'transparent', color: tab === t ? '#60a5fa' : '#718096' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Genel' && (
        <div>
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
              {testResult && <span style={{ fontSize: 13, color: testResult.success ? '#68d391' : '#fc8181' }}>{testResult.message}</span>}
            </div>
          </Section>

          <Section title="🤖 Groq AI">
            <Field label="Groq API Key" desc="(AI yorum için opsiyonel)">
              <input className="form-input" type="password" placeholder="gsk_..." value={settings.groq_api_key || ''} onChange={e => update('groq_api_key', e.target.value)} />
            </Field>
          </Section>

          <Section title="🔍 Coin Filtresi">
            <Row2>
              <NumInput k="min_volume" label="Min Hacim (USDT)" desc="Bu altı elenir" />
              <NumInput k="max_coins" label="Max Coin Sayısı" desc="Analiz edilecek" />
              <NumInput k="min_change" label="Min Değişim (%)" desc="24s alt sınır" step={0.1} />
              <NumInput k="max_change" label="Max Değişim (%)" desc="Pump filtresi" />
            </Row2>
          </Section>

          <Section title="⏱️ Tarama Ayarları">
            <Row2>
              <Field label="Tarama Aralığı">
                <select className="form-input" value={settings.check_interval || '20'} onChange={e => update('check_interval', e.target.value)}>
                  <option value="1">1 dakika</option>
                  <option value="5">5 dakika</option>
                  <option value="10">10 dakika</option>
                  <option value="15">15 dakika</option>
                  <option value="20">20 dakika</option>
                  <option value="30">30 dakika</option>
                  <option value="60">1 saat</option>
                </select>
              </Field>
              <Field label="Mum Zaman Dilimi">
                <select className="form-input" value={settings.candle_interval || '4h'} onChange={e => update('candle_interval', e.target.value)}>
                  <option value="1m">1 Dakika</option>
                  <option value="5m">5 Dakika</option>
                  <option value="15m">15 Dakika</option>
                  <option value="30m">30 Dakika</option>
                  <option value="1h">1 Saat</option>
                  <option value="4h">4 Saat</option>
                  <option value="1d">1 Gün</option>
                </select>
              </Field>
            </Row2>
          </Section>

          <Section title="🤖 Otomatik Alım/Satım">
            <div style={{ background: '#2d1111', border: '1px solid #4a1111', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#fc8181', fontWeight: 600, marginBottom: 4 }}>⚠️ DİKKAT</div>
              <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6 }}>Aktif olduğunda sistem gerçek para işlemi yapar.</div>
            </div>
            <Field label="Otomatik Alım/Satım">
              <div className="toggle-wrap">
                <label className="toggle">
                  <input type="checkbox" checked={settings.auto_trade_enabled === 'true'} onChange={e => update('auto_trade_enabled', e.target.checked ? 'true' : 'false')} />
                  <span className="toggle-slider" />
                </label>
                <span style={{ fontSize: 13, color: settings.auto_trade_enabled === 'true' ? '#68d391' : '#718096', fontWeight: 600 }}>
                  {settings.auto_trade_enabled === 'true' ? '🟢 AKTİF' : '🔴 PASİF'}
                </span>
              </div>
            </Field>
          </Section>
        </div>
      )}

      {tab === 'İndikatör Eşikleri' && (
        <div>
          <Section title="📊 Genel Sinyal">
            <Row2>
              <NumInput k="min_score" label="Min Sinyal Skoru" desc="Bu altı sinyal yok" />
              <NumInput k="candle_limit" label="Mum Sayısı" desc="Kaç mum analiz edilsin" />
            </Row2>
          </Section>
          <Section title="📈 RSI">
            <Row3>
              <NumInput k="rsi_period" label="RSI Periyot" desc="Varsayılan: 14" />
              <NumInput k="rsi_oversold" label="Aşırı Satım Eşiği" />
              <NumInput k="rsi_overbought" label="Aşırı Alım Eşiği" />
            </Row3>
            <Row3>
              <NumInput k="rsi_extreme_oversold_score" label="Aşırı Satım Puanı" desc="RSI < 25" />
              <NumInput k="rsi_oversold_score" label="Satım Bölgesi Puanı" />
              <NumInput k="rsi_rising_score" label="RSI Yükseliş Puanı" />
            </Row3>
            <Row3>
              <NumInput k="rsi_overbought_penalty" label="Alım Bölgesi Cezası" />
              <NumInput k="rsi_extreme_overbought_penalty" label="Aşırı Alım Cezası" desc="RSI > 75" />
            </Row3>
          </Section>
          <Section title="📉 MACD">
            <Row3>
              <NumInput k="macd_fast" label="Hızlı EMA" desc="Varsayılan: 12" />
              <NumInput k="macd_slow" label="Yavaş EMA" desc="Varsayılan: 26" />
              <NumInput k="macd_signal" label="Sinyal EMA" desc="Varsayılan: 9" />
            </Row3>
            <Row3>
              <NumInput k="macd_golden_cross_score" label="Golden Cross Puanı" />
              <NumInput k="macd_positive_score" label="Pozitif MACD Puanı" />
              <NumInput k="macd_bullish_div_score" label="Bullish Div Puanı" />
            </Row3>
            <Row3>
              <NumInput k="macd_death_cross_penalty" label="Death Cross Cezası" />
              <NumInput k="macd_negative_penalty" label="Negatif MACD Cezası" />
              <NumInput k="macd_bearish_div_penalty" label="Bearish Div Cezası" />
            </Row3>
          </Section>
          <Section title="📊 Bollinger Bands">
            <Row3>
              <NumInput k="bb_period" label="BB Periyot" desc="Varsayılan: 20" />
              <NumInput k="bb_std" label="Standart Sapma" step={0.1} />
              <NumInput k="bb_squeeze_score" label="Daralma Puanı" />
            </Row3>
            <Row3>
              <NumInput k="bb_extreme_low_score" label="Alt Bant Puanı" desc="bPct < 5" />
              <NumInput k="bb_low_score" label="Alt Bölge Puanı" desc="bPct < 20" />
              <NumInput k="bb_extreme_high_penalty" label="Üst Bant Cezası" desc="bPct > 95" />
            </Row3>
            <Row2>
              <NumInput k="bb_high_penalty" label="Üst Bölge Cezası" desc="bPct > 80" />
            </Row2>
          </Section>
          <Section title="📊 OBV">
            <Row3>
              <NumInput k="obv_rising_score" label="OBV Yükseliş Puanı" />
              <NumInput k="obv_hidden_bull_score" label="Gizli Alım Puanı" />
              <NumInput k="obv_falling_penalty" label="OBV Düşüş Cezası" />
            </Row3>
            <Row2>
              <NumInput k="obv_hidden_bear_penalty" label="Gizli Satış Cezası" />
            </Row2>
          </Section>
          <Section title="📊 Hacim">
            <Row3>
              <NumInput k="volume_spike_threshold" label="Spike Eşiği (x)" step={0.1} />
              <NumInput k="volume_spike_score" label="Spike Puanı" />
              <NumInput k="volume_buy_pressure_score" label="Alım Baskısı Puanı" />
            </Row3>
            <Row3>
              <NumInput k="volume_low_threshold" label="Düşük Hacim Eşiği (x)" step={0.1} />
              <NumInput k="volume_low_penalty" label="Düşük Hacim Cezası" />
              <NumInput k="volume_sell_pressure_penalty" label="Satış Baskısı Cezası" />
            </Row3>
          </Section>
          <Section title="📊 EMA Trend">
            <Row3>
              <NumInput k="ema_fast" label="Hızlı EMA" desc="Varsayılan: 20" />
              <NumInput k="ema_slow" label="Yavaş EMA" desc="Varsayılan: 50" />
              <NumInput k="ema_long" label="Uzun EMA" desc="Varsayılan: 200" />
            </Row3>
            <Row3>
              <NumInput k="ema_golden_cross_score" label="Golden Cross Puanı" />
              <NumInput k="ema_strong_up_score" label="Güçlü Yükseliş Puanı" />
              <NumInput k="ema_up_score" label="Yükseliş Puanı" />
            </Row3>
            <Row3>
              <NumInput k="ema_death_cross_penalty" label="Death Cross Cezası" />
              <NumInput k="ema_strong_down_penalty" label="Güçlü Düşüş Cezası" />
              <NumInput k="ema_down_penalty" label="Düşüş Cezası" />
            </Row3>
            <Row2>
              <NumInput k="ema_above_200_score" label="EMA200 Üstü Puanı" />
              <NumInput k="ema_below_200_penalty" label="EMA200 Altı Cezası" />
            </Row2>
          </Section>
          <Section title="📊 Destek / Direnç">
            <Row3>
              <NumInput k="sr_lookback" label="Bakış Periyotu" desc="Kaç mum geriye" />
              <NumInput k="sr_very_near_support_score" label="Çok Yakın Destek Puanı" />
              <NumInput k="sr_near_support_score" label="Yakın Destek Puanı" />
            </Row3>
            <Row3>
              <NumInput k="sr_resistance_broken_score" label="Direnç Kırılma Puanı" />
              <NumInput k="sr_near_resistance_penalty" label="Yakın Direnç Cezası" />
              <NumInput k="sr_support_broken_penalty" label="Destek Kırılma Cezası" />
            </Row3>
          </Section>
          <Section title="🕯️ Mum Yapıları">
            <Row3>
              <NumInput k="pattern_hammer_score" label="Hammer Puanı" />
              <NumInput k="pattern_bullish_engulfing_score" label="Bullish Engulfing Puanı" />
              <NumInput k="pattern_doji_score" label="Doji Puanı" />
            </Row3>
            <Row2>
              <NumInput k="pattern_shooting_star_penalty" label="Shooting Star Cezası" />
              <NumInput k="pattern_bearish_engulfing_penalty" label="Bearish Engulfing Cezası" />
            </Row2>
          </Section>
          <Section title="📊 Trend Çizgisi">
            <Row3>
              <NumInput k="trend_lookback" label="Bakış Periyotu" />
              <NumInput k="trend_uptrend_score" label="Yükseliş Trendi Puanı" />
              <NumInput k="trend_downtrend_penalty" label="Düşüş Trendi Cezası" />
            </Row3>
          </Section>
        </div>
      )}

      {tab === 'Risk Yönetimi' && (
        <div>
          <Section title="💰 İşlem Parametreleri">
            <Row2>
              <NumInput k="trade_amount_usdt" label="İşlem Başı Miktar (USDT)" />
              <NumInput k="max_open_positions" label="Max Açık Pozisyon" />
            </Row2>
          </Section>
          <Section title="🎯 Kar / Zarar Hedefleri">
            <Row2>
              <NumInput k="stop_loss_percent" label="Stop Loss (%)" step={0.1} />
              <NumInput k="take_profit_percent" label="Take Profit (%)" step={0.1} />
            </Row2>
            <Row2>
              <NumInput k="time_stop_minutes" label="Zaman Stop (dakika)" desc="0 = kapalı" />
              <NumInput k="trailing_stop_percent" label="Trailing Stop (%)" desc="0 = kapalı" step={0.1} />
            </Row2>
          </Section>
          <Section title="⚖️ Risk Kontrol">
            <Row2>
              <NumInput k="max_daily_loss_percent" label="Max Günlük Zarar (%)" step={0.1} />
              <NumInput k="max_daily_trades" label="Max Günlük İşlem" />
            </Row2>
            <Row2>
              <NumInput k="min_usdt_balance" label="Min USDT Bakiye" desc="Bu altında işlem yapma" />
            </Row2>
          </Section>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save} style={{ padding: '12px 32px', fontSize: 15 }}>
          {saved ? '✓ Kaydedildi' : '💾 Ayarları Kaydet'}
        </button>
      </div>
    </div>
  );
}
