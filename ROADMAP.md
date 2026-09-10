# MaisCtrl — roadmap completo do app

Este documento consolida o documento de funcionalidades do MaisCtrl, as decisões tomadas durante a migração para mobile e a ordem prática até a publicação.

## 1. Escopo decidido

O aplicativo mobile não terá:

- landing page;
- timer de marketing de 24 horas;
- página pública de preços;
- depoimentos de landing;
- obrigação de adotar o visual “Apple clean” do documento;
- obrigação de usar Outfit/Figtree;
- dark mode nativo como requisito.

O Premium será apresentado dentro do app autenticado. Informações de preço e assinatura só aparecem no contexto de compra, quando forem necessárias.

## 2. Estado atual

- [x] Projeto mobile separado em `mais-ctrl-mobile`.
- [x] Runtime Capacitor com presets de iPhone e Pixel.
- [x] Fluxo de splash, boas-vindas, login, cadastro e recuperação de senha.
- [x] Cadastro em quatro etapas.
- [x] Seleção e prévia de foto no cadastro.
- [x] Validação de tipo e tamanho de foto no cadastro.
- [x] Perfil com upload de foto no Supabase Storage.
- [x] Dashboard mobile inicial.
- [x] Módulo inicial de assinaturas.
- [x] Banco e migrations importados para o projeto mobile.
- [x] Download do APK pelo domínio do MaisCtrl.
- [x] Build local, testes de runtime e testes do worker passando.
- [x] Variáveis públicas do Supabase configuradas no GitHub Actions.
- [x] APK novo gerado pelo workflow após a configuração.
- [x] AAB Release candidato gerado pelo workflow com versionamento automático.
- [x] Validação visual de senha forte no cadastro.
- [x] Visão financeira local com entradas e saídas salvas no aparelho.
- [x] Testes automatizados da senha e da persistência financeira local.
- [ ] Teste completo em aparelho Android real.
- [ ] AAB assinado para publicação.
- [ ] Lançamento interno na Google Play.
- [ ] Sistema Premium mobile.

## 3. Banco e Supabase

### Schema

- [x] Comparar todas as tabelas do `maisctrl-database-schema.md` com as migrations do projeto.
- [ ] Aplicar migrations no novo projeto Supabase.
- [ ] Conferir tabelas, colunas, enums, índices e foreign keys.
- [ ] Conferir triggers de criação e atualização de perfil.
- [ ] Conferir buckets de Storage e suas políticas.
- [ ] Validar que todas as tabelas usadas pelo app estão expostas corretamente pela Data API.
- [ ] Fazer backup do schema final.

### Segurança

- [ ] Ativar RLS em todas as tabelas expostas.
- [ ] Criar policies de leitura, inserção, atualização e exclusão por usuário.
- [ ] Validar isolamento entre usuários.
- [ ] Validar isolamento entre espaços pessoais e compartilhados.
- [ ] Validar permissões de proprietário, participante e administrador.
- [ ] Revisar policies de `UPDATE` com `USING` e `WITH CHECK`.
- [ ] Não usar `user_metadata` para autorização.
- [ ] Não expor `service_role` ou qualquer secret no cliente.
- [ ] Executar os advisors de segurança do Supabase.

### Dados principais

- [ ] `profiles`.
- [ ] `subscriptions`.
- [ ] `subscription_participants`.
- [ ] `cards`.
- [ ] `card_invoices`.
- [ ] `installments`.
- [ ] `loans`.
- [ ] `financings`.
- [ ] `payments`.
- [ ] `incomes`.
- [ ] `expenses`.
- [ ] `dreams`.
- [ ] `investments`.
- [ ] `assets` ou patrimônio.
- [ ] `notifications`.
- [ ] `device_tokens`.
- [ ] `couples` e convites.
- [ ] `roles` e permissões administrativas.
- [ ] tabelas de Premium, pagamentos e webhooks.

## 4. Autenticação e onboarding

- [x] Splash screen.
- [x] Tela de boas-vindas.
- [x] Login por e-mail e senha.
- [x] Cadastro em etapas.
- [x] Recuperação de senha.
- [x] Persistência de sessão.
- [x] Logout.
- [x] Mensagens de erro em português.
- [x] Foto de perfil no cadastro.
- [x] Senha com maiúscula, minúscula, número e símbolo.
- [ ] Verificação de senha vazada via backend.
- [ ] Confirmação de e-mail em aparelho real.
- [ ] Fluxo de expiração e renovação de sessão.
- [ ] Exclusão de conta digitando `EXCLUIR`.
- [ ] 2FA TOTP com QR Code.
- [ ] Login Google, se continuar dentro do escopo.

## 5. Dashboard

