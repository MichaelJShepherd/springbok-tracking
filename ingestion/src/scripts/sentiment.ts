import { printStubPlan } from '../lib/ingestion-run.js';

// npm run ingest:sentiment
//
// Real version (future task): score fan sentiment per match via a
// lexicon-based scorer (Reddit match threads primary, Guardian headlines
// fallback), writing only derived scores + URLs/timestamps to
// sentiment_scores — never comment/article text (PRD D2/D20).
printStubPlan({
  source: 'sentiment-ingest',
  description:
    'Would lexicon-score fan sentiment per match (Reddit match threads, falling back to Guardian headlines) into sentiment_scores.',
  steps: [
    'For each match with a Reddit match thread, fetch comments per bucket (pre/1st half/2nd half/post) via the Reddit Data API.',
    'Below 25 comments in a bucket, or with no Reddit thread at all, fall back to Guardian headline+standfirst text (PRD D2/D4).',
    'Score in-memory with an AFINN-style + rugby lexicon; persist only the score, label, bucket, source, source_url and too_few flag — never the source text itself (PRD D20).',
    'Write one ingestion_runs row (PRD D25).',
  ],
});
