#!/usr/bin/env python3
"""Gera js/dados-governo-1turno-secoes.js (window.GOVERNO_1T_SECOES): votação de Governador por seção no 1º turno de 2026.

Usada pelo comparativo "1º turno × 2º turno" do painel da aba Eleições (2º turno): quando uma unidade passa de 50% de
apuração, o painel compara, nas MESMAS seções já apuradas, o resultado dos dois turnos.

Fonte: boletins de urna do 1º turno no TSE (pleito 3220), os mesmos arquivos que o painel lê ao vivo no 2º turno
(https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/...). O BU é ASN.1/BER; aqui é decodificado e só o cargo
Governador (3) é guardado.

Saída: "mun|zona|secao": [votos de 11 (Mailza), votos de 10 (Alan Rick), votos dos demais, brancos, nulos]

Uso: python tools/gerar_governo_1turno_secoes.py        (leva alguns minutos: 2 requisições por seção, 2.270 seções)
"""
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
BASE = 'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/dados/ac'
FOCO, RIVAL, CARGO = 11, 10, 3


def get(url, tentativas=4):
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read()
        except Exception:
            if i == tentativas - 1:
                return None


def ber(b, i, fim):
    out = []
    while i < fim:
        t = b[i]; i += 1
        cons = (t >> 5) & 1; tag = t & 31
        if tag == 31:
            tag = 0
            while True:
                x = b[i]; i += 1; tag = (tag << 7) | (x & 127)
                if not x & 128:
                    break
        l = b[i]; i += 1
        if l & 128:
            n = l & 127; l = int.from_bytes(b[i:i + n], 'big'); i += n
        no = {'t': tag, 'i': i, 'l': l}
        if cons:
            no['k'] = ber(b, i, i + l)
        out.append(no); i += l
    return out


def inteiro(b, no):
    return int.from_bytes(b[no['i']:no['i'] + no['l']], 'big')


def le_bu(b):
    raiz = ber(b, 0, len(b))[0]
    ult = raiz['k'][-1]
    corpo = ber(b, ult['i'], ult['i'] + ult['l'])[0]['k']
    res = None
    for x in reversed(corpo):
        if x.get('k') and x['k'][0]['t'] == 16 and len(x['k']) >= 2:
            res = x; break
    if not res:
        return None
    for rv in res['k']:
        if not rv.get('k') or len(rv['k']) < 5 or not rv['k'][4].get('k'):
            continue
        for tot in rv['k'][4]['k']:
            for cg in tot['k'][2].get('k', []):
                if not cg.get('k') or inteiro(b, cg['k'][0]) != CARGO:
                    continue
                v = {}; br = nu = 0
                for it in cg['k'][-1].get('k', []):
                    tp = inteiro(b, it['k'][0]); q = inteiro(b, it['k'][1])
                    if tp == 1:
                        ident = it['k'][2].get('k') if len(it['k']) > 2 else None
                        num = inteiro(b, ident[-1]) if ident else 0
                        v[num] = v.get(num, 0) + q
                    elif tp == 2:
                        br += q
                    elif tp == 3:
                        nu += q
                outros = sum(q for n, q in v.items() if n not in (FOCO, RIVAL))
                return [v.get(FOCO, 0), v.get(RIVAL, 0), outros, br, nu]
    return None


def secao(chave):
    mun, zona, sec = chave.split('|')
    d = '%s/%s/%04d/%04d/' % (BASE, mun, int(zona), int(sec))
    aux = get(d + 'p003220-ac-m%s-z%04d-s%04d-aux.json' % (mun, int(zona), int(sec)))
    if not aux:
        return chave, None
    j = json.loads(aux.decode('utf-8-sig'))
    hs = j.get('hashes') or []
    if not hs:
        return chave, None
    h = next((x for x in hs if x.get('st') == 'Totalizado'), hs[-1])
    bu = next((a for a in h.get('arq', []) if a.get('tp') == 'bu'), None)
    if not bu:
        return chave, None
    dados = get(d + h['hash'] + '/' + bu['nm'])
    return chave, (le_bu(dados) if dados else None)


def main():
    s = (RAIZ / 'js' / 'dados-governo-2026.js').read_text(encoding='utf-8')
    g = json.JSONDecoder().raw_decode(s[re.search(r'window\.GOVERNO_2026=', s).end():])[0]
    chaves = ['%s|%d|%d' % (r[0], r[1], r[2]) for r in g['secoes']]
    saida, falhas = {}, []
    with ThreadPoolExecutor(24) as ex:
        for i, (k, v) in enumerate(ex.map(secao, chaves), 1):
            if v:
                saida[k] = v
            else:
                falhas.append(k)
            if i % 300 == 0:
                print(i, 'de', len(chaves), flush=True)
    cab = ('/* Gerado por tools/gerar_governo_1turno_secoes.py — Governador, 1º turno de 2026, por seção (boletins de urna, TSE).\n'
           '   "mun|zona|secao": [Mailza (11), Alan Rick (10), demais candidatos, brancos, nulos] */\n')
    (RAIZ / 'js' / 'dados-governo-1turno-secoes.js').write_text(
        cab + 'window.GOVERNO_1T_SECOES=' + json.dumps(saida, separators=(',', ':')) + ';\n', encoding='utf-8')
    tot = [sum(v[i] for v in saida.values()) for i in range(5)]
    print('seções:', len(saida), '| falhas:', len(falhas), '| Mailza/Alan/demais/brancos/nulos:', tot)


if __name__ == '__main__':
    main()