- [x] Navegação inicial.
- [x] Visão geral inicial.
- [x] Cards de assinaturas, pagamentos e alertas.
- [x] Navegação para assinaturas, calendário e perfil.
- [x] Primeiro painel financeiro local para testar entradas e saídas sem backend.
- [ ] Receita total.
- [ ] Despesas totais.
- [ ] Saldo.
- [ ] Sonhos.
- [ ] Patrimônio.
- [ ] Investimentos.
- [ ] Saúde financeira.
- [ ] Busca global.
- [ ] Filtros por período e categoria.
- [ ] Próximos pagamentos consolidados.
- [ ] Painel completo de alertas.

## 6. Assinaturas

- [x] Criar assinatura.
- [x] Editar assinatura.
- [x] Excluir assinatura.
- [x] Frequência e data de cobrança.
- [x] Método de pagamento, incluindo PIX para registro.
- [ ] Frequências diária, semanal, quinzenal, mensal, trimestral e anual revisadas.
- [ ] Trial com destaque visual.
- [ ] Logos automáticos de marcas.
- [ ] Busca de marcas.
- [ ] Assinaturas compartilhadas.
- [ ] Divisão automática de valores.
- [ ] Convites por link.
- [ ] Proprietário e participantes.
- [ ] Recomendações de duplicidade e pouco uso.
- [ ] Alertas de vencimento e fim do trial.

## 7. Cartões e parcelas

- [ ] Cadastro de cartões.
- [ ] Limite, fechamento e vencimento.
- [ ] Saldos mensais.
- [ ] Faturas por mês e por cartão.
- [ ] Compras parceladas.
- [ ] Parcela atual e total.
- [ ] Progresso de pagamento.
- [ ] Soma automática da fatura.
- [ ] Integração com despesas mensais.
- [ ] Seção Cartões no dashboard.

## 8. Dívidas e financiamentos

- [ ] Dívidas pessoais, bancárias, consignadas e familiares.
- [ ] Credor, juros, valor emprestado e total a pagar.
- [ ] Parcelas, vencimento, situação e observações.
- [ ] Botão para pagar parcela.
- [ ] Saldo devedor.
- [ ] Barra de progresso.
- [ ] Financiamento de casa e veículos.
- [ ] Prazo, juros, parcela e saldo.
- [ ] Registro de pagamentos.
- [ ] Controle “Eu devo” e “Me devem”.
- [ ] Status por pessoa.

## 9. Espaço compartilhado

- [ ] Alternar entre “Meu Espaço” e espaço compartilhado.
- [ ] Convite por e-mail.
- [ ] Convite por link.
- [ ] Aceite do convite.
- [ ] Entrada e saída de participante.
- [ ] Recalcular cotas automaticamente.
- [ ] Remover participante.
- [ ] Configurar e desfazer vínculo do casal.
- [ ] Divisão de renda 70/20/10, 80/10/10 e personalizada.
- [ ] Importar itens do Meu Espaço.
- [ ] Visão por membro.
- [ ] Timeline com foto e autor.
- [ ] Check-in semanal.
- [ ] Conquistas e gamificação.

## 10. Gráficos e insights

- [ ] Evolução mensal.
- [ ] Heatmap de gastos.
- [ ] Distribuição por fonte.
- [ ] Maiores despesas.
- [ ] Comparação com mês anterior.
- [ ] Previsão de sonhos.
- [ ] Capacidade de investimento.
- [ ] Insights determinísticos.

## 11. Notificações

- [ ] Registrar token do dispositivo.
- [ ] Configurar Firebase para Android.
- [ ] Salvar tokens com RLS.
- [ ] Push de vencimento.
- [ ] Push de trial.
- [ ] Push de ativação Premium.
- [ ] Preferências por e-mail, SMS, WhatsApp e push.
- [ ] Horários personalizados.
- [ ] Cron diário.
- [ ] Histórico de notificações.
- [ ] Permitir ativar e desativar canais.

## 12. Chat com IA

- [ ] Chat conversacional.
- [ ] Limite de perguntas do plano Free.
- [ ] Markdown nas respostas.
- [ ] Análise de gastos.
- [ ] Dicas personalizadas.
- [ ] Recomendações automáticas.
- [ ] Aviso de limite atingido.
- [ ] CTA interno para Premium.
- [ ] Isolamento dos dados do usuário.
- [ ] Limite de custo por usuário.

## 13. Exportação, suporte e privacidade

- [ ] Exportar todos os dados em TXT.
- [ ] Exportar assinaturas, cartões, dívidas e pagamentos.
- [ ] Exclusão completa da conta.
- [ ] Limpeza de arquivos do Storage.
- [ ] Página de suporte.
- [ ] Envio de solicitação por e-mail.
- [ ] Feedback por emoji e comentário.
- [ ] Reporte de bugs.
- [ ] Termos de uso.
- [ ] Política de privacidade.
- [ ] LGPD.
- [ ] Modal de novidades após atualização.

## 14. Premium e pagamentos

