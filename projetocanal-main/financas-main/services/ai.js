const db = require('../database');
const intelligence = require('./intelligence');
const format = require('./format');

function lookupRate(from, to) {
  if (from === to) return 1;
  const r = db.prepare('SELECT rate FROM exchange_rates WHERE base_currency = ? AND target_currency = ?').get(from, to);
  if (r) return r.rate;
  const inv = db.prepare('SELECT rate FROM exchange_rates WHERE base_currency = ? AND target_currency = ?').get(to, from);
  return inv ? 1 / inv.rate : null;
}

function convert(amount, from, to) {
  const rate = lookupRate(from, to);
  if (!rate) return null;
  return amount * rate;
}

function intents() {
  return [
    { id: 'spend_today', kws: ['quanto posso gastar', 'posso gastar', 'spend today', 'gastar hoje', 'budget hoje', 'hoje posso'], handler: spendTodayAnswer },
    { id: 'summary', kws: ['resumo', 'summary', 'situacao', 'situação', 'como estou', 'overview'], handler: summaryAnswer },
    { id: 'balance', kws: ['saldo', 'balance', 'quanto tenho', 'total'], handler: balanceAnswer },
    { id: 'budget', kws: ['orcamento', 'orçamento', 'budget', 'limite'], handler: budgetAnswer },
    { id: 'goals', kws: ['meta', 'goal', 'objetivo', 'poupar para'], handler: goalsAnswer },
    { id: 'forecast', kws: ['previsao', 'previsão', 'forecast', 'fim do mes', 'fim do mês', 'vai sobrar'], handler: forecastAnswer },
    { id: 'score', kws: ['score', 'saude financeira', 'saúde financeira', 'nota'], handler: scoreAnswer },
    { id: 'recurring', kws: ['recorrente', 'fixo', 'assinatura', 'contas fixas'], handler: recurringAnswer },
    { id: 'debts', kws: ['divida', 'dívida', 'debt', 'devendo'], handler: debtsAnswer },
    { id: 'currency', kws: ['cambio', 'câmbio', 'exchange', 'converter', 'dolar', 'dólar', 'euro'], handler: currencyAnswer },
    { id: 'tip', kws: ['dica', 'conselho', 'tip', 'melhorar', 'economizar'], handler: tipAnswer },
    { id: 'anomalies', kws: ['anomalia', 'alerta', 'gasto estranho', 'duplicado'], handler: anomaliesAnswer }
  ];
}

function matchIntent(q) {
  const low = q.toLowerCase();
  let best = null;
  intents().forEach(i => {
    i.kws.forEach(k => {
      if (low.includes(k.toLowerCase())) {
        if (!best || i.kws[0].length > best.kws[0].length) best = i;
      }
    });
  });
  return best;
}

function spendTodayAnswer(user, ctx) {
  const s = intelligence.spendToday(user.id, user);
  return `Pode gastar hoje até **${format.formatMoney(s.recommended, user.currency)}**.\n\nBase de cálculo:\n• Saldo nas contas: ${format.formatMoney(s.explanation[0].value, user.currency)}\n• Receitas futuras estimadas: ${format.formatMoney(s.explanation[1].value, user.currency)}\n• Despesas fixas até ao fim do mês: ${format.formatMoney(s.explanation[2].value, user.currency)}\n• Contribuição para metas: ${format.formatMoney(s.explanation[3].value, user.currency)}\n• Reserva para orçamento restante: ${format.formatMoney(s.explanation[4].value, user.currency)}`;
}

function summaryAnswer(user, ctx) {
  const t = intelligence.monthTotals(user.id);
  return `Resumo do mês:\n• Receitas: ${format.formatMoney(t.income, user.currency)}\n• Despesas: ${format.formatMoney(t.expense, user.currency)}\n• Saldo do mês: **${format.formatMoney(t.balance, user.currency)}**`;
}

function balanceAnswer(user, ctx) {
  const accts = intelligence.getAccountsWithBalance(user.id);
  const total = accts.reduce((s, a) => s + a.balance, 0);
  const lines = accts.length ? accts.map(a => `• ${a.name}: ${format.formatMoney(a.balance, a.currency)}`).join('\n') : '• Nenhuma conta criada ainda.';
  return `Saldo total: **${format.formatMoney(total, user.currency)}**.\n\n${lines}`;
}

function budgetAnswer(user, ctx) {
  const b = intelligence.getBudgetsWithSpent(user.id);
  if (!b.length) return 'Ainda não criou orçamentos. Vá à secção Orçamentos para definir limites por categoria.';
  return b.map(x => `• ${x.category}: ${format.formatMoney(x.spent, user.currency)} / ${format.formatMoney(x.limit, user.currency)} (${Math.round(x.pct)}%)`).join('\n');
}

function goalsAnswer(user, ctx) {
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(user.id);
  if (!goals.length) return 'Ainda não tem metas. Crie uma meta para poupar com objectivo.';
  return goals.map(g => {
    const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
    return `• ${g.icon} ${g.name}: ${format.formatMoney(g.current, user.currency)} de ${format.formatMoney(g.target, user.currency)} (${pct}%)`;
  }).join('\n');
}

function forecastAnswer(user, ctx) {
  const f = intelligence.forecastMonthEnd(user.id, user);
  return `Previsão para o fim do mês: **${format.formatMoney(f.predictedEnd, user.currency)}**.\n\n• Despesa média diária: ${format.formatMoney(f.avgDailyExpense, user.currency)}\n• Despesa projectada restante: ${format.formatMoney(f.projectedExpense, user.currency)}\n• Receitas futuras (recorrentes): ${format.formatMoney(f.projectedIncome, user.currency)}`;
}

