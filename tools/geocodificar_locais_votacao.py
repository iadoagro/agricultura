"""Geocodifica os locais de votação de um município via Nominatim (OpenStreetMap):
lê o endereço já existente em js/locais-votacao.js e grava latitude/longitude em
js/locais-votacao-coordenadas.js, pra desenhar um mapa de ruas de verdade em vez
da grade esquemática (seção eleitoral não tem polígono oficial do TSE, mas o
local de votação tem um endereço, e esse sim dá pra botar num mapa real).

Respeita o limite de uso do Nominatim (1 requisição por segundo, User-Agent
identificado — https://operations.osmfoundation.org/policies/nominatim/).
Grava a cada local geocodificado, então pode interromper e rodar de novo sem
perder o que já foi feito: só busca quem ainda não está no arquivo de saída.

Uso:
  python tools/geocodificar_locais_votacao.py [CD_MUNICIPIO_IBGE]
Padrão: 1200401 (Rio Branco). Passe outro código (ver assets/acre-localidades.json)
pra estender a outros municípios depois.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOMINATIM = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'SEAGRI-Acre-Fiscais/1.0 (uso interno; geocodificacao de locais de votacao publicos)'
SAIDA = ROOT / 'js/locais-votacao-coordenadas.js'


def carregar_locais():
    texto = (ROOT / 'js/locais-votacao.js').read_text(encoding='utf-8')
    marcador = 'window.LOCAIS_VOTACAO ='
    inicio = texto.index(marcador) + len(marcador)
    fim = texto.rindex(';')
    return json.loads(texto[inicio:fim].strip())['locais']


def carregar_municipios():
    dados = json.loads((ROOT / 'assets/acre-localidades.json').read_text(encoding='utf-8'))
    return {str(m['id']): m['nome'] for m in dados}


def carregar_existentes():
    if not SAIDA.exists():
        return {}
    texto = SAIDA.read_text(encoding='utf-8')
    marcador = 'window.LOCAIS_COORDENADAS ='
    if marcador not in texto:
        return {}
    inicio = texto.index(marcador) + len(marcador)
    fim = texto.rindex(';')
    return json.loads(texto[inicio:fim].strip())


def bairro_de(display_name, nome_mun):
    """O 1º pedaço do display_name é o POI/via, o(s) último(s) são
    município/estado/região/CEP/país — o que sobra no meio costuma ser o
    bairro. Heurística, não garantida; melhor que nada quando bate."""
    partes = [p.strip() for p in display_name.split(',')]
    descartar_fim = {nome_mun.title(), 'Acre', 'Região Norte', 'Brasil'}
    meio = partes[1:]
    while meio and (meio[-1] in descartar_fim or meio[-1].replace('-', '').isdigit()):
        meio.pop()
    return meio[-1] if meio else None


def geocodificar(query):
    url = NOMINATIM + '?' + urllib.parse.urlencode({'format': 'json', 'limit': 1, 'q': query, 'countrycodes': 'br'})
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        dados = json.loads(resp.read().decode('utf-8'))
    return dados[0] if dados else None


def gravar(existentes):
    SAIDA.write_text(
        '/* Coordenadas geocodificadas via Nominatim/OpenStreetMap a partir do\n'
        '   endereço de js/locais-votacao.js — gerado por\n'
        '   tools/geocodificar_locais_votacao.py. Cobre só os municípios já\n'
        '   rodados; ausência aqui = sem coordenada conhecida (cai pra grade\n'
        '   esquemática em vez do mapa de ruas). */\n'
        'window.LOCAIS_COORDENADAS = ' + json.dumps(existentes, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8'
    )


def main():
    municipio = sys.argv[1] if len(sys.argv) > 1 else '1200401'
    municipios = carregar_municipios()
    nome_mun = municipios.get(municipio, municipio)
    locais = [l for l in carregar_locais() if l['municipio'] == municipio]
    existentes = carregar_existentes()
    pendentes = [l for l in locais if l['id'] not in existentes]

    print(f'{nome_mun} ({municipio}): {len(locais)} locais, {len(pendentes)} ainda sem coordenada.')
    if not pendentes:
        print('Nada a fazer.')
        return

    ok = falhas = 0
    for i, l in enumerate(pendentes):
        query = l['endereco'] + ', ' + nome_mun + ', Acre, Brasil'
        resultado = None
        try:
            resultado = geocodificar(query)
        except urllib.error.URLError as e:
            print(f'  [{i + 1}/{len(pendentes)}] ERRO de rede em "{l["nome"]}": {e}')
        except Exception as e:
            print(f'  [{i + 1}/{len(pendentes)}] ERRO em "{l["nome"]}": {e}')

        if resultado:
            existentes[l['id']] = {
                'lat': float(resultado['lat']),
                'lon': float(resultado['lon']),
                'bairro': bairro_de(resultado.get('display_name', ''), nome_mun),
            }
            gravar(existentes)
            ok += 1
            print(f'  [{i + 1}/{len(pendentes)}] OK — {l["nome"]}')
        else:
            falhas += 1
            print(f'  [{i + 1}/{len(pendentes)}] sem resultado — {l["nome"]} · {query}')

        if i < len(pendentes) - 1:
            time.sleep(1.1)

    print(f'Concluído: {ok} geocodificados, {falhas} sem resultado (ficam de fora do mapa de ruas).')


if __name__ == '__main__':
    main()
