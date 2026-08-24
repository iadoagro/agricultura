# -*- coding: utf-8 -*-
"""
Gera js/dados-deagro.js a partir de DEAGRO.xlsx (planilha do Departamento de
Agronegocio da SEAGRI/AC).

Uso (na raiz do projeto):
    python tools/gerar_dados_deagro.py [caminho/para/DEAGRO.xlsx]

A planilha e um caderno por divisao: cada aba tem cabecalho proprio e as
colunas mudam de significado de uma para outra. Este script normaliza cada aba
num "conjunto" com chaves curtas e estaveis, que o painel (js/deagro.js) agrega
sem precisar conhecer o layout original.

Dados pessoais sensiveis (documento de identificacao, telefone, e-mail)
NAO sao exportados: o numero de CPF e removido ate de campos de texto
livre — a mesma regra de tools/gerar_dados_mecanizacao.py. Nome do produtor e mantido, como no painel da
mecanizacao, porque e o que identifica o atendimento.
"""
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "DEAGRO.xlsx")
SAIDA = os.path.join(RAIZ, "js", "dados-deagro.js")


# ----------------------------------------------------------------- utilidades
def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


# Duas formas de CPF aparecem na planilha, e so essas duas sao removidas:
# com rotulo ("CPF: NNN.NNN.NNN-NN" ou "cpf NNNNNNNNNNN") e a formatada por
# inteiro ("NNN.NNN.NNN-NN"). Uma sequencia solta de 11 digitos NAO e tocada:
# codigos CAR e coordenadas tambem tem digitos em sequencia.
RE_CPF = re.compile(
    r"\s*[(\[]?\s*[-–]?\s*(?:"
    r"C\.?\s?P\.?\s?F\.?\s*n?[º°.:№]*\s*\d{3}\.?\d{3}\.?\d{3}\s?-?\s?\d{2}"
    r"|\d{3}\.\d{3}\.\d{3}-\d{2}"
    r")\s*[)\]]?",
    re.IGNORECASE)


def sem_cpf(s):
    """Remove qualquer CPF (com ou sem o rotulo) de um texto livre.

    A planilha traz CPF no meio de campos descritivos como o cessionario dos
    silos; nada disso pode chegar ao arquivo publicado. Textos sem CPF voltam
    intactos — a limpeza nao pode mexer em CAR, CNPJ nem coordenada."""
    if not RE_CPF.search(s):
        return s
    limpo = re.sub(r"\s{2,}", " ", RE_CPF.sub(" ", s))
    return limpo.strip().strip(" -–,;").strip()


def limpar_cpf(o):
    """Passada final: varre o pacote inteiro antes de gravar."""
    if isinstance(o, str):
        return sem_cpf(o)
    if isinstance(o, list):
        return [limpar_cpf(i) for i in o]
    if isinstance(o, dict):
        return {k: limpar_cpf(v) for k, v in o.items()}
    return o


def texto(v):
    """Valor de celula -> string limpa. '-', 'n/a' e afins viram vazio."""
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r"\s+", " ", str(v)).strip()
    if sem_acento(s).lower().strip(" .") in ("", "-", "--", "n/a", "na",
                                             "nao informado", "nao informada",
                                             "sem informacao"):
        return ""
    return sem_cpf(s)


