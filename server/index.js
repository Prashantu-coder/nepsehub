const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database Setup
const db = new Database('nepse_hub.db');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trade_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    entry REAL,
    sl REAL,
    target REAL,
    date TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Watchlist Routes ---
app.get('/api/watchlist', (req, res) => {
    const stocks = db.prepare('SELECT symbol FROM watchlist').all();
    res.json(stocks.map(s => s.symbol));
});

app.post('/api/watchlist', (req, res) => {
    const { symbol } = req.body;
    try {
        db.prepare('INSERT INTO watchlist (symbol) VALUES (?)').run(symbol);
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Already in watchlist' });
    }
});

app.delete('/api/watchlist/:symbol', (req, res) => {
    const { symbol } = req.params;
    db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol);
    res.json({ success: true });
});

// --- Trade Plans Routes ---
app.get('/api/trade-plans', (req, res) => {
    const plans = db.prepare('SELECT * FROM trade_plans ORDER BY date DESC').all();
    res.json(plans);
});

app.post('/api/trade-plans', (req, res) => {
    const { symbol, entry, sl, target } = req.body;
    try {
        const info = db.prepare('INSERT INTO trade_plans (symbol, entry, sl, target) VALUES (?, ?, ?, ?)').run(symbol, entry, sl, target);
        res.status(201).json({ id: info.lastInsertRowid, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/trade-plans/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM trade_plans WHERE id = ?').run(id);
    res.json({ success: true });
});

app.listen(port, () => {
    console.log(`NEPSE Hub Backend running at http://localhost:${port}`);
});
