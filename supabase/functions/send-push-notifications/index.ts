import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { importPKCS8, SignJWT } from "npm:jose@6.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const reminderDays = [7, 3, 2, 1, 0];
const dayInMilliseconds = 86_400_000;

type Device = {
  id: string;
  user_id: string;
  token: string;
  platform: "android" | "ios";
};

type Subscription = {
  id: string;
  user_id: string;
  name: string;
  renewal_date: string;
  trial_end_date: string | null;
  is_active: boolean;
};

type Reminder = {
  subscription: Subscription;
  kind: "renewal" | "trial";
  dueDate: string;
  days: number;
  title: string;
};

function localDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / dayInMilliseconds);
}

function reminderTitle(subscription: Subscription, kind: Reminder["kind"], days: number) {
  const subject = kind === "trial" ? `O teste de ${subscription.name}` : subscription.name;
  if (days === 0) return `${subject} ${kind === "trial" ? "termina" : "vence"} hoje`;
  return `${subject} ${kind === "trial" ? "termina" : "vence"} em ${days} dias`;
}

function getReminders(subscriptions: Subscription[], today: string) {
  return subscriptions.flatMap((subscription): Reminder[] => {
    const reminders: Reminder[] = [];
    const renewalDate = subscription.renewal_date.slice(0, 10);
    const renewalDays = daysBetween(today, renewalDate);
    if (reminderDays.includes(renewalDays)) {
      reminders.push({ subscription, kind: "renewal", dueDate: renewalDate, days: renewalDays, title: reminderTitle(subscription, "renewal", renewalDays) });
    }

    if (subscription.trial_end_date) {
      const trialDate = subscription.trial_end_date.slice(0, 10);
      const trialDays = daysBetween(today, trialDate);
      if (reminderDays.includes(trialDays)) {
        reminders.push({ subscription, kind: "trial", dueDate: trialDate, days: trialDays, title: reminderTitle(subscription, "trial", trialDays) });
      }
    }

    return reminders;
  });
}

async function getFcmAccessToken() {
  const rawServiceAccount = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!rawServiceAccount) throw new Error("FCM_SERVICE_ACCOUNT_JSON não configurado");

  const serviceAccount = JSON.parse(rawServiceAccount) as { project_id: string; client_email: string; private_key: string };
  const privateKey = await importPKCS8(serviceAccount.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Não foi possível autenticar no FCM: ${await response.text()}`);

  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("O FCM não retornou um access token");
  return { accessToken: payload.access_token, projectId: serviceAccount.project_id };
}

async function sendToFcm(device: Device, reminder: Reminder) {
  const { accessToken, projectId } = await getFcmAccessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: device.token,
        notification: { title: "MaisCtrl", body: reminder.title },
        data: { subscription_id: reminder.subscription.id, kind: reminder.kind, due_date: reminder.dueDate },
        android: { notification: { channel_id: "maisctrl-reminders" } },
      },
    }),
  });
  const payload = await response.text();
  return { ok: response.ok, invalid: payload.includes("UNREGISTERED"), detail: payload };
}

async function getApnsToken() {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const rawPrivateKey = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !rawPrivateKey) throw new Error("Credenciais APNs não configuradas");

  const privateKey = await importPKCS8(rawPrivateKey.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

async function sendToApns(device: Device, reminder: Reminder) {
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") || "com.maisctrl.app";
  const host = Deno.env.get("APNS_ENVIRONMENT") === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const token = device.token.replace(/[<>\s]/g, "");
  const jwt = await getApnsToken();
  const response = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ aps: { alert: { title: "MaisCtrl", body: reminder.title }, sound: "default" }, data: { subscription_id: reminder.subscription.id, kind: reminder.kind, due_date: reminder.dueDate } }),
  });
  const payload = await response.text();
  return { ok: response.ok, invalid: response.status === 400 || response.status === 410, detail: payload };
}

async function sendToDevice(device: Device, reminder: Reminder) {
  return device.platform === "android" ? sendToFcm(device, reminder) : sendToApns(device, reminder);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Variáveis do Supabase não configuradas");

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const today = localDate();
    const limitDate = addDays(today, 7);
    const subscriptionFields = "id,user_id,name,renewal_date,trial_end_date,is_active";
    const [renewalResult, trialResult, devicesResult] = await Promise.all([
      supabase.from("subscriptions").select(subscriptionFields).eq("is_active", true).gte("renewal_date", today).lte("renewal_date", limitDate),
      supabase.from("subscriptions").select(subscriptionFields).eq("is_active", true).gte("trial_end_date", today).lte("trial_end_date", limitDate),
      supabase.from("push_devices").select("id,user_id,token,platform").eq("enabled", true),
    ]);
    if (renewalResult.error) throw renewalResult.error;
    if (trialResult.error) throw trialResult.error;
    if (devicesResult.error) throw devicesResult.error;

    const subscriptions = [...new Map([...renewalResult.data, ...trialResult.data].map((subscription) => [subscription.id, subscription])).values()] as Subscription[];
    const devices = devicesResult.data as Device[];
    const devicesByUser = new Map<string, Device[]>();
    for (const device of devices) devicesByUser.set(device.user_id, [...(devicesByUser.get(device.user_id) ?? []), device]);

    let sent = 0;
    let skipped = 0;
    let disabled = 0;
    for (const reminder of getReminders(subscriptions, today)) {
      for (const device of devicesByUser.get(reminder.subscription.user_id) ?? []) {
        const { data: existing, error: existingError } = await supabase
          .from("push_notification_deliveries")
          .select("id")
          .match({ device_id: device.id, subscription_id: reminder.subscription.id, kind: reminder.kind, due_date: reminder.dueDate, reminder_days: reminder.days })
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          skipped++;
          continue;
        }

        const result = await sendToDevice(device, reminder);
        if (result.invalid) {
          await supabase.from("push_devices").update({ enabled: false }).eq("id", device.id);
          disabled++;
        }
        if (!result.ok) {
          console.error("Push failed", { deviceId: device.id, detail: result.detail });
          continue;
        }

        const { error: deliveryError } = await supabase.from("push_notification_deliveries").insert({
          user_id: reminder.subscription.user_id,
          device_id: device.id,
          subscription_id: reminder.subscription.id,
          kind: reminder.kind,
          due_date: reminder.dueDate,
          reminder_days: reminder.days,
        });
        if (deliveryError && deliveryError.code !== "23505") throw deliveryError;
        sent++;
      }
    }

    return new Response(JSON.stringify({ today, subscriptions: subscriptions.length, sent, skipped, disabled }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("send-push-notifications failed", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
