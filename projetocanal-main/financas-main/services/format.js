const staticData = require('./static-data');

function getCurrencyInfo(code) {
  const c = staticData.getCurrency(code || 'AOA');
  return c || { code: 'AOA', symbol: 'Kz', decimals: 2, symbol_position: 'after', name: 'Kwanza' };
}

function formatMoney(value, currencyCode) {
  const c = getCurrencyInfo(currencyCode);
  const n = Number(value || 0);
  const fixed = n.toFixed(c.decimals);
  const [intPart, decPart] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const num = decPart ? `${withSep}.${decPart}` : withSep;
  return c.symbol_position === 'after' ? `${num} ${c.symbol}` : `${c.symbol}${num}`;
}

function formatMoneyNoSymbol(value, currencyCode) {
  const c = getCurrencyInfo(currencyCode);
  const n = Number(value || 0);
  const fixed = n.toFixed(c.decimals);
  const [intPart, decPart] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart ? `${withSep}.${decPart}` : withSep;
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(d);
}

function formatDate(d, dateFormat) {
  const dt = toDate(d);
  if (!dt) return '';
  const fmt = dateFormat || 'dd/mm/yyyy';
  return fmt
    .replace('dd', pad(dt.getDate()))
    .replace('mm', pad(dt.getMonth() + 1))
    .replace('yyyy', dt.getFullYear())
    .replace('yy', String(dt.getFullYear()).slice(-2));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthStr(date) {
  const d = toDate(date) || new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function addMonths(date, n) {
  const d = toDate(date) || new Date();
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = toDate(dateStr); if (!d) return 0;
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function daysInMonth(dateStr) {
  const d = toDate(dateStr) || new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function parseISODateToStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = {
  getCurrencyInfo, formatMoney, formatMoneyNoSymbol, formatDate,
  todayStr, monthStr, addMonths, daysUntil, daysInMonth, parseISODateToStr, toDate
};