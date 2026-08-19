const db = require('../database');
const XLSX = require('xlsx');
const format = require('./format');

function rowsToXlsxBuffer(rows, sheetName) {
  const ws = XLSX.utils.json_to_sheet(rows.map(r => {
    const o = {};
    Object.keys(r).forEach(k => { o[k] = r[k] === null || r[k] === undefined ? '' : r[k]; });
    return o;
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Dados');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function rowsToCsvBuffer(rows) {
  const headers = Object.keys(rows[0] || {});
  const esc = v => {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
  return Buffer.from('\uFEFF' + lines.join('\n'), 'utf8');
}

function getTransactionsRows(userId, type, month) {
  let rows;
  if (month) {
    rows = db.prepare(`SELECT date, description, category, amount, note, account_id FROM transactions WHERE user_id = ? AND type = ? AND is_transfer = 0 AND date LIKE ? ORDER BY date`).all(userId, type, month + '-%');
  } else {
    rows = db.prepare(`SELECT date, description, category, amount, note, account_id FROM transactions WHERE user_id = ? AND type = ? AND is_transfer = 0 ORDER BY date`).all(userId, type);
  }
  return rows.map(r => {
    const acc = r.account_id ? db.prepare('SELECT name FROM accounts WHERE id = ?').get(r.account_id) : null;
    return { Data: r.date, Descrição: r.description, Categoria: r.category, Valor: r.amount, 'Nota': r.note, Conta: acc ? acc.name : '' };
  });
}

function buildExport(userId, type, formatType, month) {
  let rows = [];
  const fileType = formatType === 'xlsx' ? 'xlsx' : 'csv';
  if (type === 'income' || type === 'expense') {
    rows = getTransactionsRows(userId, type, month);
  } else if (type === 'transactions') {
    const inc = getTransactionsRows(userId, 'income', month).map(r => ({ ...r, Tipo: 'Receita' }));
    const exp = getTransactionsRows(userId, 'expense', month).map(r => ({ ...r, Tipo: 'Despesa' }));
    rows = [...inc, ...exp].sort((a, b) => String(a.Data).localeCompare(String(b.Data)));
  } else if (type === 'budgets') {
    rows = db.prepare('SELECT category, "limit", month FROM budgets WHERE user_id = ? ORDER BY category').all(userId)
      .map(r => ({ Categoria: r.category, Limite: r.limit, 'Mês': r.month || '' }));
  } else if (type === 'goals') {
    rows = db.prepare('SELECT name, target, current, deadline FROM goals WHERE user_id = ? ORDER BY id').all(userId)
      .map(r => ({ Nome: r.name, Alvo: r.target, Atual: r.current, Prazo: r.deadline || '' }));
  } else if (type === 'accounts') {
    const intel = require('./intelligence');
    rows = intel.getAccountsWithBalance(userId).map(a => ({ Nome: a.name, Tipo: a.type, Saldo: a.balance, Moeda: a.currency }));
  } else if (type === 'recurring') {
    rows = db.prepare('SELECT type, description, amount, frequency, due_day, category, active FROM recurring_transactions WHERE user_id = ?').all(userId)
      .map(r => ({ Tipo: r.type === 'income' ? 'Receita' : 'Despesa', Descrição: r.description, Valor: r.amount, Frequência: r.frequency, 'Dia': r.due_day, Categoria: r.category, Ativo: r.active ? 'Sim' : 'Não' }));
  } else if (type === 'debts') {
    rows = db.prepare('SELECT creditor, original_amount, paid_amount, interest_rate, due_date, installments FROM debts WHERE user_id = ?').all(userId)
      .map(r => ({ Credor: r.creditor, 'Valor original': r.original_amount, 'Valor pago': r.paid_amount, 'Juros %': r.interest_rate, Vencimento: r.due_date, Prestações: r.installments }));
  } else if (type === 'loans') {
    rows = db.prepare('SELECT person, amount, direction, date, status FROM loans WHERE user_id = ?').all(userId)
      .map(r => ({ Pessoa: r.person, Valor: r.amount, Direção: r.direction === 'lent' ? 'Emprestou' : 'Pediu', Data: r.date, Estado: r.status }));
  } else {
    return { error: 'Tipo de exportação inválido' };
  }
  const buffer = fileType === 'xlsx' ? rowsToXlsxBuffer(rows, type) : rowsToCsvBuffer(rows);
  return { buffer, filename: `financeiq_${type}_${month || 'all'}.${fileType}` };
}

function parseCsvText(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(x => x.trim() !== '')) rows.push(row); }
  return rows;
}

function parseFileToRows(buffer, fileType) {
  if (fileType === 'csv') {
    return parseCsvText(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  }
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

module.exports = { buildExport, parseFileToRows, rowsToCsvBuffer, rowsToXlsxBuffer };