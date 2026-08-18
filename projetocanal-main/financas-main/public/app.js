/* ============================================================
   FinanceIQ – App Logic (API Connected)
   ============================================================ */

const API = {
  async _fetch(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Não autorizado');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  },
  getTransactions() { return this._fetch('/api/transactions'); },
  createTransaction(tx) { return this._fetch('/api/transactions', { method: 'POST', body: JSON.stringify(tx) }); },
  updateTransaction(id, tx) { return this._fetch('/api/transactions/' + id, { method: 'PUT', body: JSON.stringify(tx) }); },
  deleteTransaction(id) { return this._fetch('/api/transactions/' + id, { method: 'DELETE' }); },
  getBudgets() { return this._fetch('/api/budgets'); },
  createBudget(b) { return this._fetch('/api/budgets', { method: 'POST', body: JSON.stringify(b) }); },
  updateBudget(id, b) { return this._fetch('/api/budgets/' + id, { method: 'PUT', body: JSON.stringify(b) }); },
  deleteBudget(id) { return this._fetch('/api/budgets/' + id, { method: 'DELETE' }); },
  getGoals() { return this._fetch('/api/goals'); },
  createGoal(g) { return this._fetch('/api/goals', { method: 'POST', body: JSON.stringify(g) }); },
  updateGoal(id, g) { return this._fetch('/api/goals/' + id, { method: 'PUT', body: JSON.stringify(g) }); },
  deleteGoal(id) { return this._fetch('/api/goals/' + id, { method: 'DELETE' }); },
  getMembers() { return this._fetch('/api/members'); },
  createMember(m) { return this._fetch('/api/members', { method: 'POST', body: JSON.stringify(m) }); },
  updateMember(id, m) { return this._fetch('/api/members/' + id, { method: 'PUT', body: JSON.stringify(m) }); },
  deleteMember(id) { return this._fetch('/api/members/' + id, { method: 'DELETE' }); },
  getProfile() { return this._fetch('/api/auth/me'); },
  updateProfile(data) { return this._fetch('/api/profile', { method: 'PUT', body: JSON.stringify(data) }); },
  logout() { return this._fetch('/api/auth/logout', { method: 'POST' }); },
};

const CATEGORIES = {
  income: [
    { id: 'salary', label: 'Salário', icon: '💼', color: '#10d9a0' },
    { id: 'freelance', label: 'Freelance', icon: '💻', color: '#38bdf8' },
    { id: 'investment', label: 'Investimentos', icon: '📈', color: '#a78bfa' },
    { id: 'bonus', label: 'Bônus', icon: '🎁', color: '#fbbf24' },
    { id: 'rent', label: 'Aluguel Receb.', icon: '🏠', color: '#34d399' },
    { id: 'other_in', label: 'Outros', icon: '💰', color: '#6c63ff' },
  ],
  expense: [
    { id: 'housing', label: 'Moradia', icon: '🏠', color: '#f97316' },
    { id: 'food', label: 'Alimentação', icon: '🍕', color: '#fb923c' },
    { id: 'transport', label: 'Transporte', icon: '🚗', color: '#60a5fa' },
    { id: 'health', label: 'Saúde', icon: '💊', color: '#f43f5e' },
    { id: 'education', label: 'Educação', icon: '🎓', color: '#a78bfa' },
    { id: 'leisure', label: 'Lazer', icon: '🎮', color: '#fb7185' },
    { id: 'clothing', label: 'Vestuário', icon: '👗', color: '#e879f9' },
    { id: 'utilities', label: 'Contas/Serviços', icon: '💡', color: '#fbbf24' },
    { id: 'shopping', label: 'Compras', icon: '🛒', color: '#34d399' },
    { id: 'other_ex', label: 'Outros', icon: '📌', color: '#94a3b8' },
  ]
};

const ALL_CATEGORIES = [...CATEGORIES.income, ...CATEGORIES.expense];

function getCategoryById(id) {
  return ALL_CATEGORIES.find(c => c.id === id) || { id, label: id, icon: '💰', color: '#6c63ff' };
}

let transactions = [];
let budgets = [];
let goals = [];
let userProfile = { name: 'Usuário', email: '', avatar: '' };
let familyMembers = [];

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let currentType = 'income';
let editingId = null;
let editingBudgetId = null;
let editingGoalId = null;

let cashflowChart = null;
let categoryChart = null;
let annualChart = null;

function showLoading(msg = 'Carregando...') {
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = `
      <div style="
        position:fixed;inset:0;z-index:99999;
        background:rgba(10,12,28,0.85);
        display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        gap:16px;
      ">
        <div style="
          width:48px;height:48px;border:3px solid rgba(108,99,255,0.3);
          border-top-color:#6c63ff;border-radius:50%;
          animation:spin 0.8s linear infinite;
        "></div>
        <span style="color:#8a8fb5;font-size:14px;" id="loadingMsg">${msg}</span>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    const msgEl = document.getElementById('loadingMsg');
    if (msgEl) msgEl.textContent = msg;
    overlay.style.display = 'block';
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

function fmtCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getMonthTransactions() {
  return transactions.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
}

async function loadAllData() {
  showLoading('Carregando dados...');
  try {
    const [txs, b, g, m, profile] = await Promise.all([
      API.getTransactions(),
      API.getBudgets(),
      API.getGoals(),
      API.getMembers(),
      API.getProfile(),
    ]);
    transactions = txs;
    budgets = b;
    goals = g;
    familyMembers = m;
    userProfile = profile.user;
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
  }
  hideLoading();
}

function logout() {
  API.logout().finally(() => {
    window.location.href = '/login';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initTopbar();
  initNav();
  initConfirmModal();
  initTransactionModal();
  initBudgetModal();
  initGoalModal();
  initSettings();
  initFilters();

  await loadAllData();

  setUserInfo();
  document.getElementById('profileName').value = userProfile.name;
  document.getElementById('profileEmail').value = userProfile.email;
  updateAvatarPreview(userProfile.avatar);
  renderMembers();
  renderAll();
});

/* CUSTOM CONFIRM MODAL */
let _confirmResolve = null;

function initConfirmModal() {
  document.getElementById('confirmOk').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('open');
    if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
  });
  document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('open');
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  });
}

function customConfirm(msg = 'Tem certeza?', icon = '🗑️', title = 'Confirmar exclusão') {
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmModal').classList.add('open');
  return new Promise(resolve => { _confirmResolve = resolve; });
}

/* TOPBAR & NAV */
function initTopbar() {
  updateMonthLabel();
  updatePageDate();

  document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    updateMonthLabel();
    renderAll();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    updateMonthLabel();
    renderAll();
  });

  document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
}

function setUserInfo() {
  const name = userProfile.name || 'Usuário';
  document.getElementById('userNameSidebar').textContent = name;
  const initial = name[0].toUpperCase();

  const applyAvatar = (el) => {
    if (userProfile.avatar) {
      el.textContent = '';
      el.style.backgroundImage = `url(${userProfile.avatar})`;
      el.style.backgroundSize = 'cover';
    } else {
      el.textContent = initial;
      el.style.backgroundImage = 'linear-gradient(135deg, var(--accent), #a78bfa)';
    }
  };

  applyAvatar(document.getElementById('userAvatarSidebar'));
  applyAvatar(document.getElementById('topbarAvatar'));
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function updateMonthLabel() {
  document.getElementById('monthLabel').textContent = `${MONTHS[currentMonth]} ${currentYear}`;
}

function updatePageDate() {
  const now = new Date();
  document.getElementById('pageDate').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').style.display = 'none';
}

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      showPage(btn.dataset.page);
      closeSidebar();
    });
  });
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.getElementById(`nav-${name}`).classList.add('active');

  const titles = { dashboard: 'Dashboard', transactions: 'Transações', budget: 'Orçamento', goals: 'Metas', reports: 'Relatórios', settings: 'Configurações' };
  document.getElementById('pageTitle').textContent = titles[name] || name;

  if (name === 'reports') renderAnnualChart();
}

/* RENDER ALL */
function renderAll() {
  renderCards();
  renderCashflowChart();
  renderCategoryChart();
  renderRecentTransactions();
  renderAllTransactions();
  renderBudgets();
  renderGoals();
  renderReportStats();
}

/* DASHBOARD CARDS */
function renderCards() {
  const txs = getMonthTransactions();
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const rate = income > 0 ? Math.max(0, Math.min(100, ((income - expense) / income) * 100)) : 0;

  document.getElementById('totalBalance').textContent = fmtCurrency(balance);
  document.getElementById('totalIncome').textContent = fmtCurrency(income);
  document.getElementById('totalExpense').textContent = fmtCurrency(expense);
  document.getElementById('savingsRate').textContent = rate.toFixed(1) + '%';
  document.getElementById('savingsFill').style.width = rate + '%';

  const incomeCount = txs.filter(t => t.type === 'income').length;
  const expenseCount = txs.filter(t => t.type === 'expense').length;
  document.getElementById('incomeCount').textContent = `${incomeCount} entrada${incomeCount !== 1 ? 's' : ''}`;
  document.getElementById('expenseCount').textContent = `${expenseCount} saída${expenseCount !== 1 ? 's' : ''}`;
}

/* CASHFLOW CHART (Bar) */
function renderCashflowChart() {
  const labels = [];
  const incomeData = [];
  const expenseData = [];

  for (let i = 5; i >= 0; i--) {
    let m = currentMonth - i;
    let y = currentYear;
    if (m < 0) { m += 12; y--; }
    labels.push(MONTHS[m].substr(0, 3));
    const txs = transactions.filter(t => { const d = new Date(t.date + 'T00:00:00'); return d.getMonth() === m && d.getFullYear() === y; });
    incomeData.push(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    expenseData.push(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  }

  const ctx = document.getElementById('cashflowChart').getContext('2d');
  if (cashflowChart) cashflowChart.destroy();

  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Receitas',
          data: incomeData,
          backgroundColor: 'rgba(16,217,160,0.5)',
          borderColor: 'rgba(16,217,160,0.9)',
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Despesas',
          data: expenseData,
          backgroundColor: 'rgba(255,92,124,0.5)',
          borderColor: 'rgba(255,92,124,0.9)',
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipStyle() } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8a8fb5', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8a8fb5', font: { size: 11 }, callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) } }
      }
    }
  });
}

/* CATEGORY DONUT CHART */
function renderCategoryChart() {
  const txs = getMonthTransactions().filter(t => t.type === 'expense');
  const byCategory = {};
  txs.forEach(t => {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  });

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const labels = sorted.map(([id]) => getCategoryById(id).label);
  const data = sorted.map(([, v]) => v);
  const colors = sorted.map(([id]) => getCategoryById(id).color);
  const total = data.reduce((s, v) => s + v, 0);

  document.getElementById('donutTotal').textContent = fmtCurrency(total);

  const ctx = document.getElementById('categoryChart').getContext('2d');
  if (categoryChart) categoryChart.destroy();

  if (data.length === 0) {
    categoryChart = null;
    return;
  }

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipStyle(), callbacks: { label: ctx => ` ${ctx.label}: ${fmtCurrency(ctx.raw)}` } }
      }
    }
  });
}

/* ANNUAL CHART (Line) */
function renderAnnualChart() {
  const labels = MONTHS.map(m => m.substr(0, 3));
  const incomeData = [];
  const expenseData = [];
  const balanceData = [];

  for (let m = 0; m < 12; m++) {
    const txs = transactions.filter(t => { const d = new Date(t.date + 'T00:00:00'); return d.getMonth() === m && d.getFullYear() === currentYear; });
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    incomeData.push(inc);
    expenseData.push(exp);
    balanceData.push(inc - exp);
  }

  const ctx = document.getElementById('annualChart').getContext('2d');
  if (annualChart) annualChart.destroy();

  annualChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Receitas',
          data: incomeData,
          borderColor: '#10d9a0',
          backgroundColor: 'rgba(16,217,160,0.1)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#10d9a0',
          pointRadius: 4,
        },
        {
          label: 'Despesas',
          data: expenseData,
          borderColor: '#ff5c7c',
          backgroundColor: 'rgba(255,92,124,0.1)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#ff5c7c',
          pointRadius: 4,
        },
        {
          label: 'Saldo',
          data: balanceData,
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.08)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#6c63ff',
          pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#8a8fb5', font: { size: 12 }, boxWidth: 12, padding: 20 }
        },
        tooltip: { ...tooltipStyle() }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8a8fb5', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8a8fb5', font: { size: 11 }, callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) } }
      }
    }
  });
}

function tooltipStyle() {
  return {
    backgroundColor: '#1a1e35',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    titleColor: '#eef0ff',
    bodyColor: '#8a8fb5',
    padding: 10,
    cornerRadius: 8,
  };
}

/* RECENT TRANSACTIONS */
function renderRecentTransactions() {
  const txs = getMonthTransactions().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const container = document.getElementById('recentTransactions');
  container.innerHTML = txs.length === 0 ? emptyState('💸', 'Nenhuma transação este mês.', true) : txs.map(txHTML).join('');
  attachTxActions(container);
}

function renderAllTransactions() {
  const search = document.getElementById('searchInput')?.value?.toLowerCase() || '';
  const typeF = document.getElementById('filterType')?.value || '';
  const catF = document.getElementById('filterCategory')?.value || '';

  let txs = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (search) txs = txs.filter(t => t.description.toLowerCase().includes(search) || getCategoryById(t.category).label.toLowerCase().includes(search));
  if (typeF) txs = txs.filter(t => t.type === typeF);
  if (catF) txs = txs.filter(t => t.category === catF);

  const container = document.getElementById('allTransactions');
  container.innerHTML = txs.length === 0 ? emptyState('📋', 'Nenhuma transação encontrada.') : txs.map(txHTML).join('');
  attachTxActions(container);
}

function txHTML(t) {
  const cat = getCategoryById(t.category);
  const sign = t.type === 'income' ? '+' : '-';
  const color = t.type === 'income' ? 'var(--income)' : 'var(--expense)';
  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon" style="background:${cat.color}22; color:${cat.color};">${cat.icon}</div>
      <div class="tx-info">
        <div class="tx-desc">${escHtml(t.description)}</div>
        <div class="tx-meta">${cat.label}${t.note ? ' · ' + escHtml(t.note) : ''}</div>
      </div>
      <div class="tx-amount-col">
        <div class="tx-amount" style="color:${color}">${sign} ${fmtCurrency(t.amount)}</div>
        <div class="tx-date-label">${fmtDate(t.date)}</div>
      </div>
      <div class="tx-actions">
        <button class="tx-action-btn edit-tx" data-id="${t.id}">✏️</button>
        <button class="tx-action-btn delete delete-tx" data-id="${t.id}">🗑️</button>
      </div>
    </div>`;
}

function attachTxActions(container) {
  container.querySelectorAll('.edit-tx').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); editTransaction(btn.dataset.id); });
  });
  container.querySelectorAll('.delete-tx').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteTransaction(btn.dataset.id); });
  });
}

