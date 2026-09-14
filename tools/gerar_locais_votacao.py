"""Importa locais, zonas e seções da planilha de referência, sem alterar a fonte."""
import json
import re
import sys
import unicodedata
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
def chave(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s.upper()) if unicodedata.category(c) != 'Mn')

def main():
    fonte = Path(sys.argv[1])
    municipios = {chave(m['nome']): str(m['id']) for m in json.loads((ROOT/'assets/acre-localidades.json').read_text(encoding='utf-8'))}
    wb = openpyxl.load_workbook(fonte, read_only=True, data_only=True)
    locais = []
    padrao = r'(\d+)(?:\(([^)]*)\))?\s*-\s*apt\s*-\s*(\d+)'
    for linha, r in enumerate(list(wb.active.values)[2:], 3):
        secoes = []
        for m in re.finditer(padrao, str(r[5])):
            secoes.append({'numero': m[1].zfill(3), 'agregadas': [n.zfill(3) for n in re.findall(r'\d+', m[2] or '')], 'aptos': int(m[3])})
        assert secoes and not re.sub(padrao, '', str(r[5])).replace(',', '').strip(), f'Seções inválidas na linha {linha}'
        locais.append({'id': str(linha), 'municipio': municipios[chave(r[1])], 'zona': str(int(r[0])), 'nome': r[2], 'endereco': r[3], 'area': r[4], 'provisorio': r[6] == 'Sim', 'secoes': secoes})
    assert len({l['municipio'] for l in locais}) == 22
    pacote = {'fonte': fonte.name, 'locais': locais}
    (ROOT/'js/locais-votacao.js').write_text('/* Fonte: '+fonte.name+'; números entre parênteses são seções agregadas. */\nwindow.LOCAIS_VOTACAO = '+json.dumps(pacote, ensure_ascii=False, separators=(',', ':'))+';\n', encoding='utf-8')
    print(f'{len(locais)} locais; {sum(len(l["secoes"]) for l in locais)} seções principais; {sum(len(s["agregadas"]) for l in locais for s in l["secoes"])} agregadas; 22 municípios.')

if __name__ == '__main__':
    main()
