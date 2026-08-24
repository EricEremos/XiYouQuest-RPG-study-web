ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS client_attempt_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS practice_sessions_user_client_attempt_id_key
  ON public.practice_sessions (user_id, client_attempt_id)
  WHERE client_attempt_id IS NOT NULL;
