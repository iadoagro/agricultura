#!/usr/bin/env python3
"""Gera js/dados-governo-2turno-2026.js (window.GOVERNO_2T_2026) EM BRANCO: mesmas seções do 1º turno
(js/dados-governo-2026.js), todos os votos zerados, aguardando o 2º turno (25/10/2026).

Quando o TSE publicar a votação por seção do 2º turno, troque este arquivo pelo real:
    python tools/gerar_governo_2026.py votacao_secao_2026_AC.csv 2

Uso: python tools/gerar_governo_2turno_vazio.py
"""
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / 'js' / 'dados-governo-2026.js'
DESTINO = RAIZ / 'js' / 'dados-governo-2turno-2026.js'


def main():
    s = ORIGEM.read_text(encoding='utf-8')
    g = json.JSONDecoder().raw_decode(s[re.search(r'window\.GOVERNO_2026=', s).end():])[0]
    cand = dict(g['cand'], tag='Aguardando', eleito=False)
    secoes = [[m, z, sc, loc, ap, 0, 0, 0, 0, 0, 0, 0] for m, z, sc, loc, ap, *_ in g['secoes']]
    nomes = {c['num']: c['nome'] for c in g['candidatos']}
    saida = {
        'cand': cand,
        'estado': {'q': 0, 'apurado': 0, 'brancos': 0, 'nulos': 0, 'validos': 0, 'pos': 0, 'nCand': 2,
                   'partidoNominais': 0, 'partidoLegenda': 0},
        'estado22': {'q': 0, 'qMapeado': 0, 'semCorresp': []},
        'secoes': secoes,
        'rk': {n: {} for n in ('reg', 'mun', 'zona', 'bairro', 'local', 'sec')},
        'candidatos': [{'num': n, 'nome': nomes.get(n, str(n)), 'votos': 0} for n in (11, 10)],
        'turno': 2,
        'aoVivo': True,   # liga o modo "apuração ao vivo" do painel (js/eleicao-painel.js)
        'rival': 10,      # Alan Rick (Republicanos 10): o painel compara o foco (Mailza, 11) com ele
        'aguardando': True,
    }
    cab = ('/* Gerado por tools/gerar_governo_2turno_vazio.py — 2º turno de 2026 (Governador) EM BRANCO, aguardando a apuração (25/10/2026).\n'
           '   Mesmas seções do 1º turno, votos zerados. Substitua pelo real com: python tools/gerar_governo_2026.py <votacao_secao_2026_AC.csv> 2 */\n')
    lig = ('\n(function () {\n  var T = window.TCHE_2026, G = window.GOVERNO_2T_2026;\n'
           '  if (T) ["municipios", "regional", "locais", "coords", "mapa", "regionais"].forEach(function (k) { G[k] = T[k]; });\n})();\n')
    DESTINO.write_text(cab + 'window.GOVERNO_2T_2026=' + json.dumps(saida, ensure_ascii=False, separators=(',', ':')) + ';' + lig, encoding='utf-8')
    print('seções:', len(secoes), '->', DESTINO.name)


if __name__ == '__main__':
    main()
