const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const gamify = require('../services/gamify');
const { todayStr, parseISODateToStr } = require('../services/format');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const rows = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? ORDER BY id').all(userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { type, description, amount, frequency, due_day, account_id, category, start_date, end_date } = req.body;
  if (!type || !description || !amount || !frequency) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  const used = db.prepare('SELECT COUNT(*) c FROM recurring_transactions WHERE user_id = ?').get(userId).c;
  if (!plans.can(userId, 'recurring', used)) {
    return res.status(403).json({ error: 'Limite de recorrentes do plano atingido.', code: 'PLAN_LIMIT' });
  }
  const result = db.prepare(
    'INSERT INTO recurring_transactions (user_id, type, description, amount, frequency, due_day, account_id, category, start_date, end_date) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(userId, type, description, amount, frequency, due_day || 1, account_id || null, category || 'other', start_date || todayStr(), end_date || null);
  const r = db.prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(result.lastInsertRowid);
  gamify.evaluateAchievements(userId);
  res.status(201).json(r);
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { type, description, amount, frequency, due_day, account_id, category, start_date, end_date, active } = req.body;
  const existing = db.prepare('SELECT * FROM recurring_transactions WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Recorrente não encontrado.' });
  db.prepare('UPDATE recurring_transactions SET type=?, description=?, amount=?, frequency=?, due_day=?, account_id=?, category=?, start_date=?, end_date=?, active=? WHERE id=? AND user_id=?')
    .run(type, description, amount, frequency, due_day || 1, account_id || null, category || 'other', start_date, end_date, active === undefined ? 1 : (active ? 1 : 0), id, userId);
  res.json(db.prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Recorrente não encontrado.' });
  res.json({ ok: true });
});

router.post('/generate', (req, res) => {
  const userId = req.session.user.id;
  const today = todayStr();
  const rows = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND active = 1').all(userId);
  let generated = 0;
  rows.forEach(r => {
    if (r.end_date && r.end_date < today) return;
    let dueStr = null;
    if (r.frequency === 'monthly') {
      const day = Math.min(r.due_day || 1, 28);
      const yy = +today.slice(0, 4), mm = +today.slice(5, 7);
      const target = `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (target === today) dueStr = target;
    } else if (r.frequency === 'daily') {
      dueStr = today;
    }
    if (dueStr && (!r.last_generated || r.last_generated < dueStr)) {
      db.prepare('INSERT INTO transactions (user_id, type, description, amount, date, category, account_id, recurring_id, source) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(userId, r.type, r.description, r.amount, dueStr, r.category, r.account_id, r.id, 'recurring');
      db.prepare('UPDATE recurring_transactions SET last_generated = ? WHERE id = ?').run(dueStr, r.id);
      generated++;
    }
  });
  if (generated > 0) gamify.touchStreak(userId);
  res.json({ generated });
});

module.exports = router;