# MaisCtrl — passo a passo do Supabase

Este guia mostra tudo o que precisa ser feito no projeto Supabase novo para o app mobile funcionar com dados reais.

Projeto esperado:

- Referência: wdmkzljxjjjvzofrpeuk
- URL: https://wdmkzljxjjjvzofrpeuk.supabase.co
- Migrations: supabase/migrations

## 1. O que já está preparado

- O mobile já usa a URL e a chave publicável do projeto novo.
- As migrations locais foram comparadas com o maisctrl-database-schema.md.
- O diretório contém tabelas, enums, funções, triggers, policies e tokens de push Android.
- O cliente mobile não usa service_role.
- O google-services.json já está configurado no Android.

## 2. O que nunca deve ser enviado pelo chat

Não envie:

- service_role ou secret key do Supabase;
- senha do banco;
- CRON_SECRET;
- JSON da conta de serviço do Firebase;
- keystore, senha ou chave privada da Play Store.

Esses valores só devem ser usados no terminal local, no painel do Supabase ou como GitHub Secrets.

## 3. Dar acesso ao projeto

Você pode usar seu próprio terminal, sem compartilhar nenhuma chave, ou convidar um colaborador:

1. Abra o projeto novo no Supabase.
2. Entre em Settings → Team / Access Control.
3. Clique em Invite member.
4. Convide o e-mail da conta que deverá administrar o projeto.
5. Use Developer para acesso ao conteúdo do projeto; use Administrator somente se também precisar alterar configurações.
6. Aceite o convite.

Veja a documentação de [Access Control](https://supabase.com/docs/guides/platform/access-control).

## 4. Instalar e autenticar a CLI

Instale a CLI seguindo a [documentação oficial](https://supabase.com/docs/guides/cli/getting-started). Depois confira os comandos disponíveis:

~~~powershell
supabase --help
supabase db --help
supabase functions --help
~~~

Faça login:

~~~powershell
supabase login
~~~

Não cole o token de acesso no chat.

## 5. Vincular o repositório

~~~powershell
cd "C:\Users\Gabriel Morgado\Documents\mais ctrl app\mais-ctrl-mobile"
supabase link --project-ref wdmkzljxjjjvzofrpeuk
~~~

Quando a CLI pedir a senha do banco, informe-a somente no terminal.

Confira o histórico antes de alterar:

~~~powershell
supabase migration list
~~~

Se já houver tabelas ou migrations no banco novo, pare e faça uma revisão antes de continuar.

## 6. Aplicar todas as migrations

O comando recomendado é:

~~~powershell
supabase db push
~~~

As migrations serão aplicadas na ordem dos nomes dos arquivos. Não use supabase db reset no projeto remoto: ele é para banco local e pode apagar dados.

Veja [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations).

## 7. Conferir o schema

No SQL Editor do projeto, execute consultas de conferência:

~~~sql
select count(*) as public_tables
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
~~~

Todas as tabelas expostas ao cliente devem ter rowsecurity = true e policies coerentes com o usuário autenticado.

## 8. Conferir Auth

No painel do Supabase:

1. Abra Authentication → Providers.
2. Mantenha Email habilitado.
3. Defina se a confirmação de e-mail será obrigatória.
4. Em Authentication → URL Configuration, use https://mais-ctrl.vercel.app como Site URL.
5. Em Redirect URLs, autorize https://mais-ctrl.vercel.app/dashboard e maisctrl://auth/callback.
6. Crie uma conta de teste.

O cadastro deve criar o usuário em auth.users e os registros de apoio em profiles e user_subscriptions pelos triggers.

## 9. Conferir Storage de fotos

1. Abra Storage.
2. Confirme o bucket de avatares.
3. Confirme que o usuário só lê e altera o próprio caminho.
4. Teste JPG, PNG e WEBP.
5. Teste uma foto acima de 5 MB; o app deve rejeitá-la antes do upload.

## 10. Publicar a função de push

Na pasta do mobile:

~~~powershell
cd "C:\Users\Gabriel Morgado\Documents\mais ctrl app\mais-ctrl-mobile"
supabase functions deploy send-push-notifications --project-ref wdmkzljxjjjvzofrpeuk --no-verify-jwt
~~~

A função usa o header privado x-cron-secret; sem ele, retorna 403.

Configure nos secrets da Edge Function:

- CRON_SECRET;
- FCM_SERVICE_ACCOUNT_JSON;
- SUPABASE_SERVICE_ROLE_KEY;
- APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY e APNS_ENVIRONMENT apenas quando iOS entrar no escopo;
- APNS_BUNDLE_ID como com.maisctrl.app quando iOS for ativado.

O service_role pode existir somente como secret interno da Edge Function. Nunca coloque-o no React, APK, .env público ou GitHub Variables.

## 11. Agendar o push

A função deve ser chamada em:

~~~text
https://wdmkzljxjjjvzofrpeuk.supabase.co/functions/v1/send-push-notifications
~~~

Headers obrigatórios:

~~~http
x-cron-secret: <mesmo valor de CRON_SECRET>
Content-Type: application/json
~~~

Agende uma execução diária, de preferência às 8h de Brasília. Se usar pg_cron, mantenha o segredo fora do SQL versionado; um agendador externo com secret também é válido.

## 12. Validar segurança

Crie dois usuários de teste e confirme:

1. A não lê nem altera dados de B.
2. B não lê nem altera dados de A.
3. Participantes só acessam o espaço compartilhado correto.
4. Usuário comum não acessa tabelas administrativas.
5. push_devices só aceita o próprio user_id.
6. push_notification_deliveries não fica aberto para anon ou authenticated.
7. O bucket de avatar não permite acesso arbitrário.

Depois execute os [Database Advisors](https://supabase.com/docs/guides/database/database-advisors).

## 13. Testar o app com dados reais

1. Instale o APK no Android.
2. Crie uma conta.
3. Confirme o e-mail, se estiver habilitado.
4. Saia e entre novamente.
5. Crie, edite, marque como paga e exclua uma assinatura.
6. Escolha uma foto de perfil.
7. Feche e reabra o app.
8. Ative notificações locais.
9. Confira o token em push_devices.
10. Teste o push remoto somente depois de configurar a função e o agendamento.

## 14. Problemas comuns

### 401 Invalid API key

Confirme que URL e chave publicável pertencem ao mesmo projeto. A chave do cliente deve ser publicável/anon, nunca service_role.

### permission denied

A conta atual não tem acesso ao projeto. Entre com a conta correta ou convide o colaborador pela equipe.

### Histórico divergente no db push

Não force a correção. Rode supabase migration list, confira o schema remoto e faça backup antes de qualquer reparo.

### Tabela existe, mas o app não consulta

Confira separadamente: exposição na Data API, GRANT do papel correto e policy de RLS. RLS não substitui a exposição da tabela.

## 15. Critério de concluído

O Supabase estará pronto quando:

- migrations aplicadas sem erro;
- tabelas, enums, funções e triggers presentes;
- todas as tabelas públicas com RLS;
- Auth criar o perfil automaticamente;
- Storage aceitar somente arquivos autorizados;
- app persistir assinaturas e perfil;
- push registrar dispositivos;
- Edge Function enviar uma notificação de teste;
- Advisors sem falhas críticas.
