-- Device tokens used by the mobile app for remote push notifications.
CREATE TABLE IF NOT EXISTS public.push_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;

CREATE POLICY "Users can view their own push devices"
  ON public.push_devices FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can register their own push devices"
  ON public.push_devices FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own push devices"
  ON public.push_devices FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can remove their own push devices"
  ON public.push_devices FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX push_devices_user_id_idx ON public.push_devices(user_id);

CREATE TABLE IF NOT EXISTS public.push_notification_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('renewal', 'trial')),
  due_date DATE NOT NULL,
  reminder_days INTEGER NOT NULL CHECK (reminder_days BETWEEN 0 AND 7),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (device_id, subscription_id, kind, due_date, reminder_days)
);

ALTER TABLE public.push_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_notification_deliveries FROM anon, authenticated;

CREATE INDEX push_notification_deliveries_user_id_idx
  ON public.push_notification_deliveries(user_id);

CREATE INDEX push_notification_deliveries_due_date_idx
  ON public.push_notification_deliveries(due_date);

CREATE TRIGGER update_push_devices_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
