const express = require('express');
const db = require('../database');
const { isAuthenticated } = require('../middleware/auth');
const formula = require('../services/formula');
const scenarioAi = require('../services/scenario-ai');
const router = express.Router();

router.use(isAuthenticated);

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseValues(raw) {
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}

function hydrateModel(row) {
  const variables = db.prepare('SELECT * FROM scenario_variables WHERE model_id = ? ORDER BY sort, id').all(row.id);
  const scenarios = db.prepare('SELECT * FROM scenarios WHERE model_id = ? ORDER BY id').all(row.id);
  return {
    id: row.id, name: row.name, description: row.description || '',
    result_formula: row.result_formula, result_label: row.result_label || 'Resultado',
    created_at: row.created_at, updated_at: row.updated_at,
    variables: variables.map((v) => ({ id: v.id, key: v.key, label: v.label || '', unit: v.unit || '', sort: v.sort || 0 })),
    scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, values: parseValues(s.values), created_at: s.created_at }))
  };
}

function getModel(userId, id) {
  const row = db.prepare('SELECT * FROM scenario_models WHERE id = ? AND user_id = ?').get(id, userId);
  return row ? hydrateModel(row) : null;
}

function validatePayload(body) {
  const name = String(body.name || '').trim();
  const resultFormula = String(body.result_formula || '').trim();
  const resultLabel = String(body.result_label || 'Resultado').trim();
  if (!name) return { error: 'Nome do modelo é obrigatório.' };
  if (!resultFormula) return { error: 'A fórmula de resultado é obrigatória.' };

  const rawVars = Array.isArray(body.variables) ? body.variables : [];
  if (!rawVars.length) return { error: 'Defina pelo menos uma variável de entrada.' };
  const variables = [];
  const seenKeys = new Set();
  for (const v of rawVars) {
    const key = String(v.key || '').trim();
    if (!KEY_RE.test(key)) return { error: 'Chave de variável inválida: "' + key + '". Use letras, números e _.' };
    if (formula.FN.has(key) || key in formula.CONST) return { error: 'Chave "' + key + '" é palavra reservada da fórmula.' };
    if (seenKeys.has(key)) return { error: 'Chave duplicada: "' + key + '".' };
    seenKeys.add(key);
    variables.push({ key, label: String(v.label || '').trim(), unit: String(v.unit || '').trim() });
  }

  const rawScenarios = Array.isArray(body.scenarios) ? body.scenarios : [];
  if (!rawScenarios.length) return { error: 'Crie pelo menos um cenário.' };
  const scenarios = [];
  const seenNames = new Set();
  for (const sc of rawScenarios) {
    const scName = String(sc.name || '').trim();
    if (!scName) return { error: 'Todos os cenários precisam de um nome.' };
    if (seenNames.has(scName)) return { error: 'Nome de cenário duplicado: "' + scName + '".' };
    seenNames.add(scName);
    const values = {};
    for (const v of variables) {
      const raw = sc.values && sc.values[v.key];
      const n = Number(raw);
      if (!isFinite(n)) return { error: 'Cenário "' + scName + '": valor inválido para "' + (v.label || v.key) + '".' };
      values[v.key] = n;
    }
    scenarios.push({ name: scName, values });
  }

  let ast;
  try { ast = formula.validateFormula(resultFormula, seenKeys); } catch (e) { return { error: 'Fórmula inválida: ' + e.message }; }

  return { name, description: String(body.description || '').trim(), resultFormula, resultLabel, variables, scenarios, ast };
}

function insertChildren(modelId, payload) {
  const insVar = db.prepare('INSERT INTO scenario_variables (model_id, key, label, unit, sort) VALUES (?, ?, ?, ?, ?)');
  payload.variables.forEach((v, i) => insVar.run(modelId, v.key, v.label, v.unit, i));
  const insSc = db.prepare('INSERT INTO scenarios (model_id, name, "values") VALUES (?, ?, ?)');
  payload.scenarios.forEach((s) => insSc.run(modelId, s.name, JSON.stringify(s.values)));
}

function fmtNum(v) {
  if (v == null || !isFinite(v)) return null;
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

function labelsOf(model) {
  const labels = {};
  model.variables.forEach((v) => { labels[v.key] = v.label || v.key; });
  return labels;
}

function computeResults(model) {
  const keys = new Set(model.variables.map((v) => v.key));
  const ast = formula.validateFormula(model.result_formula, keys);
  const labels = labelsOf(model);
  return model.scenarios.map((sc) => {
    let result = null;
    let explanation = '';
    try {
      result = formula.evaluate(ast, sc.values);
      explanation = formula.explain(ast, sc.values, labels) + ' = ' + fmtNum(result);
    } catch (e) {
      explanation = 'Erro: ' + e.message;
    }
    return { scenarioId: sc.id, name: sc.name, values: sc.values, result: fmtNum(result), explanation };
  });
}

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const rows = db.prepare('SELECT * FROM scenario_models WHERE user_id = ? ORDER BY id DESC').all(userId);
  res.json(rows.map((r) => hydrateModel(r)));
});