function emptyState(icon, msg, withBtn = false) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <p>${msg}</p>
    ${withBtn ? `<button class="btn-primary small" onclick="document.getElementById('addTransactionBtn').click()">Adicionar transação</button>` : ''}
  </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* TRANSACTION MODAL */
function initTransactionModal() {
  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  const openBtn = document.getElementById('addTransactionBtn');

  openBtn.addEventListener('click', () => openTransactionModal());
  document.getElementById('closeTransactionModal').addEventListener('click', closeTransactionModal);
  document.getElementById('cancelTransaction').addEventListener('click', closeTransactionModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeTransactionModal(); });

  document.getElementById('typeIncome').addEventListener('click', () => setTransactionType('income'));
  document.getElementById('typeExpense').addEventListener('click', () => setTransactionType('expense'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveTransactionFromForm();
  });

  populateCategorySelect('txCategory', 'income');
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
}

function openTransactionModal(tx = null) {
  editingId = tx ? tx.id : null;
  document.getElementById('modalTitle').textContent = tx ? 'Editar Transação' : 'Nova Transação';
  document.getElementById('editId').value = tx ? tx.id : '';

  const type = tx ? tx.type : 'income';
  setTransactionType(type);

  document.getElementById('txDescription').value = tx ? tx.description : '';
  document.getElementById('txAmount').value = tx ? tx.amount : '';
  document.getElementById('txDate').value = tx ? tx.date : new Date().toISOString().split('T')[0];
  document.getElementById('txNote').value = tx ? (tx.note || '') : '';

  if (tx) {
    document.getElementById('txCategory').value = tx.category;
  }

  document.getElementById('transactionModal').classList.add('open');
  document.getElementById('txDescription').focus();
}

