/* Regional (Alto Acre, Baixo Acre, Purus, Tarauacá/Envira, Juruá) de cada um
   dos 22 municípios do Acre — mesma classificação usada pelas regionais de
   extensão do estado. Estático porque município não muda de regional; usado
   para agrupar cadastros de Fiscais e indicadores por regional (ver
   js/eleicoes-painel.js), já que "regional" no cadastro é digitada pela
   pessoa e não vem do município. Chave = codarea do IBGE (mesmo id de
   js/mapa-acre.js e assets/acre-localidades.json). */
window.REGIONAIS_MUNICIPIOS = {
  '1200013': 'Alto Acre',       // Acrelândia
  '1200054': 'Alto Acre',       // Assis Brasil
  '1200104': 'Alto Acre',       // Brasiléia
  '1200138': 'Baixo Acre',      // Bujari
  '1200179': 'Alto Acre',       // Capixaba
  '1200203': 'Juruá',           // Cruzeiro do Sul
  '1200252': 'Alto Acre',       // Epitaciolândia
  '1200302': 'Tarauacá/Envira', // Feijó
  '1200328': 'Tarauacá/Envira', // Jordão
  '1200336': 'Juruá',           // Mâncio Lima
  '1200344': 'Purus',           // Manoel Urbano
  '1200351': 'Juruá',           // Marechal Thaumaturgo
  '1200385': 'Alto Acre',       // Plácido de Castro
  '1200393': 'Juruá',           // Porto Walter
  '1200401': 'Baixo Acre',      // Rio Branco
  '1200427': 'Juruá',           // Rodrigues Alves
  '1200435': 'Purus',           // Santa Rosa do Purus
  '1200450': 'Baixo Acre',      // Senador Guiomard
  '1200500': 'Purus',           // Sena Madureira
  '1200609': 'Tarauacá/Envira', // Tarauacá
  '1200708': 'Alto Acre',       // Xapuri
  '1200807': 'Baixo Acre'       // Porto Acre
};
window.REGIONAIS = ['Alto Acre', 'Baixo Acre', 'Purus', 'Tarauacá/Envira', 'Juruá'];
