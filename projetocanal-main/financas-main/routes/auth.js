const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const staticData = require('../services/static-data');
const plans = require('../services/plans');
const gamify = require('../services/gamify');
const { notify } = require('../services/notify');
const { todayStr } = require('../services/format');
const router = express.Router();

const attempts = {};
function rateLimited(key) {
  const now = Date.now();
  if (!attempts[key]) attempts[key] = { count: 0, reset: now + 600000 };
  const a = attempts[key];
  if (now > a.reset) { a.count = 0; a.reset = now + 600000; }
  a.count++;
  return a.count > 10;
}

function genReferralCode(name) {
  const base = (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'user';
  return base + Math.random().toString(36).slice(2, 6);
}

router.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }
  if (rateLimited('login:' + email.toLowerCase())) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email ou senha incorretos.' });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'Conta desativada.' });
  }

  req.session.user = { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role };
  const sid = req.sessionID || '';
  db.prepare('INSERT OR IGNORE INTO user_sessions (user_id, sid, ua, ip) VALUES (?,?,?,?)').run(
    user.id, sid, req.headers['user-agent'] || '', req.ip || ''
  );
  db.prepare('UPDATE user_sessions SET current = 0 WHERE user_id = ?').run(user.id);
  db.prepare('UPDATE user_sessions SET current = 1 WHERE user_id = ? AND sid = ?').run(user.id, sid);
  db.prepare("UPDATE users SET last_seen = datetime('now','localtime') WHERE id = ?").run(user.id);
  gamify.touchStreak(user.id);
  res.json({ user: req.session.user });
});

router.post('/api/auth/register', (req, res) => {
  const { name, email, password, referralCode } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  if (name.length < 2) return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' });
  if (rateLimited('register:' + (email || '').toLowerCase())) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  }

  const emailLower = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower);
  if (existing) return res.status(409).json({ error: 'Este email já está cadastrado.' });

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name, email, password_hash, referral_code) VALUES (?, ?, ?, ?)').run(
    name.trim(), emailLower, password_hash, genReferralCode(name)
  );
  const userId = result.lastInsertRowid;

  if (referralCode) {
    const referrer = db.prepare('SELECT * FROM users WHERE referral_code = ?').get(referralCode);
    if (referrer) {
      db.prepare('INSERT INTO referral_rewards (referrer_id, referred_email, referred_name, status) VALUES (?,?,?,?)').run(
        referrer.id, emailLower, name.trim(), 'pending'
      );
      db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referralCode, userId);
    }
  }

  plans.startTrial(userId, 7);
  gamify.unlockAchievement(userId, 'welcome');

  req.session.user = { id: userId, name: name.trim(), email: emailLower, avatar: '', role: 'member' };
  res.status(201).json({ user: req.session.user });
});

router.post('/api/auth/logout', (req, res) => {
  const sid = req.sessionID || '';
  if (req.session.user) db.prepare('UPDATE user_sessions SET current = 0 WHERE user_id = ? AND sid = ?').run(req.session.user.id, sid);
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(401).json({ error: 'Não autenticado' });
  const plan = plans.getEffectivePlan(user.id);
  const trialActive = plans.isTrialActive(user.id);
  const remaining = plans.getEffectivePlan(user.id).features;
  res.json({
    user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role },
    plan: {
      code: plan.code, label: plan.label, trialActive,
      trialDaysLeft: trialActive ? Math.max(0, Math.ceil((new Date(user.trial_end) - new Date()) / 86400000)) : 0,
      features: remaining
    },
    settings: {
      country_code: user.country_code, currency: user.currency, language: user.language,
      date_format: user.date_format, timezone: user.timezone, month_start_day: user.month_start_day,
      onboarded: user.onboarded, onboarding_step: user.onboarding_step, two_fa_enabled: user.two_fa_enabled
    },
    streak: user.streak,
    countries: staticData.getCountries(),
    currencies: staticData.getCurrencies()
  });
});

router.post('/api/auth/twofa/toggle', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  const enabled = req.body.enabled ? 1 : 0;
  db.prepare('UPDATE users SET two_fa_enabled = ? WHERE id = ?').run(enabled, req.session.user.id);
  res.json({ enabled: !!enabled });
});

router.get('/api/auth/sessions', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  const sessions = db.prepare('SELECT id, ua, ip, created_at, last_seen, current FROM user_sessions WHERE user_id = ? ORDER BY current DESC, last_seen DESC').all(req.session.user.id);
  res.json(sessions);
});

router.post('/api/auth/sessions/revoke', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  const { sid } = req.body;
  db.prepare('DELETE FROM user_sessions WHERE user_id = ? AND sid = ?').run(req.session.user.id, sid || '');
  res.json({ ok: true });
});

module.exports = router;