function closeTransactionModal() {
  document.getElementById('transactionModal').classList.remove('open');
  document.getElementById('transactionForm').reset();
  editingId = null;
}

function setTransactionType(type) {
  currentType = type;
  document.getElementById('typeIncome').classList.toggle('active', type === 'income');
  document.getElementById('typeIncome').classList.toggle('income-btn', type === 'income');
  document.getElementById('typeExpense').classList.toggle('active', type === 'expense');
  document.getElementById('typeExpense').classList.toggle('expense-btn', type === 'expense');
  populateCategorySelect('txCategory', type);
}

function populateCategorySelect(selectId, type) {
  const sel = document.getElementById(selectId);
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>';
  CATEGORIES[type].forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon} ${c.label}`;
    sel.appendChild(opt);
  });
  if (prevVal) sel.value = prevVal;
}

async function saveTransactionFromForm() {
  const txData = {
    type: currentType,
    description: document.getElementById('txDescription').value.trim(),
    amount: parseFloat(document.getElementById('txAmount').value),
    date: document.getElementById('txDate').value,
    category: document.getElementById('txCategory').value,
    note: document.getElementById('txNote').value.trim(),
  };
  if (!txData.description || !txData.amount || !txData.date || !txData.category) return;

  try {
    if (editingId) {
      await API.updateTransaction(editingId, txData);
      const idx = transactions.findIndex(t => t.id == editingId);
      if (idx !== -1) transactions[idx] = { ...transactions[idx], ...txData };
      showToast('Transação atualizada!', 'success');
    } else {
      const newTx = await API.createTransaction(txData);
      transactions.unshift(newTx);
      showToast('Transação adicionada!', 'success');
    }
    closeTransactionModal();
    renderAll();
  } catch (e) {
    showToast('Erro ao salvar transação.', 'error');
  }
}

function editTransaction(id) {
  const numId = parseInt(id);
  const tx = transactions.find(t => t.id === numId);
  if (tx) openTransactionModal(tx);
}

async function deleteTransaction(id) {
  const numId = parseInt(id);
  const tx = transactions.find(t => t.id === numId);
  const name = tx ? tx.description : 'esta transação';
  const ok = await customConfirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`, '🗑️', 'Excluir Transação');
  if (!ok) return;

  try {
    await API.deleteTransaction(numId);
    transactions = transactions.filter(t => t.id !== numId);
    renderAll();
    showToast('Transação excluída.', 'info');
  } catch (e) {
    showToast('Erro ao excluir transação.', 'error');
  }
}

