"""Gera o mapa de bairros de outros municípios do Acre (além de Rio Branco,
que já tem seu próprio pipeline em tools/gerar_bairros_rio_branco.py, com
fonte separada — SEFIN — mais detalhada).

Fonte: IBGE, Malha de Bairros do Censo 2022 (base oficial, cobre só os
municípios onde o IBGE efetivamente delimitou bairro nesse censo — não é
todos: https://www.ibge.gov.br/geociencias/organizacao-do-territorio/
estrutura-territorial/26565-malhas-de-setores-censitarios-divisoes-
intramunicipais.html). Baixa o shapefile do Acre inteiro
(geoftp.ibge.gov.br/.../censo_2022/bairros/shp/UF/AC_bairros_CD2022.zip),
separa por município (campo CD_MUN) e cruza com os locais de votação já
geocodificados (tools/geocodificar_locais_votacao.py) pra descobrir em que
bairro cada local cai — mesmo teste ponto-dentro-de-polígono de
gerar_bairros_rio_branco.py, sem depender de nenhuma biblioteca externa
além do pyshp (só pra ler o shapefile; `pip install pyshp`).

Gera/atualiza:
  - js/mapa-bairros-municipios.js — window.MAPA_BAIRROS_MUNICIPIOS, um
    FeatureCollection por código de município IBGE.
  - js/locais-votacao-coordenadas.js — mesmo arquivo de sempre, com o
    campo "bairro" recalculado (por polígono) pros locais desses
    municípios; não mexe nos de Rio Branco (calculados à parte).

Rode depois de "python tools/geocodificar_locais_votacao.py <codigo>" pra
cada município novo (sem coordenada geocodificada, o local fica sem bairro
aqui, do mesmo jeito que já acontece pra Rio Branco). Idempotente.

Uso: python tools/gerar_bairros_municipios.py
"""
import json
import urllib.request
import zipfile
from pathlib import Path

try:
    import shapefile
except ImportError:
    raise SystemExit('Precisa do pyshp: pip install pyshp')

ROOT = Path(__file__).resolve().parent.parent
IBGE_ZIP_URL = ('https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/'
                'malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/UF/'
                'AC_bairros_CD2022.zip')
CACHE_DIR = ROOT / 'tools' / '.cache'
DESTINO_JS = ROOT / 'js' / 'mapa-bairros-municipios.js'
DESTINO_COORDENADAS = ROOT / 'js' / 'locais-votacao-coordenadas.js'
USER_AGENT = 'SEAGRI-Acre-Fiscais/1.0 (uso interno; camada publica IBGE)'
# Rio Branco fica de fora: tem pipeline e fonte próprios (SEFIN, mais bairros).
MUNICIPIO_RIO_BRANCO = '1200401'


