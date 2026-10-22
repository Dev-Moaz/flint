// lib/supabase/server.ts
// The service-role client: it bypasses Row Level Security, so it must only ever run on the server.
import 'server-only'; // the build fails if a client component ever imports this file
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Supabase environment variable ${name} is missing.`);
  return value;
}

export const supabaseAdmin = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Never serve a cached answer: a lead's status can change minute to minute
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  }
);