router.post('/suggest', (req, res) => {
  const userId = req.session.user.id;
  const subject = String(req.body.subject || '').trim();
  if (!subject) return res.status(400).json({ error: 'Descreve o assunto do cenário (ex.: comprar um carro, reserva de emergência).' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json(scenarioAi.suggestModel(subject, user));
});

router.post('/:id/analyze', async (req, res) => {
  const userId = req.session.user.id;
  const model = getModel(userId, req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  let results;
  try {
    results = computeResults(model);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const base = results.find((r) => /realista/i.test(r.name)) || results[0] || null;
  const comparison = results.map((r) => ({
    ...r,
    base: !!(base && base.scenarioId === r.scenarioId),
    delta: (r.result != null && base && base.result != null) ? fmtNum(r.result - base.result) : null
  }));
  const runData = { model, results: comparison, baseScenarioId: base ? base.scenarioId : null };
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  try {
    const ins = await scenarioAi.insights(runData, model, user);
    res.json(ins);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const payload = validatePayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const r = db.prepare('INSERT INTO scenario_models (user_id, name, description, result_formula, result_label) VALUES (?, ?, ?, ?, ?)')
    .run(userId, payload.name, payload.description, payload.resultFormula, payload.resultLabel);
  const modelId = r.lastInsertRowid;
  insertChildren(modelId, payload);
  res.status(201).json(getModel(userId, modelId));
});

router.put('/:id', (req, res) => {
  const userId = req.session.user.id;
  const model = getModel(userId, req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  const payload = validatePayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  db.prepare("UPDATE scenario_models SET name=?, description=?, result_formula=?, result_label=?, updated_at=datetime('now','localtime') WHERE id=? AND user_id=?")
    .run(payload.name, payload.description, payload.resultFormula, payload.resultLabel, model.id, userId);
  db.prepare('DELETE FROM scenarios WHERE model_id = ?').run(model.id);
  db.prepare('DELETE FROM scenario_variables WHERE model_id = ?').run(model.id);
  insertChildren(model.id, payload);
  res.json(getModel(userId, model.id));
});

router.delete('/:id', (req, res) => {
  const userId = req.session.user.id;
  const result = db.prepare('DELETE FROM scenario_models WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Modelo não encontrado.' });
  res.json({ ok: true });
});

router.post('/:id/run', (req, res) => {
  const userId = req.session.user.id;
  const model = getModel(userId, req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  let results;
  try {
    results = computeResults(model);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const base = results.find((r) => /realista/i.test(r.name)) || results[0] || null;
  const comparison = results.map((r) => ({
    ...r,
    base: !!(base && base.scenarioId === r.scenarioId),
    delta: (r.result != null && base && base.result != null) ? fmtNum(r.result - base.result) : null
  }));
  res.json({ model, results: comparison, baseScenarioId: base ? base.scenarioId : null });
});

router.post('/:id/goal-seek', (req, res) => {
  const userId = req.session.user.id;
  const model = getModel(userId, req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  const { scenarioId, variable, target, guess } = req.body;
  const sc = model.scenarios.find((s) => String(s.id) === String(scenarioId));
  if (!sc) return res.status(404).json({ error: 'Cenário não encontrado.' });
  const v = model.variables.find((x) => x.key === variable);
  if (!v) return res.status(400).json({ error: 'Variável desconhecida.' });
  const tgt = Number(target);
  if (!isFinite(tgt)) return res.status(400).json({ error: 'Valor da meta inválido.' });
  const keys = new Set(model.variables.map((x) => x.key));
  let ast;
  try { ast = formula.validateFormula(model.result_formula, keys); } catch (e) { return res.status(400).json({ error: 'Fórmula inválida: ' + e.message }); }
  const labels = labelsOf(model);
  const values = { ...sc.values };
  const baseResult = formula.evaluate(ast, values);
  const fn = (x) => { const next = { ...values, [variable]: x }; return formula.evaluate(ast, next); };
  let found;
  try {
    found = formula.goalSeek(fn, tgt, Number.isFinite(Number(guess)) ? Number(guess) : values[variable]);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const applied = { ...values, [variable]: found.x };
  const finalResult = fn(found.x);
  res.json({
    modelId: model.id, scenarioId: sc.id, scenarioName: sc.name,
    variable, variableLabel: v.label || v.key, unit: v.unit || '',
    target: tgt, found: fmtNum(found.x), converged: found.converged, iterations: found.iterations,
    before: { value: values[variable], result: fmtNum(baseResult) },
    after: { value: fmtNum(found.x), result: fmtNum(finalResult) },
    explanation: formula.explain(ast, applied, labels) + ' = ' + fmtNum(finalResult)
  });
});

router.post('/:id/scenarios/:scenarioId/apply', (req, res) => {
  const userId = req.session.user.id;
  const model = getModel(userId, req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  const sc = model.scenarios.find((s) => String(s.id) === String(req.params.scenarioId));
  if (!sc) return res.status(404).json({ error: 'Cenário não encontrado.' });
  const { variable, value } = req.body;
  if (!model.variables.some((x) => x.key === variable)) return res.status(400).json({ error: 'Variável desconhecida.' });
  const n = Number(value);
  if (!isFinite(n)) return res.status(400).json({ error: 'Valor inválido.' });
  const values = { ...sc.values, [variable]: n };
  db.prepare('UPDATE scenarios SET "values" = ? WHERE id = ?').run(JSON.stringify(values), sc.id);
  res.json({ ok: true, scenarioId: sc.id, variable, value: n, values });
});

router.post('/:id/export', (req, res) => {
  const userId = req.session.user.id;
  const model = getModel(userId, req.params.id);
  if (!model) return res.status(404).json({ error: 'Modelo não encontrado.' });
  let results;
  try {
    results = computeResults(model);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const escCell = (cell) => {
    const s = String(cell == null ? '' : cell).replace(/"/g, '""');
    return /[";\n]/.test(s) ? '"' + s + '"' : s;
  };
  const header = ['Cenário'].concat(model.variables.map((v) => v.label || v.key), [model.result_label || 'Resultado']);
  const rows = results.map((r) => [r.name].concat(model.variables.map((v) => r.values[v.key]), [r.result != null ? r.result : '']));
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(escCell).join(';')).join('\r\n');
  res.json({ csv, filename: (model.name || 'modelo').toLowerCase().replace(/[^a-z0-9]+/gi, '-') + '-cenarios.csv' });
});

module.exports = router;