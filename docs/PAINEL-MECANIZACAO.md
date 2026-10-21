# Painel da Mecanização — guia técnico

Página: `pages/dashboard.html` (a versão pública é a mesma página com `?publico=1`, servida por
`pages/mecanizacao-publico.html`). Este guia descreve como o painel é montado, as regras de negócio e como
testar e publicar.

## 1. Arquitetura

O painel é uma página única com abas. O núcleo (`js/dashboard.js`) cuida dos dados, dos filtros e da URL;
cada aba nova vive em um arquivo próprio e se registra pela **`window.PAINEL_API`**.

| Arquivo | Papel |
|---|---|
| `js/painel-calculos.js` | Regras puras, sem DOM: data de referência, exercício, somas, ranking, identidade do produtor, UTM ⇄ lat/lng e **reparo de coordenadas**. Testado no Node. |
| `js/painel-publico.js` | Visibilidade: o que aparece para o público e para o usuário logado que não é root; senha do link público (carrega **antes** de `dashboard.js`). |
| `js/painel-config.js` | Visão **Configurações** de *Mostrar mais* (só root): chaves liga/desliga por público e por usuário logado, "Ver como" (prévia), desfazer, link público e senha. |
| `js/dashboard.js` | Núcleo: carga de dados, filtros, URL, abas de leitura, inserções, exportação, assistente (ponte). |
| `js/tabela-ferramentas.js` | Barra de filtrar/ordenar/agrupar/exportar de toda `table.dados` e tabelas em cartão no celular. |
| `js/painel-comparativo.js` | Aba Comparativo (ano × ano, mês × mês, crescimentos/quedas). |
| `js/painel-metas.js` | Aba Metas (por Acre, município, escritório, técnico, ano ou mês). |
| `js/painel-tendencias.js` | Série multi-ano, sazonalidade e projeção do fim do ano. |
| `js/painel-cruzamentos.js` | Tabela dinâmica (linhas × colunas × valor). |
| `js/painel-alertas.js` | Alertas de produtividade (só interno). |
| `js/painel-relatorios.js` | Relatórios semanal/mensal (só interno); PDF baixado direto no padrão visual dos relatórios do sistema. |
| `js/painel-insercoes-extra.js` | Visões **Por município, Por escritório, Por serviço, Por técnico e Por horário** (lançamentos pela data/hora de inserção; só internas). |
| `js/painel-pontos.js` | Mapa de pontos (satélite, calor, área por escritório). Vive em *Mostrar mais → Mapa de pontos*. |
| `js/assistente-dados.js` | Assistente de perguntas (opção de usar os filtros; perguntas fixadas). |

### Onde ficam as visões
Abas na barra: Visão geral, Mecanização, Açudagem, Cultura, Município, Mapa, Escritório Local, **Produtor**,
Exportar, Lançar relatórios e **Mostrar mais**. Dentro de *Mostrar mais* (aba `insercoes`) ficam as visões:
Registros, Por lançador, Por dia, Por semana, Por mês, Por município, Por escritório, Por serviço, Por técnico, Por horário, Mapa de pontos, **Comparativo, Metas, Tendências,
Cruzamentos, Alertas, Relatórios e Configurações (só root)**. Na versão pública só aparecem Comparativo, Metas, Tendências e
Cruzamentos (as demais trazem nomes de pessoas ou dados internos e nem são desenhadas no DOM).
Uma visão de módulo se registra com `PAINEL_API.registrarAba('x', fn)` e ganha um `<div class="ins-bloco" data-sec="x">`
e um botão em `#insNav`; a lista fica em `SECOES_MODULO` (e `SECOES_INTERNAS`) no `js/dashboard.js`.

**Filtros em *Mostrar mais*:** a lateral de filtros aparece em todas as visões que leem a seleção. Metas, Alertas,
Relatórios e Configurações (`SECOES_SEM_SELECAO`) não leem filtro algum e a lateral some (`atualizarFiltros()`).

### Como criar uma aba nova
1. Botão `<button class="aba" data-aba="x">` e painel `<div class="aba-conteudo" data-aba="x">` em `dashboard.html`.
2. Um arquivo `js/painel-x.js`, carregado depois de `dashboard.js`, que chama
   `PAINEL_API.registrarAba('x', function (C) { ... })`. `C.D` é a seleção já filtrada; use
   `PAINEL_API.tiles`, `pintarSerie`, `pintarCat`, `filtrar`, `registros`, `auditar` etc.
3. Se a aba não pode aparecer na versão pública: adicione o nome a `ABAS_FORA_DO_PUBLICO`
   (em `dashboard.js`) e a regra `html.modo-publico .aba[data-aba="x"]` em `css/dashboard.css`.
   Se pode aparecer, inclua-a em `ABAS_CONFIGURAVEIS` (`js/painel-publico.js`).
4. Rode `node tools/versionar.cjs pages/dashboard.html`.

