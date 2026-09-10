# Supabase do MaisCtrl

Este diretório contém as migrations necessárias para recriar o banco do MaisCtrl no projeto Supabase novo.

## Estado conferido

- O arquivo `C:\Users\Gabriel Morgado\Downloads\maisctrl-database-schema.md` foi comparado com as migrations locais.
- As migrations cobrem as tabelas descritas no documento, além de `push_devices` e suas políticas para o app mobile.
- A ordem correta é a ordem lexicográfica dos nomes dos arquivos dentro de `supabase/migrations`.
- O banco remoto ainda precisa ser conferido pelo proprietário do projeto, porque a conta usada neste ambiente não tem permissão de administração nesse projeto.

## Aplicação

1. Abra o projeto com referência `wdmkzljxjjjvzofrpeuk` no painel do Supabase.
2. Abra o SQL Editor ou conecte o Supabase CLI ao projeto.
3. Execute todas as migrations de `supabase/migrations` em ordem, sem pular as correções posteriores de RLS.
4. Confirme que as tabelas, enums, funções, triggers, buckets e policies foram criados.
5. Gere os tipos TypeScript novamente depois de aplicar o schema, se o schema remoto for diferente do local.

Não coloque `service_role`, senha do banco ou qualquer segredo em `.env` do cliente, no APK ou no GitHub Actions como variável pública. O app deve usar somente a URL e a chave publicável.

## Verificação mínima

Depois da aplicação, confirme:

- criação de usuário gera `profiles` e `user_subscriptions`;
- leitura e escrita de `subscriptions` ficam isoladas pelo usuário autenticado;
- tabelas compartilhadas respeitam proprietário e participante;
- `push_devices` aceita apenas o próprio usuário;
- o bucket de avatar e suas policies estão ativos;
- nenhum advisor de segurança acusa tabela exposta sem RLS.

Se o painel continuar redirecionando para a tela de organizações, convide a conta usada no Codex como membro do projeto ou aplique as migrations diretamente pelo SQL Editor da sua sessão. Depois disso, o app já está preparado para usar o mesmo schema.
