// Local Supabase client for ingestion writes (PRD D18/D21) — service-role
// key only, never used by the Angular app. Reads config from process.env
// (populated from ingestion/.env by env.ts's loadEnvFile, called by every
// real script before this module is used).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseClient(): SupabaseClient {
  const url = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see ingestion/.env.example) — ' +
        'copy ingestion/.env.example to ingestion/.env and fill in the local values from `supabase status`.',
    );
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
