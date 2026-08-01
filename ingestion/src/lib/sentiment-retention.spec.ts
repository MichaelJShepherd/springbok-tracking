// PRD D20 retention invariant, automated: "no comment/headline text
// persisted or logged — enforce with a lint rule or equivalent automated
// check." This suite is that check. It must fail if someone reintroduces
// source-text persistence or logging into the sentiment pipeline, so it
// combines several independent techniques rather than trusting any one
// alone (task #78 Gate 3 review found and closed real bypasses in an
// earlier version of this file — see the comments below marking each):
//
//  1. Behavioural: runs the real row-building functions against fixture
//     text containing a unique, unmistakable marker string, with
//     console.log/warn/error spied, and asserts the marker appears in
//     neither the returned rows (what would be persisted to
//     `sentiment_scores`) nor anything logged.
//  2. Structural whitelist: asserts every row has *exactly* the column set
//     PRD D20 permits — an added field (however named) fails the test
//     immediately, even before anyone wires it up to a real insert.
//  3. Static source scan (the "lint rule" equivalent): scans every non-spec
//     .ts file under src/lib and src/scripts (glob-based — see the Gate 3
//     note below on why not a name pattern) for a console/stdout/stderr
//     call that references a source-text field or JSON.stringifies a
//     comment/article collection, tolerant of the call spanning multiple
//     lines.
//  4. Upsert-site guard: scripts/sentiment.ts currently has no code path
//     that writes to `sentiment_scores` at all (see its header comment —
//     both live branches refuse to run pending real request-building
//     work), so the "debug field slipped into the real upsert" attack
//     surface is exactly zero right now; this suite asserts that stays
//     true, and must be upgraded (not just re-approved) the moment a real
//     upsert call is reintroduced there.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGuardianRow, buildRedditRows, type SentimentRow } from './sentiment-pipeline.js';
import type { RedditComment } from './reddit-client.js';
import type { GuardianArticle } from './guardian-client.js';

const MARKER = 'RETENTION_TEST_MARKER_DO_NOT_PERSIST_9f3a1c';
const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(LIB_DIR, '..', 'scripts');

const ALLOWED_ROW_KEYS = ['match_id', 'bucket', 'score', 'label', 'bucket_source_count', 'too_few', 'source', 'source_url'].sort();

function assertNoMarkerAnywhere(rows: SentimentRow[], loggedText: string) {
  const serialisedRows = JSON.stringify(rows);
  expect(serialisedRows).not.toContain(MARKER);
  expect(loggedText).not.toContain(MARKER);
}

describe('D20 retention — behavioural check against a marker string', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buildRedditRows never returns or logs the marker embedded in a comment body', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const comments: RedditComment[] = Array.from({ length: 26 }, (_, i) => ({
      body: `great performance today ${MARKER} number ${i}`,
      createdUtc: Math.floor(Date.now() / 1000) - i * 60,
    }));
    const rows = buildRedditRows('m-marker', comments, null, 'https://reddit.test/thread');

    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    assertNoMarkerAnywhere(rows, logged);
  });

  it('buildGuardianRow never returns or logs the marker embedded in a headline/standfirst', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const articles: GuardianArticle[] = Array.from({ length: 5 }, (_, i) => ({
      headline: `Springboks win ${MARKER}`,
      standfirst: `A report containing ${MARKER} in the standfirst ${i}`,
      webUrl: `https://guardian.test/${i}`,
      webPublicationDate: '2026-07-04',
    }));
    const row = buildGuardianRow('m-marker-2', articles);

    const logged = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    assertNoMarkerAnywhere([row], logged);
  });
});

describe('D20 retention — structural whitelist', () => {
  it('every Reddit-built row has exactly the D20-permitted columns, nothing else', () => {
    const comments: RedditComment[] = [{ body: 'brilliant', createdUtc: Math.floor(Date.now() / 1000) }];
    const rows = buildRedditRows('m-shape', comments, null, null);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(ALLOWED_ROW_KEYS);
    }
  });

  it('the Guardian-built row has exactly the D20-permitted columns, nothing else', () => {
    const row = buildGuardianRow('m-shape-2', [
      { headline: 'brilliant', standfirst: null, webUrl: 'https://guardian.test/x', webPublicationDate: '2026-07-04' },
    ]);
    expect(Object.keys(row).sort()).toEqual(ALLOWED_ROW_KEYS);
  });
});

