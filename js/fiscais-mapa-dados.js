/* Liga os cadastros atuais à seção eleitoral e ao histórico disponível. */
window.CoberturaLocaisMapa = function (municipio, registros, locais, historico) {
  const canonico = n => String(n == null ? '' : n).replace(/^0+/, '') || '0';
  const chave = (m, z, s) => String(m) + '|' + canonico(z) + '|' + canonico(s);
  const fiscais = new Set(registros.map(r => chave(r.municipio, r.zona, r.secao)));
  const votos = new Map();
  (historico.semVotos || []).forEach(r => votos.set(chave(r.municipio, r.zona, r.secao), 0));
  (historico.porSecao || []).forEach(r => votos.set(chave(r.municipio, r.zona, r.secao), Number(r.votos)));
  return locais.filter(l => String(l.municipio) === String(municipio)).map(local => {
    const vistas = new Set();
    const secoes = [];
    local.secoes.forEach(s => [s.numero].concat(s.agregadas || []).forEach(numero => {
      const k = chave(municipio, local.zona, numero);
      if (vistas.has(k)) return;
      vistas.add(k);
      secoes.push({numero, zona: local.zona, comFiscal: fiscais.has(k), votos: votos.has(k) ? votos.get(k) : null});
    }));
    return {local, secoes};
  });
};
