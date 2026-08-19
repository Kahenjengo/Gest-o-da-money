const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const notify = require('../services/notify');
const router = express.Router();

router.use(isAuthenticated);

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  notify.generateUserNotifications(userId, user);
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50').all(userId);
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0').get(userId).c;
  res.json({ notifications, unread });
});

router.post('/read', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.body;
  if (id) {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?').run(userId, id);
  } else {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  db.prepare('DELETE FROM notifications WHERE user_id = ? AND id = ?').run(userId, id);
  res.json({ ok: true });
});

module.exports = router;