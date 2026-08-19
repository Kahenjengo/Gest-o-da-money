const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

function withMeta(tx) {
  const acc = tx.account_id ? db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(tx.account_id) : null;
  const mem = tx.member_id ? db.prepare('SELECT id, name FROM members WHERE id = ?').get(tx.member_id) : null;
  return { ...tx, account: acc ? { id: acc.id, name: acc.name } : null, member: mem ? { id: mem.id, name: mem.name } : null };
}

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const { type, category, month, q, limit, offset, account } = req.query;
  let sql = 'SELECT * FROM transactions WHERE user_id = ? AND is_transfer = 0';
  const params = [userId];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (month) { sql += ' AND date LIKE ?'; params.push(month + '-%'); }
  if (account) { sql += ' AND account_id = ?'; params.push(account); }
  if (q) { sql += ' AND (description LIKE ? OR note LIKE ?)'; params.push('%' + q + '%', '%' + q + '%'); }
  sql += ' ORDER BY date DESC, id DESC';
  const limitN = parseInt(limit) || 500;
  const off = parseInt(offset) || 0;
  const rows = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, limitN, off);
  res.json(rows.map(withMeta));
});

router.get('/stats', (req, res) => {
  const userId = req.session.user.id;
  const { month } = req.query;
  const prefix = (month || new Date().toISOString().slice(0, 7)) + '-%';
  const income = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type='income' AND is_transfer = 0 AND date LIKE ?").get(userId, prefix).s;
  const expense = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type='expense' AND is_transfer = 0 AND date LIKE ?").get(userId, prefix).s;
  const count = db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = ? AND is_transfer = 0 AND date LIKE ?').get(userId, prefix).c;
  res.json({ income, expense, balance: income - expense, count });
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { type, description, amount, date, category, note, account_id, member_id, recurring_id, source } = req.body;
  if (!type || !description || !amount || !date || !category) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }
  const result = db.prepare(
    `INSERT INTO transactions (user_id, type, description, amount, date, category, note, account_id, member_id, recurring_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, type, description, amount, date, category, note || '', account_id || null, member_id || null, recurring_id || null, source || 'manual');
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  gamify.touchStreak(userId);
  gamify.evaluateAchievements(userId);
  res.status(201).json(withMeta(tx));
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { type, description, amount, date, category, note, account_id, member_id } = req.body;
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Transação não encontrada.' });

  db.prepare(
    `UPDATE transactions SET type=?, description=?, amount=?, date=?, category=?, note=?, account_id=?, member_id=?, updated_at=datetime('now','localtime') WHERE id=? AND user_id=?`
  ).run(type, description, amount, date, category, note || '', account_id || null, member_id || null, id, userId);
  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.json(withMeta(updated));
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Transação não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;