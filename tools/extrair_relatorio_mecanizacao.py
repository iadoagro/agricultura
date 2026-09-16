"""Le a Ficha de Vistoria (Programa de Recuperacao de Areas Degradadas -
Mecanizacao) em PDF e tenta identificar os campos do formulario, para
pre-preencher a aba "Lancamento" do painel de mecanizacao.

Chamado por lancar_mecanizacao.php (acao "extrair"):
    python tools/extrair_relatorio_mecanizacao.py caminho/do/arquivo.pdf
Escreve um JSON em stdout: {"ok": true, "texto": "...", "campos": {...}}
ou {"ok": false, "erro": "..."} em caso de falha.

LIMITACOES IMPORTANTES (por isso cada campo tem "confianca"):
  - Os PDFs enviados como exemplo sao fichas fotografadas/escaneadas com uma
    camada de texto gerada por OCR (nao é texto "de verdade" digitado no
    arquivo). Nomes e outras palavras escritas a mao saem com erros de OCR
    com frequencia; numeros (CPF, datas, coordenadas) costumam sair melhor.
  - Campos de marcar com X (Estado Civil, Sexo, Indigena, Possui DAP, tipo de
    trator Agricola/Nao agricola, Tipo de Implemento) NAO da para preencher
    sozinho: a extracao de texto nao enxerga qual quadradinho foi marcado,
    só a lista impressa das opções. Ficam sempre em branco para o usuário
    escolher.
  - A tabela de culturas (linha por linha) tambem fica de fora: a ordem do
    texto extraido nao preserva a posicao visual das celulas da tabela, entao
    nao da pra saber com confianca qual area (hectare) foi escrita ao lado de
    qual cultura. O usuario adiciona as culturas manualmente.
"""
import sys
import json
import re
import unicodedata
import difflib

MUNICIPIOS_ACRE = [
    'Acrelândia', 'Assis Brasil', 'Brasiléia', 'Bujari', 'Capixaba',
    'Cruzeiro do Sul', 'Epitaciolândia', 'Feijó', 'Jordão', 'Mâncio Lima',
    'Manoel Urbano', 'Marechal Thaumaturgo', 'Plácido de Castro',
    'Porto Acre', 'Porto Walter', 'Rio Branco', 'Rodrigues Alves',
    'Santa Rosa do Purus', 'Sena Madureira', 'Senador Guiomard',
    'Tarauacá', 'Xapuri',
]

# Confusões comuns de OCR entre letras cirílicas/latinas parecidas
# (observadas nos exemplos reais: "Coyeхова" no lugar de "Capixaba" etc.)
HOMOGLIFOS = str.maketrans({
    'а': 'a', 'А': 'A', 'е': 'e', 'Е': 'E', 'о': 'o', 'О': 'O',
    'р': 'p', 'Р': 'P', 'с': 'c', 'С': 'C', 'х': 'x', 'Х': 'X',
    'у': 'y', 'У': 'Y', 'к': 'k', 'К': 'K', 'м': 'm', 'М': 'M',
    'н': 'H', 'В': 'B', 'в': 'B', 'Т': 'T',
})


