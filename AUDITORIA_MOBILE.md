# Auditoria de responsividade mobile

Branch: `feat/responsividade-mobile`. **Fase atual: diagnóstico concluído — aguardando OK para corrigir.**
Ponto de retomada: este arquivo + `auditoria-mobile/relatorio-antes-chromium.{md,json}`.

## Como a auditoria foi feita (e limites)
- Sistema: front estático (HTML/CSS/JS puro, sem build/lint/testes) servido pelo Apache do XAMPP em `http://localhost/agricultura/pages/`. Login e dados vêm de um Supabase remoto; `lancar_mecanizacao.php`, `salvar_*.php`, `admin_*.php` são APIs (sem tela).
- **Sem credenciais de teste** (`AUDIT_USER/PASS` não existem) e o único banco é o Supabase remoto. Para não tocar em dados reais, o script intercepta `*.supabase.co` (responde listas vazias) e injeta uma sessão simulada de responsável só no navegador do teste. Consequência: telas com dados vindos do banco (fiscais, chamados, contatos, usuários, logs, lançamentos) foram vistas em **estado vazio**; estados "lista longa/texto longo" dessas telas **não foram exercitados**. Painéis Mecanização/DEAGRO usam dados embutidos em `js/dados-*.js` e foram vistos com dados reais.
- **WebKit não foi rodado**: o download do Playwright (Chromium/WebKit) estourou timeout na rede. O Chromium usado é o Google Chrome instalado (`channel: chrome`). Pendência: instalar WebKit e repetir 375/390/430.
- Comando: `cd auditoria-mobile && npm install && node auditar.js --fase antes` (opções no cabeçalho do script).

## Inventário (19 páginas + 3 redirecionadores + 404; 810 estados medidos em 10 viewports)
| Tela | Rota (`pages/`) | Perfil | Estados medidos | Status |
|---|---|---|---|---|
| Início | index.html | logado | 1 | diagnosticada |
| Login | admin-login.html | público | 1 | diagnosticada |
| Trocar senha | admin-trocar-senha.html | logado | 1 | diagnosticada |
| Usuários | admin-usuarios.html | responsável | 1 | diagnosticada |
| Bairros dos fiscais | cadastros-fiscais.html | responsável | 1 (+aba) | diagnosticada |
| Cadastros auxiliares | cadastros-chamados.html | chamados | 4 abas | diagnosticada |
| Fila de chamados | chamados.html | chamados | 1 | diagnosticada |
| Abrir chamado | abrir-chamado.html | público | 1 (passos 1–3 só na captura inicial) | diagnosticada |
| Acompanhar chamado | acompanhar-chamado.html | público | 1 | diagnosticada |
| Contatos | contatos.html | contatos | 1 (modal QR **não abriu** na captura) | diagnosticada |
| Painel Mecanização | dashboard.html | dashboards | 16 abas | diagnosticada |
| Painel público | dashboard.html?publico=1 (e mecanizacao-publico.html) | público | 16 abas | diagnosticada |
| Editar lançamento | lancamento-editar.html | dashboards | 1 (sem id: estado de erro) | diagnosticada |
| DEAGRO | deagro.html (15 abas) | dashboards | 15 | diagnosticada |
| DEAGRO seções | deagro-secoes.html | dashboards | 1 | diagnosticada |
| Fiscais/Eleições | eleicoes.html (abas Fiscais, Resultados, Relatório) | eleicoes | 5 | diagnosticada |
| Logs | logs.html | responsável | 1 | diagnosticada |
| Organograma | organograma.html | organograma | 1 | diagnosticada |
| Portarias | portarias.html | portarias | 1 | diagnosticada |
| Redirecionadores | dashboards.html, admin-permissoes.html | — | medidos no destino | sem tela própria |
| Erro 404 | (Apache) | — | 1 | fora do sistema; ver exceções |

Componentes compartilhados: `nav.js`/`nav.css` (menu-gaveta + trilha), `base.css`, `padrao.css` (formulários `.pd-*`), `chamados-comum.css`, `modal-ui`, `fx-ui`, `ui-upgrade`, `mobile-ui.js` (filtros recolhíveis), `graficos.js`, mapas (`mapa-*.js`, Leaflet), tabelas `.ch-tabela-rolagem` / `.tabela-scroll`, abas `.abas-pista`.

Não medidos (dependem de dados/ações reais): modal QR de contatos, diálogos de lançamento (`lancMotivoDialogo`, `lancPessoasDialogo`, `lancDiffDialogo`), modal de relatório do dashboard, toasts, listas longas com dados reais, passos do wizard de abrir chamado além do 1º.

## Resultado do diagnóstico (Chromium)
**O projeto já está bem encaminhado**: em todos os 10 viewports **nenhuma tela do sistema tem rolagem horizontal da página** (as únicas ocorrências: 404 do Apache em 375/412, e Contatos em 768 — 783 px > 768, botões `.btn-salvar`). Menu-gaveta existe e todos os 13 destinos abrem pelo menu e o fecham ao navegar.

### Impede o uso
- Nenhum encontrado. (Um revisor apontou a tabela de *Acompanhar chamado* como "impede uso": ela rola dentro do contêiner, mas sem indicação visual de rolagem — classifico como **prejudica**.)