/* FILTERS */
function initFilters() {
  const sel = document.getElementById('filterCategory');
  ALL_CATEGORIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon} ${c.label}`;
    sel.appendChild(opt);
  });

  document.getElementById('searchInput').addEventListener('input', renderAllTransactions);
  document.getElementById('filterType').addEventListener('change', renderAllTransactions);
  document.getElementById('filterCategory').addEventListener('change', renderAllTransactions);
}

/* BUDGET MODAL */
function initBudgetModal() {
  document.getElementById('addBudgetBtn').addEventListener('click', openBudgetModal);
  document.getElementById('closeBudgetModal').addEventListener('click', closeBudgetModal);
  document.getElementById('cancelBudget').addEventListener('click', closeBudgetModal);
  document.getElementById('budgetModal').addEventListener('click', (e) => { if (e.target.id === 'budgetModal') closeBudgetModal(); });
  document.getElementById('budgetForm').addEventListener('submit', (e) => { e.preventDefault(); saveBudget(); });
  populateCategorySelect('budgetCategory', 'expense');
}

function openBudgetModal(budget = null) {
  editingBudgetId = budget ? budget.id : null;
  document.getElementById('editBudgetId').value = budget ? budget.id : '';
  document.getElementById('budgetCategory').value = budget ? budget.category : '';
  document.getElementById('budgetLimit').value = budget ? budget.limit : '';
  document.getElementById('budgetModal').classList.add('open');
}

function closeBudgetModal() {
  document.getElementById('budgetModal').classList.remove('open');
  document.getElementById('budgetForm').reset();
  editingBudgetId = null;
}

async function saveBudget() {
  const budgetData = {
    category: document.getElementById('budgetCategory').value,
    limit: parseFloat(document.getElementById('budgetLimit').value),
  };
  if (!budgetData.category || !budgetData.limit) return;

  try {
    if (editingBudgetId) {
      const updated = await API.updateBudget(editingBudgetId, budgetData);
      const idx = budgets.findIndex(b => b.id === editingBudgetId);
      if (idx !== -1) budgets[idx] = updated;
      showToast('Orçamento atualizado!', 'success');
    } else {
      const newB = await API.createBudget(budgetData);
      budgets.push(newB);
      showToast('Orçamento criado!', 'success');
    }
    closeBudgetModal();
    renderBudgets();
  } catch (e) {
    showToast(e.message || 'Erro ao salvar orçamento.', 'error');
  }
}

function renderBudgets() {
  const txs = getMonthTransactions().filter(t => t.type === 'expense');
  const container = document.getElementById('budgetList');

  if (budgets.length === 0) {
    container.innerHTML = emptyState('🎯', 'Nenhum orçamento definido ainda.');
    return;
  }

  container.innerHTML = budgets.map(b => {
    const cat = getCategoryById(b.category);
    const spent = txs.filter(t => t.category === b.category).reduce((s, t) => s + t.amount, 0);
    const pct = Math.min(100, (spent / b.limit) * 100);
    const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'safe';
    const remaining = b.limit - spent;

    return `
      <div class="budget-item" data-id="${b.id}">
        <div class="budget-item-header">
          <div class="budget-cat-info">
            <div class="budget-cat-icon" style="background:${cat.color}22; color:${cat.color};">${cat.icon}</div>
            <span class="budget-cat-name">${cat.label}</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="budget-amounts">
              <span class="budget-spent">${fmtCurrency(spent)}</span>
              <span class="budget-sep">/</span>
              <span class="budget-limit">${fmtCurrency(b.limit)}</span>
            </div>
            <div class="budget-actions">
              <button class="tx-action-btn edit-budget" data-id="${b.id}">✏️</button>
              <button class="tx-action-btn delete delete-budget" data-id="${b.id}">🗑️</button>
            </div>
          </div>
        </div>
        <div class="budget-progress">
          <div class="progress-bar">
            <div class="progress-fill ${cls}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="budget-item-footer">
          <span class="budget-pct">${pct.toFixed(0)}% utilizado</span>
          <span class="budget-remaining">${remaining >= 0 ? fmtCurrency(remaining) + ' restante' : '⚠️ Excedeu ' + fmtCurrency(-remaining)}</span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.edit-budget').forEach(btn => {
    btn.addEventListener('click', () => {
      const numId = parseInt(btn.dataset.id);
      const b = budgets.find(x => x.id === numId);
      if (b) openBudgetModal(b);
    });
  });
  container.querySelectorAll('.delete-budget').forEach(btn => {
    btn.addEventListener('click', async () => {
      const numId = parseInt(btn.dataset.id);
      const b = budgets.find(x => x.id === numId);
      const cat = b ? getCategoryById(b.category).label : 'este orçamento';
      const ok = await customConfirm(`Excluir orçamento de "${cat}"?`, '🎯', 'Excluir Orçamento');
      if (!ok) return;

      try {
        await API.deleteBudget(numId);
        budgets = budgets.filter(x => x.id !== numId);
        renderBudgets();
        showToast('Orçamento excluído.', 'info');
      } catch (e) {
        showToast('Erro ao excluir orçamento.', 'error');
      }
    });
  });
}