### Tipo de gráfico: computador × celular
Todo gráfico tem um seletor de tipo (`data-tipos` no HTML; o 1º da lista é o tipo que o painel prevê como principal).
- **Computador:** abre na tabela (ou no tipo que a pessoa escolheu); a escolha fica em `localStorage`, chave
  `seagri_tipos_grafico`.
- **Celular** (até 768 px, o mesmo corte do CSS; o painel se identifica sozinho e troca ao girar o aparelho): abre no tipo
  principal do painel — barras para ranking, rosca para poucas partes, colunas/linha para o tempo. Rosca, pizza e colunas
  com **mais de 6 categorias** vão para barras (`padraoCelular()` em `js/dashboard.js`). Só as escolhas feitas pela pessoa
  ficam guardadas, em `seagri_tipos_grafico_celular`, à parte das do computador; os padrões nunca são gravados, então
  mudar um padrão vale para todo mundo, inclusive quem já mexeu em outro gráfico.
- No celular as barras mostram o nome inteiro em cima e a barra na largura toda (CSS no fim de `css/dashboard.css`), e as
  séries usam uma área de desenho estreita (`eixos()` em `js/graficos.js`) para os números continuarem legíveis.

## 2. Regras de negócio (as que mais geram dúvida)

- **Exercício** = o ano da planilha/lançamento (`r.ex`, ou o ano de `r.d`). É por ele que o filtro
  *Período* recorta, para os totais baterem com a planilha.
- **Mês** = o da vistoria **quando plausível** (ocorreu até o lançamento e no máximo **18 meses** antes);
  senão, o da data de lançamento. Um serviço de dez/2025 lançado na planilha de 2026 conta em 2026,
  no mês 12. Por isso os rótulos de mês não levam o ano.
- **Produtor** = nome normalizado (sem acento, caixa e espaço dobrado). Nenhum documento pessoal chega ao painel.
- **Inserção fora do expediente**: antes das 7h ou a partir das 18h (hora de Rio Branco, campo `h` de cada registro); no calendário aparece com a marca ☾ e, no fim de semana, com **FS**.
- **Hectares** só contam em *Mecanização*; **horas** e **tanques** são da *Açudagem*.
- **Coordenadas**: UTM WGS84, hemisfério sul, zonas 18/19. Chegam só para quem está logado.
  Valor digitado errado é **reparado em tela** (x/y trocados, dígito faltando/sobrando/trocado, zona,
  graus sem vírgula), pela proximidade com o centro do município; o que não se recupera sai do mapa.
  O banco **não** é alterado.
- **Projeção do ano** = realizado ÷ participação acumulada esperada (sazonalidade dos anos completos).
- **Alertas**: abaixo de X% da média dos últimos N dias (entre quem atuou no último ano) e município
  sem atendimento há mais de N dias. Limites em `mecanizacao_alertas_config`.

## 3. Dados e banco

Caminho de leitura (do mais rápido ao mais lento; cada um cai no seguinte se falhar):

1. **Cache local (IndexedDB `seagri_mecanizacao`)** — o painel desenha na hora com a última base recebida
   (chave `p` = público, `i` = logado; vale 14 dias / 12 h e o do logado é apagado ao sair da conta) e só então
   pergunta ao servidor se a versão mudou. Sem rede, continua mostrando a base do cache (nunca troca pelo
   arquivo antigo).
2. **RPC `mecanizacao_painel(p_versao)`** (`database/mecanizacao-painel-rpc.sql`), chamada direto do navegador:
   escolhe o perfil pelo JWT (logado = usuário existente e não bloqueado; senão público), compara a versão e
   responde `{ igual: true }` (56 bytes) ou devolve o painel já montado, guardado em `mecanizacao_painel_cache`
   até a base mudar.
3. **Função de borda `lancar-mecanizacao`** (ação `painel`, `supabase/functions/lancar-mecanizacao/index.ts`):
   mesmo resultado, montado em TypeScript. Só é usada se o SQL acima não estiver aplicado ou o RPC falhar.
4. Fallbacks finais: `data/mecanizacao.json` → localStorage → `js/dados-mecanizacao.js`.

A **versão** é um contador (`mecanizacao_versao`, tabela de uma linha) que sobe a cada gravação em
`mecanizacao_lancamentos` / `mecanizacao_lancadores` (gatilhos por comando). Formato: `<contador>-<p|i>`.
A regra de montagem (`paraRegistroPainel`) existe em TypeScript (borda) e em SQL (`mecanizacao_painel_montar`);
`node tools/conferir_painel_sql.cjs` compara as duas registro a registro nos dois perfis e deve dar "idênticos".

Na partida, a conferência da configuração/senha do link público e a leitura dos dados andam em paralelo, mas
os dados só aparecem na tela depois que a configuração liberar.

Objetos no Supabase (scripts em `database/`):

