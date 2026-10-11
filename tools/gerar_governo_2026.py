#!/usr/bin/env python3
"""Gera js/dados-governo-2026.js (window.GOVERNO_2026) a partir da votação por
seção do 1º turno de 2026 (TSE, votacao_secao_2026_AC.csv), cargo Governador.

Mesmo formato de js/dados-tche-2026.js / js/dados-felipe-2024.js, para o painel
de js/eleicao-painel.js. Municípios, regionais, locais de votação (bairro/endereço),
coordenadas e o mapa vêm de js/dados-tche-2026.js (mesma eleição, mesmas seções)
e são lidos em tempo de execução no navegador — aqui só saem seções, ranking e
totais.

Uso: python tools/gerar_governo_2026.py caminho/votacao_secao_2026_AC.csv
"""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FOCO = 11                       # candidato do painel: Mailza Assis (PP 11)
NOME_FOCO = 'MAILZA ASSIS'
SEM_BAIRRO = '(sem bairro informado)'


def carregar_tche():
    s = (RAIZ / 'js' / 'dados-tche-2026.js').read_text(encoding='utf-8')
    m = re.search(r'window\.TCHE_2026=', s)
    return json.JSONDecoder().raw_decode(s[m.end():])[0]


def posicao(votos_por_cand):
    """(posição do candidato-foco, nº de candidatos com voto) numa unidade."""
    com_voto = {n: v for n, v in votos_por_cand.items() if v > 0}
    meu = com_voto.get(FOCO, 0)
    if not meu:
        return [0, len(com_voto)]
    return [1 + sum(1 for v in com_voto.values() if v > meu), len(com_voto)]


