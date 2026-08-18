/* ============================================================
   FinanceIQ – Login Logic (API Connected)
   ============================================================ */

(function () {
    'use strict';

    if (document.getElementById('loginCard').classList.contains('hidden') === false) {
      fetch('/api/auth/me').then(r => {
        if (r.ok) { window.location.href = '/'; }
      }).catch(() => {});
    }

    const loginCard = document.getElementById('loginCard');
    const registerCard = document.getElementById('registerCard');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');

    showRegisterBtn.addEventListener('click', function () {
        loginCard.classList.add('hidden');
        registerCard.classList.remove('hidden');
        registerCard.style.animation = 'none';
        registerCard.offsetHeight;
        registerCard.style.animation = 'fadeInUp 0.5s ease-out';
        clearErrors();
    });

    showLoginBtn.addEventListener('click', function () {
        registerCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
        loginCard.style.animation = 'none';
        loginCard.offsetHeight;
        loginCard.style.animation = 'fadeInUp 0.5s ease-out';
        clearErrors();
    });

    document.querySelectorAll('.toggle-password').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var targetId = btn.dataset.target;
            var input = document.getElementById(targetId);
            var eyeOpen = btn.querySelector('.eye-open');
            var eyeClosed = btn.querySelector('.eye-closed');

            if (input.type === 'password') {
                input.type = 'text';
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                input.type = 'password';
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        });
    });

    var registerPassword = document.getElementById('registerPassword');
    var strengthFill = document.getElementById('strengthFill');
    var strengthText = document.getElementById('strengthText');

    registerPassword.addEventListener('input', function () {
        var val = registerPassword.value;
        var score = 0;
        if (val.length >= 6) score++;
        if (val.length >= 10) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        var levels = [
            { label: '', color: 'transparent', width: '0%' },
            { label: 'Fraca', color: '#f43f5e', width: '20%' },
            { label: 'Fraca', color: '#f97316', width: '40%' },
            { label: 'Média', color: '#fbbf24', width: '60%' },
            { label: 'Forte', color: '#10d9a0', width: '80%' },
            { label: 'Excelente', color: '#38bdf8', width: '100%' },
        ];

        var level = levels[score] || levels[0];
        strengthFill.style.width = level.width;
        strengthFill.style.background = level.color;
        strengthText.textContent = val.length > 0 ? level.label : '';
        strengthText.style.color = level.color;
    });

    function showError(id, msg) {
        const el = document.getElementById(id);
        const msgEl = document.getElementById(id + 'Msg');
        msgEl.textContent = msg;
        el.style.display = 'flex';
    }

    function hideError(id) {
        document.getElementById(id).style.display = 'none';
    }

    function showSuccess(id, msg) {
        const el = document.getElementById(id);
        const msgEl = document.getElementById(id + 'Msg');
        msgEl.textContent = msg;
        el.style.display = 'flex';
    }

    function clearErrors() {
        ['loginError', 'registerError', 'registerSuccess'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function setLoading(btnId, loading) {
        const btn = document.getElementById(btnId);
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        btn.disabled = loading;
        text.style.display = loading ? 'none' : 'inline';
        loader.style.display = loading ? 'flex' : 'none';
    }

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        hideError('loginError');
        setLoading('loginBtn', true);

        var email = document.getElementById('loginEmail').value.trim();
        var password = document.getElementById('loginPassword').value;

        fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok) {
                showError('loginError', result.data.error || 'Erro ao fazer login.');
                setLoading('loginBtn', false);
                return;
            }
            window.location.href = '/';
        })
        .catch(function () {
            showError('loginError', 'Erro de conexão. Tente novamente.');
            setLoading('loginBtn', false);
        });
    });

    registerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        hideError('registerError');
        hideError('registerSuccess');
        setLoading('registerBtn', true);

        var name = document.getElementById('registerName').value.trim();
        var email = document.getElementById('registerEmail').value.trim();
        var password = document.getElementById('registerPassword').value;
        var confirmPw = document.getElementById('registerConfirm').value;

        if (name.length < 2) {
            showError('registerError', 'Nome deve ter pelo menos 2 caracteres.');
            setLoading('registerBtn', false);
            return;
        }

        if (password.length < 6) {
            showError('registerError', 'Senha deve ter pelo menos 6 caracteres.');
            setLoading('registerBtn', false);
            return;
        }

        if (password !== confirmPw) {
            showError('registerError', 'As senhas não coincidem.');
            setLoading('registerBtn', false);
            return;
        }

        fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, email: email, password: password })
        })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok) {
                showError('registerError', result.data.error || 'Erro ao criar conta.');
                setLoading('registerBtn', false);
                return;
            }
            setLoading('registerBtn', false);
            showSuccess('registerSuccess', 'Conta criada com sucesso! Redirecionando...');
            setTimeout(function () {
                window.location.href = '/';
            }, 1500);
        })
        .catch(function () {
            showError('registerError', 'Erro de conexão. Tente novamente.');
            setLoading('registerBtn', false);
        });
    });

})();
