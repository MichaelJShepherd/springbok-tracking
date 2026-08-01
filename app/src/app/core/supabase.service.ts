import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Thin wrapper around the Supabase JS client.
 *
 * Per PRD D18/D19: this talks only to the local Supabase instance with the
 * public anon key (RLS enforces public-read-only), and no user action here
 * ever triggers an upstream fetch — ingestion is a separate, explicitly
 * invoked process (see ingestion/).
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
  );
}
