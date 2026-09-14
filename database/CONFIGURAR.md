# Banco compartilhado de Fiscais (antes "Eleições")

A integração está preparada para Supabase, mas ainda não existe um projeto conectado. Até preencher a configuração, o sistema continua no modo local.

## Ativar

1. Crie sua conta em https://supabase.com/dashboard e um projeto. Confira as condições do plano escolhido antes de confirmar. Guarde a senha do banco fora do código.
2. No SQL Editor, execute nesta ordem: `database/eleicoes.sql` (cria as tabelas de cadastro), `database/admin.sql` (cria o login com aprovação) e `database/fiscais-acesso.sql` (libera os cadastros de Fiscais para quem for aprovado com essa página em Acessos). Os três podem ser executados de novo sem problema se precisar corrigir algo.
3. Em Connect / API Keys, copie a Project URL e a chave **publishable** (`sb_publishable_...`). Preencha `js/banco-config.js`. A chave publicável pode estar no navegador porque as permissões são verificadas pelo banco. Nunca use uma chave secret/service_role ou a senha do banco nesse arquivo.
4. Siga `database/CONFIGURAR-ADMIN.md` para criar a conta do responsável e aprovar quem precisa de acesso. Quem for aprovado com a página **Fiscais** marcada em **Acessos** já vê os cadastros automaticamente ao abrir a página — não existe mais um login separado dentro dela.
5. Para levar os dados anteriores, use **Importar cadastros deste navegador** no navegador e endereço onde foram criados, depois de configurar o banco nessa mesma cópia do site. Dados de arquivo local, localhost e GitHub Pages pertencem a armazenamentos diferentes. A importação mantém a cópia local e é repetível: o mesmo registro e suas duplicatas idênticas recebem identificadores estáveis.
6. Publique os arquivos atualizados na hospedagem do site quando a conexão estiver validada. O Supabase armazena os dados; a hospedagem serve as páginas. Não é obrigatório migrar para Vercel. Os endpoints PHP de outros módulos não são alterados por esta integração.

## Operação

- Os aprovados com Fiscais liberado compartilham a mesma base. Use **Atualizar cadastros** para buscar mudanças feitas por outra pessoa. Não há atualização em tempo real automática.
- A sessão é a mesma do login do site (ver `database/CONFIGURAR-ADMIN.md`) e exige novo login após expirar. Nenhuma senha é persistida pelo aplicativo.
- Sem conexão ou sem autorização, o sistema informa a falha e conserva o formulário. Não salva silenciosamente no navegador quando configurado para o banco.
- Não há permissão de exclusão/alteração de registros pelo aplicativo. Quem tem acesso é definido em **Acessos**, só o responsável mexe lá.
- Os arquivos SQL e de configuração são preparados localmente. As políticas precisam ser executadas e verificadas no projeto real antes do uso em produção.

Documentação: https://supabase.com/docs/guides/auth/passwords e https://supabase.com/docs/guides/database/postgres/row-level-security
