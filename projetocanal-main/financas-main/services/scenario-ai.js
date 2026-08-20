'use strict';
const db = require('../database');
const intelligence = require('./intelligence');
const format = require('./format');
const formula = require('./formula');

function round(v) { return Math.round(v * 100) / 100; }

function buildContext(user) {
  const currency = user.currency || 'AOA';
  const t = intelligence.monthTotals(user.id);
  const projected = intelligence.getProjectedIncome(user.id);
  const monthlyIncome = Math.max(t.income, projected, 1);
  const balance = intelligence.getTotalBalance(user.id, currency);
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(user.id);
  return { currency, monthlyIncome, balance, goals };
}

function makeScenarios(vars) {
  const base = {}, opt = {}, pes = {};
  vars.forEach((v) => {
    base[v.key] = round(v.base);
    opt[v.key] = round(v.base * v.opt);
    pes[v.key] = round(v.base * v.pes);
  });
  return {
    variables: vars.map((v) => ({ key: v.key, label: v.label, unit: v.unit || '' })),
    scenarios: [
      { name: 'Otimista', values: opt },
      { name: 'Realista', values: base },
      { name: 'Pessimista', values: pes }
    ]
  };
}

function templates() {
  return [
    {
      kws: ['venda', 'vendas', 'comercio', 'comércio', 'negocio', 'negócio', 'loja', 'empreend', 'restaurante', 'produto', 'freela', 'servico', 'serviço'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Projeção de vendas', description: 'Lucro mensal estimado a partir da receita, margem e custo fixo.',
          result_label: 'Lucro mensal', result_formula: 'receita * (margem / 100) - custo_fixo',
          variables: [
            { key: 'receita', label: 'Receita mensal', unit: '', base: income * 1.2, opt: 1.15, pes: 0.8 },
            { key: 'margem', label: 'Margem', unit: '%', base: 30, opt: 1.1, pes: 0.85 },
            { key: 'custo_fixo', label: 'Custo fixo', unit: '', base: income * 0.4, opt: 0.9, pes: 1.15 }
          ]
        };
      }
    },
    {
      kws: ['poupan', 'reserva', 'emergencia', 'emergência', 'fundo', 'imprevisto'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Reserva de emergência', description: 'Acumulação da reserva ao longo do tempo, adaptada aos seus rendimentos.',
          result_label: 'Reserva acumulada', result_formula: 'saldo_inicial + mensal * meses',
          variables: [
            { key: 'saldo_inicial', label: 'Saldo inicial', unit: '', base: c.balance || income * 0.5, opt: 1.1, pes: 0.9 },
            { key: 'mensal', label: 'Depósito mensal', unit: '', base: income * 0.15, opt: 1.3, pes: 0.7 },
            { key: 'meses', label: 'Meses', unit: '', base: 6, opt: 1, pes: 1 }
          ]
        };
      }
    },
    {
      kws: ['viagem', 'férias', 'ferias', 'turismo', 'passeio'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Custo da viagem', description: 'Orçamento total de uma viagem por dias e despesas diárias.',
          result_label: 'Custo total', result_formula: 'dias * (hotel + alimentacao) + transporte + extras',
          variables: [
            { key: 'dias', label: 'Dias', unit: '', base: 7, opt: 1, pes: 1.3 },
            { key: 'hotel', label: 'Hotel (dia)', unit: '', base: income * 0.1, opt: 0.85, pes: 1.2 },
            { key: 'alimentacao', label: 'Alimentação (dia)', unit: '', base: income * 0.06, opt: 0.85, pes: 1.2 },
            { key: 'transporte', label: 'Transporte', unit: '', base: income * 0.5, opt: 0.85, pes: 1.2 },
            { key: 'extras', label: 'Extras', unit: '', base: income * 0.2, opt: 0.8, pes: 1.3 }
          ]
        };
      }
    },
    {
      kws: ['invest', 'rendimento', 'aplicacao', 'aplicação', 'acoes', 'ações', 'cdb', 'tesouro'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Projeção de investimento', description: 'Crescimento do capital com juros compostos ao longo do tempo.',
          result_label: 'Valor final', result_formula: 'principal * (1 + taxa / 100) ^ meses',
          variables: [
            { key: 'principal', label: 'Capital inicial', unit: '', base: c.balance || income, opt: 1.2, pes: 0.8 },
            { key: 'taxa', label: 'Taxa mensal', unit: '%', base: 1.5, opt: 1.3, pes: 0.7 },
            { key: 'meses', label: 'Meses', unit: '', base: 12, opt: 1, pes: 1 }
          ]
        };
      }
    },
    {
      kws: ['carro', 'veiculo', 'veículo', 'moto', 'motorizada', 'bicicleta'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Compra do veículo', description: 'Poupança mensal necessária para adquirir o veículo.',
          result_label: 'Poupança mensal', result_formula: '(preco - entrada) / meses',
          variables: [
            { key: 'preco', label: 'Preço do veículo', unit: '', base: income * 18, opt: 0.9, pes: 1.15 },
            { key: 'entrada', label: 'Entrada', unit: '', base: income * 3, opt: 1.2, pes: 0.8 },
            { key: 'meses', label: 'Meses', unit: '', base: 24, opt: 1.5, pes: 0.8 }
          ]
        };
      }
    },
    {
      kws: ['casa', 'imovel', 'imóvel', 'apartamento', 'constru', 'terreno'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Projeção imobiliária', description: 'Plano de poupança para a aquisição imobiliária.',
          result_label: 'Valor poupado', result_formula: 'poupanca_mensal * meses',
          variables: [
            { key: 'poupanca_mensal', label: 'Poupança mensal', unit: '', base: income * 0.2, opt: 1.3, pes: 0.7 },
            { key: 'meses', label: 'Meses', unit: '', base: 36, opt: 1, pes: 1 }
          ]
        };
      }
    },
    {
      kws: ['estudo', 'estudos', 'curso', 'faculdade', 'universidade', 'escola', 'propina', 'licenciatura'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Custo dos estudos', description: 'Custo total de um curso ou formação profissional.',
          result_label: 'Custo total', result_formula: 'propina_mensal * meses + materiais',
          variables: [
            { key: 'propina_mensal', label: 'Propina mensal', unit: '', base: income * 0.25, opt: 0.85, pes: 1.2 },
            { key: 'meses', label: 'Meses', unit: '', base: 12, opt: 1, pes: 1 },
            { key: 'materiais', label: 'Materiais', unit: '', base: income * 0.1, opt: 0.8, pes: 1.3 }
          ]
        };
      }
    },
    {
      kws: ['casamento', 'evento', 'festa', 'celebra', 'aniversario', 'aniversário', 'bodas'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Orçamento do evento', description: 'Estimativa de custo de um evento ou celebração.',
          result_label: 'Custo total', result_formula: 'convidados * custo_convidado + decoracao',
          variables: [
            { key: 'convidados', label: 'Convidados', unit: '', base: 100, opt: 1, pes: 1.3 },
            { key: 'custo_convidado', label: 'Custo por convidado', unit: '', base: income * 0.05, opt: 0.85, pes: 1.2 },
            { key: 'decoracao', label: 'Decoração e extras', unit: '', base: income * 0.8, opt: 0.85, pes: 1.25 }
          ]
        };
      }
    },
    {
      kws: ['telefone', 'eletrodom', 'telemovel', 'telemóvel', 'computador', 'portatil', 'portátil', 'tv', 'gadget', 'aparelho', 'geladeira', 'frigorifico', 'frigorífico'],
      build(c) {
        const income = c.monthlyIncome || 1;
        return {
          name: 'Compra de equipamento', description: 'Poupança mensal para adquirir o equipamento.',
          result_label: 'Poupança mensal', result_formula: 'valor / meses',
          variables: [
            { key: 'valor', label: 'Valor do equipamento', unit: '', base: income * 0.8, opt: 0.9, pes: 1.15 },
            { key: 'meses', label: 'Meses', unit: '', base: 6, opt: 1.5, pes: 0.7 }
          ]
        };
      }
    }
  ];
}

