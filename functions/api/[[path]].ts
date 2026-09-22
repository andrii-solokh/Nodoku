/// <reference types="@cloudflare/workers-types" />

import { handleApi } from "../../server/api";
import { D1Store, UnavailableStore } from "../../server/store";

export interface Env {
  DB?: D1Database;
  APP_ORIGIN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  REMOVE_ADS_AMOUNT?: string;
  POSTHOG_PROJECT_API_KEY?: string;
  POSTHOG_QUERY_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;
  ACCOUNTS_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
}

export function apiEnv(env: Env): Record<string, string | undefined> {
  return {
    APP_ORIGIN: env.APP_ORIGIN,
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    REMOVE_ADS_AMOUNT: env.REMOVE_ADS_AMOUNT,
    POSTHOG_PROJECT_API_KEY: env.POSTHOG_PROJECT_API_KEY,
    POSTHOG_QUERY_API_KEY: env.POSTHOG_QUERY_API_KEY,
    POSTHOG_PROJECT_ID: env.POSTHOG_PROJECT_ID,
    ACCOUNTS_ENABLED: env.ACCOUNTS_ENABLED,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
  };
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  const store = env.DB ? new D1Store(env.DB) : new UnavailableStore();
  // Preserve the original body and Stripe-Signature header for verification.
  return handleApi(request, apiEnv(env), store);
};
