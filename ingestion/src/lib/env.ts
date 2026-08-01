// Tiny .env loader — no dependency earns its place here (AGENTS.md 1.3):
// this is a handful of lines, so we don't reach for the `dotenv` package.
// Loads ingestion/.env (gitignored, real local values) into process.env
// without overwriting anything already set in the environment.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const INGESTION_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadEnvFile(path: string = join(INGESTION_DIR, '.env')): void {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
