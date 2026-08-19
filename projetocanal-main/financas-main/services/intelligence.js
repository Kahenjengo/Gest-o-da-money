const db = require('../database');
const { todayStr, monthStr, daysUntil, daysInMonth, formatMoney, getCurrencyInfo } = require('./format');

function getAccountBalance(account) {
  const inc = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND account_id = ? AND type = ? AND is_transfer = 0').get(account.user_id, account.id, 'income').s;
  const exp = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND account_id = ? AND type = ? AND is_transfer = 0').get(account.user_id, account.id, 'expense').s;
  const inT = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE user_id = ? AND to_account = ?').get(account.user_id, account.id).s;
  const outT = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE user_id = ? AND from_account = ?').get(account.user_id, account.id).s;
  return (account.initial_balance || 0) + inc - exp + inT - outT;
}

function getAccountsWithBalance(userId) {
  return db.prepare('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 ORDER BY id').all(userId).map(a => ({
    ...a,
    balance: getAccountBalance(a)
  }));
}

function getTotalBalance(userId, currency) {
  const accts = getAccountsWithBalance(userId);
  return accts.reduce((s, a) => s + (a.currency === currency ? a.balance : a.balance), 0);
}

function monthTotals(userId, month) {
  const m = month || monthStr();
  const prefix = m + '-';
  const inc = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = 'income' AND is_transfer = 0 AND date LIKE ?").get(userId, prefix + '%').s;
  const exp = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = 'expense' AND is_transfer = 0 AND date LIKE ?").get(userId, prefix + '%').s;
  return { income: inc, expense: exp, balance: inc - exp };
}

function monthTotalsByCategory(userId, month, type) {
  const m = month || monthStr();
  const rows = db.prepare('SELECT category, COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = ? AND is_transfer = 0 AND date LIKE ? GROUP BY category ORDER BY s DESC').all(userId, type, m + '-%');
  return rows;
}

function getBudgetsWithSpent(userId, month) {
  const m = month || monthStr();
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND (month IS NULL OR month = ?)').all(userId, m);
  return budgets.map(b => {
    const spent = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND type = ? AND is_transfer = 0 AND category = ? AND date LIKE ?').get(userId, 'expense', b.category, m + '-%').s;
    const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;
    return { ...b, spent, pct };
  });
}

function getProjectedIncome(userId) {
  const r = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND type = ? AND active = 1').all(userId, 'income');
  return r.reduce((s, x) => s + x.amount, 0);
}

function getProjectedExpenses(userId) {
  const r = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND type = ? AND active = 1').all(userId, 'expense');
  return r.reduce((s, x) => s + x.amount, 0);
}

function getUpcomingRecurring(userId, days) {
  const today = todayStr();
  const d = new Date(); d.setDate(d.getDate() + (days || 30));
  const until = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND active = 1').all(userId);
  const out = [];
  rows.forEach(r => {
    if (r.end_date && r.end_date < today) return;
    let next = null;
    if (r.frequency === 'monthly') {
      const yy = today.slice(0, 4), mm = today.slice(5, 7);
      const day = Math.min(r.due_day || 1, 28);
      const thisM = `${yy}-${mm}-${String(day).padStart(2, '0')}`;
      next = thisM >= today ? thisM : null;
      if (!next) {
        const nd = new Date(+yy, +mm, day);
        next = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
      }
    } else if (r.frequency === 'weekly') {
      const base = new Date(); base.setDate(base.getDate() + ((r.due_day - 1 + 7) % 7 - base.getDay() + 7) % 7);
      next = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    }
    if (next && next <= until) out.push({ ...r, next });
  });
  return out.sort((a, b) => a.next.localeCompare(b.next));
}

function spendToday(userId, user) {
  const currency = user.currency || 'AOA';
  const accts = getAccountsWithBalance(userId);
  const totalBal = accts.reduce((s, a) => s + a.balance, 0);
  const projectedIncome = getProjectedIncome(userId);
  const projectedExpense = getProjectedExpenses(userId);
  const recExpDue = getUpcomingRecurring(userId, 30)
    .filter(r => r.type === 'expense')
    .reduce((s, r) => s + r.amount, 0);
  const goalsMonthly = db.prepare('SELECT COALESCE(SUM(monthly_contribution),0) s FROM goals WHERE user_id = ?').get(userId).s;
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
  const m = monthStr();
  const daysLeft = Math.max(0, daysInMonth(m) - (new Date().getDate() - 1));
  const totalMonthDays = daysInMonth(m);
  const budgetTotal = budgets.reduce((s, b) => s + b.limit, 0);

  let monthlyCommit = projectedExpense;
  if (budgetTotal > 0) {
    monthlyCommit = Math.max(monthlyCommit, budgetTotal);
  }

  const dailyDisposable = (monthlyCommit * (daysLeft / totalMonthDays));
  const available = totalBal + projectedIncome - recExpDue - goalsMonthly - dailyDisposable;
  const recommended = Math.max(0, Math.floor(Math.max(0, available) * 10) / 10);

  const explanation = [
    { label: 'saldo_contas', value: totalBal },
    { label: 'receitas_futuras', value: projectedIncome },
    { label: 'despesas_fixas_ate_fim_mes', value: recExpDue },
    { label: 'contribuicao_metas', value: goalsMonthly },
    { label: 'reserva_orcamento_restante', value: Math.round(dailyDisposable * 100) / 100 }
  ];

  return { recommended, available: Math.round(available * 100) / 100, explanation, daysLeft };
}

