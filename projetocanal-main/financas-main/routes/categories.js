const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const staticData = require('../services/static-data');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const type = req.query.type;
  const categories = type ? staticData.getCategories(userId, type) : staticData.getCategories(userId);
  res.json(categories);
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const { type, name, icon, color } = req.body;
  if (!type || !name) return res.status(400).json({ error: 'Tipo e nome são obrigatórios.' });
  const used = db.prepare('SELECT COUNT(*) c FROM categories WHERE user_id = ?').get(userId).c;
  if (!plans.can(userId, 'categories', used)) {
    return res.status(403).json({ error: 'Limite de categorias do plano atingido.', code: 'PLAN_LIMIT' });
  }
  try {
    const result = db.prepare('INSERT INTO categories (user_id, type, name, icon, color) VALUES (?,?,?,?,?)')
      .run(userId, type, name, icon || '🏷️', color || '#6c63ff');
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(cat);
  } catch (e) {
    res.status(409).json({ error: 'Categoria já existe.' });
  }
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { name, icon, color } = req.body;
  const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Categoria não encontrada.' });
  db.prepare('UPDATE categories SET name=?, icon=?, color=? WHERE id=? AND user_id=?').run(name, icon, color, id, userId);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Categoria não encontrada.' });
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, userId);
  res.json({ ok: true });
});

module.exports = router;