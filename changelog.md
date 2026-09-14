# Changelog

Registro das principais mudanças do MaisCtrl para Android.

## Não publicado

### Alterado

- Ícone do app atualizado com a imagem oficial enviada, com fundo preto, no Android, iOS e versão web instalável.
- Logo decorativa removida da tela de cadastro para deixar o formulário livre acima do teclado.
- Badge da logo MaisCtrl no painel pessoal transformado em entrada para o espaço +2.
- Nova tela fixa do +2 criada com identidade visual própria e retorno direto para o painel pessoal.
- Cadastro de assinaturas reorganizado em um fluxo modal de três etapas, com revisão antes de salvar.
- Badge principal renomeado para MaisCtrl e espaço do casal identificado como +Couple após o clique.
- Avatar do perfil exibido no botão do cabeçalho, ao lado das notificações.
- Menu inferior redesenhado como dock flutuante, com aba ativa destacada e respiro para a área segura do aparelho.
- Perfil removido do menu inferior; o acesso continua disponível pelo avatar no cabeçalho.
- Logos de marcas conhecidas adicionadas às assinaturas via CDN público, com fallback para a inicial.
- Ícone adaptativo do Android alinhado à logo oficial enviada, removendo o foreground padrão do template.

### Corrigido

- Tela inicial de autenticação mantida fixa, sem rolagem ou deslocamento do card de ações.
- Campos de login reposicionados automaticamente para permanecerem visíveis acima do teclado.
- Tela de cadastro mantida estática, sem rolagem, com o formulário acima do teclado.
- Teclado simulado expandido até as laterais da tela, sem falhas nos cantos superiores.
- Upload de foto de perfil habilitado no Supabase com bucket e políticas de acesso por usuário.
- Formulários em bottom sheet mantidos fixos, com espaço de segurança acima do teclado.
- Link de recuperação de senha passou a abrir o formulário de nova senha dentro do app.
- Callback de recuperação separado do login normal para impedir entrada direta no painel sem trocar a senha.
- Deep link `maisctrl://auth/callback` registrado também no iOS para completar a recuperação de senha.

## 0.1.28 — 2026-09-10

### Adicionado

- Botão para testar o envio de notificações push diretamente no Perfil.
- Retorno de links de autenticação por e-mail para o app Android.
- Sincronização automática da APK Android com a página de download do site.

### Alterado

- Ícone do app atualizado com a marca do MaisCtrl e proporções menores.
- APK de teste Android publicada no site para download.
- App Android ajustado para respeitar as barras do sistema.

### Corrigido

- Registro dos tokens de notificação push no Android.
- Redirecionamento de autenticação para o endereço público do app.

### Documentação

- Instruções de configuração e teste de notificações push.
- Registro do fluxo de autenticação por deep link no Android.