### Android

- [ ] Criar produtos mensal e anual na Play Console.
- [ ] Integrar Google Play Billing.
- [ ] Validar a compra no backend.
- [ ] Acknowledge da compra.
- [ ] Criar entitlement Premium.
- [ ] Sincronizar renovação, cancelamento, expiração e reembolso.
- [ ] Restaurar compra.
- [ ] Link para gerenciar assinatura.

Google Pay é uma carteira complementar. Não deve substituir o Google Play Billing para uma assinatura digital vendida dentro do app.

### Web e iOS

- [ ] Manter Stripe para checkout web.
- [ ] Webhooks de assinatura.
- [ ] Portal do cliente.
- [ ] PIX web, se mantido.
- [ ] Avaliar Google Pay e Apple Pay no fluxo web.
- [ ] No iOS, avaliar StoreKit/In-App Purchase para Premium digital.
- [ ] Usar Apple Pay apenas nos cenários permitidos para o produto e a plataforma.

### Regras de Premium

- [ ] Plano Free.
- [ ] Plano Premium.
- [ ] Trial configurável.
- [ ] Plano vitalício administrado manualmente.
- [ ] Ativação automática.
- [ ] Reversão automática para Free.
- [ ] Notificação de ativação.
- [ ] Notificação de cancelamento.
- [ ] Comissão recorrente, se mantida.
- [ ] Tema Premium apenas se continuar coerente com o design aprovado.

## 15. Android e publicação

- [x] Conferir package ID.
- [x] Conferir nome e ícone.
- [x] Configurar `google-services.json`.
- [x] Configurar Firebase.
- [x] Configurar permissões.
- [x] Configurar notificações.
- [x] Manter keystore fora do repositório.
- [x] Gerar APK de teste.
- [ ] Gerar AAB assinado.
- [ ] Criar app na Google Play Console.
- [ ] Criar lançamento interno.
- [ ] Testar instalação pelo Play Console.
- [ ] Corrigir problemas de revisão.
- [ ] Publicar produção.
- [ ] Configurar atualização de versão.

## 16. Site de download

- [x] Rota `/download`.
- [x] APK servido pelo próprio domínio.
- [x] Arquivo `/downloads/maisctrl.apk`.
- [x] Checksum conferido.
- [x] Deploy do Vercel validado.
- [x] Atualizar o APK do site para a release Android atual.
- [ ] Automatizar a atualização do APK do site a cada nova release.
- [x] Exibir versão e data do APK.
- [x] Exibir instruções de instalação Android.
- [x] Exibir aviso de versão de teste enquanto estiver fora da Play Store.

## 17. GitHub Actions

- [x] Workflow de build Android.
- [x] Validação do Supabase.
- [x] Variável `VITE_SUPABASE_URL` configurada.
- [x] Variável `VITE_SUPABASE_PUBLISHABLE_KEY` configurada.
- [x] Confirmar workflow verde no commit atual.
- [x] Confirmar APK e checksum na release.
- [x] Executar testes mobile e Sites antes de publicar a release Android.
- [ ] Automatizar atualização do APK no site.
- [ ] Nunca colocar `service_role` ou secrets no bundle.

## 18. QA final

- [ ] Cadastro completo.
- [ ] Confirmação de e-mail.
- [ ] Login e logout.
- [ ] Recuperação de senha.
- [ ] Sessão persistente.
- [ ] Foto de perfil.
- [ ] Dashboard.
- [ ] Assinaturas.
- [ ] Cartões.
- [ ] Parcelas.
- [ ] Dívidas.
- [ ] Financiamentos.
- [ ] Casal e convites.
- [ ] Notificações.
- [ ] Push real.
- [ ] Exportação.
- [ ] Exclusão de conta.
- [ ] Pagamento e cancelamento.
- [ ] Instalação limpa.
- [ ] Atualização do app.
- [ ] Android pequeno e grande.
- [ ] Teclado aberto e fechado.
- [ ] Modo offline e retomada.

## 19. Ordem imediata

1. Testar o APK publicado em um Android real.
2. Fechar a validação das migrations no novo Supabase.
3. Corrigir erros encontrados no aparelho ou no banco.
4. Implementar os módulos financeiros restantes.
5. Implementar push real.
6. Preparar keystore e AAB assinado de produção.
7. Fazer lançamento interno na Play Store.
8. Implementar Google Play Billing para Premium.
9. Publicar o app.
10. Preparar iOS com StoreKit quando o Android estiver estável.

## Critério de pronto para liberar o Android

- Build remoto verde.
- APK instalável em aparelho real.
- Cadastro, login e sessão funcionando.
- Dados persistindo no Supabase.
- RLS validado.
- Foto de perfil funcionando.
- Dashboard sem erro bloqueante.
- Download próprio funcionando.
- AAB assinado disponível.
- Lançamento interno aprovado.
