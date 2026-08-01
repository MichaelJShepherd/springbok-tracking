import { describe, expect, it, vi } from 'vitest';
import { printStubPlan, USER_AGENT } from './ingestion-run.js';

describe('printStubPlan', () => {
  it('prints the source, the honest User-Agent, and every step in order', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printStubPlan({
      source: 'example-source',
      description: 'Would do the example thing.',
      steps: ['first step', 'second step'],
    });

    const lines = logSpy.mock.calls.map((call) => call[0]);
    expect(lines[0]).toContain('example-source');
    expect(lines).toContainEqual(expect.stringContaining(USER_AGENT));
    expect(lines).toContainEqual(expect.stringContaining('1. first step'));
    expect(lines).toContainEqual(expect.stringContaining('2. second step'));
    expect(lines).toContainEqual(expect.stringContaining('No network calls made'));

    logSpy.mockRestore();
  });

  it('never mentions live fetching succeeding — it is a stub only', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printStubPlan({ source: 's', description: 'd', steps: [] });

    const output = logSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toMatch(/stub only/i);

    logSpy.mockRestore();
  });
});
