const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const intelligence = require('../services/intelligence');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const accounts = intelligence.getAccountsWithBalance(userId);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  res.json({ accounts, total });
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { name, type, initial_balance, currency, institution, description } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nome e tipo são obrigatórios.' });
  const used = db.prepare('SELECT COUNT(*) c FROM accounts WHERE user_id = ?').get(userId).c;
  if (!plans.can(userId, 'accounts', used)) {
    return res.status(403).json({ error: 'Limite de contas do plano atingido. Faça upgrade para o Pro.', code: 'PLAN_LIMIT' });
  }
  const result = db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance, currency, institution, description) VALUES (?,?,?,?,?,?,?)')
    .run(userId, name, type, Number(initial_balance) || 0, currency || 'AOA', institution || '', description || '');
  const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  gamify.evaluateAchievements(userId);
  res.status(201).json({ ...acc, balance: intelligence.getAccountBalance(acc) });
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { name, type, initial_balance, currency, institution, description, is_active } = req.body;
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada.' });
  db.prepare('UPDATE accounts SET name=?, type=?, initial_balance=?, currency=?, institution=?, description=?, is_active=? WHERE id=? AND user_id=?')
    .run(name, type, Number(initial_balance) || 0, currency || 'AOA', institution || '', description || '', is_active === undefined ? 1 : (is_active ? 1 : 0), id, userId);
  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json({ ...updated, balance: intelligence.getAccountBalance(updated) });
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const result = db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Conta não encontrada.' });
  db.prepare('UPDATE transactions SET account_id = NULL WHERE user_id = ? AND account_id = ?').run(userId, id);
  res.json({ ok: true });
});

module.exports = router;