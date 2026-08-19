const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const debts = db.prepare('SELECT * FROM debts WHERE user_id = ? ORDER BY due_date').all(userId).map(d => ({
    ...d,
    remaining: Math.max(0, d.original_amount - d.paid_amount),
    pct: d.original_amount > 0 ? Math.min(100, Math.round((d.paid_amount / d.original_amount) * 100)) : 0
  }));
  const totalRemaining = debts.reduce((s, d) => s + d.remaining, 0);
  res.json({ debts, totalRemaining });
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { creditor, original_amount, paid_amount, interest_rate, due_date, installments, installment_amount, frequency, notes } = req.body;
  if (!creditor || !original_amount || !due_date) return res.status(400).json({ error: 'Credor, valor e vencimento são obrigatórios.' });
  const result = db.prepare(
    'INSERT INTO debts (user_id, creditor, original_amount, paid_amount, interest_rate, due_date, installments, installment_amount, frequency, notes) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(userId, creditor, original_amount, paid_amount || 0, interest_rate || 0, due_date, installments || 0, installment_amount || 0, frequency || 'monthly', notes || '');
  res.status(201).json(db.prepare('SELECT * FROM debts WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { creditor, original_amount, paid_amount, interest_rate, due_date, installments, installment_amount, frequency, notes } = req.body;
  const existing = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Dívida não encontrada.' });
  db.prepare('UPDATE debts SET creditor=?, original_amount=?, paid_amount=?, interest_rate=?, due_date=?, installments=?, installment_amount=?, frequency=?, notes=? WHERE id=? AND user_id=?')
    .run(creditor, original_amount, paid_amount || 0, interest_rate || 0, due_date, installments || 0, installment_amount || 0, frequency || 'monthly', notes || '', id, userId);
  res.json(db.prepare('SELECT * FROM debts WHERE id = ?').get(id));
});

router.post('/:id/pay', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { amount } = req.body;
  const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(id, userId);
  if (!debt) return res.status(404).json({ error: 'Dívida não encontrada.' });
  const n = Number(amount) || 0;
  const paid = Math.min(debt.original_amount, debt.paid_amount + n);
  db.prepare('UPDATE debts SET paid_amount = ? WHERE id = ?').run(paid, id);
  if (paid >= debt.original_amount) gamify.evaluateAchievements(userId);
  db.prepare('INSERT INTO transactions (user_id, type, description, amount, date, category, note, source) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, 'expense', `Pagamento dívida: ${debt.creditor}`, n, new Date().toISOString().slice(0, 10), 'Dívidas', '', 'debt');
  res.json(db.prepare('SELECT * FROM debts WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM debts WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Dívida não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;