function scoreAnswer(user, ctx) {
  const s = intelligence.computeScore(user.id, user);
  return `A sua saúde financeira está em **${s.score}/100**.\n\n${s.factors.map(f => `• ${f.label}: ${f.value}`).join('\n')}`;
}

function recurringAnswer(user, ctx) {
  const rows = db.prepare('SELECT * FROM recurring_transactions WHERE user_id = ? AND active = 1').all(user.id);
  if (!rows.length) return 'Não tem transacções recorrentes registadas.';
  const inc = rows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const exp = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  return `Compromissos fixos mensais:\n${rows.map(r => `• ${r.type === 'income' ? '🟢' : '🔴'} ${r.description}: ${format.formatMoney(r.amount, user.currency)} (${r.frequency})`).join('\n')}\n\nTotal receitas fixas: ${format.formatMoney(inc, user.currency)} • Total despesas fixas: ${format.formatMoney(exp, user.currency)}`;
}

function debtsAnswer(user, ctx) {
  const debts = db.prepare('SELECT * FROM debts WHERE user_id = ?').all(user.id);
  const loans = db.prepare('SELECT * FROM loans WHERE user_id = ?').all(user.id);
  const out = [];
  debts.forEach(d => {
    const remaining = d.original_amount - d.paid_amount;
    out.push(`• Dívida ${d.creditor}: ${format.formatMoney(remaining, user.currency)} restantes (vence ${format.formatDate(d.due_date, user.date_format)})`);
  });
  loans.filter(l => l.status !== 'paid').forEach(l => {
    out.push(`• ${l.direction === 'lent' ? 'A receber de' : 'A pagar a'} ${l.person}: ${format.formatMoney(l.amount, user.currency)} (${l.status})`);
  });
  return out.length ? out.join('\n') : 'Sem dívidas ou empréstimos pendentes. Óptimo!';
}

function currencyAnswer(user, ctx) {
  const m = /(\d[\d.,]*)\s*(usd|eur|aoa|brl|mzn|kz|euro|dolar|dólar)?/.exec(ctx.question.toLowerCase());
  let amount = null;
  if (m) amount = parseFloat(m[1].replace(',', '.'));
  const ref = intelligence.getTotalBalance(user.id);
  const conv = convert(1, 'USD', user.currency);
  const parts = [];
  if (conv) parts.push(`1 USD = ${format.formatMoney(conv, user.currency)}`);
  const eur = convert(1, 'EUR', user.currency);
  if (eur) parts.push(`1 EUR = ${format.formatMoney(eur, user.currency)}`);
  if (amount !== null && m && m[2]) {
    const code = ({ usd: 'USD', eur: 'EUR', aoakz: 'AOA', brl: 'BRL', mzn: 'MZN', euro: 'EUR', dolar: 'USD', 'dólar': 'USD' })[m[2]] || 'USD';
    const r = convert(amount, code, user.currency);
    if (r) parts.push(`\n${format.formatMoney(amount, code)} = **${format.formatMoney(r, user.currency)}**`);
  }
  return parts.length ? parts.join('\n') : 'Taxas de câmbio estáticas de referência. Configure o provedor para taxas em tempo real.';
}

function tipAnswer(user, ctx) {
  const s = intelligence.computeScore(user.id, user);
  const tips = [];
  if (s.score < 60) tips.push('Estabeleça orçamentos por categoria e respeite os limites.');
  const f = intelligence.forecastMonthEnd(user.id, user);
  if (f.predictedEnd < 0) tips.push('As suas despesas projectadas ultrapassam o saldo. Reveja gastos variáveis.');
  const debts = db.prepare('SELECT COUNT(*) c FROM debts WHERE user_id = ?').get(user.id).c;
  if (debts > 0) tips.push('Priorize o pagamento de dívidas com juros mais altos.');
  const goals = db.prepare('SELECT COUNT(*) c FROM goals WHERE user_id = ?').get(user.id).c;
  if (goals === 0) tips.push('Crie metas com contribuição mensal automática para poupar de forma consistente.');
  tips.push('Use a regra 50/30/20: 50% necessidades, 30% desejos, 20% poupança.');
  tips.push('Registe todas as despesas pequenas — são elas que escapam ao orçamento.');
  return `Conselhos personalizados:\n• ${tips.slice(0, 4).join('\n• ')}`;
}

function anomaliesAnswer(user, ctx) {
  const a = intelligence.detectAnomalies(user.id);
  if (!a.length) return 'Sem anomalias detectadas este mês.';
  return a.map(x => {
    if (x.type === 'category_spike') return `• ⚠️ ${x.category}: ${format.formatMoney(x.current, user.currency)} este mês (${x.pct}% acima da média)`;
    return `• 🔁 Possível duplicado: "${x.description}" ${format.formatMoney(x.amount, user.currency)} em ${x.date} (${x.count}x)`;
  }).join('\n');
}

function answer(question, user) {
  const intent = matchIntent(question);
  let response;
  let fallback = false;
  if (intent) {
    try {
      response = intent.handler(user, { question });
    } catch (e) {
      response = 'Não consegui analisar os seus dados neste momento. Tente novamente.';
      fallback = true;
    }
  } else {
    fallback = true;
    response = 'Ainda não consigo responder a essa pergunta com precisão. Experimente: "quanto posso gastar hoje", "resumo do mês", "meu saldo", "como está meu orçamento", "previsão do fim do mês", "meu score financeiro", "minhas dívidas", "converter 100 USD para AOA".';
  }
  db.prepare('INSERT INTO ai_conversations (user_id, question, answer) VALUES (?,?,?)').run(user.id, question, response);
  return { response, fallback };
}

module.exports = { answer, convert, lookupRate };