# Login de Admin com aprovação e controle de acesso

Usa o mesmo projeto Supabase de `database/eleicoes.sql` (a URL e a chave em
`js/banco-config.js` já servem para os dois). Qualquer pessoa pode criar uma
conta pela tela de login, mas só tem acesso liberado depois que
**luansobraldourado5@gmail.com** aprova o cadastro — e só enxerga as páginas
que ela liberar pra essa pessoa (por padrão, Fiscais e Dashboards).

O login agora é exigido em **todas** as páginas do site, não só nas que
antes ficavam escondidas na tela inicial.

## Ativar

1. No SQL Editor do projeto, execute nesta ordem: `database/admin.sql`,
   `database/admin-usuarios.sql` e (se ainda não rodou) `database/fiscais-acesso.sql`.
   Todos podem rodar de novo sem problema. Se alguma tela mostrar **"O banco
   não concluiu a operação"**, é sinal de que algum desses ainda não rodou
   nesse projeto — rode de novo e veja se o SQL Editor mostra erro em vermelho.
2. Em Authentication > Providers > Email, confira se **Confirm email** está
   como você quer:
   - Ligado (padrão): quem se cadastra precisa clicar no link do e-mail
     antes de conseguir entrar. Fica como uma segunda verificação, além da
     aprovação.
   - Desligado: o cadastro já entra direto (ainda pendente de aprovação).
3. Abra a página inicial (ela vai te mandar direto pra tela de login) e
   cadastre a conta com o e-mail **luansobraldourado5@gmail.com** e uma
   senha. Esse e-mail é reconhecido pelo código como o responsável — não
   precisa de aprovação, de liberação de página nem de estar "ativo" pra
   ele mesmo, sempre vê tudo.
4. Se "Confirm email" estiver ligado, confirme pelo e-mail recebido.
5. Para Excluir usuário e Editar e-mail (dentro do módulo Usuários), copie
   `admin_config.example.php` para `admin_config.php` (mesma pasta) e
   preencha com a Project URL e a chave **service_role** do seu projeto
   (Project Settings > API — é a chave de acesso total, bem diferente da
   publishable). `admin_config.php` já está no `.gitignore`: nunca vai pro
   git, fica só no seu servidor. Sem esse arquivo, o resto do login/aprovação
   funciona normalmente — só Excluir e Editar e-mail ficam indisponíveis.
6. Entre com a conta do responsável. O acesso já fica liberado e aparecem
   dois módulos a mais na tela inicial, só pra você:
   - **Usuários** — cadastra gente diretamente (já aprovada, sem passar
     pela fila), aprova ou recusa quem se cadastrou sozinho, ativa/desativa
     o acesso de quem já foi aprovado, reenvia e-mail de redefinição de
     senha, edita o e-mail de uma conta ou exclui ela de vez.
   - **Acessos** — pra cada pessoa, escolhe quais páginas (Fiscais,
     Portarias, Organograma, Chamados, Dashboards, Contatos) ela pode ver.
     Toda conta nova começa só com Fiscais e Dashboards marcados.
7. Para cada pessoa que precisa de acesso, ou você cadastra direto em
   **Usuários**, ou ela cria a própria conta na tela de login e fica
   pendente até você aprovar.

## Operação

- A aprovação e o controle de acesso são só seus: a política do banco só
  deixa luansobraldourado5@gmail.com ler a lista completa e mudar status,
  páginas ou o "ativo" de qualquer conta.
- Recusar um cadastro não apaga a conta, só marca como recusada — a pessoa
  pode ser aprovada depois se mudar de ideia. **Desativar** é diferente de
  recusar: serve pra tirar o acesso de alguém já aprovado sem perder a
  aprovação nem as páginas liberadas — reativar depois não exige aprovar
  de novo.
- **Redefinir senha** manda um e-mail de redefinição pro próprio usuário
  (o app nunca vê nem define a senha dele diretamente).
- **Excluir** e **Editar e-mail** mexem direto no Supabase Authentication
  e por isso passam pelo servidor (`admin_usuarios.php`, com a service_role
  guardada em `admin_config.php`) — nunca pelo navegador.
- Digitar a URL de uma página diretamente (sem passar pelo card na tela
  inicial) não burla o controle: cada página confere de novo se a conta
  está aprovada, ativa, e se aquela página está entre as liberadas pra ela.
- A sessão vale só na aba e exige novo login depois que expira. Nenhuma
  senha fica salva pelo aplicativo.
- Quem é aprovado com **Fiscais** marcado em Acessos já vê os cadastros
  dessa página assim que abre — sem pedir login de novo lá dentro, porque
  é a mesma sessão. Isso depende de `database/fiscais-acesso.sql` (ver
  `database/CONFIGURAR.md`).
- Isso não muda os Admins do dashboard nem do organograma (edição de
  conteúdo), que continuam com a senha própria de cada página.