def baixar_shapefile_ibge():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = CACHE_DIR / 'AC_bairros_CD2022.zip'
    if not zip_path.exists():
        print('Baixando malha de bairros do IBGE (Censo 2022, Acre)...')
        req = urllib.request.Request(IBGE_ZIP_URL, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp, open(zip_path, 'wb') as f:
            f.write(resp.read())
    with zipfile.ZipFile(zip_path) as z:
        # O zip do IBGE às vezes traz um .zip de outro estado dentro (bug
        # deles, visto na prática) — extrai só os arquivos do Acre mesmo.
        for nome in z.namelist():
            if nome.startswith('AC_bairros_CD2022.'):
                z.extract(nome, CACHE_DIR)
    return CACHE_DIR / 'AC_bairros_CD2022'


def nomes_bairro_brutos(caminho_dbf):
    """O .dbf tem codificação mista — a maioria dos registros é Latin-1, mas
    alguns (aparentemente digitados num sistema diferente) são UTF-8 de
    verdade — confirmado comparando bytes brutos ("Brasiléia" é Latin-1
    puro; "Lírio dos Vales" tem os 2 bytes UTF-8 de "í"). Nenhum encoding
    único decodifica tudo certo, então lê o campo NM_BAIRRO na unha (DBF é
    formato simples: cabeçalho de 32 bytes + descritores de campo de 32
    bytes cada, terminados em 0x0D) e tenta UTF-8 primeiro, cai pra Latin-1
    só se os bytes não forem UTF-8 válido — por registro, não pro arquivo
    inteiro. Devolve a lista de nomes, na mesma ordem que
    sf.shapeRecords()/sf.records() (mesmo arquivo, sem filtro).
    """
    dados = Path(caminho_dbf).read_bytes()
    tam_cabecalho = int.from_bytes(dados[8:10], 'little')
    tam_registro = int.from_bytes(dados[10:12], 'little')
    num_registros = int.from_bytes(dados[4:8], 'little')
    campos = []
    pos = 32
    offset = 1  # 1º byte de cada registro é a flag de exclusão
    while dados[pos] != 0x0D:
        nome = dados[pos:pos + 11].split(b'\x00', 1)[0].decode('ascii')
        tamanho = dados[pos + 16]
        campos.append((nome, offset, tamanho))
        offset += tamanho
        pos += 32
    off_bairro, tam_bairro = next((o, t) for n, o, t in campos if n == 'NM_BAIRRO')
    nomes = []
    for i in range(num_registros):
        inicio = tam_cabecalho + i * tam_registro
        bruto = dados[inicio + off_bairro: inicio + off_bairro + tam_bairro]
        try:
            nomes.append(bruto.decode('utf-8').strip())
        except UnicodeDecodeError:
            nomes.append(bruto.decode('latin1').strip())
    return nomes


def carregar_bairros_por_municipio():
    caminho = baixar_shapefile_ibge()
    sf = shapefile.Reader(str(caminho), encoding='latin1')
    nomes_corretos = nomes_bairro_brutos(str(caminho) + '.dbf')
    por_municipio = {}
    for i, sr in enumerate(sf.shapeRecords()):
        rec = sr.record.as_dict()
        cod_mun = rec['CD_MUN']
        if cod_mun == MUNICIPIO_RIO_BRANCO:
            continue
        nome_bairro = nomes_corretos[i]
        if not nome_bairro:
            continue
        geom = sr.shape.__geo_interface__
        # arredonda a uns 5 decimais (~1m) — sobra de precisão do shapefile
        # original só pesa o navegador à toa.
        geom = json.loads(json.dumps(geom), parse_float=lambda v: round(float(v), 5))
        feature = {
            'type': 'Feature',
            'geometry': geom,
            'properties': {'bairro': nome_bairro},
        }
        por_municipio.setdefault(cod_mun, []).append(feature)
    return {cod: {'type': 'FeatureCollection', 'features': feats} for cod, feats in por_municipio.items()}


def ponto_no_anel(x, y, anel):
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


def bairro_no_municipio(lon, lat, feicoes):
    for f in feicoes:
        if ponto_no_poligono(lon, lat, f['geometry']):
            return f['properties']['bairro']
    return None


def carregar_locais_por_id():
    texto = (ROOT / 'js/locais-votacao.js').read_text(encoding='utf-8')
    marcador = 'window.LOCAIS_VOTACAO ='
    inicio = texto.index(marcador) + len(marcador)
    fim = texto.rindex(';')
    locais = json.loads(texto[inicio:fim].strip())['locais']
    return {l['id']: l for l in locais}


def carregar_coordenadas():
    if not DESTINO_COORDENADAS.exists():
        return {}
    texto = DESTINO_COORDENADAS.read_text(encoding='utf-8')
    marcador = 'window.LOCAIS_COORDENADAS ='
    if marcador not in texto:
        return {}
    inicio = texto.index(marcador) + len(marcador)
    fim = texto.rindex(';')
    return json.loads(texto[inicio:fim].strip())


def gravar_coordenadas(dados):
    DESTINO_COORDENADAS.write_text(
        '/* Coordenadas geocodificadas via Nominatim/OpenStreetMap a partir do\n'
        '   endereço de js/locais-votacao.js — gerado por\n'
        '   tools/geocodificar_locais_votacao.py. Bairro de Rio Branco calculado\n'
        '   por tools/gerar_bairros_rio_branco.py (polígono SEFIN); bairro dos\n'
        '   demais municípios por tools/gerar_bairros_municipios.py (polígono\n'
        '   IBGE, Censo 2022). Cobre só os municípios já rodados; ausência aqui\n'
        '   = sem coordenada conhecida. */\n'
        'window.LOCAIS_COORDENADAS = ' + json.dumps(dados, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8'
    )


def main():
    print('Lendo malha de bairros do IBGE...')
    bairros_por_municipio = carregar_bairros_por_municipio()
    DESTINO_JS.write_text(
        '/* Polígonos de bairros dos municípios do Acre (exceto Rio Branco, que\n'
        '   tem fonte própria — ver js/mapa-rio-branco-bairros.js) — fonte: IBGE,\n'
        '   Malha de Bairros do Censo Demográfico 2022 (oficial, mas só cobre os\n'
        '   municípios onde o IBGE delimitou bairro nesse censo — não é todos).\n'
        '   Gerado por tools/gerar_bairros_municipios.py. Chave = código do\n'
        '   município (mesmo id de js/mapa-acre.js). */\n'
        'window.MAPA_BAIRROS_MUNICIPIOS = ' + json.dumps(bairros_por_municipio, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8'
    )
    total_bairros = sum(len(fc['features']) for fc in bairros_por_municipio.values())
    print(f'{len(bairros_por_municipio)} municípios, {total_bairros} bairros salvos em '
          f'js/mapa-bairros-municipios.js ({DESTINO_JS.stat().st_size} bytes).')

    locais_por_id = carregar_locais_por_id()
    coordenadas = carregar_coordenadas()
    atualizados = sem_bairro = fora_do_escopo = 0
    for local_id, c in coordenadas.items():
        local = locais_por_id.get(local_id)
        if not local or local['municipio'] == MUNICIPIO_RIO_BRANCO:
            fora_do_escopo += 1
            continue
        colecao = bairros_por_municipio.get(local['municipio'])
        if not colecao:
            continue
        encontrado = bairro_no_municipio(c['lon'], c['lat'], colecao['features'])
        if encontrado:
            c['bairro'] = encontrado
            atualizados += 1
        else:
            sem_bairro += 1
    gravar_coordenadas(coordenadas)
    print(f'Bairro atualizado para {atualizados} locais ({sem_bairro} geocodificados mas fora de '
          f'qualquer polígono; {fora_do_escopo} de Rio Branco ou sem cadastro, ignorados).')


if __name__ == '__main__':
    main()