function forecastMonthEnd(userId, user) {
  const m = monthStr();
  const totals = monthTotals(userId, m);
  const totalBal = getTotalBalance(userId);
  const daysLeft = Math.max(1, daysInMonth(m) - (new Date().getDate() - 1));
  const day = new Date().getDate();
  const avgDailyExpense = day > 0 ? totals.expense / day : 0;
  const projectedExpense = avgDailyExpense * daysLeft;
  const projectedIncome = getProjectedIncome(userId);
  const predictedEnd = totalBal + projectedIncome - projectedExpense;
  return { predictedEnd, projectedIncome, projectedExpense, avgDailyExpense, daysLeft };
}

function detectAnomalies(userId) {
  const m = monthStr();
  const anomalies = [];
  const cats = monthTotalsByCategory(userId, m, 'expense');
  const prevRows = db.prepare(
    `SELECT substr(date,1,7) AS month, category, SUM(amount) AS s
     FROM transactions
     WHERE user_id = ? AND type = 'expense' AND is_transfer = 0 AND substr(date,1,7) < ?
     GROUP BY month, category ORDER BY month DESC`
  ).all(userId, m);
  cats.forEach(c => {
    const vals = prevRows.filter(p => p.category === c.category).slice(0, 6).map(p => p.s);
    if (vals.length >= 2) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg > 0 && c.s > avg * 1.4 && (c.s - avg) > 1000) {
        anomalies.push({ type: 'category_spike', category: c.category, current: c.s, avg, pct: Math.round(((c.s - avg) / avg) * 100) });
      }
    }
  });
  const dup = db.prepare('SELECT description, amount, date, COUNT(*) c FROM transactions WHERE user_id = ? AND type = ? GROUP BY description, amount, date HAVING c > 1').all(userId, 'expense');
  dup.forEach(d => anomalies.push({ type: 'duplicate', description: d.description, amount: d.amount, date: d.date, count: d.c }));
  return anomalies;
}

function computeScore(userId, user) {
  let score = 50;
  const factors = [];
  const m = monthStr();
  const totals = monthTotals(userId, m);
  const budgets = getBudgetsWithSpent(userId, m);

  if (budgets.length > 0) {
    const ok = budgets.filter(b => b.pct <= 100).length / budgets.length;
    score += Math.round(ok * 10);
    factors.push({ key: 'orcamentos', value: ok >= 0.7 ? '+10' : '+5', label: 'Controle de orçamento' });
  }
  if (totals.income > 0) {
    const rate = totals.balance / totals.income;
    const pts = Math.round(Math.max(-10, Math.min(10, rate * 10)));
    score += pts;
    factors.push({ key: 'poupanca', value: (pts >= 0 ? '+' : '') + pts, label: 'Margem de poupança' });
  }
  const debts = db.prepare('SELECT COALESCE(SUM(original_amount - paid_amount),0) s FROM debts WHERE user_id = ?').get(userId).s;
  const totalBal = getTotalBalance(userId);
  if (debts > 0) {
    score -= 10;
    factors.push({ key: 'dividas', value: '-10', label: 'Dívidas pendentes' });
  } else {
    score += 3;
    factors.push({ key: 'dividas', value: '+3', label: 'Sem dívidas' });
  }
  const rec = getProjectedExpenses(userId);
  if (rec > 0 && totals.income > 0) {
    const burden = rec / totals.income;
    if (burden > 0.7) { score -= 8; factors.push({ key: 'fixas', value: '-8', label: 'Compromissos fixos altos' }); }
    else if (burden < 0.4) { score += 4; factors.push({ key: 'fixas', value: '+4', label: 'Compromissos fixos saudáveis' }); }
  }
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId);
  if (goals.length > 0) {
    const progress = goals.reduce((s, g) => s + (g.current / g.target), 0) / goals.length;
    score += Math.round(progress * 10);
    factors.push({ key: 'metas', value: '+' + Math.round(progress * 10), label: 'Progresso em metas' });
  }
  const streaks = user.streak || 0;
  if (streaks > 0) { score += Math.min(10, streaks); factors.push({ key: 'consistencia', value: '+' + Math.min(10, streaks), label: 'Consistência de registos' }); }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, factors };
}

function dailyTotals(userId, yearMonth) {
  const prefix = yearMonth + '-';
  const rows = db.prepare('SELECT date, SUM(CASE WHEN type = ? THEN amount ELSE 0 END) income, SUM(CASE WHEN type = ? THEN amount ELSE 0 END) expense FROM transactions WHERE user_id = ? AND is_transfer = 0 AND date LIKE ? GROUP BY date')
    .all('income', 'expense', userId, prefix + '%');
  return rows;
}

function balanceHistory(userId, months) {
  const n = months || 6;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const t = monthTotals(userId, m);
    out.push({ month: m, income: t.income, expense: t.expense, net: t.balance });
  }
  return out;
}

module.exports = {
  getAccountBalance, getAccountsWithBalance, getTotalBalance,
  monthTotals, monthTotalsByCategory, getBudgetsWithSpent,
  getProjectedIncome, getProjectedExpenses, getUpcomingRecurring,
  spendToday, forecastMonthEnd, detectAnomalies, computeScore,
  dailyTotals, balanceHistory
};