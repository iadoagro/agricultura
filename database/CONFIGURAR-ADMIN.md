# Login de Admin com aprovação e controle de acesso

Usa o mesmo projeto Supabase de `database/eleicoes.sql` (a URL e a chave em
`js/banco-config.js` já servem para os dois). O login de todo mundo, exceto
**luansobraldourado5@gmail.com**, é `nome.sobrenome` com uma senha — sem
e-mail de verdade. Qualquer pessoa pode criar a própria conta pela tela de
login informando Nome, Sobrenome e senha, mas só tem acesso liberado depois
que luansobraldourado5@gmail.com aprova o cadastro — e só enxerga as
páginas que ela liberar pra essa pessoa (por padrão, Fiscais e Dashboards).

O login agora é exigido em **todas** as páginas do site, não só nas que
antes ficavam escondidas na tela inicial.

## Ativar

1. No SQL Editor do projeto, execute nesta ordem: `database/admin.sql`,
   `database/admin-usuarios.sql`, `database/admin-troca-senha.sql` e (se
   ainda não rodou, ou pra pegar a política nova de editar cadastros)
   `database/fiscais-acesso.sql`. Todos podem rodar de novo sem problema.
   Se alguma tela mostrar **"O banco não concluiu a operação"**, é sinal de
   que algum desses ainda não rodou nesse projeto — rode de novo e veja se
   o SQL Editor mostra erro em vermelho.
2. Crie a conta do responsável direto no Supabase, já que a tela de login
   do site só cadastra contas `nome.sobrenome` (sem e-mail de verdade) —
   luansobraldourado5@gmail.com precisa ser uma exceção de propósito. Em
   **Authentication > Users**, clique em **Add user** (ou **Invite**),
   informe o e-mail **luansobraldourado5@gmail.com**, defina uma senha e
   marque **Auto Confirm User** (assim não depende de e-mail de
   confirmação nenhum). Esse e-mail exato é reconhecido pelo código como o
   responsável — não precisa de aprovação, de liberação de página nem de
   estar "ativo" pra ele mesmo, sempre vê tudo. Se essa conta já existe
   (você já configurou antes), pule este passo.
3. O módulo **Usuários** e o autocadastro pela tela de login criam contas
   pela API administrativa do Supabase (pra não depender de e-mail de
   confirmação, já que `nome.sobrenome` não recebe e-mail nenhum), então
   `admin_config.php` é obrigatório pro cadastro funcionar, não só pra
   Excluir/Editar login. Copie `admin_config.example.php` para
   `admin_config.php` (mesma pasta) e preencha com a Project URL e a chave
   **service_role** do seu projeto (Project Settings > API — é a chave de
   acesso total, bem diferente da publishable). `admin_config.php` já está
   no `.gitignore`: nunca vai pro git, fica só no seu servidor.
4. **Configure um SMTP próprio antes de usar de verdade** (ver seção
   "E-mail (SMTP)" abaixo) — vale só pra conta do responsável, que usa
   e-mail de verdade; ainda assim evita esbarrar em **"429: email rate
   limit exceeded"** ao usar Redefinir senha nela.
5. Entre com a conta do responsável (e-mail e senha do passo 2). O acesso
   já fica liberado e aparecem dois módulos a mais na tela inicial, só
   pra você:
   - **Usuários** — cadastra gente direto informando **Nome** e
     **Sobrenome** (o login vira `nome.sobrenome`) com a senha padrão
     `123456`; a pessoa é obrigada a trocá-la no primeiro acesso. Também
     aprova/recusa quem se cadastrou sozinho, ativa/desativa o acesso de
     quem já foi aprovado, edita o login de uma conta ou exclui ela de
     vez. **Redefinir senha** não se aplica a essas contas (sem e-mail de
     verdade) — pra isso, exclua e cadastre de novo, ou peça pra pessoa
     entrar em contato.
   - **Acessos** — pra cada pessoa, escolhe quais páginas (Fiscais,
     Portarias, Organograma, Chamados, Dashboards, Contatos) ela pode ver.
     Toda conta nova começa só com Fiscais e Dashboards marcados.
6. Para cada pessoa que precisa de acesso, ou você cadastra direto em
   **Usuários**, ou ela mesma cria a própria conta (Nome, Sobrenome,
   senha) na tela de login e fica pendente até você aprovar.