def sem_acento(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def limpar(s):
    if not s:
        return ''
    s = s.translate(HOMOGLIFOS)
    s = re.sub(r'\s+', ' ', s).strip(' :;._-')
    return s


def campo(valor, confianca, origem=''):
    return {'valor': valor, 'confianca': confianca, 'origem': origem}


def extrair_apos_label(texto, labels, ate=None, max_len=80):
    """Pega o trecho logo depois de um rótulo impresso (com variações de
    acento/maiúscula/espaço), até o próximo rótulo conhecido ou até max_len
    caracteres. Muitos exemplares reais colam o valor no rótulo sem espaço
    ("Escritório Local:tapixaba"), por isso não exige separador."""
    corpo = texto
    for label in labels:
        pad = r'[\s:._-]*'
        m = re.search(re.escape(label).replace(r'\ ', r'\s+') + pad, corpo, re.IGNORECASE)
        if not m:
            continue
        resto = corpo[m.end():m.end() + max_len]
        if ate:
            corte = re.search(ate, resto, re.IGNORECASE)
            if corte:
                resto = resto[:corte.start()]
        resto = resto.split('\n')[0]
        valor = limpar(resto)
        if valor:
            return valor
    return ''


def melhor_municipio(bruto):
    if not bruto:
        return None
    alvo = sem_acento(bruto).lower()
    candidatos = {sem_acento(m).lower(): m for m in MUNICIPIOS_ACRE}
    achado = difflib.get_close_matches(alvo, candidatos.keys(), n=1, cutoff=0.6)
    if achado:
        return candidatos[achado[0]]
    for chave, nome in candidatos.items():
        if chave in alvo or alvo in chave:
            return nome
    return None


def reconstruir_data(bruto, min_ano=2015, max_ano=2035):
    """As datas do formulário chegam bem espalhadas pelo OCR
    ("10 112 12025", "112120ZS", "70112 1Z025"): junta os dígitos e tenta
    montar dd/mm/aaaa. Sempre confiança baixa — é a reconstrução mais
    frágil de todas."""
    if not bruto:
        return None
    digitos = re.sub(r'[^0-9]', '', bruto.upper().replace('Z', '2').replace('S', '5'))
    if len(digitos) < 8:
        return None
    digitos = digitos[:8]
    dia, mes, ano = digitos[0:2], digitos[2:4], digitos[4:8]
    try:
        d, m, a = int(dia), int(mes), int(ano)
    except ValueError:
        return None
    if not (1 <= d <= 31 and 1 <= m <= 12 and min_ano <= a <= max_ano):
        return None
    return '%04d-%02d-%02d' % (a, m, d)


def extrair_cpf(texto):
    m = re.search(r'CPF\s*:?\s*([0-9][0-9.\-\s]{9,16}[0-9])', texto, re.IGNORECASE)
    if not m:
        return None
    digitos = re.sub(r'\D', '', m.group(1))
    if len(digitos) != 11:
        return None
    return digitos[0:3] + '.' + digitos[3:6] + '.' + digitos[6:9] + '-' + digitos[9:11]


def extrair_telefone(texto):
    m = re.search(r'Telefone\s*:?\s*\(?\s*(\d{2,3})\s*\)?\s*[-.\s]*(\d{4,5})[-.\s]*(\d{4})', texto, re.IGNORECASE)
    if not m:
        return None
    return '(%s) %s-%s' % (m.group(1)[-2:], m.group(2), m.group(3))


def extrair_valor_dae(texto):
    m = re.search(r'Valor\s+da\s+DAE\s*R\$\s*:?\s*([0-9][0-9.,]*)', texto, re.IGNORECASE)
    if not m:
        return None
    bruto = m.group(1).strip()
    if ',' in bruto:
        bruto = bruto.replace('.', '').replace(',', '.')
    try:
        return round(float(bruto), 2)
    except ValueError:
        return None


def extrair_pontos_geo(texto):
    """Os três pontos (01/02/03) quase sempre saem em branco no papel — só o
    primeiro tem coordenada de verdade. E o OCR frequentemente lê a tabela
    fora de ordem (todos os rótulos "X:" antes de todos os "Y:"), então tentar
    casar cada ponto com sua própria janela de texto duplica valores. Mais
    seguro: pega só o primeiro X, primeiro Y e primeira Zona com dígito
    dentro da seção de georreferenciamento, como palpite único."""
    m = re.search(r'Georreferenciamento(.{0,600})', texto, re.IGNORECASE | re.DOTALL)
    trecho = m.group(1) if m else texto

    def primeiro(padrao):
        for m2 in re.finditer(padrao, trecho, re.IGNORECASE):
            if m2.group(1):
                return m2.group(1)
        return ''

    x = primeiro(r'X\s*:?\s*([0-9]{4,9})')
    y = primeiro(r'Y\s*:?\s*([0-9]{4,9})')
    zona = primeiro(r'Zona\s*:?\s*\(?\s*\)?\s*(18|19)')
    if not x and not y:
        return []
    return [{'ponto': 1, 'x': x, 'y': y, 'zona': zona}]


def detectar_tipo_servico(texto):
    baixo = sem_acento(texto).lower()
    pontos_mec = baixo.count('cultivo') + baixo.count('area mecanizada') + baixo.count('area cultivada')
    pontos_acu = baixo.count('acude') + baixo.count('tanque') + baixo.count('reforma de acude')
    if pontos_mec == 0 and pontos_acu == 0:
        return None
    return 'Açudagem' if pontos_acu > pontos_mec else 'Mecanização'


PROXIMO_LABEL = (
    r'(?:Nome|CPF|Data\s+d[ea]|Estado\s+Civil|Sexo|Ind[ií]gena|Etnia|Possui\s+DAP|'
    r'Telefone|Endere[cç]o|Munic[ií]pio|Escrit[oó]rio|Assinatura|3\.\d|2\.\d|1\.\d|$)'
)


def montar_campos(texto):
    campos = {}

    campos['escritorio_local'] = campo(
        extrair_apos_label(texto, ['Escritório Local', 'Escritorio Local'], ate=r'Data\s+da\s+Vistoria'),
        'baixa', 'rótulo impresso')

    data_vistoria_bruta = extrair_apos_label(texto, ['Data da Vistoria', 'Data da Vlstoria'], ate=r'[A-Za-zÀ-ú]{4}')
    campos['data_vistoria'] = campo(reconstruir_data(data_vistoria_bruta), 'baixa', 'dígitos após "Data da Vistoria"')

    campos['responsavel_tecnico'] = campo(
        extrair_apos_label(texto, [
            'Nome do Responsável Técnico', 'Nome do Responsavel Tecnico',
            'Nome do Responsávél Tecnico',
        ], ate=PROXIMO_LABEL),
        'baixa', 'rótulo impresso')

    campos['nome_beneficiario'] = campo(
        extrair_apos_label(texto, ['Nome do Beneficiário', 'Nome do Beneficiario'], ate=PROXIMO_LABEL),
        'baixa', 'rótulo impresso; escrita à mão')

    campos['cpf'] = campo(extrair_cpf(texto), 'média', 'dígitos após "CPF"')

    nasc_bruta = extrair_apos_label(texto, ['Data de Nascimento'], ate=r'Estado\s+Civil|Sexo|[A-Za-zÀ-ú]{5}')
    campos['data_nascimento'] = campo(reconstruir_data(nasc_bruta), 'baixa', 'dígitos após "Data de Nascimento"')

    campos['telefone'] = campo(extrair_telefone(texto), 'média', 'dígitos após "Telefone"')

    campos['associacao_cooperativa'] = campo(
        extrair_apos_label(texto, ['Nome da Associação/Cooperativa', 'Nome da Associacao/Cooperativa'], ate=PROXIMO_LABEL),
        'baixa', 'rótulo impresso')

    campos['endereco'] = campo(
        extrair_apos_label(texto, [
            'Endereço (Projeto de Assentamento/Comunidade, BR/Ramal, Km, nº do lote)',
            'Endereco (Projeto de Assentamento/Comunidade, BR/Ramal, Km, n do lote)',
            'Endereço', 'Endereco',
        ], ate=r'Nome\s+da\s+Propriedade', max_len=120),
        'baixa', 'rótulo impresso')

    campos['nome_propriedade'] = campo(
        extrair_apos_label(texto, ['Nome da Propriedade'], ate=PROXIMO_LABEL),
        'baixa', 'rótulo impresso')

    municipio_bruto = extrair_apos_label(texto, ['Município', 'Municipio'], ate=PROXIMO_LABEL)
    municipio_ajustado = melhor_municipio(municipio_bruto)
    campos['municipio'] = campo(
        municipio_ajustado or (municipio_bruto or None),
        'média' if municipio_ajustado else 'baixa',
        'comparado com a lista dos 22 municípios do Acre' if municipio_ajustado else 'rótulo impresso, sem correspondência clara')

    campos['num_identificacao_patrimonio'] = campo(
        extrair_apos_label(texto, ['N° de Identificação/N° Patrimônio', 'N de Identificacao/N Patrimonio',
                                    'Identificação/N° Patrimônio', 'Patrimônio', 'Patrimonio'], ate=PROXIMO_LABEL),
        'baixa', 'rótulo impresso')

    num_dae_bruto = extrair_apos_label(texto, ['N° da DAE', 'N da DAE'], ate=r'Assinatura|Valor')
    # Quando o campo fica em branco no papel, o OCR às vezes gruda o texto da
    # assinatura logo abaixo — sem nenhum dígito, isso quase nunca é o número
    # da DAE de verdade, então descarta em vez de sugerir algo enganoso.
    campos['num_dae'] = campo(
        num_dae_bruto if re.search(r'\d', num_dae_bruto or '') else None,
        'baixa', 'rótulo impresso')

    campos['valor_dae'] = campo(extrair_valor_dae(texto), 'média', 'dígitos após "Valor da DAE"')

    campos['pontos_geo'] = campo(extrair_pontos_geo(texto), 'média', 'dígitos após "X:"/"Y:"/"Zona:"')

    campos['tipo_servico'] = campo(detectar_tipo_servico(texto), 'média',
                                    'presença das palavras "cultivo" (mecanização) ou "açude/tanque" (açudagem)')

    # Campos que o texto não permite identificar com segurança: ficam None
    # de propósito, para o formulário pedir escolha manual (ver docstring).
    for chave in ('estado_civil', 'sexo', 'indigena', 'etnia', 'possui_dap',
                  'tipo_uso', 'tipo_trator', 'maquinas', 'implementos',
                  'culturas', 'area_total_ha', 'horas_maquina', 'quantidade_acudes',
                  'poligono'):
        campos[chave] = campo(None, 'nenhuma', 'não é possível identificar a partir do texto do PDF')

    return campos


def main():
    # O Windows abre o stdout do processo filho na codepage do console
    # (cp1252 em pt-BR), que não representa vários caracteres acentuados do
    # formulário — força UTF-8 para o PHP sempre receber o JSON completo.
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    if len(sys.argv) < 2:
        print(json.dumps({'ok': False, 'erro': 'Informe o caminho do PDF.'}))
        return 1
    caminho = sys.argv[1]
    try:
        from pypdf import PdfReader
    except ImportError:
        print(json.dumps({'ok': False, 'erro': 'Pacote "pypdf" não instalado no servidor (pip install pypdf).'}))
        return 1
    try:
        leitor = PdfReader(caminho)
        texto = '\n'.join((pagina.extract_text() or '') for pagina in leitor.pages)
    except Exception as e:
        print(json.dumps({'ok': False, 'erro': 'Não foi possível ler o PDF: ' + str(e)}))
        return 1
    if not texto.strip():
        print(json.dumps({'ok': False, 'erro': 'O PDF não tem texto reconhecível (parece ser só imagem, sem OCR).'}))
        return 1
    campos = montar_campos(texto)
    print(json.dumps({'ok': True, 'texto': texto, 'campos': campos}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
