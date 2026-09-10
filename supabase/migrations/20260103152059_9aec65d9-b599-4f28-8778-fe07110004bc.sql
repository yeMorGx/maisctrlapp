-- Habilitar extensões necessárias para jobs agendados.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- O agendamento é configurado depois do deploy, usando secrets no ambiente.
-- Não guardar URL de projeto, JWT, service role ou segredo de cron nesta migration.