## E-mail (SMTP)

Por padrão o Supabase manda os e-mails de confirmação de cadastro e de
redefinição de senha pelo serviço de e-mail dele mesmo, que tem um limite
bem baixo (poucos e-mails por hora) — de propósito, para não virar spam.
Pra usar isso de verdade, configure um SMTP próprio, usando o Gmail de
luansobraldourado5@gmail.com:

1. Em https://myaccount.google.com/security, ligue a **Verificação em
   duas etapas** (obrigatório pro próximo passo), se ainda não estiver.
2. Em https://myaccount.google.com/apppasswords, crie uma **senha de
   app** (nome sugerido: "Supabase"). O Google mostra uma senha de 16
   letras — copie na hora, não aparece de novo depois.
3. No Supabase, vá em **Project Settings > Authentication** (ou
   **Authentication > Settings**, dependendo da versão) e ache a seção
   **SMTP Settings**. Ligue **Enable Custom SMTP** e preencha:
   - Sender email: `luansobraldourado5@gmail.com`
   - Sender name: `SISTEMA` (ou o nome que quiser que apareça)
   - Host: `smtp.gmail.com`
   - Port: `587`
   - Username: `luansobraldourado5@gmail.com`
   - Password: a senha de app de 16 letras do passo 2 (não é a senha
     normal da conta Google)
4. Salve. Teste cadastrando um e-mail novo ou clicando em Redefinir senha
   em Usuários — o e-mail deve chegar sem cair no limite de antes (o
   Gmail aguenta ~500 e-mails/dia, bem mais que suficiente aqui).

Se preferir outro provedor (Resend, SendGrid, Mailgun etc.) o processo é
parecido, só troca host/porta/usuário/senha pelos do provedor escolhido —
mas a maioria exige verificar um domínio próprio pra mandar pra qualquer
destinatário, não só pra você mesmo.

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
  (o app nunca vê nem define a senha dele diretamente) — só funciona pra
  luansobraldourado5@gmail.com, a única conta com e-mail de verdade.
- **Login por usuário:** todo mundo entra com `nome.sobrenome` (sem "@" nem
  domínio) no mesmo campo de e-mail da tela de login — o app completa por
  baixo dos panos. Só luansobraldourado5@gmail.com usa o e-mail de verdade.
- **Cadastrar** (autocadastro e o formulário em Usuários), **Excluir** e
  **Editar login** mexem direto no Supabase Authentication e por isso
  passam pelo servidor (`admin_usuarios.php`, com a service_role guardada
  em `admin_config.php`) — nunca pelo navegador. O autocadastro só aceita
  logins no formato `nome.sobrenome@sistema.local` (o domínio fixo que o
  app usa por baixo dos panos) — não dá pra usar essa rota pra criar conta
  com e-mail arbitrário.
- **Troca de senha obrigatória:** toda conta criada em Usuários fica
  marcada pra trocar a senha; no próximo login ela cai direto numa tela de
  troca de senha antes de acessar qualquer outra página. Depende de
  `database/admin-troca-senha.sql`. Quem se cadastra sozinho pela tela de
  login já escolhe a própria senha, então não precisa trocar depois.
- Digitar a URL de uma página diretamente (sem passar pelo card na tela
  inicial) não burla o controle: cada página confere de novo se a conta
  está aprovada, ativa, e se aquela página está entre as liberadas pra ela.
- A sessão vale só na aba e exige novo login depois que expira. Nenhuma
  senha fica salva pelo aplicativo.
- Qualquer conta aprovada (e ativa) que abrir a página Fiscais já vê os
  cadastros de cara — sem pedir login de novo lá dentro, porque é a mesma
  sessão. O acesso aos dados não depende de "Fiscais" estar marcada em
  Acessos: essa marcação só controla se a página aparece como card e se a
  URL fica acessível pra ela; luansobraldourado5@gmail.com e toda conta
  aprovada sempre têm os dados liberados quando chegam lá. Isso depende de
  `database/fiscais-acesso.sql` (ver `database/CONFIGURAR.md`).
- Isso não muda os Admins do dashboard nem do organograma (edição de
  conteúdo), que continuam com a senha própria de cada página.