function suggestModel(subject, user) {
  const c = buildContext(user);
  const low = String(subject || '').toLowerCase();
  let tpl = null;
  for (const t of templates()) {
    if (t.kws.some((k) => low.includes(k))) { tpl = t; break; }
  }
  const parts = tpl ? tpl.build(c) : generic(subject, c);
  const made = makeScenarios(parts.variables);
  return {
    name: parts.name,
    description: parts.description,
    result_label: parts.result_label,
    result_formula: parts.result_formula,
    variables: made.variables,
    scenarios: made.scenarios,
    usedContext: { currency: c.currency, monthlyIncome: round(c.monthlyIncome), balance: round(c.balance) }
  };
}

function generic(subject, c) {
  const income = c.monthlyIncome || 1;
  const s = String(subject || '').trim();
  const name = s ? s[0].toUpperCase() + s.slice(1) : 'Simulação';
  return {
    name,
    description: 'Simulação de cenários para "' + s + '".',
    result_label: 'Resultado',
    result_formula: 'entradas - saidas',
    variables: [
      { key: 'entradas', label: 'Entradas', unit: '', base: income, opt: 1.15, pes: 0.85 },
      { key: 'saidas', label: 'Saídas', unit: '', base: income * 0.7, opt: 0.85, pes: 1.15 }
    ]
  };
}