def numero(v):
    """Numero a partir de celula ou texto pt-BR ('3.214.030,41' -> 3214030.41).

    O ponto e ambiguo: em '2.610' separa milhar, em '13.33' separa decimal.
    A regra usada e a da planilha — ponto seguido de exatamente tres digitos
    (e sem virgula na string) e milhar."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = str(v).strip()
    m = re.search(r"\d[\d.,]*", s)
    if not m:
        return None
    s = m.group(0).rstrip(".,")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.search(r"\.\d{3}$", s) or re.search(r"\.\d{3}\.", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def sacas(v, kg_padrao=None):
    """'25 Sacas de 40 kg' -> 1000.0 (kg). Numero solto usa kg_padrao."""
    s = str(v or "")
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*sac[ao]s?\s*de\s*(\d+(?:[.,]\d+)?)\s*kg",
                  sem_acento(s), re.I)
    if m:
        return numero(m.group(1)) * numero(m.group(2))
    n = numero(v)
    if n is None:
        return None
    return n * kg_padrao if kg_padrao else n


# --------------------------------------------------------------- municipios --
# Os 22 municipios do Acre. A planilha grafa o mesmo municipio de varias formas
# ("Brasileia", "Brasileía", "Senador Guiormard"): a comparacao e feita sem
# acento e em minusculas, e o rotulo exportado e sempre o oficial.
MUNICIPIOS = [
    "Acrelândia", "Assis Brasil", "Brasiléia", "Bujari", "Capixaba",
    "Cruzeiro do Sul", "Epitaciolândia", "Feijó", "Jordão", "Mâncio Lima",
    "Manoel Urbano", "Marechal Thaumaturgo", "Plácido de Castro", "Porto Acre",
    "Porto Walter", "Rio Branco", "Rodrigues Alves", "Santa Rosa do Purus",
    "Sena Madureira", "Senador Guiomard", "Tarauacá", "Xapuri",
]
CHAVE_MUN = {sem_acento(m).lower(): m for m in MUNICIPIOS}
# apelidos que a comparacao sem acento nao resolve
CHAVE_MUN.update({
    "senador guiormard": "Senador Guiomard",
    "sen. guiomard": "Senador Guiomard",
    "manuel urbano": "Manoel Urbano",
    "transacreana": "Rio Branco",     # AC-90, zona rural de Rio Branco
    "humaita": "Porto Acre",          # distrito de Porto Acre
    "vila campinas": "Plácido de Castro",
})

FORA = "Fora do Acre"
# a usina de nitrogenio atende produtores de fora do estado; sao poucos e o
# municipio de origem nao interessa ao painel, entao viram um rotulo so
FORA_DO_ACRE = ("boca do acre", "porto velho", "rondonia", "ariquemes",
                "amazonas", "labrea", "manaus", "guajara")


def municipio(v):
    s = texto(v)
    if not s:
        return ""
    k = sem_acento(s).lower().strip(" .")
    if k in CHAVE_MUN:
        return CHAVE_MUN[k]
    # "Boca do Acre - AM", "Ariquemes - RO": outra unidade da federacao
    if re.search(r"[-/]\s*[A-Za-z]{2}\s*$", s) and not k.endswith("ac"):
        return FORA
    k = re.sub(r"\s*[-/]\s*ac$", "", k).strip()
    if k in CHAVE_MUN:
        return CHAVE_MUN[k]
    if any(k.startswith(f) for f in FORA_DO_ACRE):
        return FORA
    AVISOS.append("municipio fora da lista: " + s)
    return s


def sexo(v):
    s = sem_acento(texto(v)).lower()
    if s.startswith("f"):
        return "Feminino"
    if s.startswith("m"):
        return "Masculino"
    return ""


def data_iso(v):
    """Celula de data -> 'AAAA-MM-DD'. Texto tipo '17-23/07/2023' usa a ultima
    data reconhecivel; e o formato que a planilha usa para viagens de campo."""
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    s = texto(v)
    if not s:
        return ""
    achados = re.findall(r"(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})", s)
    if achados:
        d, m, a = achados[-1]
        a = int(a)
        if a < 100:
            a += 2000
        try:
            return date(a, int(m), int(d)).strftime("%Y-%m-%d")
        except ValueError:
            return ""
    m = re.search(r"(19|20)\d{2}", s)
    return m.group(0) + "-01-01" if m else ""


ANO_MAX = datetime.now().year + 1


def ano_de(v):
    """Ano como string. Aceita data, texto com data ou o proprio ano.

    Ano fora da faixa plausivel e erro de digitacao na planilha (ha um '3023'):
    volta vazio para nao criar uma opcao de filtro que nao existe."""
    iso = data_iso(v)
    a = iso[:4] if iso else ""
    if not a:
        n = numero(v)
        a = str(int(n)) if n and n == int(n) else ""
    if a and 1990 <= int(a) <= ANO_MAX:
        return a
    if a:
        AVISOS.append("ano implausivel descartado: " + a)
    return ""


# ------------------------------------------------------------------- leitura
wb = openpyxl.load_workbook(XLSX, data_only=True)
AVISOS = []


def aba(nome):
    """Aba pelo nome, tolerando diferenca de acento/caixa/corte do Excel.

    O nome exato ganha sempre: o Excel corta o titulo em 31 caracteres, entao
    "Atividade Tecnica" e prefixo de "Atividade Tecnica DIAP 2023" e a busca
    por prefixo sozinha devolveria a aba errada."""
    alvo = sem_acento(nome).lower()
    abas = [(sem_acento(ws.title).lower(), ws) for ws in wb.worksheets]
    for t, ws in abas:
        if t == alvo:
            return ws
    for t, ws in abas:
        if t.startswith(alvo[:31]) or alvo.startswith(t):
            return ws
    AVISOS.append("aba nao encontrada: " + nome)
    return None


def linhas(nome, pular=1):
    """Linhas de dados (sem cabecalho), ja como listas com 40 posicoes."""
    ws = aba(nome)
    if not ws:
        return []
    out = []
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i < pular:
            continue
        if not any(c not in (None, "") for c in r):
            continue
        out.append(list(r) + [None] * 40)
    return out


def limpar(d):
    """Remove chaves vazias — o arquivo gerado fica ~40% menor."""
    return {k: v for k, v in d.items() if v not in (None, "", [], 0.0) or v == 0}


CONJ = {}


def conjunto(cid, nome, div, sub, itens, medidas=None, nota=""):
    itens = [i for i in itens if any(v not in (None, "") for v in i.values())]
    # linha sem produtor num conjunto de produtores e sobra de formatacao da
    # planilha (a ultima linha do café repete as sacas sem nome nenhum)
    if any(i.get("nome") for i in itens):
        itens = [i for i in itens if i.get("nome")]
    CONJ[cid] = {
        "nome": nome, "div": div, "sub": sub, "n": len(itens),
        "medidas": medidas or [], "nota": nota, "linhas": itens,
    }


# ============================================================ 1. AGRICULTURA
# Silos e armazens — o layout muda com o tipo: nas unidades publicas a coluna E
# traz a taxa de secagem e a capacidade estatica vem em F ("2.610 (2 silos
# metalicos)"); nas privadas e da Cageacre a capacidade ja esta em E.
silos = []
for r in linhas("Silos e Armazens"):
    tipo = texto(r[9]) or "Não informado"
    publico = tipo.lower().startswith("públic") or tipo.lower().startswith("public")
    invest = texto(r[7])
    silos.append(limpar({
        "mun": municipio(r[0]), "ender": texto(r[1]), "cess": texto(r[2]),
        "termo": texto(r[3]) if publico else "",
        "secagem": texto(r[4]) if publico else texto(r[3]),
        "cap": numero(r[5] if publico else r[4]),
        "pulmao": numero(r[6] if publico else r[5]),
        "invest": sum(numero(x) or 0 for x in re.findall(r"[\d.,]+", invest)) or None,
        "geo": texto(r[8]).replace("\n", " "), "tipo": tipo,
    }))
conjunto("silos", "Silos e armazéns", "agricultura", "Armazenagem", silos,
         [{"campo": "cap", "rot": "Capacidade estática", "un": "t", "dec": 0},
          {"campo": "invest", "rot": "Investimento", "un": "R$", "dec": 0}],
         "Capacidade estática em toneladas. O investimento soma construção e "
         "ampliação e só existe nas unidades públicas.")

# Cafeicultura — tres formatos de registro na mesma aba: quantidade direta
# (t/kg), contagem de sacas em colunas separadas e sacas escritas por extenso.
cafe = []
for r in linhas("Cafeicultura DEAGRO"):
    calc_kg = sacas(r[10], 40) or sacas(r[5], 1000)
    npk_kg = sacas(r[11], 25) or sacas(r[6], 1)
    fte_kg = sacas(r[12], 25) or sacas(r[7], 1)
    cafe.append(limpar({
        "nome": texto(r[0]), "ender": texto(r[1]), "mun": municipio(r[2]),
        "geo": texto(r[3]).replace("\n", " "), "sexo": sexo(r[8]),
        "calc": round((calc_kg or 0) / 1000.0, 3) or None,
        "npk": npk_kg, "fte": fte_kg, "mudas": numero(r[9]),
    }))
conjunto("cafe", "Cafeicultura — beneficiários", "agricultura", "Café", cafe,
         [{"campo": "calc", "rot": "Calcário", "un": "t", "dec": 1},
          {"campo": "npk", "rot": "Fertilizante NPK", "un": "kg", "dec": 0},
          {"campo": "fte", "rot": "FTE BR12", "un": "kg", "dec": 0},
          {"campo": "mudas", "rot": "Mudas", "un": "un", "dec": 0}],
         "Sacas convertidas em quilos (calcário 40 kg, NPK e FTE 25 kg).")

conjunto("cafe_concurso", "Concurso de qualidade do café", "agricultura", "Café",
         [limpar({"nome": texto(r[0]), "mun": municipio(r[2]), "sexo": sexo(r[8])})
          for r in linhas("Concurso Café")])

conjunto("cafe_palestras", "Palestras do café — Expoacre 2023", "agricultura",
         "Café", [limpar({"nome": texto(r[0]), "ano": "2023"})
                  for r in linhas("Palestras Café Expoacre 2023")])

conjunto("cafe_curso_tec", "Curso do café — técnicos", "agricultura", "Café",
         [limpar({"nome": texto(r[0]), "inst": texto(r[1]), "turma": texto(r[4])})
          for r in linhas("Curso Cafe Técnicos")])

conjunto("cafe_curso_prod", "Curso do café — produtores", "agricultura", "Café",
         [limpar({"nome": texto(r[0]), "turma": texto(r[3]), "mun": municipio(r[4])})
          for r in linhas("Curso Café Produtores")])

conjunto("palestras_deagro", "Palestras do DEAGRO", "agricultura", "Eventos",
         [limpar({"nome": texto(r[0])}) for r in linhas("Palestras DEAGRO")])


# ============================================== 2. AQUICULTURA E PESCA (DIAP)
def atividade(nome_aba, ci):
    """Abas de atividade tecnica. `ci` mapeia o nome das colunas, que mudam de
    posicao entre as tres versoes da mesma planilha.

    "ender" e "geo" so existem em parte das versoes — quem nao tem simplesmente
    omite a chave no mapa."""
    out = []
    for r in linhas(nome_aba):
        out.append(limpar({
            "data": data_iso(r[ci["data"]]), "ano": ano_de(r[ci["data"]]),
            "nome": texto(r[ci["nome"]]), "sexo": sexo(r[ci["sexo"]]),
            "idade": numero(r[ci["idade"]]), "mun": municipio(r[ci["mun"]]),
            "ender": texto(r[ci["ender"]]) if "ender" in ci else "",
            "geo": texto(r[ci["geo"]]).replace("\n", " ") if "geo" in ci else "",
            "ativ": texto(r[ci["ativ"]]),
            # a equipe vem com um nome por linha na mesma celula; o corte tem de
            # ser feito no valor cru, antes de texto() colapsar as quebras
            "equipe": [t for t in (texto(x) for x in
                                   re.split(r"[\n;/]+", str(r[ci["equipe"]] or ""))) if t],
            "diarias": numero(r[ci["diarias"]]), "dias": numero(r[ci["dias"]]),
            "km": numero(r[ci["km"]]),
        }))
    return out


MED_ATIV = [{"campo": "km", "rot": "Km percorridos", "un": "km", "dec": 0},
            {"campo": "diarias", "rot": "Diárias", "un": "", "dec": 1},
            {"campo": "dias", "rot": "Dias de campo", "un": "", "dec": 0}]

conjunto("diap", "Atividade técnica — DIAP 2023", "aquicultura", "Atividade técnica",
         atividade("Atividade Técnica DIAP 2023",
                   {"data": 0, "nome": 1, "sexo": 2, "idade": 3, "mun": 6,
                    "ender": 7, "geo": 8,
                    "ativ": 9, "equipe": 10, "diarias": 11, "dias": 12, "km": 13}),
         MED_ATIV,
         "Diárias, dias e quilometragem são lançados na primeira linha de cada "
         "viagem; os demais produtores da mesma visita entram sem esses valores.")


# ========================================================= 3. CENTRAL DE INCUBAÇÃO
incub = []
for r in linhas("Controle de Beneficiários - Cen"):
    incub.append(limpar({
        "data": data_iso(r[0]), "ano": ano_de(r[0]), "nome": texto(r[1]),
        "idade": numero(r[2]),
        "ender": texto(r[5]), "mun": municipio(r[6]),
        "corte": numero(r[7]), "postura": numero(r[8]),
        "total": numero(r[9]), "sexo": sexo(r[10]),
    }))
conjunto("incub", "Distribuição de pintos", "incubacao", "Central de Incubação",
         incub, [{"campo": "total", "rot": "Pintos distribuídos", "un": "un", "dec": 0},
                 {"campo": "corte", "rot": "Pintos de corte", "un": "un", "dec": 0},
                 {"campo": "postura", "rot": "Pintos de postura", "un": "un", "dec": 0}],
         "Série histórica desde 2013. Corte e postura só foram separados nos "
         "lançamentos recentes — o total cobre todos os registros.")

# A aba "Beneficiarios UDs" traz as mesmas 20 produtoras da aba "Galinha
# Caipira", com os mesmos campos. So uma entra no painel — as duas contariam
# cada produtora duas vezes.
conjunto("galinha", "Projeto Galinha Caipira — produtoras", "incubacao",
         "Projeto Galinha Caipira",
         [limpar({"nome": texto(r[0]), "ender": texto(r[2]), "mun": municipio(r[3]),
                  "sexo": sexo(r[6])}) for r in linhas("Galinha Caipíra")])

conjunto("incub_ativ", "Atividade técnica — Central de Incubação", "incubacao",
         "Atividade técnica",
         atividade("Atividade Técnica Central de In",
                   {"data": 0, "nome": 1, "sexo": 2, "idade": 3, "mun": 5,
                    "geo": 6,
                    "ativ": 7, "equipe": 8, "diarias": 9, "dias": 10, "km": 11}),
         MED_ATIV)


# ==================================================================== 4. PECUÁRIA
def unidade(nome_aba, rot):
    return [limpar({
        "nome": texto(r[0]), "prop": texto(r[1]), "ender": texto(r[2]),
        "mun": municipio(r[3]), "geo": texto(r[4]).replace("\n", " "),
        "area": numero(r[6]), "arearec": numero(r[7]),
        "sexo": sexo(r[9]), "idade": numero(r[10]), "car": texto(r[11]),
        "tipo": rot,
    }) for r in linhas(nome_aba)]


MED_UD = [{"campo": "area", "rot": "Área das propriedades", "un": "ha", "dec": 1},
          {"campo": "arearec", "rot": "Área recuperada", "un": "ha", "dec": 1}]

conjunto("pec_ud", "Pecuária Eficiente — unidades demonstrativas", "pecuaria",
         "Pecuária Eficiente", unidade("Pecuaria Eficiente - Beneficiar", "UD"),
         MED_UD)
conjunto("pec_up", "Pecuária Eficiente — unidades produtivas", "pecuaria",
         "Pecuária Eficiente", unidade("Beneficiários UPs", "UP"), MED_UD)

# A aba "Recebimento de Calcário" repete linha por linha a "Recebimento de
# Calcarios UDs" (so a ultima coluna muda de nome: Observacao/Status). So uma
# entra no painel — as duas somariam o calcario em dobro.
conjunto("pec_calcario", "Calcário entregue às unidades", "pecuaria",
         "Calcário",
         [limpar({"nome": texto(r[0]), "mun": municipio(r[1]),
                  "kg": numero(r[2]), "data": data_iso(r[3]), "ano": ano_de(r[3]),
                  "situacao": texto(r[5]) or "Ativo"})
          for r in linhas("Recebimento de Calcarios UDs")],
         [{"campo": "kg", "rot": "Calcário entregue", "un": "kg", "dec": 0}])

adubos = []
for r in linhas("Recebimento de Adubos"):
    adubos.append(limpar({
        "nome": texto(r[0]), "mun": municipio(r[2]),
        "data": data_iso(r[3]), "ano": ano_de(r[3]),
        "ureia": numero(r[5]), "super": numero(r[7]),
        "kcl": numero(r[9]), "micro": numero(r[11]),
    }))
for a in adubos:
    a["total"] = round(sum(a.get(k) or 0 for k in ("ureia", "super", "kcl", "micro")), 2)
conjunto("pec_adubos", "Adubos entregues às unidades", "pecuaria",
         "Pecuária Eficiente", adubos,
         [{"campo": "total", "rot": "Adubo entregue", "un": "kg", "dec": 0},
          {"campo": "ureia", "rot": "Ureia", "un": "kg", "dec": 0},
          {"campo": "super", "rot": "Superfosfato simples", "un": "kg", "dec": 0},
          {"campo": "kcl", "rot": "Cloreto de potássio", "un": "kg", "dec": 0},
          {"campo": "micro", "rot": "Micronutrientes", "un": "kg", "dec": 0}])

conjunto("calcario", "Programa do calcário — beneficiários", "pecuaria",
         "Calcário",
         [limpar({"nome": texto(r[0]), "mun": municipio(r[1]), "ender": texto(r[2]),
                  "geo": texto(r[3]).replace("\n", " "),
                  "ton": numero(r[6]), "indic": texto(r[5]),
                  "situacao": texto(r[8]), "doc": texto(r[9]).replace("Entrgue", "Entregue"),
                  "sexo": sexo(r[10]), "idade": numero(r[11]),
                  "distrib": texto(r[12]), "car": texto(r[13])})
          for r in linhas("Beneficiarios Calcario")],
         [{"campo": "ton", "rot": "Calcário", "un": "t", "dec": 1}])

ia = []
for r in linhas("Beneficiario IA"):
    ia.append(limpar({
        # a coluna B nao tem titulo na planilha, mas e o municipio — so os
        # lancamentos mais recentes a preenchem
        "nome": texto(r[0]), "mun": municipio(r[1]), "ender": texto(r[2]),
        "geo": texto(r[3]).replace("\n", " "), "indic": texto(r[5]),
        "vacas": numero(r[6]), "touros": texto(r[7]),
        "leite": numero(r[8]), "corte": numero(r[9]),
        "data": data_iso(r[10]), "ano": ano_de(r[10]),
        "parto": data_iso(r[11]),
        "prenhez": numero(r[12]), "pctprenhez": numero(r[13]),
        "bezerros": numero(r[14]), "pctbezerros": numero(r[15]),
        "machos": numero(r[16]), "femeas": numero(r[17]),
        "pctmachos": numero(r[18]), "pctfemeas": numero(r[19]),
        "sexo": sexo(r[21]), "idade": numero(r[22]), "car": texto(r[23]),
    }))
conjunto("ia", "Inseminação artificial — beneficiários", "pecuaria",
         "Melhoramento genético", ia,
         [{"campo": "vacas", "rot": "Vacas inseminadas", "un": "un", "dec": 0},
          {"campo": "prenhez", "rot": "Prenhezes confirmadas", "un": "un", "dec": 0},
          {"campo": "bezerros", "rot": "Bezerros nascidos", "un": "un", "dec": 0}],
         "A prenhez é confirmada cerca de 60 dias após a inseminação e o "
         "nascimento nove meses depois — os lotes mais novos ainda aparecem "
         "sem bezerros.")

conjunto("ensimina", "Ensimina — produtores atendidos", "pecuaria",
         "Melhoramento genético",
         [limpar({"nome": texto(r[0]), "ender": texto(r[1]), "mun": municipio(r[2]),
                  "geo": texto(r[3]).replace("\n", " "),
                  "sexo": sexo(r[6]), "idade": numero(r[7]),
                  "data": data_iso(r[9]), "ano": ano_de(r[9]),
                  "touro": texto(r[11]), "leite": numero(r[12]), "corte": sacas(r[13]),
                  "brincos": texto(r[14]), "doses": numero(r[10])})
          for r in linhas("Ensimina + Produtores")],
         [{"campo": "doses", "rot": "Doses entregues", "un": "un", "dec": 0}])

conjunto("touros", "Sêmen — touros do banco", "pecuaria", "Melhoramento genético",
         [limpar({"nome": texto(r[0]), "reg": texto(r[1]), "nasc": data_iso(r[2]),
                  "pai": texto(r[3]), "avo": texto(r[4]), "raca": texto(r[5]),
                  "qtd": numero(r[6]), "data": data_iso(r[7]), "ano": ano_de(r[7]),
                  "usadas": numero(r[8]), "disp": numero(r[9])})
          for r in linhas("Touro Doses")],
         [{"campo": "qtd", "rot": "Doses recebidas", "un": "un", "dec": 0},
          {"campo": "usadas", "rot": "Doses utilizadas", "un": "un", "dec": 0},
          {"campo": "disp", "rot": "Doses disponíveis", "un": "un", "dec": 0}])

conjunto("insumos_ia", "Recebimento de sêmen", "pecuaria", "Melhoramento genético",
         [limpar({"data": data_iso(r[0]), "ano": ano_de(r[0]), "leite": numero(r[1]),
                  "corte": numero(r[2]), "total": numero(r[3]), "touros": texto(r[4])})
          for r in linhas("Controle de Recebimento de Insu")],
         [{"campo": "total", "rot": "Doses recebidas", "un": "un", "dec": 0}])

nitro = []
for r in linhas("Usina de Nitrogênio"):
    nitro.append(limpar({
        "data": data_iso(r[0]), "ano": ano_de(r[0]), "nome": texto(r[1]),
        "kg": numero(r[2]), "valor": numero(r[3]),
        "ender": texto(r[4]), "mun": municipio(r[5]),
    }))
conjunto("nitrogenio", "Usina de nitrogênio líquido", "pecuaria", "Usina de nitrogênio",
         nitro, [{"campo": "kg", "rot": "Nitrogênio fornecido", "un": "L", "dec": 1},
                 {"campo": "valor", "rot": "Valor arrecadado", "un": "R$", "dec": 2}],
         "Fornecimento de nitrogênio líquido para conservação de sêmen e "
         "vacinas. Série diária desde março de 2021.")

conjunto("solar", "Energia solar nas propriedades", "pecuaria", "Energia solar",
         [limpar({"nome": texto(r[0]), "ender": texto(r[1]), "mun": municipio(r[2]),
                  "geo": texto(r[3]).replace("\n", " "),
                  "area": numero(r[5])}) for r in linhas("Energia Solar")],
         [{"campo": "area", "rot": "Área das propriedades", "un": "ha", "dec": 1}])

conjunto("pec_ativ", "Atividade técnica — pecuária", "pecuaria", "Atividade técnica",
         atividade("Atividade Tecnica",
                   {"data": 0, "nome": 1, "sexo": 2, "idade": 3, "mun": 4,
                    "geo": 5,
                    "ativ": 6, "equipe": 7, "diarias": 8, "dias": 9, "km": 10}),
         MED_ATIV,
         "Diárias, dias e quilometragem são lançados na primeira linha de cada "
         "viagem; os demais produtores da mesma visita entram sem esses valores.")


# ============================================================== 5. CAPACITAÇÕES
conjunto("curso_prod", "Cursos — produtores", "capacitacao", "Cursos",
         [limpar({"nome": texto(r[0]), "local": texto(r[2]), "data": data_iso(r[3]),
                  "ano": ano_de(r[3]), "mun": municipio(r[4]), "curso": texto(r[5])})
          for r in linhas("Curso Produtores")])

conjunto("curso_tec", "Cursos — técnicos", "capacitacao", "Cursos",
         [limpar({"nome": texto(r[0]), "inst": texto(r[1]), "data": data_iso(r[4]),
                  "ano": ano_de(r[4]), "curso": texto(r[5])})
          for r in linhas("Curso Tecnicos")])

conjunto("seminarios", "Seminários", "capacitacao", "Eventos",
         [limpar({"nome": texto(r[0]), "mun": municipio(r[2]), "data": data_iso(r[3]),
                  "ano": ano_de(r[3]), "local": texto(r[4])})
          for r in linhas("Seminiários")])

conjunto("dias_campo", "Dias de campo — Expojuruá", "capacitacao", "Eventos",
         [limpar({"nome": texto(r[0]), "ano": ano_de(r[2]), "mun": municipio(r[3])})
          for r in linhas("Dias de Campos - Expojurua")])


def palestrantes(nome_aba, ano, pular=0, numerado=False):
    """Abas do Expoacre sao verticais: uma coluna so, com o nome do palestrante
    e o tema em linhas seguidas.

    Em 2024 cada bloco comeca pelo NUMERO da palestra (1, 2, 3...) e termina com
    datas, diarias e trechos de viagem ("Campinas - SP / Rio Branco - AC"), que
    nao interessam ao painel. O corte do bloco olha para a sequencia esperada de
    numeros — nao para "qualquer numero" —, senao a diaria (4,5) abriria um bloco
    novo e os dois trechos da viagem virariam um par palestrante/tema falso."""
    out, bloco, proximo = [], [], 1
    for r in linhas(nome_aba, pular=pular):
        t = texto(r[0])
        if not t:
            continue
        n = r[0]
        eh_numero = isinstance(n, (int, float)) and not isinstance(n, bool)
        if numerado and eh_numero and float(n) == proximo:
            bloco = []                       # numero da palestra: novo bloco
            proximo += 1
            continue
        # datas, diarias e o que vier depois do tema nao entram no par
        if isinstance(n, (datetime, date)) or eh_numero or len(bloco) >= 2:
            continue
        bloco.append(t)
        if len(bloco) == 2:
            out.append({"nome": bloco[0], "tema": bloco[1], "ano": ano})
            # sem numeracao (2023) a aba e uma lista alternada de nome e tema,
            # entao o bloco reabre aqui; com numeracao, quem reabre e o numero
            if not numerado:
                bloco = []
    return out


# a aba de 2023 tem cabecalho e e uma lista alternada; a de 2024 e numerada
pal = palestrantes("Expoacre curso 2023", "2023", pular=1) + \
      palestrantes("Expoacre Curso 2024", "2024", numerado=True)
conjunto("expoacre", "Palestrantes do Expoacre", "capacitacao", "Eventos", pal)


# ------------------------------------------------------------------- gravacao
DIVISOES = [
    {"id": "agricultura", "nome": "Divisão de Agricultura", "icone": "cafe"},
    {"id": "aquicultura", "nome": "Divisão de Aquicultura e Pesca", "icone": "peixe"},
    {"id": "incubacao", "nome": "Divisão de Central de Incubação", "icone": "ovo"},
    {"id": "pecuaria", "nome": "Divisão de Pecuária", "icone": "boi"},
    {"id": "capacitacao", "nome": "Capacitações e eventos", "icone": "curso"},
]

anos = sorted({l.get("ano") for c in CONJ.values() for l in c["linhas"] if l.get("ano")})
muns = sorted({l.get("mun") for c in CONJ.values() for l in c["linhas"] if l.get("mun")})
total = sum(c["n"] for c in CONJ.values())

dados = {
    "meta": {
        "arquivo": os.path.basename(XLSX),
        "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "conjuntos": len(CONJ), "registros": total,
        "periodo": [anos[0], anos[-1]] if anos else [],
        "avisos": AVISOS,
    },
    "divisoes": DIVISOES,
    "municipios": muns,
    "anos": anos,
    "conjuntos": CONJ,
}

dados = limpar_cpf(dados)

os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
with open(SAIDA, "w", encoding="utf-8") as f:
    f.write("/* Dados do DEAGRO — SEAGRI/AC\n"
            "   GERADO AUTOMATICAMENTE por tools/gerar_dados_deagro.py\n"
            "   Fonte: %s — %s\n"
            "   Nao editar a mao: rode o script novamente apos atualizar a planilha.\n"
            "   Dados pessoais (documento, telefone, e-mail) nao sao exportados. */\n"
            % (os.path.basename(XLSX), dados["meta"]["gerado_em"]))
    f.write("window.DADOS_DEAGRO = ")
    json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

print("OK  %s" % SAIDA)
print("    %d conjuntos, %d registros, %d municipios, anos %s"
      % (len(CONJ), total, len(muns), dados["meta"]["periodo"]))
for c in sorted(CONJ.values(), key=lambda x: -x["n"]):
    print("    %-5d %s" % (c["n"], c["nome"]))
for a in AVISOS:
    print("    AVISO: " + a)
