/* ============================================================
   FinanceIQ – Application Logic (SPA)
   ============================================================ */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = (k) => (window.FIQ && window.FIQ.t) ? window.FIQ.t(k) : k;
  const money = (v) => (window.FIQ && window.FIQ.fmtMoney) ? window.FIQ.fmtMoney(v, (S.settings && S.settings.currency) || 'AOA') : String(v);
  const fdate = (s) => (window.FIQ && window.FIQ.fmtDate) ? window.FIQ.fmtDate(s) : (s || '');
  const mlabel = (m) => (window.FIQ && window.FIQ.monthLabel) ? window.FIQ.monthLabel(m) : m;
  const fmtNum = (v) => {
    if (v == null || !isFinite(v)) return '—';
    const r = Math.round(v * 1e6) / 1e6;
    if (Object.is(r, -0)) return '0';
    const abs = Math.abs(r);
    const s = (abs !== 0 && abs < 1) ? String(r) : r.toFixed(2).replace(/\.?0+$/, '');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };
  const downloadText = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'download.txt';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
  };

  const S = {
    user: null, plan: null, settings: null, streak: 0,
    countries: [], currencies: [], categories: [],
    accounts: [], members: [], transactions: [],
    budgets: [], goals: [], debts: [], loans: [], recurring: [], transfers: [],
    notifications: [], unread: 0,
    month: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })(),
    view: 'dashboard',
    allTx: []
  };

  const VIEW_META = {
    dashboard: ['dashboard', ''],
    movements: ['movements', ''],
    budget: ['budget', ''],
    goals: ['goals', ''],
    accounts: ['accounts', ''],
    debts: ['debts', ''],
    reports: ['reports', ''],
    calendar: ['calendar', ''],
    assistant: ['assistant', ''],
    family: ['family', ''],
    challenges: ['challenges', ''],
    referrals: ['referrals', ''],
    plans: ['plans', ''],
    admin: ['admin', ''],
    settings: ['settings', '']
  };

  /* ---------------- API ---------------- */
  async function api(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error(t('error_generic'));
    }
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error(t('error_generic'));
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : null;
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : t('error_generic');
      if (data && data.code === 'PLAN_LIMIT') { openPaywall(); }
      throw new Error(msg);
    }
    return data;
  }

  /* ---------------- Toast ---------------- */
  function toast(msg, type) {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
  }

  /* ---------------- Modal ---------------- */
  function openModal(html, title) {
    $('#modal').innerHTML = '<div class="modal-head"><h3 class="modal-title">' + esc(title || '') + '</h3><button class="icon-btn" data-modal-close aria-label="' + esc(t('close')) + '">✕</button></div><div class="modal-body">' + html + '</div>';
    $('#modalOverlay').classList.remove('hidden');
    document.body.classList.add('modal-open');
    bindModalClose();
  }

  function closeModal() {
    $('#modalOverlay').classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  function bindModalClose() {
    const ov = $('#modalOverlay');
    ov.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', closeModal));
    ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
    document.addEventListener('keydown', function escKey(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escKey); }
    });
  }

  function openPaywall() {
    const feats = [t('paywall_features_1'), t('paywall_features_2'), t('paywall_features_3'), t('paywall_features_4'), t('paywall_features_5'), t('paywall_features_6')];
    const trial = S.plan && S.plan.trialActive;
    const days = S.plan ? S.plan.trialDaysLeft : 0;
    openModal(`
      <div class="paywall-body">
        <div class="paywall-hero">💎</div>
        <h3>${esc(t('paywall_why'))}</h3>
        ${trial ? `<p class="muted">${esc(t('trial_active'))} · ${days} ${esc(t('trial_days_left'))}</p>` : ''}
        <ul class="paywall-features">
          ${feats.map((f) => `<li><span class="paywall-check">✓</span> ${esc(f)}</li>`).join('')}
        </ul>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-modal-close>${esc(t('no_thanks'))}</button>
          <button class="btn btn-primary" id="paywallGoPlans">${esc(t('upgrade_now'))}</button>
        </div>
      </div>`, t('go_premium'));
    $('#paywallGoPlans').addEventListener('click', () => { closeModal(); nav('plans'); });
  }

  /* ---------------- Confirm ---------------- */
  function confirmBox(message, title) {
    return new Promise((resolve) => {
      openModal(`
        <p class="confirm-text">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button>
          <button class="btn btn-danger" id="confirmYes">${esc(t('confirm'))}</button>
        </div>`, title || t('confirm'));
      const yes = $('#confirmYes');
      const done = (v) => { closeModal(); yes.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); resolve(v); };
      const onClick = () => done(true);
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      yes.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ---------------- Init ---------------- */
  async function init() {
    bindGlobal();
    try {
      const me = await api('GET', '/api/auth/me');
      S.user = me.user;
      S.plan = me.plan;
      S.settings = me.settings;
      S.streak = me.streak || 0;
      S.countries = me.countries || [];
      S.currencies = me.currencies || [];
      if (window.FIQ) {
        window.FIQ.registerCurrencies(S.currencies);
        window.FIQ.dateFormat = S.settings.date_format;
        window.FIQ.setLang(S.settings.language || 'pt');
      }
      await loadBaseData();
      renderShell();
      nav('dashboard');
      if (!S.settings.onboarded) openOnboarding();
      loadNotifications(true);
    } catch (e) {
      $('#views').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>' + esc(e.message) + '</p></div>';
    }
  }

  async function loadBaseData() {
    const [cats, accs, mems] = await Promise.all([
      api('GET', '/api/categories'),
      api('GET', '/api/accounts'),
      api('GET', '/api/members')
    ]);
    S.categories = cats;
    S.accounts = accs.accounts || [];
    S.members = mems;
  }

  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarOverlay').classList.add('hidden'); }

  /* ---------------- Global events ---------------- */
  function bindGlobal() {
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => nav(b.dataset.view)));

    $('#hamburger').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebarOverlay').classList.remove('hidden'); });
    $('#sidebarOverlay').addEventListener('click', closeSidebar);

    $('#userMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#userMenu').classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#userMenuBtn')) $('#userMenu').classList.add('hidden'); });
    $$('#userMenu [data-action]').forEach((b) => b.addEventListener('click', () => {
      $('#userMenu').classList.add('hidden');
      const a = b.dataset.action;
      if (a === 'logout') doLogout();
      else if (a === 'open-settings') nav('settings');
      else if (a === 'open-plans') nav('plans');
    }));

    $('#monthPrev').addEventListener('click', () => shiftMonth(-1));
    $('#monthNext').addEventListener('click', () => shiftMonth(1));
    $('#monthInput').addEventListener('change', (e) => { S.month = e.target.value || S.month; reloadView(); });

    $('#notifBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#notifPanel').classList.toggle('hidden'); loadNotifications(false); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#notifBtn')) $('#notifPanel').classList.add('hidden'); });
    $('#notifReadAll').addEventListener('click', async () => {
      await api('POST', '/api/notifications/read', {});
      loadNotifications(true);
    });

    $('#fab').addEventListener('click', (e) => { e.stopPropagation(); $('#fabMenu').classList.toggle('hidden'); });
    $('#fabMain').addEventListener('click', (e) => { e.stopPropagation(); $('#fabMenu').classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.fab-wrap')) $('#fabMenu').classList.add('hidden'); });
    $$('#fabMenu [data-fab]').forEach((b) => b.addEventListener('click', () => {
      $('#fabMenu').classList.add('hidden');
      const f = b.dataset.fab;
      if (f === 'expense') openTxModal('expense');
      else if (f === 'income') openTxModal('income');
      else if (f === 'transfer') openTransferModal();
      else if (f === 'ocr') openOcrModal();
      else if (f === 'import') openImportModal();
    }));

    let debounce = null;
    $('#globalSearch').addEventListener('input', (e) => {
      clearTimeout(debounce);
      const q = e.target.value.trim();
      if (!q) { $('#searchResults').innerHTML = ''; return; }
      debounce = setTimeout(async () => {
        try {
          const rows = await api('GET', '/api/transactions?q=' + encodeURIComponent(q) + '&limit=8');
          renderSearchResults(rows, q);
        } catch (err) { /* ignore */ }
      }, 300);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { $('#fabMenu').classList.add('hidden'); $('#notifPanel').classList.add('hidden'); closeSidebar(); }
    });
  }

  function shiftMonth(delta) {
    const [y, m] = S.month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    S.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    reloadView();
  }

  function reloadView() {
    $('#monthInput').value = S.month;
    const loaders = {
      dashboard: loadDashboard, movements: loadMovements, budget: loadBudget,
      goals: loadGoals, accounts: loadAccounts, debts: loadDebts,
      reports: loadReports, calendar: loadCalendar
    };
    if (loaders[S.view]) loaders[S.view]();
  }

  async function doLogout() {
    await api('POST', '/api/auth/logout', {});
    window.location.href = '/login';
  }

  /* ---------------- Shell render ---------------- */
  function renderShell() {
    $('#planChipSide').innerHTML = planChipHtml();
    $('#streakVal').textContent = S.streak || 0;
    $('#userName').textContent = S.user.name;
    $('#userEmail').textContent = S.user.email;
    $('#userAvatar').textContent = (S.user.name || 'U')[0].toUpperCase();
    if (S.user.role === 'admin') $$('.nav-admin').forEach((b) => b.classList.remove('hidden'));
    if (window.FIQ) {
      $('#navMain').querySelectorAll('[data-view]').forEach((b) => { b.querySelector('.nav-label').textContent = t(b.dataset.view); });
      $('#pageTitle').textContent = t(S.view);
      $('#monthInput').value = S.month;
      document.documentElement.lang = window.FIQ.getLang();
    }
  }

  function planChipHtml() {
    const p = S.plan || { code: 'free', label: 'Grátis', trialActive: false, trialDaysLeft: 0 };
    if (p.trialActive) return `<span class="badge-trial">${esc(t('trial_active'))} · ${p.trialDaysLeft}d</span>`;
    if (p.code === 'pro') return `<span class="badge-pro">PRO</span>`;
    if (p.code === 'family') return `<span class="badge-pro">FAMÍLIA</span>`;
    return `<span class="badge-free">${esc(t('free'))}</span>`;
  }

  function checkPro() {
    if (S.plan && S.plan.code !== 'free') return true;
    openPaywall();
    return false;
  }

  /* ---------------- Navigation ---------------- */
  function nav(view) {
    const meta = VIEW_META[view];
    if (!meta) return;
    const proViews = ['debts', 'assistant', 'family', 'challenges'];
    if (proViews.includes(view) && !checkPro()) return;
    if (view === 'admin' && S.user && S.user.role !== 'admin') return;

    S.view = view;
    $$('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.bn-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    $('#pageTitle').textContent = t(view);
    $('#pageSubtitle').textContent = meta[1] || '';
    $('#main').scrollTop = 0;
    $('#fabMenu').classList.add('hidden');
    $('#notifPanel').classList.add('hidden');
    closeSidebar();
    if (window.FIQ) document.documentElement.lang = window.FIQ.getLang();

    const loaders = {
      dashboard: loadDashboard, movements: loadMovements, budget: loadBudget,
      goals: loadGoals, accounts: loadAccounts, debts: loadDebts,
      reports: loadReports, calendar: loadCalendar, assistant: renderAssistant,
      family: loadFamily, challenges: loadChallenges, referrals: loadReferrals,
      plans: renderPlans, admin: loadAdmin, settings: renderSettings
    };
    (loaders[view] || (() => {}))();
  }

  /* ---------------- Search ---------------- */
  function renderSearchResults(rows, q) {
    let box = $('#searchResults');
    if (!box) {
      box = document.createElement('div');
      box.id = 'searchResults';
      box.className = 'search-results';
      $('#globalSearch').parentElement.appendChild(box);
    }
    if (!rows.length) { box.innerHTML = `<div class="search-none">${esc(t('no_results'))}</div>`; return; }
    box.innerHTML = rows.map((r) => `
      <button class="search-item" data-id="${r.id}">
        <span class="search-icon">${r.type === 'income' ? '🟢' : '🔴'}</span>
        <span class="search-text">${esc(r.description)}</span>
        <span class="search-amt ${r.type === 'income' ? 'income' : 'expense'}">${money(r.amount)}</span>
      </button>`).join('');
    box.querySelectorAll('.search-item').forEach((b) => b.addEventListener('click', () => {
      box.innerHTML = '';
      openTxModal(r.type === 'income' ? 'income' : 'expense', rows.find((x) => x.id === Number(b.dataset.id)));
    }));
  }

  /* ---------------- DASHBOARD ---------------- */
  async function loadDashboard(showLoad) {
    const el = $('#view-dashboard');
    if (showLoad !== false) showLoading(el);
    try {
      const data = await api('GET', '/api/reports/dashboard?month=' + S.month + '&months=6');
      S.balanceHistory = data.balanceHistory || [];
      S.allTx = data.allTx || [];
      const totals = data.totals || { income: 0, expense: 0, balance: 0 };
      const accounts = data.accounts || [];
      const totalBalance = data.totalBalance || 0;
      const budgets = data.budgets || [];
      const goals = data.goals || [];
      const score = data.score || 0;

      let budgetTotal = 0, budgetSpent = 0;
      budgets.forEach((b) => { budgetTotal += b.limit || 0; budgetSpent += b.spent || 0; });
      const budgetPct = budgetTotal > 0 ? Math.min(100, Math.round((budgetSpent / budgetTotal) * 100)) : 0;

      el.innerHTML = `
        <div class="dash-grid">
          <div class="stat-card">
            <div class="stat-label">${esc(t('income'))}</div>
            <div class="stat-value income">${money(totals.income)}</div>
            <div class="stat-trend">${mlabel(S.month)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${esc(t('expense'))}</div>
            <div class="stat-value expense">${money(totals.expense)}</div>
            <div class="stat-trend">${mlabel(S.month)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${esc(t('balance'))}</div>
            <div class="stat-value">${money(totals.balance)}</div>
            <div class="stat-trend">${esc(t('this_month'))}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${esc(t('total_balance'))}</div>
            <div class="stat-value">${money(totalBalance)}</div>
            <div class="stat-trend">${accounts.length} ${esc(t('account'))}${accounts.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div class="cards-grid">
          <div class="card">
            <div class="card-head"><span class="card-title">${esc(t('trend'))}</span></div>
            <div class="card-body">${barChartHtml('balance', data.balanceHistory || [])}</div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-title">${esc(t('budget'))}</span></div>
            <div class="card-body">
              <div class="budget-summary">
                <div class="progress-label"><span>${esc(t('budget_spent'))}</span><strong>${money(budgetSpent)} / ${money(budgetTotal)}</strong></div>
                <div class="progress-bar"><div class="progress-fill ${budgetPct > 100 ? 'over' : ''}" style="width:${budgetPct}%"></div></div>
                <div class="progress-label"><span>${esc(t('budget_remaining'))}</span><strong>${money(budgetTotal - budgetSpent)}</strong></div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-title">${esc(t('score'))}</span></div>
            <div class="card-body score-card">${scoreRing(score)}</div>
          </div>
        </div>

        <div class="cards-grid">
          <div class="card">
            <div class="card-head">
              <span class="card-title">${esc(t('spend_today'))}</span>
              <button class="btn btn-ghost btn-sm" id="dashForecast">${esc(t('forecast'))}</button>
            </div>
            <div class="card-body">
              <div class="big-number">${data.spendToday ? money(data.spendToday.recommended) : money(0)}</div>
              ${data.spendToday && data.spendToday.explanation ? `
              <ul class="mini-list">
                ${data.spendToday.explanation.map((e) => `<li><span>${esc(e.label)}</span><b>${money(e.value)}</b></li>`).join('')}
              </ul>` : ''}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-title">${esc(t('goals'))}</span></div>
            <div class="card-body">
              ${goals.length ? goals.slice(0, 3).map((g) => {
                const p = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
                return `<div class="mini-goal">
                  <div class="progress-label"><span>${esc(g.icon)} ${esc(g.name)}</span><strong>${p}%</strong></div>
                  <div class="progress-bar"><div class="progress-fill accent" style="width:${p}%"></div></div>
                </div>`;
              }).join('') : `<p class="muted">${esc(t('empty'))}</p>`}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><span class="card-title">${esc(t('movements'))}</span></div>
          <div class="card-body">${renderTxRows((data.recent || []).slice(0, 8), true)}</div>
        </div>

        ${data.anomalies && data.anomalies.length ? `
        <div class="card warn-card">
          <div class="card-head"><span class="card-title">⚠️ ${esc(t('anomalies'))}</span></div>
          <div class="card-body">
            <ul class="mini-list">
              ${data.anomalies.map((a) => `<li><span>${a.type === 'duplicate' ? `🔁 ${esc(a.description)} (${a.date})` : `⚡ ${esc(a.category)}`}</span><b>${money(a.type === 'duplicate' ? a.amount : a.current)}</b></li>`).join('')}
            </ul>
          </div>
        </div>` : ''}
      `;

      if (data.goals) S.goals = data.goals;
      if (data.budgets) S.budgets = data.budgets;

      $('#dashForecast') && $('#dashForecast').addEventListener('click', async () => {
        const f = await api('GET', '/api/intelligence/forecast');
        openModal(`
          <div class="big-number">${money(f.predictedEnd)}</div>
          <ul class="mini-list">
            <li><span>${esc(t('income_future'))}</span><b>${money(f.projectedIncome)}</b></li>
            <li><span>${esc(t('fixed_expenses'))}</span><b>${money(f.projectedExpense)}</b></li>
            <li><span>${esc(t('avg'))} ${esc(t('expense'))}/${esc(t('day'))}</span><b>${money(f.avgDailyExpense)}</b></li>
          </ul>`, t('forecast'));
      });

      $('#view-dashboard').querySelectorAll('.tx-edit').forEach((btn) => btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const tx = data.recent.find((x) => x.id === id);
        if (tx) openTxModal(tx.type, tx);
      }));
      $('#view-dashboard').querySelectorAll('.tx-delete').forEach((btn) => btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const ok = await confirmBox(t('delete_confirm'));
        if (!ok) return;
        try { await api('DELETE', '/api/transactions/' + id); toast(t('deleted'), 'success'); loadDashboard(); } catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  async function loadDashboardQuiet() {
    if (S.view !== 'dashboard') return;
    await loadDashboard(false);
  }

  /* ---------------- Charts ---------------- */
  function barChartHtml(kind, rows) {
    if (!rows || !rows.length) return `<p class="muted">${esc(t('empty'))}</p>`;
    const max = Math.max(1, ...rows.map((r) => Math.max(r.income || 0, r.expense || 0, r.net || 0)));
    const w = rows.length;
    const barW = Math.max(4, Math.min(22, Math.floor(520 / w) - 4));
    const bars = rows.map((r) => {
      const label = (r.month || '').slice(5) + '/' + (r.month || '').slice(2, 4);
      const iH = ((r.income || 0) / max) * 100;
      const eH = ((r.expense || 0) / max) * 100;
      return `<div class="bar-col" style="width:${barW}px" title="${label}">
        ${kind === 'balance' ? `<div class="bar-stack">
          <div class="bar income" style="height:${iH}%"></div>
          <div class="bar expense" style="height:${eH}%"></div>
        </div>` : `<div class="bar-stack"><div class="bar ${r.net >= 0 ? 'income' : 'expense'}" style="height:${(Math.abs(r.net || 0) / max) * 100}%"></div></div>`}
        <span class="bar-label">${label}</span>
      </div>`;
    }).join('');
    return `<div class="bar-chart"><div class="bar-plot">${bars}</div><div class="chart-legend"><span class="lg income">${esc(t('income'))}</span><span class="lg expense">${esc(t('expense'))}</span></div></div>`;
  }

  function scoreRing(score) {
    const r = 34, c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, score));
    const color = pct >= 70 ? '#10d9a0' : pct >= 40 ? '#f7b731' : '#ff5c7c';
    return `<div class="score-wrap">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
        <circle cx="46" cy="46" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 46 46)"/>
      </svg>
      <div class="score-num">${pct}<small>/100</small></div>
    </div>`;
  }

  /* ---------------- Tx rows ---------------- */
  function renderTxRows(rows, withActions) {
    if (!rows || !rows.length) return `<div class="empty-state"><div class="empty-icon">📭</div><p>${esc(t('empty'))}</p></div>`;
    const cat = (name) => { const c = S.categories.find((x) => x.name === name); return c ? (c.icon || '🏷️') : '🏷️'; };
    return `<div class="tx-list">${rows.map((r) => `
      <div class="tx-row">
        <span class="tx-icon ${r.type}">${r.type === 'income' ? '🟢' : '🔴'}</span>
        <div class="tx-main">
          <span class="tx-desc">${esc(r.description)}</span>
          <span class="tx-cat">${cat(r.category)} ${esc(r.category || '')} · ${fdate(r.date)}</span>
        </div>
        <span class="tx-amount ${r.type}">${r.type === 'income' ? '+' : '−'}${money(r.amount)}</span>
        ${withActions ? `<div class="tx-actions">
          <button class="tx-action-btn tx-edit" data-id="${r.id}" aria-label="${esc(t('edit'))}">✏️</button>
          <button class="tx-action-btn tx-delete" data-id="${r.id}" aria-label="${esc(t('delete'))}">🗑️</button>
        </div>` : ''}
      </div>`).join('')}</div>`;
  }

  function showLoading(el) {
    el.innerHTML = `<div class="loading"><div class="spinner"></div><p>${esc(t('loading'))}</p></div>`;
  }

  window.FIQ = Object.assign(window.FIQ || {}, {
    nav, openTx: (type, tx) => openTxModal(type, tx), openBudget: () => openBudgetModal(),
    openAccount: () => openAccountModal(), openGoal: () => openGoalModal(),
    openQuickAdd: () => { $('#fabMenu').classList.toggle('hidden'); }
  });
/* ---------------- MOVEMENTS ---------------- */
  async function loadMovements() {
    const el = $('#view-movements');
    showLoading(el);
    const q = (S.movFilter || {});
    const params = new URLSearchParams();
    if (q.type) params.set('type', q.type);
    if (q.category) params.set('category', q.category);
    if (q.q) params.set('q', q.q);
    params.set('month', S.month);
    params.set('limit', '200');
    try {
      const rows = await api('GET', '/api/transactions?' + params.toString());
      S.transactions = rows;
      const totals = await api('GET', '/api/transactions/stats?month=' + S.month);
      const cats = S.categories;
      const expenseCats = cats.filter((c) => c.type === 'expense');
      const incomeCats = cats.filter((c) => c.type === 'income');

      el.innerHTML = `
        <div class="card">
          <div class="card-head">
            <span class="card-title">${esc(t('movements'))}</span>
            <div class="card-actions">
              <button class="btn btn-primary btn-sm" id="movAdd">＋ ${esc(t('add'))}</button>
            </div>
          </div>
          <div class="card-body">
            <div class="filters">
              <select id="movType" class="filter-select">
                <option value="">${esc(t('all_types'))}</option>
                <option value="income" ${q.type === 'income' ? 'selected' : ''}>${esc(t('income'))}</option>
                <option value="expense" ${q.type === 'expense' ? 'selected' : ''}>${esc(t('expense'))}</option>
              </select>
              <select id="movCat" class="filter-select">
                <option value="">${esc(t('all'))}</option>
                ${expenseCats.map((c) => `<option value="${esc(c.name)}" ${q.category === c.name ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
              </select>
              <input type="search" id="movQ" class="filter-search" placeholder="${esc(t('search'))}..." value="${esc(q.q || '')}" />
            </div>
            <div class="mov-stats">
              <span class="pill income">${esc(t('income'))}: ${money(totals.income)}</span>
              <span class="pill expense">${esc(t('expense'))}: ${money(totals.expense)}</span>
              <span class="pill">${esc(t('net'))}: ${money(totals.balance)}</span>
            </div>
            ${renderTxRows(rows, true)}
          </div>
        </div>`;

      $('#movAdd').addEventListener('click', () => openTxModal('expense'));
      $('#movType').addEventListener('change', (e) => { S.movFilter = S.movFilter || {}; S.movFilter.type = e.target.value || null; loadMovements(); });
      $('#movCat').addEventListener('change', (e) => { S.movFilter = S.movFilter || {}; S.movFilter.category = e.target.value || null; loadMovements(); });
      $('#movQ').addEventListener('input', (e) => {
        clearTimeout(S.movDebounce);
        S.movDebounce = setTimeout(() => { S.movFilter = S.movFilter || {}; S.movFilter.q = e.target.value.trim() || null; loadMovements(); }, 350);
      });

      el.querySelectorAll('.tx-edit').forEach((btn) => btn.addEventListener('click', () => {
        const tx = rows.find((x) => x.id === Number(btn.dataset.id));
        if (tx) openTxModal(tx.type, tx);
      }));
      el.querySelectorAll('.tx-delete').forEach((btn) => btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const ok = await confirmBox(t('delete_confirm'));
        if (!ok) return;
        try { await api('DELETE', '/api/transactions/' + id); toast(t('deleted'), 'success'); loadMovements(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- BUDGET ---------------- */
  async function loadBudget() {
    const el = $('#view-budget');
    showLoading(el);
    try {
      const budgets = await api('GET', '/api/budgets?month=' + S.month);
      S.budgets = budgets;
      const totalLimit = budgets.reduce((s, b) => s + (b.limit || 0), 0);
      const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);
      const expenseCats = S.categories.filter((c) => c.type === 'expense');
      const usedCats = budgets.map((b) => b.category);
      const unused = expenseCats.filter((c) => !usedCats.includes(c.name));

      el.innerHTML = `
        <div class="card">
          <div class="card-head">
            <span class="card-title">${esc(t('budget_title'))} · ${mlabel(S.month)}</span>
            <button class="btn btn-primary btn-sm" id="budgetAdd">＋ ${esc(t('add'))}</button>
          </div>
          <div class="card-body">
            ${budgets.length ? `
            <div class="budget-summary">
              <div class="progress-label"><span>${esc(t('budget_spent'))}</span><strong>${money(totalSpent)} / ${money(totalLimit)}</strong></div>
              <div class="progress-bar"><div class="progress-fill ${totalLimit > 0 && totalSpent > totalLimit ? 'over' : ''}" style="width:${totalLimit > 0 ? Math.min(100, (totalSpent / totalLimit) * 100) : 0}%"></div></div>
            </div>
            <div class="cards-grid budget-grid">
              ${budgets.map((b) => {
                const pct = Math.min(100, Math.round(b.pct || 0));
                const over = (b.pct || 0) > 100;
                return `<div class="budget-card ${over ? 'over' : ''}">
                  <div class="budget-head"><span>${esc(b.category)}</span><button class="tx-action-btn budget-del" data-id="${b.id}">🗑️</button></div>
                  <div class="progress-label"><span>${esc(t('budget_spent'))}</span><strong>${money(b.spent)} / ${money(b.limit)}</strong></div>
                  <div class="progress-bar"><div class="progress-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
                  <div class="budget-foot">
                    <span>${esc(t('budget_remaining'))}: ${money(b.limit - b.spent)}</span>
                    <button class="btn btn-ghost btn-sm budget-edit" data-id="${b.id}">${esc(t('edit'))}</button>
                  </div>
                </div>`;
              }).join('')}
            </div>` : `<div class="empty-state"><div class="empty-icon">📋</div><p>${esc(t('empty'))}</p><button class="btn btn-primary empty-action" id="budgetEmptyAdd">${esc(t('add'))}</button></div>`}
          </div>
        </div>`;

      $('#budgetAdd').addEventListener('click', () => openBudgetModal(null, unused));
      const ea = $('#budgetEmptyAdd'); ea && ea.addEventListener('click', () => openBudgetModal(null, unused));
      el.querySelectorAll('.budget-edit').forEach((b) => b.addEventListener('click', () => {
        const x = budgets.find((y) => y.id === Number(b.dataset.id));
        if (x) openBudgetModal(x);
      }));
      el.querySelectorAll('.budget-del').forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.dataset.id);
        const ok = await confirmBox(t('delete_confirm'));
        if (!ok) return;
        try { await api('DELETE', '/api/budgets/' + id); toast(t('deleted'), 'success'); loadBudget(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- GOALS ---------------- */
  async function loadGoals() {
    const el = $('#view-goals');
    showLoading(el);
    try {
      const [goals, models] = await Promise.all([api('GET', '/api/goals'), api('GET', '/api/scenarios')]);
      S.goals = goals;
      el.innerHTML = `
        <div class="card">
          <div class="card-head"><span class="card-title">${esc(t('goals'))}</span><button class="btn btn-primary btn-sm" id="goalAdd">＋ ${esc(t('goal_new'))}</button></div>
          <div class="card-body">
            ${goals.length ? `<div class="cards-grid goals-grid">
              ${goals.map((g) => {
                const p = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
                return `<div class="goal-card">
                  <div class="goal-head"><span class="goal-icon">${esc(g.icon || '🎯')}</span><span class="goal-name">${esc(g.name)}</span><button class="tx-action-btn goal-del" data-id="${g.id}">🗑️</button></div>
                  <div class="goal-progress">
                    <div class="progress-label"><span>${esc(t('goal_progress'))}</span><strong>${p}%</strong></div>
                    <div class="progress-bar"><div class="progress-fill accent" style="width:${p}%"></div></div>
                  </div>
                  <div class="goal-amounts"><span>${money(g.current)}</span><span>${esc(t('goal_target'))}: ${money(g.target)}</span></div>
                  ${g.deadline ? `<div class="goal-deadline">📅 ${esc(t('goal_deadline'))}: ${fdate(g.deadline)}</div>` : ''}
                  <div class="goal-actions">
                    <button class="btn btn-ghost btn-sm goal-edit" data-id="${g.id}">${esc(t('edit'))}</button>
                    <button class="btn btn-primary btn-sm goal-contrib" data-id="${g.id}">＋ ${esc(t('goal_contribute'))}</button>
                  </div>
                </div>`;
              }).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">🎯</div><p>${esc(t('empty'))}</p><button class="btn btn-primary empty-action" id="goalEmptyAdd">${esc(t('goal_new'))}</button></div>`}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">🔮 ${esc(t('scenarios_title'))}</span><button class="btn btn-ghost btn-sm" id="goalSeekBtn">🎯 ${esc(t('goal_seek'))}</button><button class="btn btn-primary btn-sm" id="scnNew">＋ ${esc(t('scenarios_new'))}</button></div>
          <div class="card-body">
            ${models.length ? `<div class="cards-grid goals-grid">
              ${models.map((m) => `
                <div class="goal-card scenario-card">
                  <div class="goal-head"><span class="goal-icon">🔮</span><span class="goal-name">${esc(m.name)}</span><button class="tx-action-btn scn-del" data-id="${m.id}">🗑️</button></div>
                  ${m.description ? `<div class="muted scenario-desc">${esc(m.description)}</div>` : ''}
                  <div class="goal-deadline">${m.variables.length} ${esc(t('scenario_vars_count'))} · ${m.scenarios.length} ${esc(t('scenario_scn_count'))}</div>
                  <div class="scenario-formula" title="${esc(m.result_label || t('scenario_result'))}">${esc(m.result_formula)}</div>
                  <div class="goal-actions">
                    <button class="btn btn-ghost btn-sm scn-edit" data-id="${m.id}">${esc(t('scenario_edit'))}</button>
                    <button class="btn btn-primary btn-sm scn-run" data-id="${m.id}">${esc(t('scenario_run'))}</button>
                  </div>
                </div>`).join('')}
            </div>` : `<div class="empty-state"><div class="empty-icon">🔮</div><p>${esc(t('scenario_no_models'))}</p><button class="btn btn-primary empty-action" id="scnEmptyNew">${esc(t('scenarios_new'))}</button></div>`}
          </div>
        </div>`;

      $('#goalAdd').addEventListener('click', () => openGoalModal());
      const ga = $('#goalEmptyAdd'); ga && ga.addEventListener('click', () => openGoalModal());
      el.querySelectorAll('.goal-edit').forEach((b) => b.addEventListener('click', () => { const g = goals.find((x) => x.id === Number(b.dataset.id)); if (g) openGoalModal(g); }));
      el.querySelectorAll('.goal-del').forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.dataset.id); const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
        try { await api('DELETE', '/api/goals/' + id); toast(t('deleted'), 'success'); loadGoals(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelectorAll('.goal-contrib').forEach((b) => b.addEventListener('click', () => { const g = goals.find((x) => x.id === Number(b.dataset.id)); if (g) openContributeModal(g); }));

      $('#scnNew').addEventListener('click', () => openScenarioModal());
      const sne = $('#scnEmptyNew'); sne && sne.addEventListener('click', () => openScenarioModal());
      $('#goalSeekBtn').addEventListener('click', () => openGoalSeekModal());
      el.querySelectorAll('.scn-edit').forEach((b) => b.addEventListener('click', () => { const m = models.find((x) => x.id === Number(b.dataset.id)); if (m) openScenarioModal(m); }));
      el.querySelectorAll('.scn-del').forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.dataset.id); const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
        try { await api('DELETE', '/api/scenarios/' + id); toast(t('deleted'), 'success'); loadGoals(); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelectorAll('.scn-run').forEach((b) => b.addEventListener('click', () => { const m = models.find((x) => x.id === Number(b.dataset.id)); if (m) runScenarios(m); }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- ACCOUNTS ---------------- */
  async function loadAccounts() {
    const el = $('#view-accounts');
    showLoading(el);
    try {
      const res = await api('GET', '/api/accounts');
      S.accounts = res.accounts || [];
      const total = res.total || 0;
      el.innerHTML = `
        <div class="card">
          <div class="card-head"><span class="card-title">${esc(t('accounts'))}</span><button class="btn btn-primary btn-sm" id="accAdd">＋ ${esc(t('add'))}</button></div>
          <div class="card-body">
            ${S.accounts.length ? `
            <div class="stat-card inline"><div class="stat-label">${esc(t('total_balance'))}</div><div class="stat-value">${money(total)}</div></div>
            <div class="cards-grid accounts-grid">
              ${S.accounts.map((a) => {
                const icons = { checking: '🏦', savings: '💰', cash: '💵', investment: '📈', credit: '💳' };
                return `<div class="account-card">
                  <div class="account-head">
                    <span class="account-icon">${icons[a.type] || '🏦'}</span>
                    <div class="account-info"><span class="account-name">${esc(a.name)}</span><span class="account-type">${esc(t('account_' + a.type) || a.type)}</span></div>
                    <button class="tx-action-btn acc-del" data-id="${a.id}">🗑️</button>
                  </div>
                  <div class="account-balance">${money(a.balance)}</div>
                  <div class="account-foot">
                    <span>${esc(a.institution || '—')}</span>
                    <button class="btn btn-ghost btn-sm acc-edit" data-id="${a.id}">${esc(t('edit'))}</button>
                  </div>
                </div>`;
              }).join('')}
            </div>` : `<div class="empty-state"><div class="empty-icon">🏦</div><p>${esc(t('empty'))}</p><button class="btn btn-primary empty-action" id="accEmptyAdd">${esc(t('add'))}</button></div>`}
          </div>
        </div>`;

      $('#accAdd').addEventListener('click', () => openAccountModal());
      const aa = $('#accEmptyAdd'); aa && aa.addEventListener('click', () => openAccountModal());
      el.querySelectorAll('.acc-edit').forEach((b) => b.addEventListener('click', () => { const a = S.accounts.find((x) => x.id === Number(b.dataset.id)); if (a) openAccountModal(a); }));
      el.querySelectorAll('.acc-del').forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.dataset.id); const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
        try { await api('DELETE', '/api/accounts/' + id); toast(t('deleted'), 'success'); loadAccounts(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }
/* ---------------- DEBTS + LOANS ---------------- */
  async function loadDebts() {
    const el = $('#view-debts');
    showLoading(el);
    try {
      const res = await api('GET', '/api/debts');
      const loans = await api('GET', '/api/loans');
      S.debts = res.debts || [];
      S.loans = loans;
      el.innerHTML = `
        <div class="mov-tabs" id="debtTabs">
          <button class="tab-btn active" data-tab="debts">🛡️ ${esc(t('debts'))}</button>
          <button class="tab-btn" data-tab="loans">🤝 ${esc(t('loan'))}s</button>
        </div>
        <div class="card">
          <div class="card-head">
            <span class="card-title" id="debtTitle">${esc(t('debts'))}</span>
            <button class="btn btn-primary btn-sm" id="debtAdd">＋ ${esc(t('add'))}</button>
          </div>
          <div class="card-body" id="debtBody"></div>
        </div>`;

      $('#debtAdd').addEventListener('click', () => openDebtModal());
      $$('#debtTabs .tab-btn').forEach((b) => b.addEventListener('click', () => {
        $$('#debtTabs .tab-btn').forEach((x) => x.classList.toggle('active', x === b));
        if (b.dataset.tab === 'debts') { $('#debtTitle').textContent = t('debts'); $('#debtAdd').textContent = '＋ ' + t('add'); renderDebtsTab(); }
        else { $('#debtTitle').textContent = t('loan') + 's'; $('#debtAdd').textContent = '＋ ' + t('loan'); renderLoansTab(); }
      }));
      renderDebtsTab();
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  function renderDebtsTab() {
    const box = $('#debtBody');
    if (!box) return;
    if (!S.debts.length) { box.innerHTML = `<div class="empty-state"><div class="empty-icon">🛡️</div><p>${esc(t('empty'))}</p><button class="btn btn-primary empty-action" id="debtEmptyAdd">${esc(t('add'))}</button></div>`; $('#debtEmptyAdd') && $('#debtEmptyAdd').addEventListener('click', () => openDebtModal()); return; }
    box.innerHTML = S.debts.map((d) => {
      const overdue = !d.paid && d.due_date < (new Date().toISOString().slice(0, 10));
      const status = d.remaining <= 0 ? 'paid' : overdue ? 'overdue' : d.paid_amount > 0 ? 'partial' : 'pending';
      return `<div class="debt-card">
        <div class="debt-head"><span class="debt-name">${esc(d.creditor)}</span><span class="status-pill ${status}">${esc(t(status))}</span></div>
        <div class="debt-body">
          <div class="debt-remaining">${money(d.remaining)} <small>${esc(t('debt'))}</small></div>
          <div class="progress-bar"><div class="progress-fill ${status === 'paid' ? 'good' : ''}" style="width:${d.pct}%"></div></div>
          <div class="debt-meta">
            <span>${esc(t('original_amount'))}: ${money(d.original_amount)}</span>
            <span>${esc(t('due_date'))}: ${fdate(d.due_date)}</span>
            ${d.interest_rate ? `<span>${esc(t('interest_rate'))}: ${d.interest_rate}%</span>` : ''}
          </div>
        </div>
        <div class="debt-actions">
          <button class="btn btn-primary btn-sm debt-pay" data-id="${d.id}">${esc(t('paid'))}</button>
          <button class="btn btn-ghost btn-sm debt-edit" data-id="${d.id}">${esc(t('edit'))}</button>
          <button class="btn btn-ghost btn-sm debt-del" data-id="${d.id}">🗑️</button>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('.debt-pay').forEach((b) => b.addEventListener('click', () => { const d = S.debts.find((x) => x.id === Number(b.dataset.id)); if (d) openPayDebtModal(d); }));
    box.querySelectorAll('.debt-edit').forEach((b) => b.addEventListener('click', () => { const d = S.debts.find((x) => x.id === Number(b.dataset.id)); if (d) openDebtModal(d); }));
    box.querySelectorAll('.debt-del').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.id); const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
      try { await api('DELETE', '/api/debts/' + id); toast(t('deleted'), 'success'); loadDebts(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  function renderLoansTab() {
    const box = $('#debtBody');
    if (!box) return;
    if (!S.loans.length) { box.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div><p>${esc(t('empty'))}</p><button class="btn btn-primary empty-action" id="loanEmptyAdd">${esc(t('add'))}</button></div>`; $('#loanEmptyAdd') && $('#loanEmptyAdd').addEventListener('click', () => openLoanModal()); return; }
    box.innerHTML = S.loans.map((l) => `
      <div class="debt-card">
        <div class="debt-head"><span class="debt-name">${l.direction === 'lent' ? '📤' : '📥'} ${esc(l.person)}</span><span class="status-pill ${l.status}">${esc(t(l.status))}</span></div>
        <div class="debt-body">
          <div class="debt-remaining">${money(l.amount)} <small>${esc(t(l.direction === 'lent' ? 'lent' : 'borrowed'))}</small></div>
          <div class="debt-meta"><span>${esc(t('date'))}: ${fdate(l.date)}</span><span>${esc(t('status'))}: ${esc(t(l.status))}</span></div>
        </div>
        <div class="debt-actions">
          <button class="btn btn-ghost btn-sm loan-edit" data-id="${l.id}">${esc(t('edit'))}</button>
          <button class="btn btn-ghost btn-sm loan-del" data-id="${l.id}">🗑️</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('.loan-edit').forEach((b) => b.addEventListener('click', () => { const l = S.loans.find((x) => x.id === Number(b.dataset.id)); if (l) openLoanModal(l); }));
    box.querySelectorAll('.loan-del').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.id); const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
      try { await api('DELETE', '/api/loans/' + id); toast(t('deleted'), 'success'); loadDebts(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  /* ---------------- REPORTS ---------------- */
  async function loadReports() {
    const el = $('#view-reports');
    showLoading(el);
    try {
      const monthly = await api('GET', '/api/reports/monthly?month=' + S.month);
      const comparison = await api('GET', '/api/reports/comparison?months=6');
      const categories = await api('GET', '/api/reports/categories?month=' + S.month);
      const accounts = await api('GET', '/api/reports/accounts');
      const recurring = await api('GET', '/api/reports/recurring');

      const catRows = (rows) => rows.length ? rows.map((r) => `
        <div class="tx-row">
          <span class="tx-icon">🏷️</span>
          <div class="tx-main"><span class="tx-desc">${esc(r.category)}</span><span class="tx-cat">${esc(r.category)}</span></div>
          <span class="tx-amount expense">${money(r.s)}</span>
        </div>`).join('') : `<p class="muted">${esc(t('empty'))}</p>`;

      el.innerHTML = `
        <div class="mov-tabs" id="reportTabs">
          <button class="tab-btn active" data-tab="monthly">📊 ${esc(t('report_monthly'))}</button>
          <button class="tab-btn" data-tab="comparison">📈 ${esc(t('report_comparison'))}</button>
          <button class="tab-btn" data-tab="categories">🏷️ ${esc(t('report_categories'))}</button>
          <button class="tab-btn" data-tab="accounts">🏦 ${esc(t('report_accounts'))}</button>
          <button class="tab-btn" data-tab="recurring">🔁 ${esc(t('report_recurring'))}</button>
        </div>
        <div class="card">
          <div class="card-head">
            <span class="card-title" id="reportTitle">${esc(t('report_monthly'))}</span>
            <div class="card-actions">
              <a class="btn btn-ghost btn-sm" href="/api/export/transactions?format=csv&month=${S.month}">${esc(t('export_csv'))}</a>
              <a class="btn btn-ghost btn-sm" href="/api/export/transactions?format=xlsx&month=${S.month}">${esc(t('export_excel'))}</a>
            </div>
          </div>
          <div class="card-body" id="reportBody">
            <div class="dash-grid">
              <div class="stat-card"><div class="stat-label">${esc(t('total_income'))}</div><div class="stat-value income">${money(monthly.totals.income)}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('total_expense'))}</div><div class="stat-value expense">${money(monthly.totals.expense)}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('net'))}</div><div class="stat-value">${money(monthly.totals.balance)}</div></div>
              ${monthly.totals.income ? `<div class="stat-card"><div class="stat-label">${esc(t('savings_rate'))}</div><div class="stat-value">${Math.round((monthly.totals.balance / monthly.totals.income) * 100)}%</div></div>` : ''}
            </div>
            <div class="card-inner"><h4>${esc(t('top_categories'))}</h4>${catRows(monthly.categories || [])}</div>
            <div class="card-inner"><h4>${esc(t('trend'))}</h4>${barChartHtml('balance', monthly.balanceHistory || [])}</div>
          </div>
        </div>`;

      const tabs = {
        monthly: () => { $('#reportTitle').textContent = t('report_monthly');
          $('#reportBody').innerHTML = `
            <div class="dash-grid">
              <div class="stat-card"><div class="stat-label">${esc(t('total_income'))}</div><div class="stat-value income">${money(monthly.totals.income)}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('total_expense'))}</div><div class="stat-value expense">${money(monthly.totals.expense)}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('net'))}</div><div class="stat-value">${money(monthly.totals.balance)}</div></div>
              ${monthly.totals.income ? `<div class="stat-card"><div class="stat-label">${esc(t('savings_rate'))}</div><div class="stat-value">${Math.round((monthly.totals.balance / monthly.totals.income) * 100)}%</div></div>` : ''}
            </div>
            <div class="card-inner"><h4>${esc(t('top_categories'))}</h4>${catRows(monthly.categories || [])}</div>
            <div class="card-inner"><h4>${esc(t('trend'))}</h4>${barChartHtml('balance', monthly.balanceHistory || [])}</div>`;
        },
        comparison: () => { $('#reportTitle').textContent = t('report_comparison');
          $('#reportBody').innerHTML = `<div class="card-inner">${barChartHtml('balance', comparison.months || [])}</div>`;
        },
        categories: () => { $('#reportTitle').textContent = t('report_categories');
          $('#reportBody').innerHTML = `<div class="report-cols">
            <div class="card-inner"><h4>${esc(t('expense'))}</h4>${catRows(categories.expenses || [])}</div>
            <div class="card-inner"><h4>${esc(t('income'))}</h4>${catRows(categories.incomes || [])}</div>
          </div>`;
        },
        accounts: () => { $('#reportTitle').textContent = t('report_accounts');
          $('#reportBody').innerHTML = (accounts.accounts || []).length ? accounts.accounts.map((a) => `
            <div class="tx-row"><span class="tx-icon">🏦</span><div class="tx-main"><span class="tx-desc">${esc(a.name)}</span><span class="tx-cat">${esc(t('account_' + a.type) || a.type)}</span></div><span class="tx-amount">${money(a.balance)}</span></div>`).join('') : `<p class="muted">${esc(t('empty'))}</p>`;
        },
        recurring: () => { $('#reportTitle').textContent = t('report_recurring');
          $('#reportBody').innerHTML = (recurring.rows || []).length ? recurring.rows.map((r) => `
            <div class="tx-row"><span class="tx-icon">${r.type === 'income' ? '🟢' : '🔴'}</span><div class="tx-main"><span class="tx-desc">${esc(r.description)}</span><span class="tx-cat">${esc(t('recurring'))} · ${esc(t(r.frequency))}</span></div><span class="tx-amount ${r.type}">${money(r.amount)}</span></div>`).join('') : `<p class="muted">${esc(t('empty'))}</p>`;
        }
      };

      $$('#reportTabs .tab-btn').forEach((b) => b.addEventListener('click', () => {
        $$('#reportTabs .tab-btn').forEach((x) => x.classList.toggle('active', x === b));
        tabs[b.dataset.tab]();
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- CALENDAR ---------------- */
  async function loadCalendar() {
    const el = $('#view-calendar');
    showLoading(el);
    try {
      const data = await api('GET', '/api/intelligence/calendar?month=' + S.month);
      const days = data.days || {};
      const [y, m] = S.month.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const startDow = first.getDay();
      const dim = new Date(y, m, 0).getDate();
      let cells = '';
      for (let i = 0; i < startDow; i++) cells += `<div class="cal-day empty"></div>`;
      for (let d = 1; d <= dim; d++) {
        const key = S.month + '-' + String(d).padStart(2, '0');
        const info = days[key];
        const today = key === new Date().toISOString().slice(0, 10);
        cells += `<div class="cal-day ${today ? 'today' : ''} ${info ? 'has-tx' : ''}" data-day="${d}">
          <span class="cal-num">${d}</span>
          ${info ? `<div class="cal-bal income">+${money(info.income || 0)}</div><div class="cal-bal expense">−${money(info.expense || 0)}</div>` : ''}
          ${info && info.recurring ? info.recurring.map((r) => `<div class="cal-ev ${r.type}">${esc(r.description)}</div>`).join('') : ''}
        </div>`;
      }
      el.innerHTML = `
        <div class="card">
          <div class="card-head"><span class="card-title">${mlabel(S.month)}</span></div>
          <div class="card-body">
            <div class="cal-grid">
              <div class="cal-head">S</div><div class="cal-head">T</div><div class="cal-head">Q</div><div class="cal-head">Q</div><div class="cal-head">S</div><div class="cal-head">S</div><div class="cal-head">D</div>
              ${cells}
            </div>
          </div>
        </div>`;
      el.querySelectorAll('.cal-day[data-day]').forEach((c) => c.addEventListener('click', () => {
        const day = c.dataset.day;
        const date = S.month + '-' + String(day).padStart(2, '0');
        openDayModal(date);
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  async function openDayModal(date) {
    const rows = await api('GET', '/api/transactions?month=' + S.month + '&limit=500');
    const dayRows = rows.filter((r) => r.date === date);
    openModal(`
      <h4>${fdate(date)}</h4>
      ${renderTxRows(dayRows, true)}
      <div class="modal-actions"><button class="btn btn-primary" id="dayAdd">＋ ${esc(t('add'))}</button></div>`, fdate(date));
    $('#dayAdd').addEventListener('click', () => { closeModal(); openTxModal('expense'); });
    const m = $('#modal');
    m.querySelectorAll('.tx-edit').forEach((b) => b.addEventListener('click', () => { const x = dayRows.find((r) => r.id === Number(b.dataset.id)); if (x) openTxModal(x.type, x); }));
    m.querySelectorAll('.tx-delete').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.id); const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
      try { await api('DELETE', '/api/transactions/' + id); toast(t('deleted'), 'success'); closeModal(); loadCalendar(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  /* ---------------- ASSISTANT ---------------- */
  function renderAssistant() {
    const el = $('#view-assistant');
    const suggestions = [t('spend_today'), t('score'), t('forecast'), 'resumo do mês', 'meu saldo', 'minhas dívidas'];
    el.innerHTML = `
      <div class="card chat-card">
        <div class="card-head"><span class="card-title">🤖 ${esc(t('assistant_title'))}</span></div>
        <div class="card-body">
          <div class="chat-log" id="chatLog"></div>
          <div class="chat-suggestions">
            ${suggestions.map((s) => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join('')}
          </div>
          <div class="chat-input-row">
            <input type="text" id="chatInput" placeholder="${esc(t('ask_placeholder'))}" autocomplete="off" />
            <button class="btn btn-primary" id="chatSend">➤</button>
          </div>
        </div>
      </div>`;
    const addMsg = (role, text) => {
      const log = $('#chatLog');
      const d = document.createElement('div');
      d.className = 'chat-msg ' + role;
      d.textContent = text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    };
    const ask = async (q) => {
      if (!q.trim()) return;
      addMsg('user', q);
      $('#chatInput').value = '';
      addMsg('bot', t('loading'));
      try {
        const res = await api('POST', '/api/ai/ask', { question: q });
        const msgs = $('#chatLog').querySelectorAll('.chat-msg');
        msgs[msgs.length - 1].textContent = res.response;
      } catch (e) {
        const msgs = $('#chatLog').querySelectorAll('.chat-msg');
        msgs[msgs.length - 1].textContent = e.message;
      }
    };
    $('#chatSend').addEventListener('click', () => ask($('#chatInput').value));
    $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask($('#chatInput').value); });
    el.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => ask(c.dataset.q)));
    $('#chatInput').focus();
  }

  /* ---------------- FAMILY ---------------- */
  async function loadFamily() {
    const el = $('#view-family');
    showLoading(el);
    try {
      const res = await api('GET', '/api/family');
      const family = res.family, members = res.members || [], invited = res.invited || [];
      el.innerHTML = `
        <div class="card">
          <div class="card-head"><span class="card-title">👨‍👩‍👧 ${esc(t('family_title'))}</span>
            ${family ? '<button class="btn btn-primary btn-sm" id="famInvite">＋ ' + esc(t('invite_member')) + '</button>' : '<button class="btn btn-primary btn-sm" id="famCreate">＋ ' + esc(t('create_family')) + '</button>'}
          </div>
          <div class="card-body">
            ${family ? `
              <div class="family-info"><strong>${esc(family.name)}</strong><span>${members.filter((m) => m.status === 'active').length} ${esc(t('members'))}</span></div>
              <div class="members-list">
                ${members.map((m) => `
                  <div class="member-item">
                    <div class="member-avatar">${m.name ? m.name[0].toUpperCase() : '?'}</div>
                    <div class="member-details">
                      <span class="member-name">${esc(m.name || m.email || m.user_email || '?')}</span>
                      <span class="member-relation">${m.status === 'pending' ? esc(t('pending')) : esc(t(m.role || 'member'))}</span>
                    </div>
                    <div class="tx-actions">
                      ${m.user_id !== S.user.id ? `<button class="tx-action-btn fam-del" data-id="${m.id}">🗑️</button>` : '<span class="status-pill active">' + esc(t('you')) + '</span>'}
                    </div>
                  </div>`).join('')}
              </div>
              <div class="family-join">
                <input type="text" id="famCode" placeholder="${esc(t('join_with_code'))}" />
                <button class="btn btn-ghost" id="famJoin">${esc(t('join_family'))}</button>
              </div>` : `<div class="empty-state"><div class="empty-icon">👨‍👩‍👧</div><p>${esc(t('empty'))}</p><button class="btn btn-primary empty-action" id="famEmptyCreate">${esc(t('create_family'))}</button></div>`}
          </div>
        </div>`;

      const fc = $('#famCreate'); fc && fc.addEventListener('click', () => openFamilyCreate());
      const fe = $('#famEmptyCreate'); fe && fe.addEventListener('click', () => openFamilyCreate());
      $('#famInvite') && $('#famInvite').addEventListener('click', () => openFamilyInvite());
      $('#famJoin') && $('#famJoin').addEventListener('click', async () => {
        const code = $('#famCode').value.trim(); if (!code) return;
        try { await api('POST', '/api/family/join', { inviteCode: code }); toast(t('success'), 'success'); loadFamily(); } catch (e) { toast(e.message, 'error'); }
      });
      el.querySelectorAll('.fam-del').forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.dataset.id); const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
        try { await api('DELETE', '/api/family/' + id); toast(t('deleted'), 'success'); loadFamily(); } catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }
/* ---------------- CHALLENGES ---------------- */
  async function loadChallenges() {
    const el = $('#view-challenges');
    showLoading(el);
    try {
      const data = await api('GET', '/api/gamification');
      const challenges = data.challenges || [];
      const achievements = data.achievements || [];
      const points = data.points || 0;
      el.innerHTML = `
        <div class="stats-row">
          <div class="stat-card"><div class="stat-label">${esc(t('points'))}</div><div class="stat-value">🏆 ${points}</div></div>
          <div class="stat-card"><div class="stat-label">${esc(t('streak'))}</div><div class="stat-value">🔥 ${data.streak || 0}</div></div>
          <div class="stat-card"><div class="stat-label">${esc(t('achievements_title'))}</div><div class="stat-value">🎖️ ${achievements.length}</div></div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">🏆 ${esc(t('challenges_title'))}</span></div>
          <div class="card-body">
            ${challenges.length ? challenges.map((c) => {
              const pct = c.target > 0 ? Math.min(100, Math.round((c.progress / c.target) * 100)) : 0;
              return `<div class="challenge-card ${c.completed ? 'done' : ''}">
                <div class="challenge-head"><span class="challenge-icon">${esc(c.icon)}</span>
                  <div class="challenge-info"><span class="challenge-name">${esc(c.name)}</span><span class="challenge-desc">${esc(c.description)}</span></div>
                  ${c.completed ? '<span class="status-pill paid">✓</span>' : `<span class="challenge-reward">+${c.reward}</span>`}
                </div>
                <div class="progress-label"><span>${c.progress} / ${c.target}</span><strong>${pct}%</strong></div>
                <div class="progress-bar"><div class="progress-fill ${c.completed ? 'good' : 'accent'}" style="width:${pct}%"></div></div>
              </div>`;
            }).join('') : `<p class="muted">${esc(t('empty'))}</p>`}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">🎖️ ${esc(t('achievements_title'))}</span></div>
          <div class="card-body">
            ${achievements.length ? `<div class="achievements-grid">${achievements.map((a) => `
              <div class="achievement">
                <span class="ach-icon">${esc(a.icon)}</span>
                <span class="ach-name">${esc(a.name)}</span>
                <span class="ach-desc">${esc(a.description)}</span>
              </div>`).join('')}</div>` : `<p class="muted">${esc(t('empty'))}</p>`}
          </div>
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- REFERRALS ---------------- */
  async function loadReferrals() {
    const el = $('#view-referrals');
    showLoading(el);
    try {
      const data = await api('GET', '/api/referrals');
      el.innerHTML = `
        <div class="card">
          <div class="card-head"><span class="card-title">🤝 ${esc(t('referral_title'))}</span></div>
          <div class="card-body">
            <p class="muted">${esc(t('referral_reward'))}</p>
            <div class="referral-box">
              <input type="text" id="refLink" value="${esc(data.link)}" readonly />
              <button class="btn btn-primary" id="refCopy">${esc(t('copy'))}</button>
            </div>
            <div class="stats-row">
              <div class="stat-card"><div class="stat-label">${esc(t('referrals'))}</div><div class="stat-value">${data.stats.sent}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('pending'))}</div><div class="stat-value">${data.stats.pending}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('success'))}</div><div class="stat-value">${data.stats.rewarded}</div></div>
              <div class="stat-card"><div class="stat-label">Pro ${esc(t('day'))}s</div><div class="stat-value">${data.stats.totalDays}</div></div>
            </div>
            ${data.rewards.length ? `<h4>${esc(t('referrals'))}</h4><div class="referral-table">
              ${data.rewards.map((r) => `
                <div class="tx-row">
                  <div class="tx-main"><span class="tx-desc">${esc(r.referred_name || r.referred_email)}</span><span class="tx-cat">${esc(r.referred_email)}</span></div>
                  <span class="status-pill ${r.status}">${esc(r.status)}</span>
                </div>`).join('')}
            </div>` : ''}
          </div>
        </div>`;
      $('#refCopy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(data.link); toast(t('copied'), 'success'); }
        catch (e) { $('#refLink').select(); document.execCommand('copy'); toast(t('copied'), 'success'); }
      });
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- PLANS ---------------- */
  async function renderPlans() {
    const el = $('#view-plans');
    showLoading(el);
    try {
      const data = await api('GET', '/api/plans');
      S.plan = data.current;
      const plans = data.plans || [];
      const currentCode = (data.current && data.current.code) || 'free';
      const trial = data.trialActive;
      el.innerHTML = `
        ${trial ? `<div class="trial-banner">✨ ${esc(t('trial_active'))} · ${data.trialDaysLeft} ${esc(t('trial_days_left'))}</div>` : ''}
        <div class="plans-grid">
          ${plans.map((p) => {
            const isCurrent = p.code === currentCode;
            const featured = p.code === 'pro';
            const feats = Object.keys(p.features || {}).map((k) => `<li class="plan-feature ${p.features[k] ? 'on' : 'off'}"><span>${p.features[k] ? '✓' : '✕'}</span> ${esc(k.replace(/_/g, ' '))}</li>`).join('');
            return `<div class="plan-card ${featured ? 'featured' : ''} ${isCurrent ? 'current' : ''}">
              <div class="plan-name">${p.code === 'free' ? esc(t('free')) : esc(p.name)}</div>
              <div class="plan-price"><span>${p.price_monthly > 0 ? p.price_monthly.toFixed(2) : '0'}</span><small>${p.price_monthly > 0 ? '/ ' + esc(t('monthly_billing').toLowerCase()) : ''}</small></div>
              ${p.price_annual > 0 ? `<div class="plan-annual">${p.price_annual.toFixed(2)} / ${esc(t('year'))}</div>` : ''}
              <ul class="plan-features">${feats}</ul>
              ${isCurrent ? `<button class="btn btn-ghost btn-block" disabled>${esc(t('current_plan'))}</button>`
                : p.code === 'free'
                  ? `<button class="btn btn-ghost btn-block plan-cancel" data-plan="free">${esc(t('cancel_plan'))}</button>`
                  : `<button class="btn btn-primary btn-block plan-upgrade" data-plan="${p.code}">${esc(t('upgrade_now'))}</button>`}
            </div>`;
          }).join('')}
        </div>`;
      el.querySelectorAll('.plan-upgrade').forEach((b) => b.addEventListener('click', async () => {
        const plan = b.dataset.plan;
        const ok = await confirmBox(t('upgrade_now') + '?', plan.toUpperCase());
        if (!ok) return;
        try { await api('POST', '/api/plans/upgrade', { plan, period: 'month', durationMonths: 1 }); toast(t('success'), 'success'); renderPlans(); renderShell(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelectorAll('.plan-cancel').forEach((b) => b.addEventListener('click', async () => {
        const ok = await confirmBox(t('downgrade_confirm'));
        if (!ok) return;
        try { await api('POST', '/api/plans/cancel', {}); toast(t('updated'), 'success'); renderPlans(); renderShell(); } catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- ADMIN ---------------- */
  async function loadAdmin() {
    const el = $('#view-admin');
    showLoading(el);
    try {
      const m = await api('GET', '/api/admin/dashboard');
      const users = await api('GET', '/api/admin/users');
      el.innerHTML = `
        <div class="mov-tabs" id="adminTabs">
          <button class="tab-btn active" data-tab="overview">📊 ${esc(t('admin_overview'))}</button>
          <button class="tab-btn" data-tab="users">👥 ${esc(t('admin_users'))}</button>
          <button class="tab-btn" data-tab="plans">📋 ${esc(t('admin_plans'))}</button>
        </div>
        <div class="card" id="adminCard">
          <div class="card-body" id="adminBody">
            <div class="dash-grid">
              <div class="stat-card"><div class="stat-label">${esc(t('total_users'))}</div><div class="stat-value">${m.users}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('pro_users'))}</div><div class="stat-value">${m.proUsers}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('trial_users'))}</div><div class="stat-value">${m.trialUsers}</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('mrr'))}</div><div class="stat-value">${money(m.mrr)}</div></div>
            </div>
            <div class="dash-grid">
              <div class="stat-card"><div class="stat-label">${esc(t('conversion_rate'))}</div><div class="stat-value">${m.conversionRate}%</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('churn_rate'))}</div><div class="stat-value">${m.churnRate}%</div></div>
              <div class="stat-card"><div class="stat-label">${esc(t('new_this_month'))}</div><div class="stat-value">${m.newMonth}</div></div>
              <div class="stat-card"><div class="stat-label">Famílias</div><div class="stat-value">${m.families}</div></div>
            </div>
            <div class="card-inner"><h4>Novos (7 dias)</h4>${barChartHtml('net', (m.signups7 || []).map((s) => ({ month: s.date.slice(0, 7) + '-' + s.date.slice(8, 10), net: s.count })))}</div>
          </div>
        </div>`;

      const renderUsers = () => {
        $('#adminBody').innerHTML = `
          <div class="table">
            <div class="table-head"><span>ID</span><span>${esc(t('name'))}</span><span>${esc(t('email'))}</span><span>${esc(t('plan'))}</span><span>${esc(t('role'))}</span><span>${esc(t('validity'))}</span><span>${esc(t('status'))}</span><span></span></div>
            ${users.map((u) => `<div class="table-row">
              <span>${u.id}</span>
              <span>${esc(u.name)}</span>
              <span>${esc(u.email)}</span>
              <span class="status-pill ${u.plan_code === 'free' ? 'pending' : 'paid'}">${esc(u.plan_code)}</span>
              <span>${esc(u.role)}</span>
              <span>${u.trial_end || u.current_period_end ? esc(fdate(u.trial_end || u.current_period_end)) : '—'}</span>
              <span>${u.is_active ? '<span class="status-pill active">✓</span>' : '<span class="status-pill overdue">✕</span>'}</span>
              <button class="btn btn-ghost btn-sm admin-edit" data-id="${u.id}">${esc(t('edit'))}</button>
            </div>`).join('')}
          </div>`;
        $('#adminBody').querySelectorAll('.admin-edit').forEach((b) => b.addEventListener('click', () => {
          const u = users.find((x) => x.id === Number(b.dataset.id));
          if (u) openAdminUserModal(u);
        }));
      };

      const renderPlans = async () => {
        $('#adminBody').innerHTML = `<div class="empty-state"><p>${esc(t('loading'))}</p></div>`;
        let plans;
        try { plans = await api('GET', '/api/admin/plans'); } catch (e) { $('#adminBody').innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`; return; }
        $('#adminBody').innerHTML = `
          <div class="table">
            <div class="table-head"><span>ID</span><span>${esc(t('name'))}</span><span>Código</span><span>${esc(t('price_monthly'))}</span><span>${esc(t('price_annual'))}</span><span>${esc(t('trial_days'))}</span><span>${esc(t('status'))}</span><span></span></div>
            ${plans.map((p) => `<div class="table-row">
              <span>${p.id}</span>
              <span>${esc(p.name)}</span>
              <span>${esc(p.code)}</span>
              <span>${p.price_monthly.toFixed(2)}</span>
              <span>${p.price_annual.toFixed(2)}</span>
              <span>${p.trial_days}</span>
              <span class="status-pill ${p.is_active ? 'active' : 'overdue'}">${p.is_active ? esc(t('active')) : '—'}</span>
              <button class="btn btn-ghost btn-sm admin-plan-edit" data-id="${p.id}">${esc(t('edit'))}</button>
            </div>`).join('')}
          </div>`;
        $('#adminBody').querySelectorAll('.admin-plan-edit').forEach((b) => b.addEventListener('click', () => {
          const p = plans.find((x) => x.id === Number(b.dataset.id));
          if (p) openPlanModal(p);
        }));
      };

      $$('#adminTabs .tab-btn').forEach((b) => b.addEventListener('click', () => {
        $$('#adminTabs .tab-btn').forEach((x) => x.classList.toggle('active', x === b));
        if (b.dataset.tab === 'users') renderUsers();
        else if (b.dataset.tab === 'plans') renderPlans();
        else loadAdmin();
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }

  /* ---------------- SETTINGS ---------------- */
  async function renderSettings() {
    const el = $('#view-settings');
    showLoading(el);
    try {
      const st = await api('GET', '/api/settings');
      const sessions = await api('GET', '/api/auth/sessions');
      const cats = S.categories;
      el.innerHTML = `
        <div class="settings-grid">
          <div class="card">
            <div class="card-head"><span class="card-title">👤 ${esc(t('profile'))}</span></div>
            <div class="card-body">
              <div class="form-group"><label>${esc(t('name'))}</label><input id="setName" value="${esc(S.user.name)}" /></div>
              <div class="form-group"><label>${esc(t('email'))}</label><input id="setEmail" value="${esc(S.user.email)}" /></div>
              <button class="btn btn-primary" id="setSaveProfile">${esc(t('save'))}</button>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-title">⚙️ ${esc(t('settings'))}</span></div>
            <div class="card-body">
              <div class="form-group"><label>${esc(t('country'))}</label>
                <select id="setCountry">${S.countries.map((c) => `<option value="${esc(c.code)}" ${c.code === st.country_code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
              </div>
              <div class="form-group"><label>${esc(t('currency'))}</label>
                <select id="setCurrency">${S.currencies.map((c) => `<option value="${esc(c.code)}" ${c.code === st.currency ? 'selected' : ''}>${esc(c.code)} — ${esc(c.name)}</option>`).join('')}</select>
              </div>
              <div class="form-row">
                <div class="form-group"><label>${esc(t('language'))}</label>
                  <select id="setLang"><option value="pt" ${st.language === 'pt' ? 'selected' : ''}>Português</option><option value="en" ${st.language === 'en' ? 'selected' : ''}>English</option><option value="es" ${st.language === 'es' ? 'selected' : ''}>Español</option><option value="fr" ${st.language === 'fr' ? 'selected' : ''}>Français</option></select>
                </div>
                <div class="form-group"><label>${esc(t('date_format'))}</label>
                  <select id="setDf"><option value="dd/mm/yyyy" ${st.date_format === 'dd/mm/yyyy' ? 'selected' : ''}>dd/mm/yyyy</option><option value="mm/dd/yyyy" ${st.date_format === 'mm/dd/yyyy' ? 'selected' : ''}>mm/dd/yyyy</option><option value="yyyy-mm-dd" ${st.date_format === 'yyyy-mm-dd' ? 'selected' : ''}>yyyy-mm-dd</option></select>
                </div>
              </div>
              <div class="form-group"><label>${esc(t('month_start'))}</label><input type="number" id="setMonthStart" min="1" max="28" value="${st.month_start_day || 1}" /></div>
              <button class="btn btn-primary" id="setSavePrefs">${esc(t('save'))}</button>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-title">🔒 ${esc(t('security'))}</span></div>
            <div class="card-body">
              <div class="form-group"><label>${esc(t('current_password'))}</label><input type="password" id="setCurPw" /></div>
              <div class="form-group"><label>${esc(t('new_password'))}</label><input type="password" id="setNewPw" /></div>
              <button class="btn btn-primary" id="setChangePw">${esc(t('save'))}</button>
              <hr />
              <div class="settings-item"><span>${esc(t('two_fa'))}</span>
                <label class="switch"><input type="checkbox" id="set2fa" ${st.two_fa_enabled ? 'checked' : ''} /><span class="slider"></span></label>
              </div>
              <hr />
              <h4>${esc(t('sessions'))}</h4>
              <div class="session-list">
                ${sessions.map((s) => `<div class="session-item"><span class="${s.current ? 'pill active' : 'pill'}">${s.current ? '✓' : '·'}</span><span>${esc(s.ua.slice(0, 60) || '—')}</span>${s.current ? '' : `<button class="tx-action-btn session-revoke" data-sid="${esc(s.sid)}">✕</button>`}</div>`).join('')}
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-title">🏷️ ${esc(t('category_new'))}</span></div>
            <div class="card-body">
              <div class="form-row">
                <div class="form-group"><label>${esc(t('type'))}</label><select id="catType"><option value="expense">${esc(t('expense'))}</option><option value="income">${esc(t('income'))}</option></select></div>
                <div class="form-group"><label>${esc(t('name'))}</label><input id="catName" placeholder="..." /></div>
              </div>
              <button class="btn btn-primary" id="catAddBtn">${esc(t('add'))}</button>
              <hr />
              <div class="cat-list">${cats.map((c) => `<div class="cat-chip"><span>${esc(c.icon)} ${esc(c.name)}</span>${c.user_id ? `<button class="tx-action-btn cat-del" data-id="${c.id}">✕</button>` : ''}</div>`).join('')}</div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-title">📤 ${esc(t('export_data'))}</span></div>
            <div class="card-body">
              <a class="btn btn-ghost btn-block" href="/api/export/transactions?format=csv">${esc(t('export_csv'))}</a>
              <a class="btn btn-ghost btn-block" href="/api/export/transactions?format=xlsx">${esc(t('export_excel'))}</a>
            </div>
          </div>
          <div class="card danger-card">
            <div class="card-head"><span class="card-title">⚠️ ${esc(t('delete_account'))}</span></div>
            <div class="card-body">
              <div class="form-group"><label>${esc(t('password'))}</label><input type="password" id="setDelPw" /></div>
              <button class="btn btn-danger" id="setDelete">${esc(t('delete_account'))}</button>
            </div>
          </div>
        </div>`;

      $('#setSaveProfile').addEventListener('click', async () => {
        try {
          const res = await api('PUT', '/api/profile', { name: $('#setName').value.trim(), email: $('#setEmail').value.trim() });
          S.user = res.user; renderShell(); toast(t('save_success'), 'success');
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#setSavePrefs').addEventListener('click', async () => {
        try {
          const res = await api('PUT', '/api/settings', {
            country_code: $('#setCountry').value, currency: $('#setCurrency').value,
            language: $('#setLang').value, date_format: $('#setDf').value, month_start_day: parseInt($('#setMonthStart').value) || 1
          });
          S.settings = Object.assign({}, S.settings, res);
          if (window.FIQ) { window.FIQ.setLang(res.language); window.FIQ.dateFormat = res.date_format; }
          toast(t('save_success'), 'success'); renderShell(); renderSettings();
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#setChangePw').addEventListener('click', async () => {
        try { await api('POST', '/api/profile/password', { current: $('#setCurPw').value, newPassword: $('#setNewPw').value }); $('#setCurPw').value = ''; $('#setNewPw').value = ''; toast(t('save_success'), 'success'); } catch (e) { toast(e.message, 'error'); }
      });
      $('#set2fa').addEventListener('change', async () => {
        try { await api('POST', '/api/auth/twofa/toggle', { enabled: $('#set2fa').checked }); toast(t('save_success'), 'success'); } catch (e) { toast(e.message, 'error'); }
      });
      $('#setDelete').addEventListener('click', async () => {
        const ok = await confirmBox(t('delete_confirm'));
        if (!ok) return;
        try { await api('POST', '/api/profile/delete', { password: $('#setDelPw').value }); window.location.href = '/login'; } catch (e) { toast(e.message, 'error'); }
      });
      $('#catAddBtn').addEventListener('click', async () => {
        try {
          await api('POST', '/api/categories', { type: $('#catType').value, name: $('#catName').value.trim() });
          $('#catName').value = ''; await loadBaseData(); renderSettings(); toast(t('save_success'), 'success');
        } catch (e) { toast(e.message, 'error'); }
      });
      el.querySelectorAll('.cat-del').forEach((b) => b.addEventListener('click', async () => {
        try { await api('DELETE', '/api/categories/' + b.dataset.id); await loadBaseData(); renderSettings(); toast(t('deleted'), 'success'); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelectorAll('.session-revoke').forEach((b) => b.addEventListener('click', async () => {
        try { await api('POST', '/api/auth/sessions/revoke', { sid: b.dataset.sid }); renderSettings(); } catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`;
    }
  }
/* ---------------- MODALS ---------------- */
  function catOptions(type, selected) {
    return S.categories.filter((c) => c.type === type).map((c) => `<option value="${esc(c.name)}" ${c.name === selected ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  }

  function openTxModal(type, tx) {
    const isEdit = !!tx;
    const tcat = type === 'income' ? 'income' : 'expense';
    openModal(`
      <div class="form-group"><label>${esc(t('type'))}</label>
        <div class="seg"><button class="seg-btn ${type === 'expense' ? 'active' : ''}" data-t="expense">${esc(t('expense'))}</button><button class="seg-btn ${type === 'income' ? 'active' : ''}" data-t="income">${esc(t('income'))}</button></div>
      </div>
      <div class="form-group"><label>${esc(t('description'))}</label><input id="txDesc" value="${esc(tx ? tx.description : '')}" required /></div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="txAmt" value="${tx ? tx.amount : ''}" required /></div>
        <div class="form-group"><label>${esc(t('date'))}</label><input type="date" id="txDate" value="${tx ? tx.date : new Date().toISOString().slice(0, 10)}" /></div>
      </div>
      <div class="form-group"><label>${esc(t('category'))}</label><select id="txCat">${catOptions(tcat, tx ? tx.category : null)}</select></div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('account'))}</label>
          <select id="txAccount"><option value="">—</option>${S.accounts.map((a) => `<option value="${a.id}" ${tx && tx.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>${esc(t('member'))}</label>
          <select id="txMember"><option value="">—</option>${S.members.map((m) => `<option value="${m.id}" ${tx && tx.member_id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-group"><label>${esc(t('note'))}</label><input id="txNote" value="${esc(tx ? tx.note || '' : '')}" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="txSave">${esc(isEdit ? t('save') : t('add'))}</button></div>`, isEdit ? t('edit') : t('add'));

    $$('#modal .seg-btn').forEach((b) => b.addEventListener('click', () => {
      $$('#modal .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      $('#txCat').innerHTML = catOptions(b.dataset.t === 'income' ? 'income' : 'expense', null);
    }));

    $('#txSave').addEventListener('click', async () => {
      const body = {
        type: $('#modal .seg-btn.active').dataset.t,
        description: $('#txDesc').value.trim(),
        amount: parseFloat($('#txAmt').value) || 0,
        date: $('#txDate').value,
        category: $('#txCat').value,
        note: $('#txNote').value.trim(),
        account_id: $('#txAccount').value ? Number($('#txAccount').value) : null,
        member_id: $('#txMember').value ? Number($('#txMember').value) : null
      };
      if (!body.description || !body.amount) { toast(t('required_field'), 'error'); return; }
      try {
        if (isEdit) await api('PUT', '/api/transactions/' + tx.id, body);
        else await api('POST', '/api/transactions', body);
        closeModal(); toast(t('save_success'), 'success');
        const loaders = { dashboard: loadDashboard, movements: loadMovements, calendar: loadCalendar, budget: loadBudget };
        if (loaders[S.view]) loaders[S.view](); else loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openAccountModal(acc) {
    const isEdit = !!acc;
    const types = ['checking', 'savings', 'cash', 'investment', 'credit'];
    openModal(`
      <div class="form-group"><label>${esc(t('name'))}</label><input id="accName" value="${esc(acc ? acc.name : '')}" required /></div>
      <div class="form-group"><label>${esc(t('account_type'))}</label>
        <select id="accType">${types.map((ty) => `<option value="${ty}" ${acc && acc.type === ty ? 'selected' : ''}>${esc(t('account_' + ty) || ty)}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('initial_balance'))}</label><input type="number" step="0.01" id="accBal" value="${acc ? acc.initial_balance : 0}" /></div>
        <div class="form-group"><label>${esc(t('currency'))}</label>
          <select id="accCur">${S.currencies.map((c) => `<option value="${esc(c.code)}" ${acc && acc.currency === c.code ? 'selected' : ''}>${esc(c.code)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-group"><label>${esc(t('institution'))}</label><input id="accInst" value="${esc(acc ? acc.institution || '' : '')}" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="accSave">${esc(isEdit ? t('save') : t('add'))}</button></div>`, isEdit ? t('edit') : t('add'));
    $('#accSave').addEventListener('click', async () => {
      const body = {
        name: $('#accName').value.trim(), type: $('#accType').value,
        initial_balance: parseFloat($('#accBal').value) || 0,
        currency: $('#accCur').value, institution: $('#accInst').value.trim()
      };
      if (!body.name) { toast(t('required_field'), 'error'); return; }
      try {
        if (isEdit) await api('PUT', '/api/accounts/' + acc.id, body);
        else await api('POST', '/api/accounts', body);
        closeModal(); toast(t('save_success'), 'success');
        await loadAccounts(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openBudgetModal(bud, unusedCats) {
    const isEdit = !!bud;
    const cats = unusedCats || S.categories.filter((c) => c.type === 'expense');
    openModal(`
      <div class="form-group"><label>${esc(t('category'))}</label>
        ${isEdit ? `<input value="${esc(bud.category)}" disabled />` : `<select id="budCat">${cats.map((c) => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>`}
      </div>
      <div class="form-group"><label>${esc(t('budget_limit'))}</label><input type="number" step="0.01" id="budLimit" value="${bud ? bud.limit : ''}" required /></div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('budget_projected'))}</label><input type="number" step="0.01" id="budProjected" value="${bud ? bud.projected || 0 : 0}" /></div>
        <div class="form-group"><label>${esc(t('budget_remaining'))} (%)</label><input type="number" id="budAlert" value="${bud ? bud.alert_threshold || 80 : 80}" min="1" max="100" /></div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="budSave">${esc(isEdit ? t('save') : t('add'))}</button></div>`, isEdit ? t('edit') : t('add'));
    $('#budSave').addEventListener('click', async () => {
      const body = {
        category: isEdit ? bud.category : $('#budCat').value,
        limit: parseFloat($('#budLimit').value) || 0,
        projected: parseFloat($('#budProjected').value) || 0,
        alert_threshold: parseInt($('#budAlert').value) || 80,
        month: S.month
      };
      if (!body.limit) { toast(t('required_field'), 'error'); return; }
      try {
        if (isEdit) await api('PUT', '/api/budgets/' + bud.id, body);
        else await api('POST', '/api/budgets', body);
        closeModal(); toast(t('save_success'), 'success');
        await loadBudget(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openGoalModal(g) {
    const isEdit = !!g;
    openModal(`
      <div class="form-row">
        <div class="form-group"><label>${esc(t('name'))}</label><input id="goalName" value="${esc(g ? g.name : '')}" required /></div>
        <div class="form-group"><label>Ícone</label><input id="goalIcon" maxlength="4" value="${esc(g ? g.icon || '🎯' : '🎯')}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('goal_target'))}</label><input type="number" step="0.01" id="goalTarget" value="${g ? g.target : ''}" required /></div>
        <div class="form-group"><label>${esc(t('goal_current'))}</label><input type="number" step="0.01" id="goalCurrent" value="${g ? g.current || 0 : 0}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('goal_deadline'))}</label><input type="date" id="goalDeadline" value="${g && g.deadline ? g.deadline : ''}" /></div>
        <div class="form-group"><label>${esc(t('goal_monthly'))}</label><input type="number" step="0.01" id="goalMonthly" value="${g ? g.monthly_contribution || 0 : 0}" /></div>
      </div>
      <div class="form-group"><label>${esc(t('category'))}</label><select id="goalCat"><option value="">—</option>${catOptions('expense', g ? g.category : null)}</select></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="goalSave">${esc(isEdit ? t('save') : t('add'))}</button></div>`, isEdit ? t('edit') : t('goal_new'));
    $('#goalSave').addEventListener('click', async () => {
      const body = {
        name: $('#goalName').value.trim(), icon: $('#goalIcon').value || '🎯',
        target: parseFloat($('#goalTarget').value) || 0, current: parseFloat($('#goalCurrent').value) || 0,
        deadline: $('#goalDeadline').value || null, monthly_contribution: parseFloat($('#goalMonthly').value) || 0,
        category: $('#goalCat').value || null
      };
      if (!body.name || !body.target) { toast(t('required_field'), 'error'); return; }
      try {
        if (isEdit) await api('PUT', '/api/goals/' + g.id, body);
        else await api('POST', '/api/goals', body);
        closeModal(); toast(t('save_success'), 'success');
        await loadGoals(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openContributeModal(g) {
    openModal(`
      <p class="muted">${esc(g.icon)} ${esc(g.name)} — ${money(g.current)} / ${money(g.target)}</p>
      <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="contAmt" value="${g.monthly_contribution || 0}" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="contGo">${esc(t('goal_contribute'))}</button></div>`, t('goal_contribute'));
    $('#contGo').addEventListener('click', async () => {
      const amount = parseFloat($('#contAmt').value) || 0;
      if (!amount) { toast(t('required_field'), 'error'); return; }
      try {
        await api('POST', '/api/goals/' + g.id + '/contribute', { amount });
        closeModal(); toast(t('save_success'), 'success');
        await loadGoals(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  /* ---------------- ANÁLISE DE HIPÓTESES (cenários + goal seek) ---------------- */
  function openScenarioModal(model) {
    const st = {
      vars: model ? model.variables.map((v) => ({ key: v.key, label: v.label || '', unit: v.unit || '' }))
        : [{ key: 'receita', label: 'Receita', unit: '' }, { key: 'margem', label: 'Margem', unit: '%' }, { key: 'custo', label: 'Custo fixo', unit: '' }],
      scns: model ? model.scenarios.map((s) => ({ name: s.name, values: Object.assign({}, s.values) }))
        : [{ name: 'Otimista', values: {} }, { name: 'Realista', values: {} }, { name: 'Pessimista', values: {} }],
      formula: model ? model.result_formula : 'receita * (margem / 100) - custo',
      label: model ? model.result_label : 'Lucro mensal',
      desc: model ? (model.description || '') : ''
    };
    st.scns.forEach((sc) => st.vars.forEach((v) => { if (sc.values[v.key] === undefined) sc.values[v.key] = 0; }));

    openModal(`
      <div class="scenario-ai-bar">
        <div class="form-group" style="flex:1;margin-bottom:0"><label>✨ ${esc(t('scenario_ai_subject'))}</label><input id="scnAiSubject" placeholder="${esc(t('scenario_ai_subject_ph'))}" /></div>
        <button class="btn btn-ghost btn-sm" id="scnAiGo" style="align-self:end">✨ ${esc(t('scenario_ai_suggest'))}</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('scenario_model'))}</label><input id="scnName" value="${esc(model ? model.name : '')}" /></div>
        <div class="form-group"><label>${esc(t('scenario_result_label'))}</label><input id="scnResultLabel" value="${esc(st.label)}" /></div>
      </div>
      <div class="form-group"><label>${esc(t('scenario_desc'))}</label><input id="scnDesc" value="${esc(st.desc)}" /></div>
      <div class="form-group"><label>${esc(t('scenario_formula'))}</label><input id="scnFormula" value="${esc(st.formula)}" /><small class="muted">${esc(t('scenario_formula_hint'))}</small></div>
      <div class="form-group"><label>${esc(t('scenario_variables'))}</label><div id="scnVars"></div><button class="btn btn-ghost btn-sm" id="scnAddVar">${esc(t('scenario_add_var'))}</button></div>
      <div class="form-group"><label>${esc(t('scenario_scenarios'))}</label><div id="scnScns"></div><button class="btn btn-ghost btn-sm" id="scnAddScn">${esc(t('scenario_add_scn'))}</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="scnSave">${esc(t('save'))}</button></div>`, model ? t('scenario_edit') : t('scenarios_new'));

    const renderVars = () => {
      const box = $('#scnVars');
      box.innerHTML = st.vars.map((v, i) => `
        <div class="scn-var-row">
          <input data-vi="${i}" data-f="key" value="${esc(v.key)}" placeholder="${esc(t('scenario_variable_key'))}" />
          <input data-vi="${i}" data-f="label" value="${esc(v.label)}" placeholder="${esc(t('scenario_variable_label'))}" />
          <input data-vi="${i}" data-f="unit" value="${esc(v.unit)}" placeholder="${esc(t('scenario_variable_unit'))}" />
          <button class="tx-action-btn scn-var-del" data-vi="${i}">✕</button>
        </div>`).join('');
      box.querySelectorAll('[data-vi]').forEach((inp) => inp.addEventListener('input', () => { const v = st.vars[Number(inp.dataset.vi)]; v[inp.dataset.f] = inp.value; }));
      box.querySelectorAll('.scn-var-del').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.vi);
        const key = st.vars[i].key;
        st.vars.splice(i, 1);
        st.scns.forEach((sc) => delete sc.values[key]);
        renderVars(); renderScns();
      }));
    };
    const renderScns = () => {
      const box = $('#scnScns');
      box.innerHTML = st.scns.map((sc, i) => `
        <div class="scn-scn-row">
          <div class="scn-scn-head">
            <input data-si="${i}" data-f="name" value="${esc(sc.name)}" placeholder="${esc(t('scenario_scenarios'))}" />
            <button class="tx-action-btn scn-scn-del" data-si="${i}">✕</button>
          </div>
          <div class="scn-scn-vals">
            ${st.vars.map((v) => `
              <label class="scn-val-input"><span>${esc(v.key)}</span>
                <input type="number" step="any" data-si="${i}" data-k="${esc(v.key)}" value="${esc(sc.values[v.key] != null ? sc.values[v.key] : 0)}" />
              </label>`).join('')}
          </div>
        </div>`).join('');
      box.querySelectorAll('[data-si]').forEach((inp) => inp.addEventListener('input', () => {
        const sc = st.scns[Number(inp.dataset.si)];
        if (inp.dataset.f === 'name') sc.name = inp.value;
        else if (inp.dataset.k) { const n = parseFloat(inp.value); sc.values[inp.dataset.k] = isFinite(n) ? n : 0; }
      }));
      box.querySelectorAll('.scn-scn-del').forEach((b) => b.addEventListener('click', () => { st.scns.splice(Number(b.dataset.si), 1); renderScns(); }));
    };

    renderVars(); renderScns();
    $('#scnAiGo').addEventListener('click', async () => {
      const subject = $('#scnAiSubject').value.trim();
      if (!subject) { toast(t('required_field'), 'error'); return; }
      const btn = $('#scnAiGo');
      btn.disabled = true; btn.textContent = '...';
      try {
        const s = await api('POST', '/api/scenarios/suggest', { subject });
        $('#scnName').value = s.name;
        $('#scnDesc').value = s.description || '';
        $('#scnResultLabel').value = s.result_label || 'Resultado';
        $('#scnFormula').value = s.result_formula;
        st.vars = s.variables.map((v) => ({ key: v.key, label: v.label || '', unit: v.unit || '' }));
        st.scns = s.scenarios.map((sc) => ({ name: sc.name, values: Object.assign({}, sc.values) }));
        renderVars(); renderScns();
        toast(t('scenario_ai_filled'), 'success');
      } catch (e) { toast(e.message, 'error'); }
      btn.disabled = false; btn.textContent = '✨ ' + t('scenario_ai_suggest');
    });
    $('#scnAddVar').addEventListener('click', () => {
      let k = 'var' + (st.vars.length + 1);
      while (st.vars.some((v) => v.key === k)) k = 'v' + (st.vars.length + Math.floor(Math.random() * 999));
      st.vars.push({ key: k, label: '', unit: '' });
      st.scns.forEach((sc) => { sc.values[k] = 0; });
      renderVars(); renderScns();
    });
    $('#scnAddScn').addEventListener('click', () => {
      st.scns.push({ name: '', values: Object.fromEntries(st.vars.map((v) => [v.key, 0])) });
      renderScns();
    });
    $('#scnSave').addEventListener('click', async () => {
      const payload = {
        name: $('#scnName').value.trim(),
        description: $('#scnDesc').value.trim(),
        result_label: $('#scnResultLabel').value.trim() || 'Resultado',
        result_formula: $('#scnFormula').value.trim(),
        variables: st.vars.map((v) => ({ key: v.key.trim(), label: v.label.trim(), unit: v.unit.trim() })),
        scenarios: st.scns.map((sc) => ({ name: sc.name.trim(), values: Object.assign({}, sc.values) }))
      };
      if (!payload.name || !payload.result_formula) { toast(t('required_field'), 'error'); return; }
      try {
        if (model) await api('PUT', '/api/scenarios/' + model.id, payload);
        else await api('POST', '/api/scenarios', payload);
        closeModal(); toast(t('save_success'), 'success');
        await loadGoals();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function runScenarios(model) {
    openModal('<div class="empty-state"><div class="empty-icon">🔮</div><p>' + esc(t('loading')) + '</p></div>', t('scenario_compare_title'));
    try {
      const data = await api('POST', '/api/scenarios/' + model.id + '/run', {});
      const res = data.results || [];
      const vars = data.model.variables || [];
      const rows = res.map((r) => `
        <div class="scenario-row ${r.base ? 'scenario-base' : ''}">
          <div class="scenario-row-head">
            <strong>${esc(r.name)}</strong>
            ${r.base ? `<span class="badge-trial">${esc(t('scenario_base'))}</span>` : ''}
            ${r.delta != null ? `<span class="scenario-delta ${r.delta >= 0 ? 'pos' : 'neg'}">${r.delta >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(r.delta))}</span>` : ''}
          </div>
          <div class="scenario-vals">
            ${vars.map((v) => `<span class="scenario-val"><em>${esc(v.label || v.key)}</em> <b>${fmtNum(r.values[v.key])}</b> ${esc(v.unit || '')}</span>`).join('')}
          </div>
          <div class="scenario-result"><span>${esc(data.model.result_label || t('scenario_result'))}</span><b>${r.result == null ? '—' : fmtNum(r.result)}</b></div>
          <p class="muted scenario-explain">${esc(r.explanation)}</p>
        </div>`).join('');
      openModal(`
        <div id="scnInsights" class="hidden scenario-ai-insights"></div>
        <div class="scenario-compare">${rows || `<div class="empty-state"><p>${esc(t('empty'))}</p></div>`}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="scnExport">${esc(t('scenario_export'))}</button>
          <button class="btn btn-ghost" id="scnAnalyze">✨ ${esc(t('scenario_ai_analyze'))}</button>
          <button class="btn btn-ghost" data-modal-close>${esc(t('close'))}</button>
          <button class="btn btn-primary" id="scnApplyGoal">${esc(t('scenario_apply_goal'))}</button>
        </div>`, t('scenario_compare_title') + ' — ' + model.name);
      $('#scnExport').addEventListener('click', async () => {
        try { const exp = await api('POST', '/api/scenarios/' + model.id + '/export', {}); downloadText(exp.csv, exp.filename, 'text/csv;charset=utf-8'); } catch (e) { toast(e.message, 'error'); }
      });
      $('#scnAnalyze').addEventListener('click', async () => {
        const box = $('#scnInsights');
        box.classList.remove('hidden');
        box.innerHTML = `<p class="muted">${esc(t('scenario_ai_loading'))}</p>`;
        try {
          const ins = await api('POST', '/api/scenarios/' + model.id + '/analyze', {});
          const sensHtml = (ins.sensitivity || []).map((s) => `
            <div class="sens-row"><span>${esc(s.label)}</span><b>${fmtNum(s.impact)} ${esc(s.unit || '')}</b></div>`).join('');
          box.innerHTML = `
            <div class="scenario-ai-head">✨ ${esc(t('scenario_ai_title'))} ${ins.usedExternal ? '' : `<span class="badge-trial">${esc(t('scenario_ai_local'))}</span>`}</div>
            <pre class="scenario-ai-text">${esc(ins.text)}</pre>
            ${sensHtml ? `<div class="sens-block"><div class="sens-title">${esc(t('scenario_ai_sensitivity'))}</div>${sensHtml}</div>` : ''}`;
        } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
      });
      $('#scnApplyGoal').addEventListener('click', () => chooseGoalToApply(data));
    } catch (e) {
      openModal(`<div class="empty-state"><div class="empty-icon">⚠️</div><p>${esc(e.message)}</p></div>`, t('scenario_compare_title'));
    }
  }

  function chooseGoalToApply(data) {
    const scenarios = data.results || [];
    if (!scenarios.length) return;
    openModal(`
      <div class="form-group"><label>${esc(t('scenario_scenarios'))}</label>
        <select id="cgScn">${scenarios.map((s) => `<option value="${s.scenarioId}">${esc(s.name)} (${fmtNum(s.result)})</option>`).join('')}</select></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="cgGo">${esc(t('confirm'))}</button></div>`, t('scenario_apply_goal'));
    $('#cgGo').addEventListener('click', () => {
      const sc = scenarios.find((s) => String(s.scenarioId) === $('#cgScn').value);
      if (!sc || sc.result == null) { toast(t('error_generic'), 'error'); return; }
      applyValueToGoal(sc.result, sc.name + ': ' + fmtNum(sc.result));
    });
  }

  function applyValueToGoal(value, label) {
    const goals = S.goals || [];
    if (!goals.length) { toast(t('goal_new'), 'info'); return; }
    openModal(`
      <p class="muted">${esc(label || '')} → <b>${fmtNum(value)}</b></p>
      <div class="form-group"><label>${esc(t('scenario_choose_goal'))}</label>
        <select id="vgGoal">${goals.map((g) => `<option value="${g.id}">${esc(g.icon || '🎯')} ${esc(g.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>${esc(t('scenario_field'))}</label>
        <select id="vgField">
          <option value="monthly_contribution">${esc(t('scenario_goal_monthly'))}</option>
          <option value="target">${esc(t('scenario_goal_target'))}</option>
          <option value="current">${esc(t('scenario_goal_current'))}</option>
        </select></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="vgGo">${esc(t('confirm'))}</button></div>`, t('scenario_apply_goal'));
    $('#vgGo').addEventListener('click', async () => {
      const goal = goals.find((g) => g.id === Number($('#vgGoal').value));
      const field = $('#vgField').value;
      if (!goal) { toast(t('error_generic'), 'error'); return; }
      const body = {
        name: goal.name, icon: goal.icon || '🏆', target: goal.target, current: goal.current || 0,
        deadline: goal.deadline || null, monthly_contribution: goal.monthly_contribution || 0,
        category: goal.category || null, priority: goal.priority || 1
      };
      body[field] = value;
      try { await api('PUT', '/api/goals/' + goal.id, body); closeModal(); toast(t('save_success'), 'success'); loadGoals(); loadDashboardQuiet(); } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function openGoalSeekModal() {
    let models;
    try { models = await api('GET', '/api/scenarios'); } catch (e) { toast(e.message, 'error'); return; }
    if (!models.length) { toast(t('scenario_no_models'), 'info'); return; }
    openModal(`
      <div class="form-group"><label>${esc(t('scenario_model'))}</label>
        <select id="gsModel">${models.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>${esc(t('scenario_scenarios'))}</label><select id="gsScenario"></select></div>
      <div class="form-group"><label>${esc(t('goal_seek_variable'))}</label><select id="gsVar"></select></div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('goal_seek_target'))}</label><input type="number" step="any" id="gsTarget" /></div>
        <div class="form-group"><label>${esc(t('goal_seek_guess'))}</label><input type="number" step="any" id="gsGuess" /></div>
      </div>
      <div id="gsResult"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary" id="gsGo">${esc(t('goal_seek_calc'))}</button>
      </div>`, t('goal_seek_title'));
    const syncModel = () => {
      const m = models.find((x) => x.id === Number($('#gsModel').value));
      if (!m) return;
      $('#gsScenario').innerHTML = m.scenarios.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
      $('#gsVar').innerHTML = m.variables.map((v) => `<option value="${esc(v.key)}">${esc(v.label || v.key)}${v.unit ? ' (' + esc(v.unit) + ')' : ''}</option>`).join('');
    };
    $('#gsModel').addEventListener('change', syncModel);
    syncModel();
    $('#gsGo').addEventListener('click', async () => {
      const m = models.find((x) => x.id === Number($('#gsModel').value));
      const body = { scenarioId: Number($('#gsScenario').value), variable: $('#gsVar').value, target: parseFloat($('#gsTarget').value), guess: parseFloat($('#gsGuess').value) };
      if (!isFinite(body.target)) { toast(t('required_field'), 'error'); return; }
      try {
        const r = await api('POST', '/api/scenarios/' + m.id + '/goal-seek', body);
        const conv = r.converged ? t('goal_seek_converged') : t('goal_seek_not_converged');
        $('#gsResult').innerHTML = `
          <div class="scenario-seek-result ${r.converged ? 'ok' : 'warn'}">
            <p class="muted">${esc(t('goal_seek_found'))} — <b>${esc(r.variableLabel)}</b> ${r.converged ? '✓' : '≈'} <span class="seek-conv">${esc(conv)}</span></p>
            <div class="seek-value">${fmtNum(r.found)}${esc(r.unit ? ' ' + r.unit : '')}</div>
            <p class="muted">${esc(t('goal_seek_before'))}: ${fmtNum(r.before.value)} → ${fmtNum(r.before.result)}</p>
            <p class="muted">${esc(t('goal_seek_after'))}: ${fmtNum(r.after.value)} → ${fmtNum(r.after.result)}</p>
            <p class="muted scenario-explain">${esc(r.explanation)}</p>
            <div class="modal-actions" style="padding:0;margin-top:12px">
              <button class="btn btn-ghost" id="gsDiscard">${esc(t('goal_seek_discard'))}</button>
              <button class="btn btn-ghost" id="gsApplyGoal">${esc(t('goal_seek_apply_goal'))}</button>
              <button class="btn btn-primary" id="gsApplyScn">${esc(t('goal_seek_apply_scenario'))}</button>
            </div>
          </div>`;
        const foundVal = r.found;
        $('#gsDiscard').addEventListener('click', () => { closeModal(); toast(t('deleted'), 'info'); });
        $('#gsApplyGoal').addEventListener('click', () => applyValueToGoal(foundVal, r.variableLabel + ': ' + fmtNum(foundVal)));
        $('#gsApplyScn').addEventListener('click', async () => {
          try {
            await api('POST', '/api/scenarios/' + m.id + '/scenarios/' + r.scenarioId + '/apply', { variable: r.variable, value: foundVal });
            closeModal(); toast(t('save_success'), 'success'); loadGoals();
          } catch (e) { toast(e.message, 'error'); }
        });
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openTransferModal() {
    if (S.accounts.length < 2) { toast(t('required_field'), 'info'); return; }
    openModal(`
      <div class="form-row">
        <div class="form-group"><label>${esc(t('from_account'))}</label><select id="trFrom">${S.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label>${esc(t('to_account'))}</label><select id="trTo">${S.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="trAmt" /></div>
        <div class="form-group"><label>${esc(t('date'))}</label><input type="date" id="trDate" value="${new Date().toISOString().slice(0, 10)}" /></div>
      </div>
      <div class="form-group"><label>${esc(t('note'))}</label><input id="trNote" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="trGo">${esc(t('transfer'))}</button></div>`, t('transfer'));
    $('#trGo').addEventListener('click', async () => {
      const body = {
        from_account: Number($('#trFrom').value), to_account: Number($('#trTo').value),
        amount: parseFloat($('#trAmt').value) || 0, date: $('#trDate').value, note: $('#trNote').value.trim()
      };
      if (!body.amount || body.from_account === body.to_account) { toast(t('required_field'), 'error'); return; }
      try {
        await api('POST', '/api/transfers', body);
        closeModal(); toast(t('save_success'), 'success');
        await loadAccounts(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openRecurringModal(r) {
    const isEdit = !!r;
    const freqs = ['daily', 'weekly', 'monthly', 'yearly'];
    openModal(`
      <div class="form-group"><label>${esc(t('type'))}</label>
        <select id="recType"><option value="expense" ${r && r.type === 'expense' ? 'selected' : ''}>${esc(t('expense'))}</option><option value="income" ${r && r.type === 'income' ? 'selected' : ''}>${esc(t('income'))}</option></select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('description'))}</label><input id="recDesc" value="${esc(r ? r.description : '')}" required /></div>
        <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="recAmt" value="${r ? r.amount : ''}" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('frequency'))}</label><select id="recFreq">${freqs.map((f) => `<option value="${f}" ${r && r.frequency === f ? 'selected' : ''}>${esc(t(f))}</option>`).join('')}</select></div>
        <div class="form-group"><label>${esc(t('due_day'))}</label><input type="number" id="recDay" min="1" max="28" value="${r ? r.due_day || 1 : 1}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('account'))}</label><select id="recAcc"><option value="">—</option>${S.accounts.map((a) => `<option value="${a.id}" ${r && r.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label>${esc(t('category'))}</label><select id="recCat">${catOptions('expense', r ? r.category : null)}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('start_date'))}</label><input type="date" id="recStart" value="${r ? r.start_date : new Date().toISOString().slice(0, 10)}" /></div>
        <div class="form-group"><label>${esc(t('end_date'))}</label><input type="date" id="recEnd" value="${r && r.end_date ? r.end_date : ''}" /></div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="recSave">${esc(isEdit ? t('save') : t('add'))}</button></div>`, isEdit ? t('edit') : t('recurring'));
    $('#recSave').addEventListener('click', async () => {
      const body = {
        type: $('#recType').value, description: $('#recDesc').value.trim(),
        amount: parseFloat($('#recAmt').value) || 0, frequency: $('#recFreq').value,
        due_day: parseInt($('#recDay').value) || 1, account_id: $('#recAcc').value ? Number($('#recAcc').value) : null,
        category: $('#recCat').value, start_date: $('#recStart').value, end_date: $('#recEnd').value || null
      };
      if (!body.description || !body.amount) { toast(t('required_field'), 'error'); return; }
      try {
        if (isEdit) await api('PUT', '/api/recurring/' + r.id, body);
        else await api('POST', '/api/recurring', body);
        closeModal(); toast(t('save_success'), 'success');
        const loaders = { reports: loadReports, budget: loadBudget };
        if (loaders[S.view]) loaders[S.view](); else loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openDebtModal(d) {
    const isEdit = !!d;
    openModal(`
      <div class="form-row">
        <div class="form-group"><label>${esc(t('creditor'))}</label><input id="dCred" value="${esc(d ? d.creditor : '')}" required /></div>
        <div class="form-group"><label>${esc(t('original_amount'))}</label><input type="number" step="0.01" id="dOrig" value="${d ? d.original_amount : ''}" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('paid_amount'))}</label><input type="number" step="0.01" id="dPaid" value="${d ? d.paid_amount || 0 : 0}" /></div>
        <div class="form-group"><label>${esc(t('interest_rate'))}</label><input type="number" step="0.01" id="dInt" value="${d ? d.interest_rate || 0 : 0}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('due_date'))}</label><input type="date" id="dDue" value="${d ? d.due_date : new Date().toISOString().slice(0, 10)}" /></div>
        <div class="form-group"><label>${esc(t('installments'))}</label><input type="number" id="dInst" value="${d ? d.installments || 0 : 0}" /></div>
      </div>
      <div class="form-group"><label>${esc(t('installment_amount'))}</label><input type="number" step="0.01" id="dInstAmt" value="${d ? d.installment_amount || 0 : 0}" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="dSave">${esc(isEdit ? t('save') : t('add'))}</button></div>`, isEdit ? t('edit') : t('debt'));
    $('#dSave').addEventListener('click', async () => {
      const body = {
        creditor: $('#dCred').value.trim(), original_amount: parseFloat($('#dOrig').value) || 0,
        paid_amount: parseFloat($('#dPaid').value) || 0, interest_rate: parseFloat($('#dInt').value) || 0,
        due_date: $('#dDue').value, installments: parseInt($('#dInst').value) || 0,
        installment_amount: parseFloat($('#dInstAmt').value) || 0
      };
      if (!body.creditor || !body.original_amount) { toast(t('required_field'), 'error'); return; }
      try {
        if (isEdit) await api('PUT', '/api/debts/' + d.id, body);
        else await api('POST', '/api/debts', body);
        closeModal(); toast(t('save_success'), 'success'); loadDebts(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openPayDebtModal(debt) {
    openModal(`
      <p class="muted">${esc(debt.creditor)} · ${money(debt.remaining)} ${esc(t('debt'))}</p>
      <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="payAmt" value="${debt.remaining}" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="payGo">${esc(t('paid'))}</button></div>`, t('paid'));
    $('#payGo').addEventListener('click', async () => {
      try {
        await api('POST', '/api/debts/' + debt.id + '/pay', { amount: parseFloat($('#payAmt').value) || 0 });
        closeModal(); toast(t('save_success'), 'success'); loadDebts(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openLoanModal(loan) {
    const isEdit = !!loan;
    openModal(`
      <div class="form-row">
        <div class="form-group"><label>${esc(t('person'))}</label><input id="lPerson" value="${esc(loan ? loan.person : '')}" required /></div>
        <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="lAmt" value="${loan ? loan.amount : ''}" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('direction'))}</label><select id="lDir"><option value="lent" ${loan && loan.direction === 'lent' ? 'selected' : ''}>${esc(t('lent'))}</option><option value="borrowed" ${loan && loan.direction === 'borrowed' ? 'selected' : ''}>${esc(t('borrowed'))}</option></select></div>
        <div class="form-group"><label>${esc(t('date'))}</label><input type="date" id="lDate" value="${loan ? loan.date : new Date().toISOString().slice(0, 10)}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('status'))}</label><select id="lStatus"><option value="pending" ${loan && loan.status === 'pending' ? 'selected' : ''}>${esc(t('pending'))}</option><option value="partial" ${loan && loan.status === 'partial' ? 'selected' : ''}>${esc(t('partial'))}</option><option value="paid" ${loan && loan.status === 'paid' ? 'selected' : ''}>${esc(t('paid'))}</option></select></div>
        <div class="form-group"><label>${esc(t('note'))}</label><input id="lNotes" value="${esc(loan ? loan.notes || '' : '')}" /></div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="lSave">${esc(isEdit ? t('save') : t('add'))}</button></div>`, isEdit ? t('edit') : t('loan'));
    $('#lSave').addEventListener('click', async () => {
      const body = {
        person: $('#lPerson').value.trim(), amount: parseFloat($('#lAmt').value) || 0,
        direction: $('#lDir').value, date: $('#lDate').value,
        status: $('#lStatus').value, notes: $('#lNotes').value.trim()
      };
      if (!body.person || !body.amount) { toast(t('required_field'), 'error'); return; }
      try {
        if (isEdit) await api('PUT', '/api/loans/' + loan.id, body);
        else await api('POST', '/api/loans', body);
        closeModal(); toast(t('save_success'), 'success'); loadDebts(); loadDashboardQuiet();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openFamilyCreate() {
    openModal(`
      <div class="form-group"><label>${esc(t('name'))}</label><input id="famName" value="${esc(t('family_title'))}" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="famCreateGo">${esc(t('create_family'))}</button></div>`, t('create_family'));
    $('#famCreateGo').addEventListener('click', async () => {
      try {
        await api('POST', '/api/family/create', { name: $('#famName').value.trim() });
        closeModal(); toast(t('success'), 'success'); loadFamily();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openFamilyInvite() {
    openModal(`
      <div class="form-group"><label>${esc(t('email'))}</label><input type="email" id="invEmail" /></div>
      <div class="form-group"><label>${esc(t('role'))}</label><select id="invRole"><option value="member">${esc(t('member'))}</option><option value="admin">${esc(t('admin'))}</option></select></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button><button class="btn btn-primary" id="invGo">${esc(t('invite'))}</button></div>`, t('invite_member'));
    $('#invGo').addEventListener('click', async () => {
      try {
        await api('POST', '/api/family/invite', { email: $('#invEmail').value.trim(), role: $('#invRole').value });
        closeModal(); toast(t('success'), 'success'); loadFamily();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openAdminUserModal(u) {
    openModal(`
      <div class="form-group"><label>${esc(t('name'))}</label><input value="${esc(u.name)}" disabled /></div>
      <div class="form-group"><label>${esc(t('email'))}</label><input value="${esc(u.email)}" disabled /></div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('plan'))}</label><select id="auPlan"><option value="free" ${u.plan_code === 'free' ? 'selected' : ''}>${esc(t('free'))}</option><option value="pro" ${u.plan_code === 'pro' ? 'selected' : ''}>PRO</option><option value="family" ${u.plan_code === 'family' ? 'selected' : ''}>FAMÍLIA</option></select></div>
        <div class="form-group"><label>${esc(t('role'))}</label><select id="auRole"><option value="member" ${u.role === 'member' ? 'selected' : ''}>member</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option></select></div>
      </div>
      <div class="form-group"><label>${esc(t('validity'))}</label><input type="date" id="auExpiry" value="${u.trial_end || u.current_period_end || ''}" /></div>
      <div class="settings-item"><span>${esc(t('active'))}</span><label class="switch"><input type="checkbox" id="auActive" ${u.is_active ? 'checked' : ''} /><span class="slider"></span></label></div>
      <div class="modal-actions">
        <button class="btn btn-danger" id="auDel">${esc(t('delete'))}</button>
        <button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary" id="auSave">${esc(t('save'))}</button>
      </div>`, u.name);
    $('#auSave').addEventListener('click', async () => {
      try {
        await api('PUT', '/api/admin/users/' + u.id, { plan_code: $('#auPlan').value, role: $('#auRole').value, is_active: $('#auActive').checked, trial_end: $('#auExpiry').value || null });
        closeModal(); toast(t('save_success'), 'success'); loadAdmin();
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#auDel').addEventListener('click', async () => {
      const ok = await confirmBox(t('delete_confirm')); if (!ok) return;
      try { await api('DELETE', '/api/admin/users/' + u.id); closeModal(); toast(t('deleted'), 'success'); loadAdmin(); } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openPlanModal(p) {
    openModal(`
      <div class="form-group"><label>${esc(t('name'))}</label><input id="auPlName" value="${esc(p.name)}" /></div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('price_monthly'))}</label><input type="number" step="0.01" id="auPlMonthly" value="${p.price_monthly}" /></div>
        <div class="form-group"><label>${esc(t('price_annual'))}</label><input type="number" step="0.01" id="auPlAnnual" value="${p.price_annual}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${esc(t('trial_days'))}</label><input type="number" step="1" id="auPlTrial" value="${p.trial_days}" /></div>
        <div class="settings-item"><span>${esc(t('active'))}</span><label class="switch"><input type="checkbox" id="auPlActive" ${p.is_active ? 'checked' : ''} /><span class="slider"></span></label></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary" id="auPlSave">${esc(t('save'))}</button>
      </div>`, p.code.toUpperCase());
    $('#auPlSave').addEventListener('click', async () => {
      try {
        await api('PUT', '/api/admin/plans/' + p.id, {
          name: $('#auPlName').value.trim(),
          price_monthly: parseFloat($('#auPlMonthly').value) || 0,
          price_annual: parseFloat($('#auPlAnnual').value) || 0,
          trial_days: parseInt($('#auPlTrial').value, 10) || 0,
          is_active: $('#auPlActive').checked
        });
        closeModal(); toast(t('save_success'), 'success'); loadAdmin();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
/* ---------------- IMPORT ---------------- */
  function openImportModal() {
    if (!checkPro()) return;
    openModal(`
      <p class="muted">${esc(t('import_hint'))}</p>
      <label class="file-drop" for="importFile"><span>📥 ${esc(t('pick_file'))}</span><input type="file" id="importFile" accept=".csv,.xlsx" hidden /></label>
      <div id="importBox"></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button></div>`, t('csv_import'));
    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const box = $('#importBox');
      box.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
      const fileType = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const payload = { fileName: file.name, fileType, base64: reader.result.split(',')[1] };
          const res = await api('POST', '/api/import', payload);
          if (res.preview) {
            const cols = res.columns || [];
            const opt = (idx) => cols.map((c) => `<option value="${c.index}" ${c.index === idx ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
            box.innerHTML = `
              <div class="import-preview">
                <p class="muted">${res.total} ${esc(t('rows_found'))} · ${esc(t('mapped_columns'))}</p>
                <div class="form-group"><label>${esc(t('date'))}</label><select id="mpDate">${opt(res.guessed.date)}</select></div>
                <div class="form-group"><label>${esc(t('description'))}</label><select id="mpDesc">${opt(res.guessed.description)}</select></div>
                <div class="form-group"><label>${esc(t('amount'))}</label><select id="mpAmt">${opt(res.guessed.amount)}</select></div>
                <div class="form-row">
                  <div class="form-group"><label>${esc(t('default_type'))}</label><select id="mpType"><option value="expense">${esc(t('expense'))}</option><option value="income">${esc(t('income'))}</option></select></div>
                  <div class="form-group"><label>${esc(t('category'))}</label><select id="mpCat"><option value="">—</option>${catOptions('expense')}</select></div>
                </div>
                <button class="btn btn-primary btn-block" id="mpGo">${esc(t('confirm_import'))}</button>
              </div>`;
            $('#mpGo').addEventListener('click', async () => {
              try {
                const mapping = {
                  date: Number($('#mpDate').value), description: Number($('#mpDesc').value), amount: Number($('#mpAmt').value),
                  category: $('#mpCat').value || undefined, defaultType: $('#mpType').value
                };
                const r = await api('POST', '/api/import', Object.assign({}, payload, { mapping }));
                closeModal(); toast(r.imported + ' ' + t('imported_success'), 'success');
                loadMovements(); loadDashboardQuiet();
              } catch (err) { toast(err.message, 'error'); }
            });
          } else {
            closeModal(); toast(res.imported + ' ' + t('imported_success'), 'success');
            loadMovements(); loadDashboardQuiet();
          }
        } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- OCR ---------------- */
  function openOcrModal() {
    if (!checkPro()) return;
    openModal(`
      <p class="muted">${esc(t('ocr_hint'))}</p>
      <label class="file-drop" for="ocrFile"><span>📷 ${esc(t('pick_file'))}</span><input type="file" id="ocrFile" accept="image/*" hidden /></label>
      <div id="ocrResult"></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-modal-close>${esc(t('cancel'))}</button></div>`, t('ocr'));
    $('#ocrFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const box = $('#ocrResult');
      box.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await api('POST', '/api/ocr/extract', { image: reader.result.split(',')[1] });
          const ex = res.extracted || {};
          box.innerHTML = `
            <div class="form-group"><label>${esc(t('description'))}</label><input id="ocrDesc" value="${esc(ex.description)}" /></div>
            <div class="form-row">
              <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="ocrAmt" value="${ex.amount || ''}" /></div>
              <div class="form-group"><label>${esc(t('date'))}</label><input type="date" id="ocrDate" value="${ex.date}" /></div>
            </div>
            <div class="form-group"><label>${esc(t('category'))}</label><select id="ocrCat">${catOptions('expense', ex.category)}</select></div>
            <div class="form-group"><label>${esc(t('account'))}</label><select id="ocrAcc"><option value="">—</option>${S.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
            <p class="muted small">${esc(res.note)}</p>
            <button class="btn btn-primary btn-block" id="ocrGo">${esc(t('save'))}</button>`;
          $('#ocrGo').addEventListener('click', async () => {
            try {
              await api('POST', '/api/ocr/confirm', {
                description: $('#ocrDesc').value.trim(), amount: parseFloat($('#ocrAmt').value) || 0,
                date: $('#ocrDate').value, category: $('#ocrCat').value,
                account_id: $('#ocrAcc').value ? Number($('#ocrAcc').value) : null
              });
              closeModal(); toast(t('save_success'), 'success');
              loadMovements(); loadDashboardQuiet();
            } catch (err) { toast(err.message, 'error'); }
          });
        } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- NOTIFICATIONS ---------------- */
  async function loadNotifications(quiet) {
    try {
      const res = await api('GET', '/api/notifications');
      S.notifications = res.notifications || [];
      S.unread = res.unread || 0;
      $('#notifDot').classList.toggle('hidden', !S.unread);
      const list = $('#notifList');
      if (!list) return;
      if (!S.notifications.length) { list.innerHTML = `<div class="notif-empty">${esc(t('no_notifications'))}</div>`; return; }
      list.innerHTML = S.notifications.map((n) => {
        const icon = n.type === 'budget' ? '📋' : n.type === 'recurring' ? '🔁' : n.type === 'debt' ? '🛡️' : n.type === 'trial' ? '💎' : n.type === 'upgrade' ? '🚀' : '🔔';
        return `<div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
          <span class="notif-icon">${icon}</span>
          <div class="notif-text"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${fdate(String(n.created_at || '').slice(0, 10))}</small></div>
          <button class="tx-action-btn notif-del" data-id="${n.id}">✕</button>
        </div>`;
      }).join('');
      list.querySelectorAll('.notif-item').forEach((item) => item.addEventListener('click', async (e) => {
        if (e.target.closest('.notif-del')) {
          try { await api('DELETE', '/api/notifications/' + item.dataset.id); loadNotifications(true); } catch (err) { /* ignore */ }
          return;
        }
        try { await api('POST', '/api/notifications/read', { id: Number(item.dataset.id) }); loadNotifications(true); } catch (err) { /* ignore */ }
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- ONBOARDING ---------------- */
  let onboardStep = 1;
  function openOnboarding() {
    onboardStep = 1;
    $('#onboardOverlay').classList.remove('hidden');
    renderOnboardStep();
  }

  function closeOnboarding() {
    $('#onboardOverlay').classList.add('hidden');
  }

  function renderOnboardStep() {
    const box = $('#onboardOverlay').querySelector('.modal');
    const titles = [t('onboarding_step1'), t('onboarding_step2'), t('onboarding_step3'), t('onboarding_step4'), t('onboarding_step5')];
    const dots = titles.map((s, i) => `<span class="onboard-dot ${i + 1 === onboardStep ? 'active' : ''} ${i + 1 < onboardStep ? 'done' : ''}" title="${esc(s)}"></span>`).join('');
    let bodyHtml = '';
    if (onboardStep === 1) {
      bodyHtml = `<h3>🌍 ${esc(t('onboarding_step1'))}</h3>
        <div class="form-group"><label>${esc(t('country'))}</label>
          <select id="obCountry">${S.countries.map((c) => `<option value="${esc(c.code)}" ${c.code === 'AO' ? 'selected' : ''}>${esc(c.name)} (${esc(c.currency_code)})</option>`).join('')}</select>
        </div>`;
    } else if (onboardStep === 2) {
      bodyHtml = `<h3>🏦 ${esc(t('onboarding_step2'))}</h3>
        <div class="form-group"><label>${esc(t('name'))}</label><input id="obAccName" placeholder="${esc(t('institution'))}" /></div>
        <div class="form-row">
          <div class="form-group"><label>${esc(t('account_type'))}</label>
            <select id="obAccType"><option value="checking">${esc(t('account_checking'))}</option><option value="savings">${esc(t('account_savings'))}</option><option value="cash">${esc(t('account_cash'))}</option></select>
          </div>
          <div class="form-group"><label>${esc(t('initial_balance'))}</label><input type="number" id="obAccBal" value="0" /></div>
        </div>`;
    } else if (onboardStep === 3) {
      bodyHtml = `<h3>💸 ${esc(t('onboarding_step3'))}</h3>
        <div class="form-row">
          <div class="form-group"><label>${esc(t('type'))}</label><select id="obTxType"><option value="expense">${esc(t('expense'))}</option><option value="income">${esc(t('income'))}</option></select></div>
          <div class="form-group"><label>${esc(t('amount'))}</label><input type="number" step="0.01" id="obTxAmt" /></div>
        </div>
        <div class="form-group"><label>${esc(t('description'))}</label><input id="obTxDesc" /></div>
        <div class="form-group"><label>${esc(t('category'))}</label><select id="obTxCat">${catOptions('expense')}</select></div>`;
    } else if (onboardStep === 4) {
      bodyHtml = `<h3>📋 ${esc(t('onboarding_step4'))}</h3>
        <div class="form-row">
          <div class="form-group"><label>${esc(t('category'))}</label><select id="obBudCat">${catOptions('expense')}</select></div>
          <div class="form-group"><label>${esc(t('budget_limit'))}</label><input type="number" step="0.01" id="obBudLimit" /></div>
        </div>`;
    } else {
      bodyHtml = `<h3>🎯 ${esc(t('onboarding_step5'))}</h3>
        <div class="form-row">
          <div class="form-group"><label>${esc(t('name'))}</label><input id="obGoalName" /></div>
          <div class="form-group"><label>${esc(t('goal_target'))}</label><input type="number" step="0.01" id="obGoalTarget" /></div>
        </div>
        <div class="form-group"><label>${esc(t('goal_monthly'))}</label><input type="number" step="0.01" id="obGoalMonthly" value="0" /></div>`;
    }
    const prevBtn = onboardStep > 1 ? `<button class="btn btn-ghost" id="obPrev">${esc(t('previous'))}</button>` : '';
    const nextBtn = onboardStep < 5 ? `<button class="btn btn-primary" id="obNext">${esc(t('next'))}</button>` : `<button class="btn btn-primary" id="obFinish">${esc(t('finish'))}</button>`;
    box.innerHTML = `
      <div class="modal-head"><h3 class="modal-title">${esc(t('onboarding_welcome'))}</h3></div>
      <div class="modal-body">
        <div class="onboard-steps">${dots}</div>
        ${bodyHtml}
        <div class="modal-actions">
          <button class="text-btn" id="obSkip">${esc(t('skip'))}</button>
          ${prevBtn}
          ${nextBtn}
        </div>
      </div>`;

    $('#obSkip').addEventListener('click', async () => {
      try { await api('POST', '/api/onboarding/complete', {}); } catch (e) { /* ignore */ }
      S.settings.onboarded = true;
      closeOnboarding();
      await loadBaseData();
      loadDashboard();
    });
    const pv = $('#obPrev'); pv && pv.addEventListener('click', () => { onboardStep--; renderOnboardStep(); });
    const nx = $('#obNext');
    if (nx) nx.addEventListener('click', async () => {
      try {
        if (onboardStep === 1) {
          const res = await api('POST', '/api/settings/apply-country', { country_code: $('#obCountry').value });
          S.settings.currency = res.currency; S.settings.date_format = res.date_format; S.settings.country_code = res.country_code;
          if (window.FIQ) window.FIQ.dateFormat = res.date_format;
        } else if (onboardStep === 2) {
          await api('POST', '/api/onboarding/step', { step: 1, data: { name: $('#obAccName').value.trim(), type: $('#obAccType').value, initial_balance: parseFloat($('#obAccBal').value) || 0, currency: S.settings.currency } });
        } else if (onboardStep === 3) {
          await api('POST', '/api/onboarding/step', { step: 2, data: { type: $('#obTxType').value, description: $('#obTxDesc').value.trim(), amount: parseFloat($('#obTxAmt').value) || 0, category: $('#obTxCat').value, date: new Date().toISOString().slice(0, 10) } });
        } else if (onboardStep === 4) {
          await api('POST', '/api/onboarding/step', { step: 3, data: { category: $('#obBudCat').value, limit: parseFloat($('#obBudLimit').value) || 0 } });
        }
        onboardStep++; renderOnboardStep();
      } catch (e) { toast(e.message, 'error'); }
    });
    const fin = $('#obFinish');
    if (fin) fin.addEventListener('click', async () => {
      try {
        await api('POST', '/api/onboarding/step', { step: 4, data: { name: $('#obGoalName').value.trim(), target: parseFloat($('#obGoalTarget').value) || 0, monthly_contribution: parseFloat($('#obGoalMonthly').value) || 0 } });
        await api('POST', '/api/onboarding/complete', {});
        S.settings.onboarded = true;
        closeOnboarding();
        await loadBaseData();
        loadDashboard();
        toast(t('welcome_back') + ', ' + S.user.name + '!', 'success');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();