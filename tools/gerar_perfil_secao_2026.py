#!/usr/bin/env python3
"""Gera js/dados-perfil-2026.js (window.PERFIL_2026): perfil do eleitorado de cada seção (AC).
Alimenta, no painel do 2º turno (aba Eleições), as métricas de perfil: % de mulheres/homens, jovens, 60+, escolaridade,
biometria, deficiência e voto facultativo, e a comparação "resultado × perfil da seção".

Fonte (TSE, Dados Abertos — "Perfil do eleitor por seção eleitoral", UF AC):
  https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitor_secao/perfil_eleitor_secao_ATUAL_AC.zip
Uso:  python tools/gerar_perfil_secao_2026.py perfil_eleitor_secao_ATUAL_AC.zip   (ou o .csv já extraído)

Saída: "mun|zona|secao" -> [masc, fem, total, 16-24, 25-39, 40-59, 60+, superior, até_fund_incompleto, biometria, deficiência, facultativo]
(contagens de eleitores; "total" inclui todos os gêneros).
"""
import csv
import io
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def abrir(caminho):
    p = Path(caminho)
    if p.suffix.lower() == '.zip':
        z = zipfile.ZipFile(p)
        nome = next(n for n in z.namelist() if n.lower().endswith('.csv'))
        return io.TextIOWrapper(z.open(nome), encoding='latin-1', newline='')
    return open(p, encoding='latin-1', newline='')


def idade_inicial(txt):
    m = re.match(r'\s*(\d+)', txt or '')
    return int(m.group(1)) if m else None


def main(caminho):
    d = defaultdict(lambda: [0] * 12)
    with abrir(caminho) as f:
        for r in csv.DictReader(f, delimiter=';'):
            if r.get('SG_UF', 'AC') != 'AC':
                continue
            q = int(r['QT_ELEITORES'])
            v = d['%05d|%d|%d' % (int(r['CD_MUNICIPIO']), int(r['NR_ZONA']), int(r['NR_SECAO']))]
            g = (r.get('DS_GENERO') or '').upper()
            if g.startswith('MASC'):
                v[0] += q
            elif g.startswith('FEM'):
                v[1] += q
            v[2] += q
            i = idade_inicial(r.get('DS_FAIXA_ETARIA'))
            if i is not None:
                if i <= 24:
                    v[3] += q
                elif i <= 39:
                    v[4] += q
                elif i <= 59:
                    v[5] += q
                else:
                    v[6] += q
            gi = (r.get('DS_GRAU_INSTRUCAO') or '').upper()
            if gi.startswith('SUPERIOR'):
                v[7] += q
            elif gi.startswith('ANALF') or gi.startswith('L') or gi == 'ENSINO FUNDAMENTAL INCOMPLETO':
                v[8] += q
            v[9] += int(r.get('QT_ELEITORES_BIOMETRIA') or 0)
            v[10] += int(r.get('QT_ELEITORES_DEFICIENCIA') or 0)
            if (r.get('TP_OBRIGATORIEDADE_VOTO') or '').upper().startswith('FACULT'):
                v[11] += q
    saida = {k: v for k, v in sorted(d.items())}
    cab = ('/* Gerado por tools/gerar_perfil_secao_2026.py — perfil do eleitorado por seção (TSE, perfil do eleitor por seção, AC).\n'
           '   "mun|zona|secao": [masc, fem, total, 16-24, 25-39, 40-59, 60+, superior, até fund. incompleto, biometria, deficiência, facultativo] */\n')
    (RAIZ / 'js' / 'dados-perfil-2026.js').write_text(cab + 'window.PERFIL_2026=' + json.dumps(saida, separators=(',', ':')) + ';\n', encoding='utf-8')
    tot = [sum(v[i] for v in saida.values()) for i in range(12)]
    print('seções:', len(saida), '| masc/fem/total:', tot[:3], '| 16-24/25-39/40-59/60+:', tot[3:7], '| superior:', tot[7], '| baixa esc.:', tot[8], '| bio:', tot[9], '| def:', tot[10], '| facult:', tot[11])


if __name__ == '__main__':
    main(sys.argv[1])
