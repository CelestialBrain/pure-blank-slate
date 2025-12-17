-- Enable pg_cron extension for scheduling tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule cleanup function to run daily at 2 AM
SELECT cron.schedule(
  'cleanup-old-events-daily',
  '0 2 * * *', -- Run at 2:00 AM every day
  $$
  SELECT
    net.http_post(
      url:='https://azdcshjzkcidqmkpxuqz.supabase.co/functions/v1/cleanup-old-events',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6ZGNzaGp6a2NpZHFta3B4dXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5ODk0NTEsImV4cCI6MjA4MTU2NTQ1MX0.iFQi_eCmiWkkzF8VxasSl7PUzhdVz0pwagEEDo_MfbE"}'::jsonb
    ) as request_id;
  $$
);