def main(caminho, turno='1', arquivo='dados-governo-2026.js', variavel='GOVERNO_2026'):
    tche = carregar_tche()
    locais, regional = tche['locais'], tche['regional']

    secoes = {}                               # (mun, zona, secao) -> dados
    nomes = {}
    with open(caminho, encoding='latin-1', newline='') as f:
        for r in csv.DictReader(f, delimiter=';'):
            if r['DS_CARGO'] != 'Governador' or r['NR_TURNO'] != turno:
                continue
            chave = ('%05d' % int(r['CD_MUNICIPIO']), int(r['NR_ZONA']), int(r['NR_SECAO']))
            s = secoes.setdefault(chave, {'local': int(r['NR_LOCAL_VOTACAO']), 'v': defaultdict(int)})
            num = int(r['NR_VOTAVEL'])
            s['v'][num] += int(r['QT_VOTOS'])
            nomes[num] = r['NM_VOTAVEL']

    cands = [n for n in nomes if n not in (95, 96)]
    estado = defaultdict(int)
    for s in secoes.values():
        for n, v in s['v'].items():
            estado[n] += v
    brancos, nulos = estado[95], estado[96]
    validos = sum(estado[n] for n in cands)
    apurado = validos + brancos + nulos

    # unidades para o ranking: reg, mun, zona, bairro, local, sec
    unid = {k: defaultdict(lambda: defaultdict(int)) for k in ('reg', 'mun', 'zona', 'bairro', 'local', 'sec')}
    linhas, faltando = [], set()
    for (mun, zona, sec), s in sorted(secoes.items()):
        v = s['v']
        info = locais.get('%s|%d|%d' % (mun, zona, s['local']))
        if info is None:
            faltando.add((mun, zona, s['local']))
        bairro = info[1].strip() if info and info[1] and info[1].strip() else SEM_BAIRRO
        b, n = v.get(95, 0), v.get(96, 0)
        nominais = sum(v.get(c, 0) for c in cands)
        total = nominais + b + n
        meu = v.get(FOCO, 0)
        lider = 1 if meu > 0 and meu == max(v.get(c, 0) for c in cands) else 0
        # [mun, zona, secao, local, aptos(0 = não informado), comparecimento, votos, totalApurado, brancos, nulos, 0, foiOMaisVotado]
        linhas.append([mun, zona, sec, s['local'], 0, total, meu, total, b, n, 0, lider])
        ks = {'reg': regional.get(mun, 'Outras'), 'mun': mun, 'zona': '%s|%d' % (mun, zona),
              'bairro': '%s|%s' % (mun, bairro), 'local': '%s|%d|%d' % (mun, zona, s['local']),
              'sec': '%s|%d|%d' % (mun, zona, sec)}
        for nivel, k in ks.items():
            for c in cands:
                unid[nivel][k][c] += v.get(c, 0)

    rk = {nivel: {k: posicao(vc) for k, vc in d.items()} for nivel, d in unid.items()}

    ranking = sorted(({'num': c, 'nome': nomes[c], 'votos': estado[c]} for c in cands), key=lambda x: -x['votos'])
    pos = 1 + sum(1 for c in cands if estado[c] > estado[FOCO])

    saida = {
        'cand': {'nome': NOME_FOCO, 'nome2022': '', 'numero': FOCO, 'partido': 'PP', 'numPartido': 11,
                 'cargo': 'Governador', 'vagas': 1, 'nomeCompleto': nomes[FOCO], 'eleito': False,
                 'majoritario': True, 'sem22': True, 'ano': 2026,
                 'tag': ('2º turno' if turno == '1' else 'Apurado') if estado[FOCO] / validos <= 0.5 else 'Eleita'},
        'estado': {'q': estado[FOCO], 'apurado': apurado, 'brancos': brancos, 'nulos': nulos, 'validos': validos,
                   'pos': pos, 'nCand': len(cands), 'partidoNominais': 0, 'partidoLegenda': 0},
        'estado22': {'q': 0, 'qMapeado': 0, 'semCorresp': []},
        'secoes': linhas,
        'rk': rk,
        'candidatos': ranking,
        'turno': int(turno),
    }
    corpo = json.dumps(saida, ensure_ascii=False, separators=(',', ':'))
    cab = ('/* Gerado por tools/gerar_governo_2026.py a partir da votação por seção de 2026 '
           '(Governador — Mailza Assis, PP 11, turno ' + turno + ') — TSE, Portal de Dados Abertos (votacao_secao_2026_AC).\n'
           '   Municípios, regionais, locais, coordenadas e mapa vêm de js/dados-tche-2026.js (carregado antes deste arquivo).\n'
           '   secoes: [mun,zona,secao,local,aptos(0 = não informado),comparecimento(=total apurado),votos,totalApurado,brancos,nulos,0,foiOMaisVotado(0/1)] */\n')
    ligacao = ('\n(function () {\n  var T = window.TCHE_2026, G = window.' + variavel + ';\n'
               '  if (T) ["municipios", "regional", "locais", "coords", "mapa", "regionais"].forEach(function (k) { G[k] = T[k]; });\n})();\n')
    (RAIZ / 'js' / arquivo).write_text(cab + 'window.' + variavel + '=' + corpo + ';' + ligacao, encoding='utf-8')

    print('seções:', len(linhas), '| votos Mailza:', estado[FOCO], '| válidos:', validos,
          '| %.2f%%' % (estado[FOCO] / validos * 100), '| posição:', pos)
    if faltando:
        print('AVISO: locais sem cadastro em dados-tche-2026.js:', sorted(faltando)[:10], len(faltando))
    for r in ranking:
        print(' ', r['num'], r['nome'], r['votos'], '%.2f%%' % (r['votos'] / validos * 100))


if __name__ == '__main__':
    # python tools/gerar_governo_2026.py votacao_secao_2026_AC.csv [turno]   (turno 2 grava js/dados-governo-2turno-2026.js)
    if len(sys.argv) > 2 and sys.argv[2] == '2':
        main(sys.argv[1], '2', 'dados-governo-2turno-2026.js', 'GOVERNO_2T_2026')
    else:
        main(sys.argv[1])
