// ── SİMÜLASYON ───────────────────────────────────────────
const simulation = require('./src/simulation');

app.get('/api/simulation/stats', (req, res) => {
  try { res.json(simulation.getStats()); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/simulation/positions', (req, res) => {
  try {
    const all = db.prepare("SELECT * FROM sim_positions ORDER BY opened_at DESC LIMIT 50").all();
    res.json(all);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/simulation/reset', (req, res) => {
  try {
    const { balance=1000 } = req.body;
    simulation.reset(parseFloat(balance));
    res.json({ success:true, balance });
  } catch(e) { res.status(500).json({ error:e.message }); }
});
