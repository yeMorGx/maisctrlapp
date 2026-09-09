import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const values = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "")];
    }),
);

const client = createClient(values.VITE_SUPABASE_URL, values.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data, error } = await client.auth.getSession();
const [subscriptionResult, profileResult, planResult] = await Promise.all([
  client.from("subscriptions").select("id").limit(1),
  client.from("profiles").select("id").limit(1),
  client.from("user_subscriptions").select("id").limit(1),
]);

console.log(
  JSON.stringify({
    configured: Boolean(values.VITE_SUPABASE_URL && values.VITE_SUPABASE_PUBLISHABLE_KEY),
    reachable: !error,
    sessionRestored: Boolean(data.session),
    error: error?.message ?? null,
    subscriptionsQuery: {
      reachable: !subscriptionResult.error,
      rowCount: subscriptionResult.data?.length ?? null,
      error: subscriptionResult.error?.message ?? null,
    },
    profileQuery: {
      reachable: !profileResult.error,
      rowCount: profileResult.data?.length ?? null,
      error: profileResult.error?.message ?? null,
    },
    planQuery: {
      reachable: !planResult.error,
      rowCount: planResult.data?.length ?? null,
      error: planResult.error?.message ?? null,
    },
  }),
);