| Objeto | Arquivo | Quem grava |
|---|---|---|
| `mecanizacao_metas` | `mecanizacao-metas.sql`, `mecanizacao-fase-b.sql` | responsável |
| `mecanizacao_publico_config` + funções `mecanizacao_publico_*` | `mecanizacao-publico-config.sql`, `mecanizacao-visibilidade.sql` | responsável |
| `mecanizacao_alertas_config` | `mecanizacao-fase-b.sql` | responsável |
| `mecanizacao_relatorios` + `mecanizacao_gerar_relatorio` | `mecanizacao-fase-b.sql` | agendador / responsável |
| Agendamento `pg_cron` (segunda 13:00 UTC e dia 1) | `mecanizacao-agendamento.sql` | — |
| `mecanizacao_versao` + gatilhos, `mecanizacao_painel_bruto()`, índice `(criado_em, id)`, `mecanizacao_resumo_periodo` por intervalo | `mecanizacao-desempenho.sql` | gatilhos |
| `mecanizacao_painel()`, `mecanizacao_painel_montar()`, cache `mecanizacao_painel_cache` | `mecanizacao-painel-rpc.sql` (aplicar depois do anterior) | leitura |

Aplicar um script: `npx supabase db query --linked -f database/<arquivo>.sql`.
Publicar a função: `npx supabase functions deploy lancar-mecanizacao`.

## 4. Testes e verificações

```bash
node tools/testar_painel.cjs                 # regras de cálculo e reparo de coordenadas (rápido, sem rede)
node tools/testar_interface.cjs http://localhost/agricultura "<caminho>/playwright-core"   # navegador real
node tools/versionar.cjs --verificar pages/dashboard.html                                  # versões de cache em dia?
node tools/conferir_painel_sql.cjs                                                        # montagem em SQL == regra original (precisa do Supabase CLI ligado)
```

`testar_interface.cjs` abre a versão pública, percorre as abas, testa filtros/URL, exportação CSV,
assistente e o layout de 375 px, o cache local (2ª abertura só confere a versão, versão velha é
atualizada, sem rede mantém a base) e falha se houver erro de JavaScript no console.

## 5. Publicação (checklist)

1. `node tools/testar_painel.cjs` e `node tools/testar_interface.cjs ...`.
2. `node tools/versionar.cjs pages/dashboard.html` (carimba o `?v=` com o hash de cada arquivo).
3. Se mexeu em `supabase/functions/...`: `npx supabase functions deploy lancar-mecanizacao`.
4. Se mexeu em `database/*.sql`: aplicar no Supabase.
5. Commit e push (o GitHub Pages publica em 1–3 minutos).

## 6. Limitações conhecidas

- **E-mail automático** dos relatórios não está ligado: exige um provedor de e-mail (chave de API) e uma
  função de envio. Hoje o relatório é gerado e guardado automaticamente; abre-se, imprime-se em PDF e o
  botão *Enviar por e-mail* abre o rascunho no programa de e-mail.
- **Senha do link público** é um controle leve: a página confere pelo banco antes de abrir, mas os dados
  públicos continuam sendo os agregados de sempre.
- `js/dashboard.js` ainda concentra ~5,3 mil linhas (filtros, abas de leitura, inserções, mapa do Acre).
  A migração por abas deve seguir o modelo de `painel-*.js`, uma aba por vez.

## 7. Visibilidade por perfil (Configurações)

- Dois perfis configuráveis: **público** (sem login) e **usuário logado que não é root**. O root vê tudo.
- Cada perfil tem uma lista de chaves (abas e visões de *Mostrar mais*) em `mecanizacao_publico_config`
  (`itens_publico`, `itens_logado`); `NULL` = padrão (`PADRAO_PUBLICO` / `PADRAO_LOGADO` em `js/painel-publico.js`).
- *Mostrar mais* é a aba-mãe das visões: ligar uma visão liga a aba-mãe; desligar a aba-mãe esconde todas.
- Aba ou visão desligada **não abre nem por endereço, nem por cartão de "Ver detalhes"**: cai na primeira liberada
  (`primeiraAbaVisivel()` em `js/dashboard.js`).
- Itens com nomes de pessoas ou dados internos nunca podem ser liberados ao público (cadeado na tela).
- **Filtros da lateral** só aparecem nas visões que os usam. Ficam ocultos em *Configurações*, *Alertas*,
  *Relatórios* e *Metas* (`SECOES_SEM_FILTRO` em `js/dashboard.js`) e em *Lançar relatórios*.
- **Configurações cabe na janela sem rolar a página**: a altura do contêiner e das linhas é calculada por
  `ajustarAltura()` (`js/painel-config.js`) a partir do espaço livre; testado em 1920×950 e 1366×650.
- **Tela de acesso do link público** (`pedirSenhaPublica()` em `js/painel-publico.js`, estilos `.pub-login-*`): o fundo fica
  desfocado (`blur(20px)`) e coberto a 90% (só 10% de visibilidade); o foco e a rolagem ficam só no login (`inert` no resto);
  os dados **só são carregados depois** da senha certa; enquanto a configuração é conferida a página fica oculta
  (`html.pub-checando`, no máximo 5 s) para não piscar sem desfoque.

