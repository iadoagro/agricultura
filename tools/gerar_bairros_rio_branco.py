"""Baixa os polígonos de bairros de Rio Branco (fonte oficial: SEFIN — Núcleo
de Geotecnologia, https://rbgeo.riobranco.ac.gov.br, camada
"bairros_regionais_2025_final") e cruza com os locais de votação já
geocodificados por tools/geocodificar_locais_votacao.py pra descobrir em que
bairro cada local fica (teste ponto-dentro-de-polígono, sem depender de
nenhuma biblioteca externa). Gera/atualiza:

  - assets/rio-branco-bairros.geojson — os 94 polígonos, já simplificados no
    próprio servidor (maxAllowableOffset) pra não pesar no navegador.
  - js/locais-votacao-coordenadas.js — mesmo arquivo do script de
    geocodificação, só que com o campo "bairro" recalculado por polígono de
    verdade em vez da estimativa por nome que o Nominatim devolve.

Rode depois de tools/geocodificar_locais_votacao.py. Idempotente: pode rodar
de novo a qualquer momento pra atualizar os bairros sem perder coordenada.

Gera js/mapa-rio-branco-bairros.js (não .geojson solto em assets/) pro mesmo
padrão de js/mapa-acre.js: os dados já vêm dentro do JS, sem precisar de
fetch() — funciona até abrindo a página como arquivo local.

Uso: python tools/gerar_bairros_rio_branco.py
"""
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEATURESERVER = ('https://rbgeo.riobranco.ac.gov.br/server/rest/services/Hosted/'
                  'bairros_regionais_2025_final/FeatureServer/0/query')
DESTINO_JS = ROOT / 'js/mapa-rio-branco-bairros.js'
DESTINO_COORDENADAS = ROOT / 'js/locais-votacao-coordenadas.js'
USER_AGENT = 'SEAGRI-Acre-Fiscais/1.0 (uso interno; camada publica de bairros)'


def baixar_bairros():
    params = {
        'where': '1=1', 'outFields': 'bairro,cod_bairro,regional_2',
        'returnGeometry': 'true', 'outSR': '4326',
        'maxAllowableOffset': '0.0003', 'geometryPrecision': '5', 'f': 'geojson',
    }
    url = FEATURESERVER + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def ponto_no_anel(x, y, anel):
    """Ray casting par-ímpar — funciona com anéis não convexos (formato real
    de bairro)."""
    dentro = False
    n = len(anel)
    j = n - 1
    for i in range(n):
        xi, yi = anel[i]
        xj, yj = anel[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


def ponto_no_poligono(lon, lat, geometria):
    """GeoJSON Polygon: [anel_externo, buraco1, ...]. MultiPolygon: lista de
    polígonos assim. Buraco (índice > 0 do anel) subtrai."""
    tipo = geometria['type']
    poligonos = geometria['coordinates'] if tipo == 'MultiPolygon' else [geometria['coordinates']]
    for aneis in poligonos:
        if not aneis:
            continue
        dentro = ponto_no_anel(lon, lat, aneis[0])
        for buraco in aneis[1:]:
            if ponto_no_anel(lon, lat, buraco):
                dentro = False
        if dentro:
            return True
    return False


def carregar_coordenadas():
    texto = DESTINO_COORDENADAS.read_text(encoding='utf-8')
    marcador = 'window.LOCAIS_COORDENADAS ='
    inicio = texto.index(marcador) + len(marcador)
    fim = texto.rindex(';')
    return json.loads(texto[inicio:fim].strip())


def gravar_coordenadas(dados):
    DESTINO_COORDENADAS.write_text(
        '/* Coordenadas geocodificadas via Nominatim/OpenStreetMap a partir do\n'
        '   endereço de js/locais-votacao.js — gerado por\n'
        '   tools/geocodificar_locais_votacao.py, com o bairro calculado por\n'
        '   tools/gerar_bairros_rio_branco.py cruzando com\n'
        '   assets/rio-branco-bairros.geojson (polígono oficial da SEFIN).\n'
        '   Cobre só os municípios já rodados; ausência aqui = sem coordenada\n'
        '   conhecida (cai pra grade esquemática em vez do mapa de ruas). */\n'
        'window.LOCAIS_COORDENADAS = ' + json.dumps(dados, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8'
    )


def main():
    print('Baixando polígonos de bairros de Rio Branco (rbgeo.riobranco.ac.gov.br)...')
    geo = baixar_bairros()
    DESTINO_JS.write_text(
        '/* Polígonos dos 94 bairros de Rio Branco — fonte: SEFIN/Núcleo de\n'
        '   Geotecnologia (rbgeo.riobranco.ac.gov.br), camada\n'
        '   "bairros_regionais_2025_final", pública. Gerado por\n'
        '   tools/gerar_bairros_rio_branco.py; geometria já simplificada no\n'
        '   próprio servidor (maxAllowableOffset) pra não pesar no navegador. */\n'
        'window.MAPA_BAIRROS_RIO_BRANCO = ' + json.dumps(geo, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8'
    )
    print(f'{len(geo["features"])} bairros salvos em js/mapa-rio-branco-bairros.js '
          f'({DESTINO_JS.stat().st_size} bytes).')

    if not DESTINO_COORDENADAS.exists():
        print('js/locais-votacao-coordenadas.js ainda não existe — rode '
              'tools/geocodificar_locais_votacao.py primeiro.')
        return

    coordenadas = carregar_coordenadas()
    sem_bairro = 0
    for local_id, c in coordenadas.items():
        encontrado = None
        for f in geo['features']:
            if ponto_no_poligono(c['lon'], c['lat'], f['geometry']):
                encontrado = f['properties']['bairro']
                break
        if encontrado:
            c['bairro'] = encontrado
        else:
            sem_bairro += 1
    gravar_coordenadas(coordenadas)
    print(f'Bairro calculado para {len(coordenadas) - sem_bairro} de {len(coordenadas)} locais '
          f'({sem_bairro} fora de qualquer polígono).')


if __name__ == '__main__':
    main()
