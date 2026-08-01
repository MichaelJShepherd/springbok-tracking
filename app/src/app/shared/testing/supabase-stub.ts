import { SupabaseService } from '../../core/supabase.service';

/** One recorded call in a chained Supabase query builder, e.g. `.eq('a', 1)`. */
export interface QueryCall {
  method: string;
  args: unknown[];
}

export interface QueryResult {
  data: unknown;
  error: unknown;
}

export interface QueryMatcher {
  table: string;
  /** Match on the full sequence of chained calls made for a `.from(table)` query. */
  match: (calls: QueryCall[]) => boolean;
  result: QueryResult | (() => QueryResult);
}

const CHAIN_METHODS = ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'limit'] as const;

/**
 * A minimal fluent stand-in for `@supabase/supabase-js`'s query builder, for
 * component tests. Each `.from(table)` call gets its own recorded chain of
 * method calls; when the chain is awaited (or `.maybeSingle()` is called),
 * the first matcher whose `table` and `match(calls)` both hit wins.
 *
 * Throws loudly if no matcher fits, rather than silently returning
 * `undefined` — a test with an unmatched query should fail obviously, not
 * pass by accident.
 */
export function createSupabaseStub(matchers: QueryMatcher[]): SupabaseService {
  function makeBuilder(table: string) {
    const calls: QueryCall[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};

    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    }

    const resolve = (): QueryResult => {
      const matcher = matchers.find((m) => m.table === table && m.match(calls));
      if (!matcher) {
        throw new Error(
          `No stub matcher for table "${table}" with calls ${JSON.stringify(calls)}`,
        );
      }
      return typeof matcher.result === 'function' ? matcher.result() : matcher.result;
    };

    builder.maybeSingle = () => Promise.resolve(resolve());
    // Makes the builder itself awaitable when no terminal method is called
    // (mirrors supabase-js, where the query builder is a PromiseLike).
    builder.then = (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);

    return builder;
  }

  return {
    client: {
      from: (table: string) => makeBuilder(table),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/**
 * A stand-in for a Supabase client that is simply unreachable — every
 * chained call (`.select().gte().order()`, `.eq().is().maybeSingle()`, …)
 * stays chainable, and awaiting the result always rejects. Used to prove a
 * component degrades to its honest error state instead of throwing when
 * local Supabase is down (PRD D19 adversarial pass).
 */
export function createUnreachableSupabaseStub(message = 'fetch failed'): SupabaseService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of [...CHAIN_METHODS, 'maybeSingle']) {
    builder[method] = () => builder;
  }
  builder.then = (
    _onFulfilled?: (value: never) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.reject(new Error(message)).then(undefined, onRejected);

  return {
    client: {
      from: () => builder,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
