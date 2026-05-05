import React from 'react';

function CodeEditor() {
  return (
    <div style={{maxWidth:600, padding:'32px 20px', margin:'0 auto'}}>
      <h1 style={{fontSize:22, fontWeight:700, marginBottom:4, color:'#f1f5f9'}}>Kod Editoru</h1>
      <p style={{color:'#64748b', marginBottom:30, fontSize:13}}>
        Bot kodlarini buradan goruntuleyebilirsiniz.
      </p>
      <div style={{background:'#0d1321', border:'1px solid #1a2540', borderRadius:14, padding:30, textAlign:'center', color:'#64748b'}}>
        📝 Kod editoru yapim asamasinda.
      </div>
    </div>
  );
}

export default CodeEditor;
