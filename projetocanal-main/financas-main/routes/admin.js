const express = require('express');
const db = require('../database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const staticData = require('../services/static-data');
const intelligence = require('../services/intelligence');
const { monthStr } = require('../services/format');
const router = express.Router();

router.use(isAuthenticated, isAdmin);

function metrics() {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const newMonth = db.prepare('SELECT COUNT(*) c FROM users WHERE substr(created_at,1,7) = ?').get(monthStr()).c;
  const proUsers = db.prepare('SELECT COUNT(*) c FROM users WHERE plan_code != ?').get('free').c;
  const trialUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE plan_code = ? AND trial_end >= date('now','localtime') AND trial_start IS NOT NULL").get('free').c;
  const churned = db.prepare("SELECT COUNT(*) c FROM users WHERE plan_code = 'free' AND trial_end < date('now','localtime') AND trial_start IS NOT NULL").get().c;
  const totalTrial = db.prepare("SELECT COUNT(*) c FROM users WHERE trial_start IS NOT NULL").get().c;
  const conversionRate = totalTrial > 0 ? Math.round((proUsers / totalTrial) * 100) : 0;
  const churnRate = totalTrial > 0 ? Math.round((churned / totalTrial) * 100) : 0;

  const mrr = db.prepare('SELECT COALESCE(SUM(price_monthly),0) s FROM subscription_plans p WHERE p.code IN (SELECT plan_code FROM users WHERE plan_code != ?)').get('free').s;
  const transactions = db.prepare('SELECT COUNT(*) c FROM transactions').get().c;
  const families = db.prepare('SELECT COUNT(*) c FROM families').get().c;

  const signups7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    signups7.push({ date: day, count: db.prepare('SELECT COUNT(*) c FROM users WHERE date(created_at) = ?').get(day).c });
  }
  const recentUsers = db.prepare('SELECT id, name, email, plan_code, role, created_at, last_seen FROM users ORDER BY id DESC LIMIT 20').all();
  return { users, newMonth, proUsers, trialUsers, conversionRate, churnRate, mrr, transactions, families, signups7, recentUsers };
}

router.get('/dashboard', (req, res) => {
  res.json(metrics());
});

router.get('/users', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  let sql = 'SELECT id, name, email, plan_code, role, country_code, currency, created_at, last_seen, is_active FROM users';
  const params = [];
  if (q) { sql += ' WHERE name LIKE ? OR email LIKE ?'; params.push(q, q); }
  sql += ' ORDER BY id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

router.put('/users/:id', (req, res) => {
  const { id } = req.params;
  const { plan_code, role, is_active } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Utilizador não encontrado.' });
  if (req.session.user.id === Number(id) && role && role !== 'admin') {
    return res.status(400).json({ error: 'Não pode rebaixar-se a si próprio.' });
  }
  db.prepare('UPDATE users SET plan_code = COALESCE(?, plan_code), role = COALESCE(?, role), is_active = COALESCE(?, is_active) WHERE id = ?')
    .run(plan_code || null, role || null, is_active === undefined ? null : (is_active ? 1 : 0), id);
  res.json(db.prepare('SELECT id, name, email, plan_code, role, is_active FROM users WHERE id = ?').get(id));
});

router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  if (req.session.user.id === Number(id)) return res.status(400).json({ error: 'Não pode eliminar-se a si próprio.' });
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Utilizador não encontrado.' });
  res.json({ ok: true });
});

router.get('/plans', (req, res) => {
  res.json(staticData.getPlans());
});

router.put('/plans/:id', (req, res) => {
  const { id } = req.params;
  const { price_monthly, price_annual, trial_days, is_active, name, features } = req.body;
  const existing = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Plano não encontrado.' });
  db.prepare('UPDATE subscription_plans SET name = COALESCE(?, name), price_monthly = COALESCE(?, price_monthly), price_annual = COALESCE(?, price_annual), trial_days = COALESCE(?, trial_days), is_active = COALESCE(?, is_active), features = COALESCE(?, features) WHERE id = ?')
    .run(name || null, price_monthly === undefined ? null : price_monthly, price_annual === undefined ? null : price_annual, trial_days === undefined ? null : trial_days, is_active === undefined ? null : (is_active ? 1 : 0), features ? JSON.stringify(features) : null, id);
  res.json(db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id));
});

router.get('/referrals', (req, res) => {
  const rows = db.prepare(`
    SELECT rr.*, u.name as referrer_name, u.email as referrer_email
    FROM referral_rewards rr JOIN users u ON u.id = rr.referrer_id
    ORDER BY rr.id DESC LIMIT 200`).all();
  res.json(rows);
});

module.exports = router;