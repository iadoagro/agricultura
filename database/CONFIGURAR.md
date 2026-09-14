# Banco compartilhado das eleições

A integração está preparada para Supabase, mas ainda não existe um projeto conectado. Até preencher a configuração, o sistema continua no modo local.

## Ativar

1. Crie sua conta em https://supabase.com/dashboard e um projeto. Confira as condições do plano escolhido antes de confirmar. Guarde a senha do banco fora do código.
2. No SQL Editor, execute o conteúdo de `database/eleicoes.sql` uma vez. Ele cria as tabelas e políticas de acesso.
3. Em Authentication > Users, crie uma conta de acesso com e-mail e senha. Copie seu User UID e execute no SQL Editor:

   ```sql
   insert into public.eleicoes_admins (user_id) values ('UUID-DA-CONTA');
   ```

   Repita somente para pessoas autorizadas. Não há inscrição pública na página. Contas autenticadas que não estão nessa tabela não têm acesso aos cadastros.
4. Em Connect / API Keys, copie a Project URL e a chave **publishable** (`sb_publishable_...`). Preencha `js/banco-config.js`. A chave publicável pode estar no navegador porque as permissões são verificadas pelo banco. Nunca use uma chave secret/service_role ou a senha do banco nesse arquivo.
5. Abra Eleições. Clique em **Entrar no banco online**, entre com a conta criada e teste salvar e consultar em outro navegador autorizado.
6. Para levar os dados anteriores, use **Importar cadastros deste navegador** no navegador e endereço onde foram criados, depois de configurar o banco nessa mesma cópia do site. Dados de arquivo local, localhost e GitHub Pages pertencem a armazenamentos diferentes. A importação mantém a cópia local e é repetível: o mesmo registro e suas duplicatas idênticas recebem identificadores estáveis.
7. Publique os arquivos atualizados na hospedagem do site quando a conexão estiver validada. O Supabase armazena os dados; a hospedagem serve as páginas. Não é obrigatório migrar para Vercel. Os endpoints PHP de outros módulos não são alterados por esta integração.

## Operação

- Os administradores autorizados compartilham a mesma base. Use **Atualizar cadastros** para buscar mudanças feitas por outra pessoa. Não há atualização em tempo real automática.
- A autenticação do banco é separada da senha de exibição do botão Admin da página inicial. Essa senha local não autoriza acesso ao banco.
- A sessão vale na aba e exige novo login após expirar. Nenhuma senha é persistida pelo aplicativo.
- Sem conexão ou sem autorização, o sistema informa a falha e conserva o formulário. Não salva silenciosamente no navegador quando configurado para o banco.
- Não há permissão de exclusão/alteração de registros pelo aplicativo. A lista de administradores só é mantida pelo responsável pelo projeto.
- Os arquivos SQL e de configuração são preparados localmente. As políticas precisam ser executadas e verificadas no projeto real antes do uso em produção.

Documentação: https://supabase.com/docs/guides/auth/passwords e https://supabase.com/docs/guides/database/postgres/row-level-security
