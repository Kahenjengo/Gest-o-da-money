'use strict';

const FN = new Set(['min', 'max', 'round', 'abs', 'floor', 'ceil', 'sqrt', 'pow', 'log', 'ln', 'exp', 'sign']);
const CONST = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const s = String(src || '');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (!isFinite(num)) throw new Error('Número inválido: ' + s.slice(i, j));
      tokens.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ t: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/%^(),'.includes(c)) { tokens.push({ t: c, v: c }); i++; continue; }
    throw new Error('Carácter inválido: "' + c + '"');
  }
  return tokens;
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  expect(t) {
    const tk = this.next();
    if (!tk || tk.t !== t) throw new Error('Esperado "' + t + '"');
    return tk;
  }
  parse() { return this.parseAddSub(); }
  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.peek() && (this.peek().t === '+' || this.peek().t === '-')) {
      const op = this.next().t;
      const right = this.parseMulDiv();
      left = { type: 'bin', op, left, right };
    }
    return left;
  }
  parseMulDiv() {
    let left = this.parsePow();
    while (this.peek() && (this.peek().t === '*' || this.peek().t === '/' || this.peek().t === '%')) {
      const op = this.next().t;
      const right = this.parsePow();
      left = { type: 'bin', op, left, right };
    }
    return left;
  }
  parsePow() {
    const left = this.parseUnary();
    if (this.peek() && this.peek().t === '^') {
      this.next();
      const right = this.parsePow();
      return { type: 'bin', op: '^', left, right };
    }
    return left;
  }
  parseUnary() {
    if (this.peek() && (this.peek().t === '-' || this.peek().t === '+')) {
      const op = this.next().t;
      return { type: 'un', op: op === '-' ? 'neg' : 'pos', value: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  parsePrimary() {
    const tk = this.peek();
    if (!tk) throw new Error('Fórmula incompleta');
    if (tk.t === 'num') { this.next(); return { type: 'num', v: tk.v }; }
    if (tk.t === 'id') {
      this.next();
      if (this.peek() && this.peek().t === '(') {
        this.next();
        const args = [];
        if (this.peek() && this.peek().t === ')') { this.next(); }
        else {
          args.push(this.parseAddSub());
          while (this.peek() && this.peek().t === ',') { this.next(); args.push(this.parseAddSub()); }
          this.expect(')');
        }
        return { type: 'call', fn: tk.v, args };
      }
      return { type: 'var', name: tk.v };
    }
    if (tk.t === '(') {
      this.next();
      const e = this.parseAddSub();
      this.expect(')');
      return e;
    }
    throw new Error('Símbolo inesperado: "' + tk.v + '"');
  }
}

function parse(src) {
  const p = new Parser(tokenize(src));
  const ast = p.parse();
  if (p.peek()) throw new Error('Conteúdo extra na fórmula: "' + p.peek().v + '"');
  return ast;
}

function evaluate(node, vars) {
  switch (node.type) {
    case 'num': return node.v;
    case 'var': {
      if (node.name in CONST) return CONST[node.name];
      if (node.name in vars) {
        const v = Number(vars[node.name]);
        if (Number.isNaN(v) || !isFinite(v)) throw new Error('Variável "' + node.name + '" sem valor numérico');
        return v;
      }
      throw new Error('Variável desconhecida: "' + node.name + '"');
    }
    case 'call': {
      const args = node.args.map((a) => evaluate(a, vars));
      switch (node.fn) {
        case 'min': return Math.min(...args);
        case 'max': return Math.max(...args);
        case 'round': return Math.round(args[0]);
        case 'abs': return Math.abs(args[0]);
        case 'floor': return Math.floor(args[0]);
        case 'ceil': return Math.ceil(args[0]);
        case 'sqrt': return Math.sqrt(args[0]);
        case 'pow': return Math.pow(args[0], args[1]);
        case 'log': return Math.log(args[0]) / Math.LN10;
        case 'ln': return Math.log(args[0]);
        case 'exp': return Math.exp(args[0]);
        case 'sign': return Math.sign(args[0]);
        default: throw new Error('Função desconhecida: "' + node.fn + '"');
      }
    }
    case 'un': {
      const v = evaluate(node.value, vars);
      return node.op === 'neg' ? -v : v;
    }
    case 'bin': {
      const l = evaluate(node.left, vars);
      const r = evaluate(node.right, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': if (r === 0) throw new Error('Divisão por zero'); return l / r;
        case '%': if (r === 0) throw new Error('Divisão por zero (módulo)'); return l % r;
        case '^': return Math.pow(l, r);
        default: throw new Error('Operador desconhecido: "' + node.op + '"');
      }
    }
    default: throw new Error('Expressão inválida');
  }
}

function collectVars(node, acc) {
  if (!node) return;
  if (node.type === 'var' && !(node.name in CONST) && !FN.has(node.name)) acc[node.name] = true;
  if (node.type === 'bin') { collectVars(node.left, acc); collectVars(node.right, acc); }
  if (node.type === 'un') collectVars(node.value, acc);
  if (node.type === 'call') node.args.forEach((a) => collectVars(a, acc));
}

function validateFormula(formula, keys) {
  const ast = parse(formula);
  const used = {};
  collectVars(ast, used);
  for (const k of Object.keys(used)) {
    if (!keys.has(k)) throw new Error('A fórmula usa variável não declarada: "' + k + '"');
  }
  return ast;
}

function explain(node, vars, labels, prec = 0) {
  const wrap = (s, p) => (p > prec ? '(' + s + ')' : s);
  if (!node) return '';
  switch (node.type) {
    case 'num': return String(node.v);
    case 'var': {
      if (node.name in CONST) return node.name;
      const label = (labels && labels[node.name]) || node.name;
      const v = Number(vars[node.name]);
      return label + ' (' + (Number.isFinite(v) ? String(v) : '?') + ')';
    }
    case 'call':
      return node.fn + '(' + node.args.map((a) => explain(a, vars, labels, 100)).join(', ') + ')';
    case 'un':
      return wrap((node.op === 'neg' ? '−' : '') + explain(node.value, vars, labels, 11), 10);
    case 'bin': {
      const ops = { '+': ' + ', '-': ' − ', '*': ' × ', '/': ' ÷ ', '%': ' mod ', '^': ' ^ ' };
      const p = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4 };
      return wrap(explain(node.left, vars, labels, p[node.op]) + (ops[node.op] || node.op) + explain(node.right, vars, labels, p[node.op]), p[node.op]);
    }
    default: return '';
  }
}

function goalSeek(fn, target, guess) {
  const tgt = Number(target);
  const g = (v) => fn(Number(v)) - tgt;
  let best = null;
  const MAX = 1e13;
  let a = 0;
  let b = Number.isFinite(guess) && guess > 0 ? guess : 1;
  let fa = g(0);
  let fb = g(b);
  const tol = Math.max(Math.abs(tgt) * 1e-10, 1e-9);

  const consider = (x, e) => { if (isFinite(e) && (!best || Math.abs(e) < best.err)) best = { x, err: Math.abs(e) }; };
  consider(0, fa);
  consider(b, fb);

  if (fa === 0) return { x: 0, err: 0, converged: true, iterations: 0 };
  if (fb === 0) return { x: b, err: 0, converged: true, iterations: 0 };

  let bracketed = false;
  if (isFinite(fa) && isFinite(fb) && Math.sign(fa) !== Math.sign(fb)) bracketed = true;
  let iterations = 0;

  if (!bracketed) {
    for (let i = 0; i < 100 && b < MAX; i++) {
      iterations++;
      if (!isFinite(fb)) { b = a + Math.max((b - a) / 2, 1e-9); fb = g(b); consider(b, fb); if (fb === 0) return { x: b, err: 0, converged: true, iterations }; continue; }
      if (fb === 0) return { x: b, err: 0, converged: true, iterations };
      if (isFinite(fa) && Math.sign(fa) !== Math.sign(fb)) { bracketed = true; break; }
      consider(b, fb);
      a = b; fa = fb;
      b = b * 2;
      fb = g(b);
    }
  }

  if (bracketed) {
    for (let i = 0; i < 300; i++) {
      iterations++;
      const mid = (a + b) / 2;
      const fm = g(mid);
      consider(mid, fm);
      if (fm === 0 || Math.abs(fm) <= tol || Math.abs(b - a) <= tol * 1e-4) break;
      if (isFinite(fm) && Math.sign(fm) === Math.sign(fa)) { a = mid; fa = fm; }
      else { b = mid; fb = fm; }
    }
  }

  if (!best || !isFinite(best.x)) throw new Error('Não foi possível encontrar um valor para a meta.');
  return { x: best.x, err: best.err, converged: best.err <= Math.max(tol * 100, 1e-6), iterations };
}

module.exports = { parse, evaluate, validateFormula, explain, goalSeek, FN, CONST };