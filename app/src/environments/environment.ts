// Local development environment.
//
// These values are the standard Supabase CLI local-dev defaults — every
// machine that runs `supabase start` gets the exact same URL and anon key.
// They are published in Supabase's own docs and are NOT secrets: the anon
// key only unlocks whatever Postgres RLS policies explicitly allow (public
// read on display tables here — see supabase/migrations). Production
// Supabase keys must never be committed to this repo (AGENTS.md 1.1,
// PRD D18/D19).
export const environment = {
  production: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
};
