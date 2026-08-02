/**
 * D29's four era buckets — used everywhere the site needs an "era" so the
 * vocabulary stays single (docs/design.md §7.2): pre-1950, 1950–1995,
 * 1996–2010, 2011–.
 */
export const ERA_BUCKETS = ['Pre-1950', '1950–1995', '1996–2010', '2011–'] as const;
export type EraBucket = (typeof ERA_BUCKETS)[number];

export function eraBucketOf(matchDate: string): EraBucket {
  const year = Number(matchDate.slice(0, 4));
  if (year < 1950) return 'Pre-1950';
  if (year <= 1995) return '1950–1995';
  if (year <= 2010) return '1996–2010';
  return '2011–';
}
