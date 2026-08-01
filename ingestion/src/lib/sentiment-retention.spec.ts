// PRD D20 retention invariant, automated: "no comment/headline text
// persisted or logged — enforce with a lint rule or equivalent automated
// check." This suite is that check. It must fail if someone reintroduces
// source-text persistence or logging into the sentiment pipeline, so it
// combines two independent techniques rather than trusting either alone:
//
//  1. Behavioural: runs the real row-building functions against fixture
//     text containing a unique, unmistakable marker string, with
//     console.log/warn/error spied, and asserts the marker appears in
//     neither the returned rows (what would be persisted to
//     `sentiment_scores`) nor anything logged.
//  2. Structural whitelist: asserts every row has *exactly* the column set
//     PRD D20 permits — an added field (however named) fails the test
//     immediately, even before anyone wires it up to a real insert.
//  3. Static source scan: greps every sentiment-related source file for a
//     `console.*` call on the same line as a known source-text field
//     access (`.body`, `.headline`, `.standfirst`) — the "lint rule"
//     equivalent, catching a mistake even in code this suite's fixtures
//     don't happen to exercise.

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
  // Every file this project's sentiment pipeline touches. Listed
  // explicitly (rather than a broad glob) so this test fails loudly if a
  // new sentiment-related file is added and forgotten here, rather than
  // silently skipping it.
  const filesToScan = [
    join(LIB_DIR, 'reddit-client.ts'),
    join(LIB_DIR, 'guardian-client.ts'),
    join(LIB_DIR, 'sentiment-pipeline.ts'),
    join(LIB_DIR, 'sentiment-scorer.ts'),
    join(LIB_DIR, 'sentiment-buckets.ts'),
    join(LIB_DIR, 'sentiment-lexicon.ts'),
    join(SCRIPTS_DIR, 'sentiment.ts'),
  ];

  // Matches a line that both logs (console.log/warn/error/info/debug) AND
  // touches a known source-text field — the shape a real regression would
  // take (e.g. `console.log(comment.body)` or `console.error(article.headline)`).
  const SUSPICIOUS_LINE = /console\.(log|warn|error|info|debug)[^;]*\.(body|headline|standfirst)\b/;

  it('lists every sentiment-related source file (guards this test itself against silently going stale)', () => {
    const actualLibFiles = readdirSync(LIB_DIR).filter((f) => /^sentiment-|^reddit-client|^guardian-client/.test(f) && f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    const scannedBasenames = filesToScan.map((f) => f.split(/[\\/]/).pop());
    for (const file of actualLibFiles) {
      expect(scannedBasenames).toContain(file);
    }
  });

  it('no sentiment-related source file logs a comment body / headline / standfirst', () => {
    for (const filePath of filesToScan) {
      const contents = readFileSync(filePath, 'utf8');
      const offendingLines = contents.split('\n').filter((line) => SUSPICIOUS_LINE.test(line));
      expect(offendingLines, `${filePath} appears to log source text:\n${offendingLines.join('\n')}`).toEqual([]);
    }
  });
});
