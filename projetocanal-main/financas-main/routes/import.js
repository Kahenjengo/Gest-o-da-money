const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const exporter = require('../services/export');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

const DATE_PATTERNS = [/date/i, /data/i, /dia/i, /venc/i];
const DESC_PATTERNS = [/desc/i, /descri/i, /nome/i, /name/i, /detail/i, /merchant/i];
const AMOUNT_PATTERNS = [/amount/i, /valor/i, /montante/i, /price/i, /total/i, /preco/i, /préço/i];
const TYPE_PATTERNS = [/type/i, /tipo/i, /category/i, /categoria/i, /cat/i];
const NEGATIVE = /negative/i;

function guessColumns(header) {
  const map = { date: null, description: null, amount: null, type: null, category: null, negative: false };
  header.forEach((h, i) => {
    const s = String(h);
    if (!map.date && DATE_PATTERNS.some(r => r.test(s))) map.date = i;
    else if (!map.description && DESC_PATTERNS.some(r => r.test(s))) map.description = i;
    else if (!map.amount && AMOUNT_PATTERNS.some(r => r.test(s))) map.amount = i;
    else if (!map.type && TYPE_PATTERNS.some(r => r.test(s))) map.type = i;
    if (NEGATIVE.test(s)) map.negative = true;
  });
  return map;
}

function normalizeDate(v) {
  const s = String(v || '').trim();
  if (!s) return new Date().toISOString().slice(0, 10);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    let yy = m[3]; if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  m = /^(\d{1,2})-(\d{1,2})-(\d{2,4})/.exec(s);
  if (m) {
    let yy = m[3]; if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  if (!plans.can(userId, 'import')) {
    return res.status(403).json({ error: 'Importação disponível no plano Pro.', code: 'PLAN_LIMIT' });
  }
  const { fileName, fileType, base64, mapping } = req.body;
  if (!base64 || !fileType) return res.status(400).json({ error: 'Ficheiro não enviado.' });

  const buffer = Buffer.from(base64, 'base64');
  const rows = exporter.parseFileToRows(buffer, fileType);
  if (!rows.length) return res.status(400).json({ error: 'Ficheiro vazio ou ilegível.' });

  const header = rows[0].map(h => String(h).trim());
  const data = rows.slice(1);

  if (!mapping) {
    const guess = guessColumns(header);
    const columns = header.map((h, i) => ({ index: i, label: h }));
    return res.json({ preview: true, columns, header, guessed: guess, sample: data.slice(0, 5), total: data.length });
  }

  const { date, description, amount, type, category, defaultType, negative } = mapping;
  const insert = db.prepare('INSERT INTO transactions (user_id, type, description, amount, date, category, note, source) VALUES (?,?,?,?,?,?,?,?)');
  const tx = db.begin();
  let imported = 0;
  try {
    data.forEach(row => {
      const desc = row[description];
      if (desc === undefined || desc === null || String(desc).trim() === '') return;
      let amt = parseFloat(String(row[amount] || '').replace(/[^\d.,-]/g, '').replace(',', '.'));
      if (isNaN(amt) || amt === 0) return;
      const isNegative = negative !== undefined ? row[negative] : (amt < 0);
      const t = type !== undefined && row[type] ? String(row[type]).toLowerCase().includes('in') ? 'income' : 'expense' : (defaultType || (amt < 0 ? 'expense' : 'income'));
      const cat = type !== undefined && row[category] !== undefined && row[category] !== null && String(row[category]).trim() ? String(row[category]).trim() : 'Outros';
      insert.run(userId, t, String(desc).trim(), Math.abs(amt), normalizeDate(row[date]), cat, '', 'import');
      imported++;
    });
    tx.commit();
  } catch (e) {
    tx.rollback();
    return res.status(500).json({ error: 'Falha ao importar: ' + e.message });
  }

  db.prepare('INSERT INTO imported_files (user_id, file_name, rows_imported, total_rows) VALUES (?,?,?,?)')
    .run(userId, fileName || 'import', imported, data.length);
  gamify.evaluateAchievements(userId);
  res.json({ ok: true, imported, total: data.length });
});

module.exports = router;