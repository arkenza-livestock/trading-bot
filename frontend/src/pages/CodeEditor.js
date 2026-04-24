import React, { useState, useEffect } from 'react';
import axios from 'axios';

const FILES = [
  { id: 'engine', name: 'engine.js', desc: 'Ana döngü — tarama, sinyal kaydetme, alım/satım' },
  { id: 'analysis', name: 'analysis.js', desc: 'Teknik analiz — RSI, MACD, Bollinger, OBV, S/R' },
  { id: 'binance', name: 'binance.js', desc: 'Binance API — emir açma/kapama, bakiye' }
];

export default function CodeEditor({ api }) {
  const [activeFile, setActiveFile] = useState('engine');
  const [codes, setCodes] = useState({ engine: '', analysis: '', binance: '' });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          FILES.map(f => axios.get(`${api}/api/code/${f.id}`))
        );
        const newCodes = {};
        FILES.forEach((f, i) => { newCodes[f.id] = results[i].data.content; });
        setCodes(newCodes);
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    loadAll();
  }, [api]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.post(`${api}/api/code/${activeFile}`, { content: codes[activeFile] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert('Hata: ' + err.message); }
    setSaving(false);
  };

  const activeFileMeta = FILES.find(f => f.id === activeFile);

  return (
    <div style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Kod Editörü</div>
          <div className="page-sub">Dosyaları düzenle ve kaydet — sistem otomatik yeniden başlar</div>
        </div>
        <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save} disabled={saving} style={{ padding: '10px 24px' }}>
          {saving ? '⏳ Kaydediliyor...' : saved ? '✓ Kaydedildi' : '💾 Kaydet & Uygula'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '1px solid #1e2736' }}>
        {FILES.map(f => (
          <button key={f.id} onClick={() => setActiveFile(f.id)}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              borderBottom: activeFile === f.id ? '2px solid #60a5fa' : '2px solid transparent',
              background: activeFile === f.id ? '#0d1a2d' : 'transparent',
              color: activeFile === f.id ? '#60a5fa' : '#718096',
              transition: 'all 0.15s'
            }}>
            📄 {f.name}
          </button>
        ))}
      </div>

      <div style={{ background: '#0d1a2d', padding: '8px 16px', fontSize: 12, color: '#718096', borderBottom: '1px solid #1e2736' }}>
        {activeFileMeta?.desc}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#718096' }}>
          Yükleniyor...
        </div>
      ) : (
        <textarea
          value={codes[activeFile] || ''}
          onChange={e => setCodes(prev => ({ ...prev, [activeFile]: e.target.value }))}
          style={{
            flex: 1, width: '100%', padding: '16px',
            background: '#0a0e1a', border: 'none',
            color: '#e2e8f0',
            fontFamily: "'Fira Code', 'Consolas', monospace",
            fontSize: 13, lineHeight: 1.6,
            resize: 'none', outline: 'none', tabSize: 2
          }}
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const start = e.target.selectionStart;
              const end = e.target.selectionEnd;
              const newValue = codes[activeFile].substring(0, start) + '  ' + codes[activeFile].substring(end);
              setCodes(prev => ({ ...prev, [activeFile]: newValue }));
              setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 2; }, 0);
            }
          }}
          spellCheck={false}
        />
      )}

      <div style={{ background: '#0d1117', padding: '6px 16px', borderTop: '1px solid #1e2736', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4a5568' }}>
        <span>backend/src/{activeFileMeta?.name}</span>
        <span>{(codes[activeFile] || '').split('\n').length} satır</span>
      </div>
    </div>
  );
}