/* GOAL MODAL */
function initGoalModal() {
  document.getElementById('addGoalBtn').addEventListener('click', openGoalModal);
  document.getElementById('closeGoalModal').addEventListener('click', closeGoalModal);
  document.getElementById('cancelGoal').addEventListener('click', closeGoalModal);
  document.getElementById('goalModal').addEventListener('click', (e) => { if (e.target.id === 'goalModal') closeGoalModal(); });
  document.getElementById('goalForm').addEventListener('submit', (e) => { e.preventDefault(); saveGoal(); });
}

function openGoalModal(goal = null) {
  editingGoalId = goal ? goal.id : null;
  document.getElementById('goalModalTitle').textContent = goal ? 'Editar Meta' : 'Nova Meta';
  document.getElementById('editGoalId').value = goal ? goal.id : '';
  document.getElementById('goalName').value = goal ? goal.name : '';
  document.getElementById('goalTarget').value = goal ? goal.target : '';
  document.getElementById('goalCurrent').value = goal ? goal.current : '0';
  document.getElementById('goalDeadline').value = goal ? (goal.deadline || '') : '';
  document.getElementById('goalIcon').value = goal ? goal.icon : '🏆';
  document.getElementById('goalModal').classList.add('open');
}

function closeGoalModal() {
  document.getElementById('goalModal').classList.remove('open');
  document.getElementById('goalForm').reset();
  editingGoalId = null;
}

