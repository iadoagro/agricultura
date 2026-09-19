# Central de Chamados (suporte de TI)

Substitui o antigo "Chamados" (lista de conferência de portarias). Tem três telas:

| Tela | Arquivo | Quem usa | Login |
|---|---|---|---|
| Abrir chamado | `pages/abrir-chamado.html` | qualquer funcionário | não |
| Acompanhar chamados | `pages/acompanhar-chamado.html` | todos: lista de todos os chamados de todos os setores | não |
| Fila de atendimento | `pages/chamados.html` | equipe de TI | sim (permissão **Chamados**) |
| Cadastros auxiliares | `pages/cadastros-chamados.html` | equipe de TI | sim (permissão **Chamados**) |

## Ativar

1. No SQL Editor do mesmo projeto Supabase, rode `database/chamados.sql` (depois de
   `admin.sql`, que define `admin_solicitacoes`). É idempotente: pode rodar de novo.
2. Em **Acessos** (módulo do responsável), marque **Chamados** para cada pessoa da equipe
   de TI. O responsável (`root@root.com`) já vê tudo.
3. Compartilhe com os funcionários o link de `abrir-chamado.html` (a fila tem o botão
   **Link para usuários**, que copia esse endereço). A tela de login também ganhou links
   para abrir e acompanhar chamado.

Sem o passo 1 as telas mostram: *"O módulo de chamados ainda não foi instalado no banco"*.
Sem `js/banco-config.js` preenchido elas funcionam em **modo demonstração** (dados só no
navegador, com uma faixa avisando) — bom para conhecer a tela, não para uso real.

## Cadastros auxiliares

Em **Chamados > Cadastros auxiliares** a equipe mantém as listas que aparecem como seleção no
formulário de abertura:

- **Problemas** (com categoria, que define o ícone e o agrupamento na lista). O SQL já
  cadastra 24 problemas comuns; o botão *Carregar problemas sugeridos* repõe os que faltarem.
- **Diretorias > Departamentos > Setores** (cada setor pertence a um departamento, e cada
  departamento a uma diretoria). No formulário a ordem é **Nome, Setor, Departamento e
  Diretoria**, e basta escolher **um dos três** (um departamento ou uma diretoria também podem
  abrir chamado). Escolher o setor preenche e **bloqueia** o departamento e a diretoria dele;
  escolher só o departamento preenche e bloqueia a diretoria; escolher só a diretoria filtra as
  listas de baixo. Para mudar um campo bloqueado, limpe ("Selecione…") o nível de baixo.

Comportamento do formulário: se um nível ainda não tem nenhum cadastro, o campo vira texto
livre (o formulário nunca trava) — é o que aparece até você cadastrar as diretorias,
departamentos e setores. Os problemas aparecem como quadradinhos: os 10 primeiros, um
quadrado "Mostrar mais" e um quadrado "Outro" para o que não está na lista. A tela cabe
na altura da janela sem rolagem (a partir de 900 x 560 px). **Desativar** tira o item do formulário sem perder nada;
**Excluir** só é permitido se nada estiver ligado a ele. O chamado guarda o *nome* escolhido,
então renomear ou excluir um cadastro não altera chamados antigos. A fila ganhou filtro por
diretoria e mostra diretoria, departamento e problema no detalhe e no CSV.

## Como funciona

- **Sem código para o usuário**: quem abre o chamado não vê nem digita código. Ao enviar, é
  levado para a lista de acompanhamento, onde o chamado aparece destacado com a marca **MEU**.
  Por baixo, o chamado tem um código secreto (`CH-XXXXX-XXXXX`) guardado só no navegador de
  quem abriu: é ele que autoriza **responder** à equipe e **avaliar**. Os demais chamados da
  lista são somente leitura. (Trocar de navegador ou limpar os dados do site faz o chamado
  deixar de ser "meu" — ele continua na lista, só sem o botão de responder.)
- **O que a lista pública mostra**: número, data, nome abreviado ("Paulo R."), diretoria >
  departamento > setor, problema, situação e atendente; ao clicar, a descrição, o histórico
  público e as etapas. **Nunca** e-mail, telefone, notas internas nem o código secreto.
  Atenção: como não há login, *qualquer pessoa com o link vê os chamados de todos os setores*.
  O formulário avisa para não escrever senhas na descrição. Se isso for um problema, ponha
  as páginas atrás de uma rede interna/VPN.
- **Fluxo**: Aberto → Em atendimento → (Aguardando resposta) → Resolvido → Fechado.
  Se o solicitante responde a um chamado "aguardando" ou "resolvido", ele volta para
  "em atendimento". Depois de resolvido, o usuário pode avaliar de 1 a 5.
- **Prazo (SLA)** por prioridade: crítica 4 h, alta 8 h, média 24 h, baixa 72 h. O
  formulário público só oferece baixa/média/alta (pelo impacto relatado); a equipe pode
  elevar para crítica. Trocar a prioridade recalcula o prazo a partir da abertura.
- **Equipe**: assumir, mudar situação/prioridade, atribuir a alguém, responder ao usuário
  ou anotar internamente, filtrar, ver em lista ou quadro e exportar CSV (Excel).

## Segurança

- Tabelas com RLS ligado. `chamados` e `chamados_eventos` **não** têm acesso direto para `anon`:
  o público só chama as funções `abrir_chamado`, `consultar_chamado`, `responder_chamado` e
  `avaliar_chamado`, mais `listar_chamados_publico` e `detalhe_chamado_publico` (somente leitura,
  sem dados de contato). Só `chamados_aux` (as listas, sem dado sigiloso) é legível pelo público, e
  apenas os itens ativos; alterar exige a permissão Chamados.
- A equipe lê pelas policies (`pode_chamados()`) e escreve só por `chamado_atualizar`,
  que registra no histórico quem fez cada mudança (o nome vem do login, não do navegador).
- `abrir_chamado` valida tamanhos e categorias e limita abuso (8 chamados/hora por
  nome+setor e 300/hora no total). Não há CAPTCHA: se a URL pública circular fora da
  empresa, considere colocá-la atrás de uma rede interna/VPN.
- Todo texto digitado pelo usuário é exibido como texto (nunca como HTML) na fila.

Teste de sanidade depois de instalar (deve vir vazio ou negado, nunca os chamados):

    curl "$URL/rest/v1/chamados?select=*" -H "apikey: $CHAVE_PUBLISHABLE"
