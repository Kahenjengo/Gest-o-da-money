const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const plans = require('../services/plans');
const gamify = require('../services/gamify');
const router = express.Router();

router.use(isAuthenticated);

function familyView(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user.family_id) return { family: null, members: [], invited: [] };
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(user.family_id);
  const members = db.prepare(`
    SELECT fm.id, fm.role, fm.status, fm.user_id, fm.email, u.name, u.email as user_email, u.avatar
    FROM family_members fm LEFT JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ? ORDER BY fm.status = 'active' DESC, fm.id
  `).all(family.id);
  return { family, members, invited: members.filter(m => m.status === 'pending') };
}

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  if (!plans.can(userId, 'family')) {
    return res.status(403).json({ error: 'Família disponível no plano Família.', code: 'PLAN_LIMIT' });
  }
  res.json(familyView(userId));
});

router.post('/create', (req, res) => {
  const userId = req.session.user.id;
  const { name } = req.body;
  if (!plans.can(userId, 'family')) {
    return res.status(403).json({ error: 'Família disponível no plano Família.', code: 'PLAN_LIMIT' });
  }
  const existing = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId).family_id;
  if (existing) return res.status(409).json({ error: 'Já pertence a uma família.' });

  const result = db.prepare('INSERT INTO families (owner_id, name) VALUES (?,?)').run(userId, name || 'Minha Família');
  const familyId = result.lastInsertRowid;
  db.prepare('UPDATE users SET family_id = ?, family_role = ? WHERE id = ?').run(familyId, 'admin', userId);
  db.prepare('INSERT INTO family_members (family_id, user_id, role, status) VALUES (?,?,?,?)').run(familyId, userId, 'admin', 'active');
  gamify.evaluateAchievements(userId);
  res.status(201).json(familyView(userId));
});

router.post('/invite', (req, res) => {
  const userId = req.session.user.id;
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user.family_id) return res.status(400).json({ error: 'Crie uma família primeiro.' });
  const feats = plans.getEffectivePlan(userId).features;
  const activeCount = db.prepare('SELECT COUNT(*) c FROM family_members WHERE family_id = ? AND status = ?').get(user.family_id, 'active').c;
  const upTo = feats.up_to_members || 6;
  if (activeCount >= upTo) return res.status(403).json({ error: `Máximo de ${upTo} membros ativos no seu plano.` });

  const existing = db.prepare('SELECT * FROM family_members WHERE family_id = ? AND email = ?').get(user.family_id, email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Este email já foi convidado.' });
  db.prepare('INSERT INTO family_members (family_id, email, role, status) VALUES (?,?,?,?)')
    .run(user.family_id, email.toLowerCase().trim(), role || 'member', 'pending');
  res.status(201).json(familyView(userId));
});

router.post('/join', (req, res) => {
  const userId = req.session.user.id;
  const { inviteCode } = req.body;
  if (!inviteCode) return res.status(400).json({ error: 'Código de convite obrigatório.' });
  const fm = db.prepare('SELECT * FROM family_members WHERE id = ? OR email = ?').get(inviteCode, inviteCode);
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  if (!fm) return res.status(404).json({ error: 'Convite inválido.' });
  if (fm.status !== 'pending') return res.status(409).json({ error: 'Convite já utilizado.' });
  if (fm.email && fm.email !== user.email) return res.status(403).json({ error: 'Este convite não é para o seu email.' });

  db.prepare('UPDATE family_members SET user_id = ?, status = ? WHERE id = ?').run(userId, 'active', fm.id);
  db.prepare('UPDATE users SET family_id = ?, family_role = ? WHERE id = ?').run(fm.family_id, fm.role || 'member', userId);
  const fam = db.prepare('SELECT * FROM families WHERE id = ?').get(fm.family_id);
  if (fam) db.prepare('UPDATE families SET owner_id = COALESCE(owner_id, ?) WHERE id = ?').run(userId, fam.id);
  gamify.evaluateAchievements(userId);
  res.json({ ok: true, familyId: fm.family_id });
});

router.delete('/:memberId', (req, res) => {
  const userId = req.session.user.id;
  const { memberId } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const fm = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(memberId, user.family_id);
  if (!fm) return res.status(404).json({ error: 'Membro não encontrado.' });
  if (fm.user_id === user.id) return res.status(400).json({ error: 'Não pode remover-se a si próprio.' });
  if (fm.user_id) db.prepare('UPDATE users SET family_id = NULL, family_role = ? WHERE id = ?').run('owner', fm.user_id);
  db.prepare('DELETE FROM family_members WHERE id = ?').run(memberId);
  res.json(familyView(userId));
});

module.exports = router;