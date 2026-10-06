#!/usr/bin/env python3
"""Gera js/dados-boletins-rural-2026.js (window.BOLETINS_RURAL_2026): boletim de urna
(votos por candidato, brancos e nulos) das seções escolhidas da ZONA RURAL de Rio Branco (zona 9),
1º turno de 2026, para Presidente, Governador, Senador, Deputado Federal e Deputado Estadual.

As seções são as da lista SELECAO abaixo (escolas informadas pela equipe). Fonte dos votos: TSE, votação
por seção (votacao_secao_2026_AC.csv e, para Presidente, as linhas do AC de votacao_secao_2026_BR.csv);
seções agregadas e eleitores aptos vêm de js/locais-votacao.js.

Uso: python tools/gerar_boletins_rural_2026.py votacao_secao_2026_AC.csv presidente_ac.csv
"""
import csv, json, re, sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MUN, ZONA = '01392', 9      # Rio Branco, zona 9 (zona rural)
SELECAO = {                 # escola -> seções pedidas (as agregadas entram no boletim da seção principal)
    'Escola Doutor Santiago Dantas': [262, 406, 465],
    'IFAC - Transacreana': [85, 166, 191, 259, 275],
    'Escola Rural Prof. Cláudio Augusto F. de Sales': [111, 249],
    'Escola Estadual Dalva de Souza das Neves': [243, 271],
    'Escola Rural Alto Alegre II': [213, 466, 480],
    'Escola Estadual Major João Câncio': [279, 416],
    'Escola Municipal Prof. Terezinha Migueis': [112, 131, 182],
}
CARGOS = [('Presidente', 'Presidente', 1), ('Governador', 'Governador', 1), ('Senador', 'Senador', 2),
          ('Deputado Federal', 'Deputado Federal', 8), ('Deputado Estadual', 'Deputado Estadual', 24)]


def main(arquivos):
    lv = (RAIZ / 'js' / 'locais-votacao.js').read_text(encoding='utf-8')
    locais_v = json.loads(lv[lv.index('{', lv.index('window.LOCAIS_VOTACAO')):].rstrip().rstrip(';'))['locais']
    info = {}                                    # seção -> (agregadas, aptos)
    for l in locais_v:
        if l['municipio'] == '1200401' and l['zona'] == str(ZONA):
            for x in l['secoes']:
                info[int(x['numero'])] = ([int(a) for a in x['agregadas']], x['aptos'])
    pedidas = {n for v in SELECAO.values() for n in v}
    # seções agregadas: os votos aparecem no boletim da seção principal
    pedidas_efetivas = {n for n in pedidas if not any(n in info.get(m, ([], 0))[0] for m in pedidas)}
    ids = {c[0]: i for i, c in enumerate(CARGOS)}
    nomes = [dict() for _ in CARGOS]
    secoes = {}
    locs = {}
    for arq in arquivos:
        with open(arq, encoding='latin-1', newline='') as f:
            for r in csv.DictReader(f, delimiter=';'):
                if r['DS_CARGO'] not in ids or r['NR_TURNO'] != '1':
                    continue
                mun, zona = '%05d' % int(r['CD_MUNICIPIO']), int(r['NR_ZONA'])
                if mun != MUN or zona != ZONA or int(r['NR_SECAO']) not in pedidas_efetivas:
                    continue
                locs.setdefault(int(r['NR_LOCAL_VOTACAO']), [r['NM_LOCAL_VOTACAO'], r['DS_LOCAL_VOTACAO_ENDERECO']])
                c = ids[r['DS_CARGO']]
                num, votos = int(r['NR_VOTAVEL']), int(r['QT_VOTOS'])
                sec = secoes.setdefault((mun, zona, int(r['NR_SECAO'])), {'local': int(r['NR_LOCAL_VOTACAO']), 'c': defaultdict(lambda: {'v': [], 'b': 0, 'n': 0})})
                d = sec['c'][c]
                if num == 95: d['b'] += votos
                elif num == 96: d['n'] += votos
                else:
                    d['v'].append([num, votos]); nomes[c][num] = r['NM_VOTAVEL']
    linhas = []
    for (mun, zona, sec), d in sorted(secoes.items()):
        cs = {}
        for c, x in d['c'].items():
            x['v'].sort(key=lambda p: (-p[1], p[0]))
            cs[str(c)] = [x['v'], x['b'], x['n']]
        agr, aptos = info.get(sec, ([], 0))
        linhas.append([mun, zona, sec, d['local'], cs, agr, aptos])
    saida = {'cargos': [{'nome': n, 'vagas': v, 'cand': {str(k): nm for k, nm in sorted(nomes[i].items())}} for i, (_, n, v) in enumerate(CARGOS)],
             'locais': {str(k): v for k, v in sorted(locs.items())}, 'secoes': linhas}
    cab = ('/* Gerado por tools/gerar_boletins_rural_2026.py — boletim de urna (1º turno de 2026) das seções da ZONA RURAL do Acre; fonte: TSE, votação por seção.\n'
           '   secoes: [mun, zona, secao, local, {cargo: [[candidato, votos]...], brancos, nulos]}, agregadas, aptos] — locais: código -> [nome, endereço]. */\n')
    (RAIZ / 'js' / 'dados-boletins-rural-2026.js').write_text(cab + 'window.BOLETINS_RURAL_2026=' + json.dumps(saida, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print('seções:', len(linhas), '| candidatos:', [len(c['cand']) for c in saida['cargos']])
    print('seções com cargo faltando:', sum(1 for l in linhas if len(l[4]) != len(CARGOS)))


if __name__ == '__main__':
    main(sys.argv[1:])
