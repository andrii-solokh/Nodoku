import assert from 'node:assert/strict';
import test from 'node:test';
import { apiEnv } from '../functions/api/[[path]].ts';

test('Pages Functions forwards private PostHog query credentials to the API handler', () => {
  assert.deepEqual(apiEnv({
    APP_ORIGIN: 'https://nodoku.solokh.com',
    POSTHOG_PROJECT_API_KEY: 'phc_public_capture_key',
    POSTHOG_QUERY_API_KEY: 'phs_private_query_key',
    POSTHOG_PROJECT_ID: '605581',
  }), {
    APP_ORIGIN: 'https://nodoku.solokh.com',
    STRIPE_SECRET_KEY: undefined,
    STRIPE_WEBHOOK_SECRET: undefined,
    REMOVE_ADS_AMOUNT: undefined,
    POSTHOG_PROJECT_API_KEY: 'phc_public_capture_key',
    POSTHOG_QUERY_API_KEY: 'phs_private_query_key',
    POSTHOG_PROJECT_ID: '605581',
    ACCOUNTS_ENABLED: undefined,
    GOOGLE_CLIENT_ID: undefined,
  });
});
