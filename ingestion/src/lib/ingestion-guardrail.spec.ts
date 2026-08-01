import { describe, expect, it } from 'vitest';
import { completenessRatio, evaluateGuardrail } from './ingestion-guardrail.js';

describe('completenessRatio', () => {
  it('is 0 when there are no fields sampled, not NaN', () => {
    expect(completenessRatio({ totalFields: 0, presentFields: 0 })).toBe(0);
  });

  it('computes present/total', () => {
    expect(completenessRatio({ totalFields: 10, presentFields: 7 })).toBeCloseTo(0.7);
  });
});

describe('evaluateGuardrail (PRD D25)', () => {
  it('fails when zero rows were written even with perfect completeness', () => {
    const result = evaluateGuardrail(0, { totalFields: 0, presentFields: 0 }, undefined);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/zero rows/);
  });

  it('passes a healthy run with no previous baseline to compare against', () => {
    const result = evaluateGuardrail(100, { totalFields: 500, presentFields: 400 }, undefined);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('fails when completeness drops by more than 20 points vs the previous run', () => {
    const previous = { totalFields: 100, presentFields: 90 }; // 90%
    const current = { totalFields: 100, presentFields: 60 }; // 60% -> 30pt drop
    const result = evaluateGuardrail(50, current, previous);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/completeness dropped/);
  });

  it('passes when completeness drops by less than 20 points vs the previous run', () => {
    const previous = { totalFields: 100, presentFields: 90 }; // 90%
    const current = { totalFields: 100, presentFields: 75 }; // 75% -> 15pt drop
    const result = evaluateGuardrail(50, current, previous);
    expect(result.passed).toBe(true);
  });

  it('does not compare against a previous run with zero sampled fields (no usable baseline)', () => {
    const result = evaluateGuardrail(10, { totalFields: 10, presentFields: 1 }, { totalFields: 0, presentFields: 0 });
    expect(result.passed).toBe(true);
  });
});
