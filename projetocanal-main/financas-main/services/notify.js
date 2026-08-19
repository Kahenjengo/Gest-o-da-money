const db = require('../database');
const intelligence = require('./intelligence');
const { todayStr } = require('./format');

function notify(userId, type, title, message) {
  db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)').run(userId, type, title, message);
}

function generateUserNotifications(userId, user) {
  const today = todayStr();
  const m = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');

  const budgetWarnings = intelligence.getBudgetsWithSpent(userId, m)
    .filter(b => b.limit > 0 && b.pct >= (b.alert_threshold || 80));
  budgetWarnings.forEach(b => {
    const existing = db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND title LIKE ? AND date(created_at) = date('now','localtime')").get(userId, `%${b.category}%`).c;
    if (existing === 0) {
      const msg = b.pct >= 100
        ? `${b.category}: orçamento esgotado (${Math.round(b.pct)}%).`
        : `${b.category} atingiu ${Math.round(b.pct)}% do orçamento.`;
      notify(userId, b.pct >= 100 ? 'warning' : 'info', `Orçamento ${b.category}`, msg);
    }
  });

  const upcoming = intelligence.getUpcomingRecurring(userId, 7).filter(r => r.type === 'expense');
  upcoming.forEach(r => {
    const existing = db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND title = ? AND date(created_at) = date('now','localtime')").get(userId, `Recorrente ${r.description}`).c;
    if (existing === 0) notify(userId, 'reminder', `Recorrente ${r.description}`, `Vence em ${r.next}: ${r.description} (${r.amount}).`);
  });

  const debts = db.prepare('SELECT * FROM debts WHERE user_id = ?').all(userId);
  debts.forEach(d => {
    if (d.due_date === today) {
      const existing = db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND title = ? AND date(created_at) = date('now','localtime')").get(userId, `Dívida ${d.creditor}`).c;
      if (existing === 0) notify(userId, 'warning', `Dívida ${d.creditor}`, `Vence hoje! Restam ${d.original_amount - d.paid_amount}.`);
    }
  });

  if (user.trial_end && user.plan_code === 'free' && user.trial_start && user.trial_end >= today) {
    const days = Math.ceil((new Date(user.trial_end) - new Date()) / 86400000);
    if (days <= 3 && days > 0) {
      const existing = db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = ? AND date(created_at) = date('now','localtime')").get(userId, 'upgrade').c;
      if (existing === 0) notify(userId, 'upgrade', 'Trial a terminar', `O seu período de teste termina em ${days} dia(s). Faça upgrade para o Pro.`);
    }
  }
}

module.exports = { notify, generateUserNotifications };