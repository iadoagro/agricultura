/* Confere, registro a registro, que a montagem do painel feita em SQL (mecanizacao_painel_montar, usada por
   mecanizacao_painel) devolve EXATAMENTE o mesmo que a regra original em JavaScript (paraRegistroPainel, da
   função de borda lancar-mecanizacao), nos dois perfis: público e logado.

   Uso:  node tools/conferir_painel_sql.cjs      (precisa do Supabase CLI ligado ao projeto: npx supabase link)
   Sai com código 1 se houver qualquer diferença. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function consulta(sql) {
  const arq = path.join(os.tmpdir(), 'conferir_painel_' + process.pid + '.sql');
  fs.writeFileSync(arq, sql);
  const saida = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', arq], { shell: true, maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
  fs.unlinkSync(arq);
  const i = saida.indexOf('{'), j = saida.lastIndexOf('}');
  return JSON.parse(saida.slice(i, j + 1)).rows;
}

/* ------- a regra ORIGINAL (cópia fiel de supabase/functions/lancar-mecanizacao/index.ts, sem os tipos) ------- */
const NAO_INFORMADO = 'Não informado';
function nomeSugeridoDoEmail(email) {
  const u = email.split('@')[0].replace(/\d+/g, ' ').replace(/[._-]+/g, ' ').trim();
  return u.replace(/\S+/g, (p) => p.charAt(0).toUpperCase() + p.slice(1)) || email;
}
function geoPontos(v) {
  if (!Array.isArray(v)) return {};
  const pts = [];
  for (const p of v) {
    const x = Number(p && p.x), y = Number(p && p.y), z = Math.trunc(Number(p && p.zona));
    if (isFinite(x) && isFinite(y) && x > 0 && y > 0) pts.push([x, y, isFinite(z) ? z : 0]);
  }
  return pts.length ? { geo: pts } : {};
}
function paraRegistroPainel(l, nomes, logado) {
  const ou = (v, padrao = NAO_INFORMADO) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : padrao);
  const numero = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const lista = (v) => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x !== '') : []);
  const criado = new Date(String(l.criado_em));
  const d = new Date(criado.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const email = String(l.criado_por_email ?? '').trim().toLowerCase();
  const sexo = String(l.sexo ?? '');
  const culturas = Array.isArray(l.culturas) ? l.culturas : [];
  const daes = Array.isArray(l.daes) ? l.daes : [];
  return {
    d,
    h: new Date(criado.getTime() - 5 * 3600 * 1000).toISOString().slice(11, 16),
    ex: d.slice(0, 4),
    dv: typeof l.data_vistoria === 'string' ? l.data_vistoria : '',
    pc: ou(l.tipo_servico), mun: ou(l.municipio), esc: ou(l.escritorio_local), rt: ou(l.responsavel_tecnico),
    alim: (email && (nomes.get(email) || nomeSugeridoDoEmail(email))) || NAO_INFORMADO,
    prod: ou(l.nome_beneficiario),
    sexo: /^f/i.test(sexo) ? 'Feminino' : /^m/i.test(sexo) ? 'Masculino' : NAO_INFORMADO,
    ec: ou(l.estado_civil), dap: ou(l.possui_dap), assoc: ou(l.associacao_cooperativa),
    loc: logado ? ou(l.endereco, '') : '',
    propr: ou(l.nome_propriedade, ''),
    cult: culturas.map((c) => [String((c && c.cultura) ?? '').trim(), numero(c && c.area_ha), String((c && c.sistema_cultivo) ?? '').trim()]).filter((c) => c[0] !== ''),
    ha: numero(l.area_total_ha), hrs: numero(l.horas_maquina), ac: Math.trunc(numero(l.quantidade_acudes)),
    tt: ou(l.tipo_uso), maq: lista(l.maquinas), impl: lista(l.implementos),
    dae: daes.reduce((a, x) => a + numero(x && x.valor), 0),
    form: logado && typeof l.formulario_url === 'string' ? l.formulario_url : '',
    obs: ou(l.observacao, ''),
    _geo: Array.isArray(l.pontos_geo) && l.pontos_geo.length > 0,
    ...(logado ? geoPontos(l.pontos_geo) : {}),
  };
}

/* ------- comparação tolerante (números com 1e-9; geo ausente = nulo) ------- */
function igual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => igual(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of ks) { if (!igual(a[k] === undefined ? null : a[k], b[k] === undefined ? null : b[k])) return false; }
    return true;
  }
  return a === b;
}

console.log('Lendo registros brutos, nomes e a montagem em SQL…');
const brutos = consulta('select public.mecanizacao_painel_bruto() as r')[0].r;
const nomes = new Map();
consulta('select email, nome from public.mecanizacao_lancadores').forEach((x) => {
  const e = String(x.email ?? '').trim().toLowerCase(), n = typeof x.nome === 'string' ? x.nome.trim() : '';
  if (e && n) nomes.set(e, n);
});

let falhas = 0;
for (const logado of [false, true]) {
  const sql = consulta('select registros, meta from public.mecanizacao_painel_montar(' + logado + ')')[0];
  const esperado = brutos.map((l) => { const r = paraRegistroPainel(l, nomes, logado); return r; });
  const dif = [];
  esperado.forEach((e, i) => {
    const copia = { ...e }; delete copia._geo;
    if (!igual(copia, sql.registros[i])) dif.push(i);
  });
  const ok = sql.registros.length === esperado.length && dif.length === 0;
  // meta
  const semGeo = esperado.filter((r) => !r._geo).length;
  const outroAno = esperado.filter((r) => r.dv && r.dv.slice(0, 4) !== r.d.slice(0, 4)).length;
  const semForm = logado ? esperado.filter((r) => !r.form).length : 0;
  const metaOk = sql.meta.registros === esperado.length && sql.meta.qualidade.sem_geo === semGeo &&
    sql.meta.qualidade.vistoria_outro_ano === outroAno && sql.meta.qualidade.sem_formulario === semForm &&
    sql.meta.periodo[0] === esperado[0].d && sql.meta.periodo[1] === esperado[esperado.length - 1].d;
  console.log((logado ? 'logado ' : 'público') + ': ' + esperado.length + ' registros — ' + (ok ? 'idênticos' : dif.length + ' diferentes') +
    ' · meta ' + (metaOk ? 'ok' : 'DIFERENTE'));
  if (!ok) {
    falhas++;
    const i = dif[0];
    console.log('   exemplo (linha ' + i + '):\n   esperado ' + JSON.stringify(esperado[i]).slice(0, 400) + '\n   sql      ' + JSON.stringify(sql.registros[i]).slice(0, 400));
  }
  if (!metaOk) { falhas++; console.log('   meta sql ' + JSON.stringify(sql.meta)); }
}
console.log(falhas ? '\nFALHOU' : '\nA montagem em SQL é igual à original.');
process.exit(falhas ? 1 : 0);
