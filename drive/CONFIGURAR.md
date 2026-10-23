# Anexos na pasta PRIVADA do Google Drive

Todo arquivo enviado pelo sistema (documento e termo da VPN, chamado, ficha em PDF da Mecanização) vai para a
pasta do Drive, em vez do Storage do Supabase. No banco, o caminho passa a ser `drive:<id do arquivo>`.
Caminhos antigos continuam abrindo pelo Storage até serem migrados.

Dentro da pasta fica **IADOAGRO**, e dentro dela uma pasta para cada parte do sistema:

```
IADOAGRO/
  VPN/          Documentos, Termos assinados, Chamados, Termos preenchidos
  Mecanização/  Fichas em PDF
  Portarias/    2023, 2024, 2025, 2026
```

A pasta é **privada** (só a conta dona). Quem lê e escreve é a ponte `drive/upload-drive.gs`, um Apps Script que roda
como o dono e só atende pedidos do sistema:

| Quem pede | Pode |
|---|---|
| Servidor (função do Supabase / script de migração), com o SEGREDO | enviar, ler, excluir |
| Equipe logada (token da sessão, conferido no Supabase) | enviar, ler; excluir só na área VPN, que exige a permissão de VPN (`pode_vpn`) |
| Formulário público da VPN | só **enviar** documento e termo da VPN, e só com o link ativo e a senha certa |

## 1. Publicar a ponte (uma vez, na conta dona da pasta)
1. Abra https://script.google.com > **Novo projeto**.
2. Cole o conteúdo de **`drive/upload-drive.local.gs`** (é o mesmo `upload-drive.gs` já com o SEGREDO; esse arquivo não vai para o git).
3. No editor, escolha a função **`configurar`** e clique em Executar (autorize o acesso ao Drive). Ela tira o compartilhamento público da pasta.
4. **Implantar > Nova implantação > Aplicativo da Web**: *Executar como* **Eu**; *Quem tem acesso* **Qualquer pessoa**
   (o acesso à pasta continua restrito: quem decide é o código, que confere o segredo ou a sessão).
5. Copie a URL que termina em `/exec`.

Ao mudar o código depois: **Implantar > Gerenciar implantações > Editar > Nova versão** (a URL continua a mesma).

## 2. Ligar o sistema à URL
- `js/banco-config.js`: `driveUrl: 'https://script.google.com/macros/s/.../exec'`.
- Função do Supabase (PDF da Mecanização): `npx supabase secrets set DRIVE_URL=<URL> DRIVE_SEGREDO=<SEGREDO>` e
  `npx supabase functions deploy lancar-mecanizacao`.

## 3. Migrar o que já existe
```
node tools/migrar_para_drive.cjs <URL /exec> --segredo=<SEGREDO> --simular            # só conta
node tools/migrar_para_drive.cjs <URL /exec> --segredo=<SEGREDO>                      # copia para o Drive e troca os caminhos no banco
node tools/migrar_para_drive.cjs <URL /exec> --segredo=<SEGREDO> --apagar-originais   # depois de conferir: libera o espaço no Storage
```
Também envia `portarias/` e `termos-vpn/` (use `--sem-repo` para pular). As páginas continuam lendo esses PDFs
da pasta do projeto; no Drive ficam como cópia.

## Limites e cuidados
- Até 5 MB por arquivo; só PDF, JPG e PNG (o conteúdo é conferido, não só a extensão).
- A URL da ponte aparece no código das páginas. Sem sessão da equipe, SEGREDO ou formulário público aberto, ela recusa tudo.
- Enquanto o link público da VPN estiver ativo, qualquer pessoa consegue **enviar** (nunca ler) documento de até 5 MB.
- Excluir pela tela da VPN manda o arquivo para a **lixeira** do Drive (recuperável por 30 dias).
- Ler um arquivo passa pela ponte (o Apps Script devolve o conteúdo e a página monta o arquivo); por isso o limite de 5 MB.
