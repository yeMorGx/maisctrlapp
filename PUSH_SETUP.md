# Push real do MaisCtrl

O código do app já registra tokens nativos no Supabase e a Edge Function `send-push-notifications` envia os lembretes de renovação. Para ativar o envio real, ainda é necessário configurar as credenciais das lojas e do provedor de push.

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

4. Agende a função uma vez por dia, enviando o header `x-cron-secret` com o mesmo valor de `CRON_SECRET`.

## Android

1. Crie um app Android no Firebase com o package `com.maisctrl.app`.
2. Baixe `google-services.json` e coloque em `android/app/google-services.json`.
3. O plugin já foi sincronizado pelo Capacitor; depois disso, abra o projeto no Android Studio.

## iOS

1. No Apple Developer, habilite a capability Push Notifications para `com.maisctrl.app`.
2. Crie uma APNs Auth Key e preencha `APNS_KEY_ID`, `APNS_TEAM_ID` e `APNS_PRIVATE_KEY` na Edge Function.
3. Abra o projeto no Xcode, selecione o Team de assinatura e habilite Push Notifications em Signing & Capabilities.

Sem essas credenciais, o navegador continua funcionando e o app mantém os alertas locais já implementados, mas o push remoto não será entregue.
