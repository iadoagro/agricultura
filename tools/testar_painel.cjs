/* Testes das regras de cálculo do painel de Mecanização (js/painel-calculos.js).
   Rodar:  node tools/testar_painel.cjs   — sai com código 1 se algo falhar. */
const assert = require('assert');
const PC = require('../js/painel-calculos.js');
let ok = 0, falhas = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ok  ' + nome); }
  catch (e) { falhas++; console.log('FALHA ' + nome + '\n      ' + e.message); }
}
const perto = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6);

console.log('Datas e exercício');
t('vistoria plausível vale como data de referência', () => {
  const r = { d: '2026-05-10', dv: '2026-04-28', ex: '2026' };
  assert.strictEqual(PC.vistoriaValida(r), true);
  assert.strictEqual(PC.dataRef(r), '2026-04-28');
});
t('vistoria no futuro cai para a data de lançamento', () => {
  const r = { d: '2026-05-10', dv: '2026-12-01', ex: '2026' };
  assert.strictEqual(PC.vistoriaValida(r), false);
  assert.strictEqual(PC.dataRef(r), '2026-05-10');
});
t('vistoria com mais de 18 meses é inválida; exatamente 18 vale', () => {
  assert.strictEqual(PC.vistoriaValida({ d: '2026-07-01', dv: '2025-01-01' }), true);
  assert.strictEqual(PC.vistoriaValida({ d: '2026-07-01', dv: '2024-12-31' }), false);
});
t('ano digitado errado (1949) não vale', () => {
  assert.strictEqual(PC.vistoriaValida({ d: '2026-03-03', dv: '1949-03-03' }), false);
});
t('sem vistoria: usa o lançamento', () => {
  assert.strictEqual(PC.dataRef({ d: '2026-03-03', dv: '' }), '2026-03-03');
});
t('exercício é o campo ex, ou o ano do lançamento', () => {
  assert.strictEqual(PC.anoDe({ d: '2026-01-02', ex: '2025' }), '2025');
  assert.strictEqual(PC.anoDe({ d: '2026-01-02' }), '2026');
});
t('mesChave usa o exercício e o mês da data de referência', () => {
  assert.strictEqual(PC.mesChave({ d: '2026-01-10', dv: '2025-11-20', ex: '2026' }), '2026-11');
});

console.log('Agregações');
const regs = [
  { mun: 'Xapuri', ha: 10, prod: 'João da Silva' },
  { mun: 'Xapuri', ha: 5.5, prod: 'joao da  silva' },
  { mun: 'Brasiléia', ha: 4, prod: 'Maria Souza' },
  { mun: '', ha: 3, prod: '' }
];
t('soma ignora vazio', () => assert.ok(perto(PC.soma(regs, r => r.ha), 22.5)));
t('somarPor agrupa e ignora chave vazia', () => {
  const m = PC.somarPor(regs, r => r.mun, r => r.ha);
  assert.strictEqual(m.get('Xapuri'), 15.5);
  assert.strictEqual(m.has(''), false);
});
t('contar aceita lista por registro', () => {
  const m = PC.contar([{ c: ['a', 'b'] }, { c: ['a'] }, { c: [] }], r => r.c);
  assert.strictEqual(m.get('a'), 2);
  assert.strictEqual(m.get('b'), 1);
});
t('produtores distintos: sem acento, caixa e espaço dobrado', () => {
  assert.strictEqual(PC.nProdutores(regs), 2);
  assert.strictEqual(PC.chaveBusca('JOÃO'), 'joao');
});
t('ranking ordena, filtra zeros e agrupa o resto em Outros', () => {
  const m = new Map([['a', 5], ['b', 4], ['c', 3], ['d', 0], ['e', 1]]);
  const r = PC.ranking(m, 3, true);
  assert.deepStrictEqual(r.map(x => x.rot), ['a', 'b', 'Outros']);
  assert.strictEqual(r[2].val, 4);
});
t('faixas: cada valor cai na primeira faixa que o comporta', () => {
  const f = PC.faixas([{ v: 1 }, { v: 2 }, { v: 7 }, { v: 0 }], r => r.v, [{ rot: 'ate2', max: 2 }, { rot: 'ate9', max: 9 }]);
  assert.deepStrictEqual(f, [{ rot: 'ate2', val: 2 }, { rot: 'ate9', val: 1 }]);
});
t('variação: percentual nulo quando a referência é zero', () => {
  assert.strictEqual(PC.variacao(5, 0).pct, null);
  assert.ok(perto(PC.variacao(150, 100).pct, 50));
});

console.log('Coordenadas');
t('UTM 19S (538418, 8850651) cai perto de -10,397 / -68,649', () => {
  const [lat, lng] = PC.utmParaLatLng(538418, 8850651, 19);
  assert.ok(perto(lat, -10.39719, 0.001), 'lat ' + lat);
  assert.ok(perto(lng, -68.64902, 0.001), 'lng ' + lng);
});
t('meridiano central da zona 19 (500000) dá longitude -69', () => {
  const [, lng] = PC.utmParaLatLng(500000, 9000000, 19);
  assert.ok(perto(lng, -69, 1e-6), 'lng ' + lng);
});
t('equador (y = 10.000.000) dá latitude 0', () => {
  const [lat] = PC.utmParaLatLng(500000, 10000000, 19);
  assert.ok(perto(lat, 0, 1e-9));
});

console.log('Desempenho (20 mil registros sintéticos)');
t('filtrar + agregar 20 mil registros em menos de 300 ms', () => {
  const M = ['Xapuri', 'Brasiléia', 'Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá'];
  const big = [];
  for (let i = 0; i < 20000; i++) {
    const mes = String(1 + (i % 12)).padStart(2, '0');
    big.push({ d: '2026-' + mes + '-10', dv: '2026-' + mes + '-05', ex: '2026', mun: M[i % M.length], ha: i % 17, prod: 'Produtor ' + (i % 3000), pc: i % 5 ? 'Mecanização' : 'Açudagem' });
  }
  const t0 = process.hrtime.bigint();
  const sel = big.filter(r => PC.anoDe(r) === '2026' && PC.dataRef(r).slice(5, 7) >= '03');
  PC.somarPor(sel, r => r.mun, r => r.ha);
  PC.nProdutores(sel);
  PC.contar(sel, r => r.pc);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('      ' + ms.toFixed(0) + ' ms');
  assert.ok(ms < 300, ms.toFixed(0) + ' ms');
});

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