function analyze(runData, model, user) {
  const c = buildContext(user);
  const money = (v) => format.formatMoney(v == null ? 0 : v, c.currency);
  const results = (runData.results || []).filter((r) => r.result != null);
  if (!results.length) throw new Error('Sem resultados válidos para analisar.');
  const base = results.find((r) => r.base) || results[0];
  const best = results.reduce((a, b) => (b.result > a.result ? b : a));
  const worst = results.reduce((a, b) => (b.result < a.result ? b : a));

  const sens = (model.variables || []).map((v) => {
    const orig = Number(base.values[v.key]) || 0;
    const bumped = { ...base.values, [v.key]: orig * 1.1 };
    let r0 = null, r1 = null;
    try {
      const ast = formula.parse(model.result_formula);
      r0 = formula.evaluate(ast, base.values);
      r1 = formula.evaluate(ast, bumped);
    } catch (e) { /* ignore */ }
    const impact = r0 != null && r1 != null ? Math.abs(r1 - r0) : null;
    return {
      key: v.key, label: v.label || v.key, unit: v.unit || '',
      impact, sign: r0 != null && r1 != null ? Math.sign(r1 - r0) : 0
    };
  }).filter((s) => s.impact != null).sort((a, b) => b.impact - a.impact);
  const top = sens[0];

  const lines = [];
  lines.push(`Análise do modelo **"${model.name}"** (${results.length} cenários).`);
  lines.push(`• Melhor resultado: **${best.name}** — ${money(best.result)}${best.delta != null ? ' (Δ ' + (best.delta >= 0 ? '+' : '') + money(best.delta) + ')' : ''}.`);
  lines.push(`• Cenário mais conservador: **${worst.name}** — ${money(worst.result)}.`);
  if (top) lines.push(`• Maior impacto: **${top.label}** — +10% altera o resultado em ${money(top.impact)}.`);
  if (sens.length > 1) lines.push(`• Sensibilidade: ${sens.slice(0, 3).map((s) => `${s.label} (${money(s.impact)})`).join(', ')}.`);
  if (best.result > 0 && worst.result < 0) lines.push('⚠️ O cenário pessimista é negativo — tenha um plano de contingência.');
  else if (worst.result > 0) lines.push('✅ Todos os cenários são positivos; o resultado é robusto a variações.');
  else lines.push('🔴 Todos os cenários resultam em valor negativo — reveja os pressupostos.');
  if (top && top.sign > 0 && !top.unit.includes('%')) lines.push(`Dica: aumentar **${top.label}** é a alavanca mais eficaz para melhorar o resultado.`);
  if (top && top.sign < 0) lines.push(`Dica: reduzir **${top.label}** melhora o resultado (varia inversamente).`);
  if (c.goals.length) lines.push(`Enquadramento: tens ${c.goals.length} meta(s) ativa(s) — podes aplicar o cenário a uma meta com "Aplicar à meta".`);

  return { text: lines.join('\n'), best, worst, sensitivity: sens, currency: c.currency };
}

async function externalInsights(prompt) {
  const url = process.env.AI_LLM_URL;
  const key = process.env.AI_LLM_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.AI_LLM_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'És um analista financeiro. Responde em português de forma concisa, clara e com markdown simples. Fala de cenários, riscos e recomendações.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      }),
      signal: AbortSignal.timeout(15000)
    });
    const d = await r.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || null;
  } catch (e) {
    return null;
  }
}

function buildPrompt(runData, model, user) {
  const c = buildContext(user);
  const lines = [];
  lines.push(`Modelo: ${model.name} (${model.result_formula})`);
  lines.push(`Variáveis: ${(model.variables || []).map((v) => v.label || v.key).join(', ')}`);
  (runData.results || []).forEach((r) => {
    lines.push(`Cenário ${r.name}: valores ${JSON.stringify(r.values)} → resultado ${r.result}`);
  });
  lines.push(`Moeda do utilizador: ${c.currency}`);
  lines.push('Dá-me: resumo dos cenários, o cenário mais provável, riscos e recomendações práticas.');
  return lines.join('\n');
}

async function insights(runData, model, user) {
  const local = analyze(runData, model, user);
  const prompt = buildPrompt(runData, model, user);
  const ext = await externalInsights(prompt);
  return {
    text: ext || local.text,
    localText: local.text,
    usedExternal: !!ext,
    best: local.best,
    worst: local.worst,
    sensitivity: local.sensitivity,
    currency: local.currency
  };
}

module.exports = { suggestModel, analyze, insights, templates }; 