### Prejudica
1. **Menu**: ESC não fecha a gaveta quando o foco está no ☰ (o `keydown` só é ligado dentro da gaveta, `nav.js:170`); sem foco preso e sem `inert` no fundo; itens do menu com 36 px de altura, ☰ 36×44, fechar 32×44, ícones de grupo 18×44, busca 36 px/14 px.
2. **Campos com fonte < 16 px** (14 px ou 13,5 px) em praticamente todas as telas — provoca zoom automático no iOS. Maior concentração: contatos (84 campos), dashboard-lançamento/pessoas, eleições, chamados.
3. **Textos < 12 px** (10–11,5 px) em todas as telas: rótulos de KPI (`.kpi-rot` 10 px, `.kpi-sub` 10,5 px), `th` das tabelas, `.sub`, botões "ver detalhes" (11,5 px), botões de tema/Admin (11 px), badges do organograma (7–10 px).
4. **Alvos de toque < 44 px**: `.tipo-btn` (Barras/Tabela, 32×43), `.painel-link` (87×43), `.senha-mostrar` 36×44, `#temaBtn` 35×44, `.home-atalho` 40 px, botões primários de cadastro 40 px, `.input-tel` 34 px; organograma: nós de 13–28 px.
5. **Tabelas sem indicação de rolagem interna** (Acompanhar chamado, Cadastros fiscais/auxiliares, DEAGRO registros): cabeçalhos cortados na borda sem sombra/dica; mensagens vazias truncadas.
6. **Abas horizontais cortadas** sem dica de rolagem (Cadastros auxiliares, dashboard, DEAGRO).
7. **Mapas** (Acre, bairros): rótulos ilegíveis, sem zoom/toque explícito; texto "lista à esquerda" que só vale no desktop (Eleições › Resultados).
8. **Filtros longos** (Logs 7 selects em coluna; Chamados 4 selects + 4 botões) empurram os resultados para muito abaixo — Início já usa filtro recolhível (`mobile-ui.js`) nos painéis; falta nas demais.
9. **Organograma**: barra de ferramentas em 3 linhas (~350 px); zoom inicial 20% ilegível; nós minúsculos (canvas com pan/pinch — proposta abaixo).
10. **Selects do dashboard › Lançamento** com texto cortado; placeholders de busca cortados ("…ou téc", "…nome ou set").
11. **Listas gigantes sem paginação**: Portarias (43.862 px), Contatos (32.234 px), DEAGRO › Atividade (71.102 px).
12. **Contatos em 768 px**: rolagem horizontal da página (`button.btn-salvar`).
13. **Erro JS no Início** (`Cannot read properties of null (reading 'appendChild')`) — fora de responsividade, só anotado.

### Cosmético
Abas trocadas com vazios grandes abaixo (ins-dia, DEAGRO abas); cabeçalhos de KPI com quebras desiguais; "+" duplicado em "+ Novo relatório"; botão Sair colado à borda em Trocar senha; cards com alturas desiguais; alertas de status sem ação.

### Fora do escopo de responsividade (só anotado)
- Texto de ajuda em *Usuários* mostra a senha padrão inicial.
- Erro JS no Início (acima).
- `!important` já presente em vários CSS (não será ampliado).

## Decisões que preciso de você
1. **Organograma**: manter o canvas com pan/pinch e melhorar (zoom inicial que caiba, barra em uma linha rolável, alvos maiores nos nós ao selecionar) — *recomendado* — ou oferecer uma visão em lista/árvore no celular?
2. **Tabelas**: proponho cards empilhados no celular para *Acompanhar chamado* e *Cadastros* (poucas colunas) e rolagem interna com sombra de borda para *DEAGRO registros* e a tabela do dashboard. Ok?
3. **Tamanho mínimo de texto 12 px**: KPIs/`th` sobem de 10–11,5 para 12 px; pode alterar levemente a densidade visual no desktop? (Proponho restringir a mudança a `max-width: 900px` para não mexer no desktop.)
4. **Paginação/"carregar mais"** para Portarias, Contatos e DEAGRO › Atividade no celular (é mudança de comportamento de interface, não de dados). Aprova?
5. **WebKit**: consigo instalar se a rede liberar o download do Playwright; senão a validação Safari fica como pendência.

## Plano de correção (após o OK)
1. Base global: `font-size:16px` em `input/select/textarea` ≤ 900 px, quebra de palavras, mídia fluida, `100vh`→`100dvh` (`admin-auth`, `chamados*`, `contatos`, `dashboard`, `index`, `organograma`), `env(safe-area-inset-*)` em fixos.
2. Menu: ESC global, foco preso + `inert`, alvos ≥ 44 px, busca 16 px.
3. Componentes: tabelas (cards / rolagem com sombra), abas com fade/setas, filtros recolhíveis (Logs, Chamados, Eleições), botões/segmentados ≥ 44 px, modais/diálogos cheios na tela pequena, mapas com dica e zoom.
4. Telas: Contatos (768 px, campos), Organograma, Dashboard lançamento, Lançamento-editar (botão voltar), demais itens acima.
5. Validação: rerodar Chromium + WebKit, comparar desktop com baseline, adicionar teste permanente de overflow.

## Arquivos criados até agora
`auditoria-mobile/{package.json,auditar.js,.gitignore,relatorio-antes-chromium.*}`, `AUDITORIA_MOBILE.md`. Nenhum arquivo do sistema foi alterado. Capturas (git-ignoradas): `auditoria-mobile/capturas/antes/chromium/<viewport>/<tela>.png` (baseline desktop: `1366x768` e `1920x1080`).
