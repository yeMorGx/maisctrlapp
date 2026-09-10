# Push real do MaisCtrl

O código do app registra tokens nativos no Supabase e a Edge Function `send-push-notifications` envia os lembretes de renovação. A estrutura remota, a função e o agendamento do projeto `wdmkzljxjjjvzofrpeuk` já foram conferidos; falta registrar um aparelho real e validar a entrega final.

## Estado conferido

- `push_devices` e `push_notification_deliveries` existem com RLS ativo.
- A Edge Function está ativa e protegida por `x-cron-secret`.
- O cron `maisctrl-send-push-notifications` está ativo a cada 15 minutos.
- O timeout da chamada do cron foi ajustado para 30 segundos.
- O último teste da função retornou `200`, sem dispositivos cadastrados.

## Banco e função

1. Aplique `supabase/migrations/20260909170000_add_mobile_push_notifications.sql` no projeto Supabase `wdmkzljxjjjvzofrpeuk`.
2. Faça o deploy de `supabase/functions/send-push-notifications` com `verify_jwt = false`.
3. Configure os secrets da função:

   - `CRON_SECRET`
   - `FCM_SERVICE_ACCOUNT_JSON` — JSON da conta de serviço do Firebase
   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_PRIVATE_KEY`
   - `APNS_BUNDLE_ID` — `com.maisctrl.app`
   - `APNS_ENVIRONMENT` — `sandbox` durante testes ou `production` na publicação

4. O agendamento do projeto já está configurado para rodar a cada 15 minutos, enviando o header `x-cron-secret` com o mesmo valor de `CRON_SECRET`.

## Android

1. Crie um app Android no Firebase com o package `com.maisctrl.app`.
2. Baixe `google-services.json` e coloque em `android/app/google-services.json`.
3. O plugin já foi sincronizado pelo Capacitor; depois disso, abra o projeto no Android Studio.

## iOS

1. No Apple Developer, habilite a capability Push Notifications para `com.maisctrl.app`.
2. Crie uma APNs Auth Key e preencha `APNS_KEY_ID`, `APNS_TEAM_ID` e `APNS_PRIVATE_KEY` na Edge Function.
3. Abra o projeto no Xcode, selecione o Team de assinatura e habilite Push Notifications em Signing & Capabilities.

Sem essas credenciais, o navegador continua funcionando e o app mantém os alertas locais já implementados, mas o push remoto não será entregue.

## Teste final no aparelho

1. Instale a build Android `0.1.22` pelo endereço oficial de download.
2. Entre em uma conta no app.
3. Abra o sino de notificações e toque em **Ativar**.
4. Aceite a permissão de notificações do Android.
5. Confirme que o dispositivo aparece em `push_devices`.
6. Cadastre uma assinatura com vencimento hoje, amanhã, em 2, 3 ou 7 dias.
7. Mantenha o app fechado e aguarde o próximo ciclo de 15 minutos.

Se o dispositivo for salvo, mas o push não chegar, o próximo diagnóstico é conferir as credenciais do Firebase na Edge Function e o log de entrega do FCM.