describe('D20 retention — static source scan (the "lint rule" equivalent)', () => {
  /**
   * Finds every `console.log/warn/error/info/debug(...)` or
   * `process.stdout.write(...)` / `process.stderr.write(...)` call
   * expression in `contents`, however many lines it spans, and returns the
   * ones that reference `.body`/`.headline`/`.standfirst` or
   * `JSON.stringify(...)` of something that looks like a comment/article
   * collection. Operates on the whole call expression (matched-paren
   * extraction, not a single line or a fixed-width slice) specifically
   * because Gate 3 found a single-line regex misses a call whose
   * offending argument is on the next line.
   */
  function findForbiddenLoggingCalls(contents: string): string[] {
    const callStart = /(console\.(?:log|warn|error|info|debug)|process\.(?:stdout|stderr)\.write)\s*\(/g;
    const offending: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = callStart.exec(contents))) {
      const openParenIndex = contents.indexOf('(', match.index);
      if (openParenIndex === -1) continue;
      let depth = 0;
      let endIndex = contents.length;
      for (let i = openParenIndex; i < contents.length; i++) {
        if (contents[i] === '(') depth++;
        else if (contents[i] === ')') {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
      const callExpression = contents.slice(match.index, endIndex);
      const referencesSourceField = /\.(body|headline|standfirst)\b/.test(callExpression);
      const stringifiesCommentsOrArticles = /JSON\.stringify\s*\([^)]*\b(comments?|articles?)\b[^)]*\)/i.test(
        callExpression,
      );
      if (referencesSourceField || stringifiesCommentsOrArticles) {
        offending.push(callExpression.replace(/\s+/g, ' ').trim().slice(0, 200));
      }
    }
    return offending;
  }

  it('the scanner catches a console.log call whose offending .body access is on a later line (Gate 3 bypass #1)', () => {
    const bypass = `console.log(\n  "debug:",\n  comment.body,\n);`;
    expect(findForbiddenLoggingCalls(bypass)).toHaveLength(1);
  });

  it('the scanner catches JSON.stringify of a comments/articles collection (Gate 3 bypass #2)', () => {
    expect(findForbiddenLoggingCalls('console.log(JSON.stringify(comments));')).toHaveLength(1);
    expect(findForbiddenLoggingCalls('console.error(JSON.stringify(articles));')).toHaveLength(1);
  });

  it('the scanner catches process.stdout.write / process.stderr.write, not just console.* (Gate 3 bypass #3)', () => {
    expect(findForbiddenLoggingCalls('process.stdout.write(comment.body);')).toHaveLength(1);
    expect(findForbiddenLoggingCalls('process.stderr.write(article.headline);')).toHaveLength(1);
  });

  it('the scanner does not flag an ordinary, text-free console.log call', () => {
    expect(findForbiddenLoggingCalls('console.log(`[ingest:sentiment] rows written: ${rows.length}`);')).toEqual([]);
  });

  // Glob-based, not a name pattern (Gate 3 bypass #4/#5): a new lib file that
  // doesn't start with "sentiment-"/"reddit-client"/"guardian-client", or any
  // new file under src/scripts/, used to fall outside the old name-regex
  // scan entirely. Scanning every non-spec .ts file under both directories
  // means a new file is covered automatically, with nothing to keep in sync.
  function listNonSpecTsFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true } as never)
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))
      .map((entry) => join(dir, entry));
  }

  it('no non-spec .ts file under src/lib or src/scripts logs a comment body / headline / standfirst / stringified collection', () => {
    const filesToScan = [...listNonSpecTsFiles(LIB_DIR), ...listNonSpecTsFiles(SCRIPTS_DIR)];
    // Sanity floor so a broken glob (e.g. wrong dir) can't silently scan zero files and pass vacuously.
    expect(filesToScan.length).toBeGreaterThan(5);

    for (const filePath of filesToScan) {
      const contents = readFileSync(filePath, 'utf8');
      const offending = findForbiddenLoggingCalls(contents);
      expect(offending, `${filePath} appears to log source text:\n${offending.join('\n')}`).toEqual([]);
    }
  });
});

describe('D20 retention — upsert-site guard (scripts/sentiment.ts)', () => {
  it('scripts/sentiment.ts currently has no write path to sentiment_scores at all, so no field (debug or otherwise) can be smuggled into a real upsert', () => {
    // Both live branches in scripts/sentiment.ts unconditionally refuse to run
    // (task #78 Gate 2 finding — no real Reddit thread lookup or Guardian
    // query builder exists yet), so the script never builds a row or calls
    // `.from('sentiment_scores')` at all today. This assertion is the
    // strongest form of "nothing extra gets upserted" available while that
    // remains true: there is no upsert call to add a field to.
    //
    // The moment a real live path is wired back in (follow-up work), this
    // test MUST be replaced with one that spies on the Supabase client's
    // `.upsert()` call and asserts its payload came only from
    // buildRedditRows/buildGuardianRow's return value (whose shape the
    // "structural whitelist" tests above already pin) — a bare "no upsert
    // exists" assertion will no longer hold, and must not be quietly deleted
    // without that replacement.
    const scriptPath = join(SCRIPTS_DIR, 'sentiment.ts');
    const contents = readFileSync(scriptPath, 'utf8');
    expect(contents).not.toMatch(/\.from\(\s*['"]sentiment_scores['"]\s*\)/);
  });
});
