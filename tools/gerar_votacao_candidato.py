"""Filtra o CSV de votação por seção do TSE para um único candidato e gera
um arquivo JS pequeno com o resultado, no mesmo padrão de
tools/gerar_locais_votacao.py (planilha/CSV fonte -> js/dados-*.js versionado,
sem reprocessar o arquivo grande no navegador).

Uso:
  python tools/gerar_votacao_candidato.py "<caminho do votacao_secao_AAAA_UF.csv>" [SQ_CANDIDATO]

Por padrão filtra José Luís Schafer (SQ_CANDIDATO=10001622761, Deputado
Estadual, Acre 2022). O CSV do TSE é ';'-separado e vem em latin-1.
"""
import csv
import json
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQ_CANDIDATO_PADRAO = '10001622761'


def chave(s):
    return ''.join(c for c in unicodedata.normalize('NFD', (s or '').upper()) if unicodedata.category(c) != 'Mn')


def carregar_municipios():
    dados = json.loads((ROOT / 'assets/acre-localidades.json').read_text(encoding='utf-8'))
    return {chave(m['nome']): str(m['id']) for m in dados}


def carregar_locais_votacao():
    """Lê js/locais-votacao.js (window.LOCAIS_VOTACAO = {...};) sem depender de node."""
    texto = (ROOT / 'js/locais-votacao.js').read_text(encoding='utf-8')
    marcador = 'window.LOCAIS_VOTACAO ='
    inicio = texto.index(marcador) + len(marcador)
    fim = texto.rindex(';')
    return json.loads(texto[inicio:fim].strip())


def secoes_oficiais(locais_votacao):
    """(municipio, zona, secao com 3 dígitos) -> nome do local, para TODA seção
    oficial (principal ou agregada) — usado para achar quem não teve voto."""
    out = {}
    for local in locais_votacao['locais']:
        for s in local['secoes']:
            for numero in [s['numero']] + s['agregadas']:
                out[(local['municipio'], local['zona'], numero)] = local['nome']
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit('Uso: python tools/gerar_votacao_candidato.py <csv> [SQ_CANDIDATO]')
    fonte = Path(sys.argv[1])
    sq_candidato = sys.argv[2] if len(sys.argv) > 2 else SQ_CANDIDATO_PADRAO

    municipios = carregar_municipios()
    locais_votacao = carregar_locais_votacao()
    oficiais = secoes_oficiais(locais_votacao)

    porSecao = []
    candidato_nome, candidato_numero, candidato_cargo, ano = '', '', '', ''
    ignorados_mun = set()

    with fonte.open('r', encoding='latin-1', newline='') as f:
        leitor = csv.DictReader(f, delimiter=';')
        for linha in leitor:
            if linha.get('SQ_CANDIDATO') != sq_candidato:
                continue
            nome_mun = linha['NM_MUNICIPIO']
            municipio = municipios.get(chave(nome_mun))
            if not municipio:
                ignorados_mun.add(nome_mun)
                continue
            zona = str(int(linha['NR_ZONA']))
            secao = linha['NR_SECAO'].strip().zfill(3)
            votos = int(linha['QT_VOTOS'])
            porSecao.append({'municipio': municipio, 'zona': zona, 'secao': secao, 'votos': votos})
            candidato_nome = linha['NM_VOTAVEL']
            candidato_numero = linha['NR_VOTAVEL']
            candidato_cargo = linha['DS_CARGO']
            ano = linha['ANO_ELEICAO']

    if not porSecao:
        sys.exit(f'Nenhuma linha encontrada para SQ_CANDIDATO={sq_candidato}.')

    comVotos = {(r['municipio'], r['zona'], r['secao']) for r in porSecao}

    semVotos = []
    for (municipio, zona, secao), nomeLocal in oficiais.items():
        if (municipio, zona, secao) not in comVotos:
            semVotos.append({'municipio': municipio, 'zona': zona, 'secao': secao, 'local': nomeLocal})
    semVotos.sort(key=lambda r: (r['municipio'], r['zona'], r['secao']))

    porMunicipio = {}
    for r in porSecao:
        porMunicipio[r['municipio']] = porMunicipio.get(r['municipio'], 0) + r['votos']
    porMunicipioLista = [{'municipio': m, 'votos': v} for m, v in sorted(porMunicipio.items(), key=lambda i: -i[1])]

    porSecao.sort(key=lambda r: (r['municipio'], r['zona'], r['secao']))

    pacote = {
        'candidato': candidato_nome,
        'numero': candidato_numero,
        'cargo': candidato_cargo,
        'ano': int(ano) if ano else None,
        'fonte': fonte.name,
        'porMunicipio': porMunicipioLista,
        'porSecao': porSecao,
        'semVotos': semVotos,
    }

    destino = ROOT / 'js/dados-votacao-schafer.js'
    destino.write_text(
        '/* Fonte: ' + fonte.name + '; candidato filtrado por SQ_CANDIDATO=' + sq_candidato +
        '; gerado por tools/gerar_votacao_candidato.py. semVotos cruza com js/locais-votacao.js. */\n'
        'window.DADOS_VOTACAO_SCHAFER = ' + json.dumps(pacote, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8'
    )

    print(f'{candidato_nome} ({candidato_cargo}, {ano}): {len(porSecao)} seções com voto, '
          f'{sum(porMunicipio.values())} votos totais, {len(semVotos)} seções sem voto para o candidato.')
    if ignorados_mun:
        print('Municípios não reconhecidos (fora do AC ou nome não bateu, ignorados): ' + ', '.join(sorted(ignorados_mun)))


if __name__ == '__main__':
    main()
