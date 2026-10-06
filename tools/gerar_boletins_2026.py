#!/usr/bin/env python3
"""Gera os dados da aba "Boletins" (boletim de urna do 1º turno de 2026) de TODAS as seções do Acre:
Presidente, Governador, Senador, Deputado Federal e Deputado Estadual.

Saída:
  js/dados-boletins-2026.js            índice leve (window.BOLETINS_2026): cargos/candidatos e a lista de seções
                                       [mun, zona, secao, local, aptos, agregadas] — abre junto com a página.
  js/boletins-2026/mun-<cod>.js        votos por seção de cada município (window.BOL26[cod]), carregado só quando
                                       o usuário abre aquele município.

Fonte dos votos: TSE, votação por seção (votacao_secao_2026_AC.csv e, para Presidente, as linhas do AC de
votacao_secao_2026_BR.csv). Eleitores aptos e seções agregadas: js/locais-votacao.js (o código de município do
TSE é casado com o do IBGE pelas seções de cada um).

Uso: python tools/gerar_boletins_2026.py votacao_secao_2026_AC.csv presidente_ac.csv
"""
import csv, json, sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARGOS = [('Presidente', 1), ('Governador', 1), ('Senador', 2), ('Deputado Federal', 8), ('Deputado Estadual', 24)]


def le_js(nome, var):
    t = (RAIZ / 'js' / nome).read_text(encoding='utf-8')
    return json.JSONDecoder().raw_decode(t[t.index('{', t.index(var)):])[0]


def main(arquivos):
    ids = {n: i for i, (n, _) in enumerate(CARGOS)}
    nomes = [dict() for _ in CARGOS]
    secoes = {}            # (mun, zona, secao) -> {'local': int, 'c': {cargo: {'v': [], 'b': 0, 'n': 0}}}
    for arq in arquivos:
        with open(arq, encoding='latin-1', newline='') as f:
            for r in csv.DictReader(f, delimiter=';'):
                if r['DS_CARGO'] not in ids or r['NR_TURNO'] != '1' or r['SG_UF'] != 'AC':
                    continue
                chave = ('%05d' % int(r['CD_MUNICIPIO']), int(r['NR_ZONA']), int(r['NR_SECAO']))
                c = ids[r['DS_CARGO']]
                num, votos = int(r['NR_VOTAVEL']), int(r['QT_VOTOS'])
                sec = secoes.setdefault(chave, {'local': int(r['NR_LOCAL_VOTACAO']), 'c': {}})
                d = sec['c'].setdefault(c, {'v': [], 'b': 0, 'n': 0})
                if num == 95: d['b'] += votos
                elif num == 96: d['n'] += votos
                else:
                    d['v'].append([num, votos]); nomes[c][num] = r['NM_VOTAVEL']

    # aptos e agregadas: casa município TSE <-> IBGE pelas seções (zona, número)
    locais = le_js('locais-votacao.js', 'window.LOCAIS_VOTACAO')['locais']
    ibge = defaultdict(dict)
    for l in locais:
        for x in l['secoes']:
            ibge[l['municipio']][(int(l['zona']), int(x['numero']))] = ([int(a) for a in x['agregadas']], x['aptos'])
    tse = defaultdict(set)
    for (m, z, s) in secoes:
        tse[m].add((z, s))
    par = {}
    for m, ss in tse.items():
        melhor = max(ibge, key=lambda i: len(ss & set(ibge[i])))
        par[m] = melhor
        print(m, '->', melhor, len(ss & set(ibge[melhor])), '/', len(ss))

    por_mun = defaultdict(dict)
    indice = []
    for (m, z, s), d in sorted(secoes.items()):
        agr, aptos = ibge[par[m]].get((z, s), ([], 0))
        cs = []
        for c in range(len(CARGOS)):
            x = d['c'].get(c)
            if not x: cs.append(None); continue
            x['v'].sort(key=lambda p: (-p[1], p[0]))
            cs.append([x['v'], x['b'], x['n']])
        indice.append([m, z, s, d['local'], aptos, agr])
        por_mun[m]['%d|%d' % (z, s)] = cs

    saida = RAIZ / 'js' / 'boletins-2026'
    saida.mkdir(exist_ok=True)
    for f in saida.glob('mun-*.js'): f.unlink()
    for m, dados in por_mun.items():
        (saida / ('mun-%s.js' % m)).write_text('window.BOL26=window.BOL26||{};window.BOL26["%s"]=%s;\n' % (m, json.dumps(dados, separators=(',', ':'))), encoding='utf-8')
    idx = {'cargos': [{'nome': n, 'vagas': v, 'cand': {str(k): nm for k, nm in sorted(nomes[i].items())}} for i, (n, v) in enumerate(CARGOS)], 'secoes': indice}
    cab = ('/* Gerado por tools/gerar_boletins_2026.py — índice dos boletins de urna (1º turno de 2026) de todas as seções do Acre; fonte: TSE, votação por seção.\n'
           '   secoes: [mun, zona, secao, local, aptos, agregadas]. Os votos ficam em js/boletins-2026/mun-<cod>.js (carregados sob demanda). */\n')
    (RAIZ / 'js' / 'dados-boletins-2026.js').write_text(cab + 'window.BOLETINS_2026=' + json.dumps(idx, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print('seções:', len(indice), '| municípios:', len(por_mun), '| candidatos:', [len(c['cand']) for c in idx['cargos']])
    print('seções sem algum cargo:', sum(1 for d in por_mun.values() for cs in d.values() if None in cs))


if __name__ == '__main__':
    main(sys.argv[1:])