async function saveGoal() {
  const goalData = {
    name: document.getElementById('goalName').value.trim(),
    icon: document.getElementById('goalIcon').value,
    target: parseFloat(document.getElementById('goalTarget').value),
    current: parseFloat(document.getElementById('goalCurrent').value || '0'),
    deadline: document.getElementById('goalDeadline').value || null,
  };
  if (!goalData.name || !goalData.target) return;

  try {
    if (editingGoalId) {
      const updated = await API.updateGoal(editingGoalId, goalData);
      const idx = goals.findIndex(g => g.id === editingGoalId);
      if (idx !== -1) goals[idx] = updated;
      showToast('Meta atualizada!', 'success');
    } else {
      const newG = await API.createGoal(goalData);
      goals.push(newG);
      showToast('Meta criada!', 'success');
    }
    closeGoalModal();
    renderGoals();
  } catch (e) {
    showToast('Erro ao salvar meta.', 'error');
  }
}

function renderGoals() {
  const container = document.getElementById('goalsList');
  if (goals.length === 0) {
    container.innerHTML = emptyState('🏆', 'Nenhuma meta criada ainda.');
    return;
  }
  container.className = 'goals-grid';
  container.innerHTML = goals.map(g => {
    const pct = Math.min(100, (g.current / g.target) * 100);
    const deadlineStr = g.deadline ? `Prazo: ${fmtDate(g.deadline)}` : 'Sem prazo definido';
    return `
      <div class="goal-card" data-id="${g.id}">
        <div class="goal-card-header">
          <div class="goal-icon-wrap">${g.icon}</div>
          <div class="goal-actions">
            <button class="tx-action-btn edit-goal" data-id="${g.id}">✏️</button>
            <button class="tx-action-btn delete delete-goal" data-id="${g.id}">🗑️</button>
          </div>
        </div>
        <div class="goal-name">${escHtml(g.name)}</div>
        <div class="goal-amounts">
          <span class="goal-current">${fmtCurrency(g.current)}</span>
          <span class="goal-sep">/</span>
          <span class="goal-target">${fmtCurrency(g.target)}</span>
        </div>
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-footer">
          <span class="goal-pct">${pct.toFixed(0)}% concluído</span>
          <span class="goal-deadline">${deadlineStr}</span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.edit-goal').forEach(btn => {
    btn.addEventListener('click', () => {
      const numId = parseInt(btn.dataset.id);
      const g = goals.find(x => x.id === numId);
      if (g) openGoalModal(g);
    });
  });
  container.querySelectorAll('.delete-goal').forEach(btn => {
    btn.addEventListener('click', async () => {
      const numId = parseInt(btn.dataset.id);
      const g = goals.find(x => x.id === numId);
      const name = g ? g.name : 'esta meta';
      const ok = await customConfirm(`Excluir a meta "${name}"?`, '🏆', 'Excluir Meta');
      if (!ok) return;

      try {
        await API.deleteGoal(numId);
        goals = goals.filter(x => x.id !== numId);
        renderGoals();
        showToast('Meta excluída.', 'info');
      } catch (e) {
        showToast('Erro ao excluir meta.', 'error');
      }
    });
  });
}

/* REPORT STATS */
function renderReportStats() {
  const incomes = transactions.filter(t => t.type === 'income');
  const expenses = transactions.filter(t => t.type === 'expense');

  const bigIncome = incomes.length ? Math.max(...incomes.map(t => t.amount)) : 0;
  const bigExpense = expenses.length ? Math.max(...expenses.map(t => t.amount)) : 0;

  const monthMap = {};
  expenses.forEach(t => {
    const key = t.date.substr(0, 7);
    monthMap[key] = (monthMap[key] || 0) + t.amount;
  });
  const monthVals = Object.values(monthMap);
  const avgExp = monthVals.length ? monthVals.reduce((s, v) => s + v, 0) / monthVals.length : 0;

  const yearInc = transactions.filter(t => { const d = new Date(t.date + 'T00:00:00'); return t.type === 'income' && d.getFullYear() === currentYear; }).reduce((s, t) => s + t.amount, 0);
  const yearExp = transactions.filter(t => { const d = new Date(t.date + 'T00:00:00'); return t.type === 'expense' && d.getFullYear() === currentYear; }).reduce((s, t) => s + t.amount, 0);

  document.getElementById('biggestIncome').textContent = fmtCurrency(bigIncome);
  document.getElementById('biggestExpense').textContent = fmtCurrency(bigExpense);
  document.getElementById('avgExpense').textContent = fmtCurrency(avgExp);
  document.getElementById('totalSaved').textContent = fmtCurrency(Math.max(0, yearInc - yearExp));
}

/* TOAST */
let toastTimeout;
function showToast(msg, type = 'info') {
  clearTimeout(toastTimeout);
  const toast = document.getElementById('toast');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.textContent = '';
  toast.className = `toast ${type}`;
  toast.textContent = icons[type] + ' ' + msg;
  toast.classList.add('show');
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* SETTINGS & MEMBERS */
function initSettings() {
  document.getElementById('profileName').value = userProfile.name;
  document.getElementById('profileEmail').value = userProfile.email;
  updateAvatarPreview(userProfile.avatar);

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const avatar = userProfile.avatar || '';

    try {
      const result = await API.updateProfile({ name, email, avatar });
      userProfile = result.user;
      setUserInfo();
      showToast('Perfil atualizado com sucesso!', 'success');
    } catch (e) {
      showToast('Erro ao atualizar perfil.', 'error');
    }
  });

  const avatarInput = document.getElementById('avatarInput');
  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        userProfile.avatar = e.target.result;
        updateAvatarPreview(userProfile.avatar);
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById('removeAvatarBtn').addEventListener('click', () => {
    userProfile.avatar = '';
    avatarInput.value = '';
    updateAvatarPreview('');
  });

  document.getElementById('addMemberBtn').addEventListener('click', () => openMemberModal());
  document.getElementById('closeMemberModal').addEventListener('click', closeMemberModal);
  document.getElementById('cancelMember').addEventListener('click', closeMemberModal);
  document.getElementById('memberForm').addEventListener('submit', saveMember);

  renderMembers();
}

function updateAvatarPreview(src) {
  const container = document.getElementById('avatarPreviewContainer');
  const text = document.getElementById('avatarPreviewText');
  if (src) {
    container.style.backgroundImage = `url(${src})`;
    text.style.display = 'none';
  } else {
    container.style.backgroundImage = 'none';
    text.style.display = 'block';
    text.textContent = (userProfile.name || 'U')[0].toUpperCase();
  }
}

function openMemberModal(member = null) {
  document.getElementById('editMemberId').value = member ? member.id : '';
  document.getElementById('memberName').value = member ? member.name : '';
  document.getElementById('memberRelation').value = member ? member.relation : 'Esposa';
  document.getElementById('memberModalTitle').textContent = member ? 'Editar Membro' : 'Novo Membro';
  document.getElementById('memberModal').classList.add('open');
}

function closeMemberModal() {
  document.getElementById('memberModal').classList.remove('open');
  document.getElementById('memberForm').reset();
}

async function saveMember(e) {
  e.preventDefault();
  const id = document.getElementById('editMemberId').value;
  const name = document.getElementById('memberName').value.trim();
  const relation = document.getElementById('memberRelation').value;
  if (!name || !relation) return;

  try {
    if (id) {
      const numId = parseInt(id);
      const updated = await API.updateMember(numId, { name, relation });
      const idx = familyMembers.findIndex(m => m.id === numId);
      if (idx !== -1) familyMembers[idx] = updated;
      showToast('Membro atualizado!', 'success');
    } else {
      const newM = await API.createMember({ name, relation });
      familyMembers.push(newM);
      showToast('Membro adicionado!', 'success');
    }
    closeMemberModal();
    renderMembers();
  } catch (e) {
    showToast('Erro ao salvar membro.', 'error');
  }
}

function renderMembers() {
  const container = document.getElementById('membersList');
  if (familyMembers.length === 0) {
    container.innerHTML = emptyState('👨‍👩‍👦', 'Nenhum membro da família adicionado.');
    return;
  }

  container.innerHTML = familyMembers.map(m => `
    <div class="member-item">
      <div class="member-info">
        <div class="member-avatar">${m.name[0].toUpperCase()}</div>
        <div class="member-details">
          <span class="member-name">${escHtml(m.name)}</span>
          <span class="member-relation">${m.relation}</span>
        </div>
      </div>
      <div class="tx-actions">
        <button type="button" class="tx-action-btn edit-member" data-id="${m.id}">✏️</button>
        <button type="button" class="tx-action-btn delete delete-member" data-id="${m.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.edit-member').forEach(btn => {
    btn.addEventListener('click', () => {
      const numId = parseInt(btn.dataset.id);
      const m = familyMembers.find(x => x.id === numId);
      if (m) openMemberModal(m);
    });
  });

  container.querySelectorAll('.delete-member').forEach(btn => {
    btn.addEventListener('click', async () => {
      const numId = parseInt(btn.dataset.id);
      const m = familyMembers.find(x => x.id === numId);
      const name = m ? m.name : 'este membro';
      const ok = await customConfirm(`Remover "${name}" da família?`, '👨‍👩‍👦', 'Remover Membro');
      if (!ok) return;

      try {
        await API.deleteMember(numId);
        familyMembers = familyMembers.filter(x => x.id !== numId);
        renderMembers();
        showToast('Membro removido.', 'info');
      } catch (e) {
        showToast('Erro ao remover membro.', 'error');
      }
    });
  });
}
