const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.use(isAuthenticated);

router.put('/', (req, res) => {
  const userId = req.session.user.id;
  const { name, email, avatar } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const emailLower = (email || '').toLowerCase().trim();
  if (emailLower) {
    const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(emailLower, userId);
    if (dup) return res.status(409).json({ error: 'Este email já está em uso.' });
  }
  db.prepare('UPDATE users SET name=?, email=?, avatar=? WHERE id=?').run(name, emailLower, avatar || '', userId);
  req.session.user = { id: userId, name, email: emailLower, avatar: avatar || '', role: req.session.user.role };
  res.json({ user: req.session.user });
});

router.post('/password', (req, res) => {
  const userId = req.session.user.id;
  const { current, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!bcrypt.compareSync(current, user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), userId);
  res.json({ ok: true });
});

router.post('/delete', (req, res) => {
  const userId = req.session.user.id;
  const { password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;