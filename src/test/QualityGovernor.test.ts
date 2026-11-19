import { describe, expect, it } from 'vitest';
import { QualityGovernor } from '@/lib/QualityGovernor';

describe('QualityGovernor', () => {
  it('starts at a moderate picture and drops quality after repeated congestion', () => {
    const g = new QualityGovernor();
    const start = g.current();
    expect(start.maxSide).toBe(800);
    g.congested(); expect(g.current()).toEqual(start);
    g.congested();
    expect(g.current().quality).toBeLessThan(start.quality);
  });
  it('never goes below the lowest step', () => {
    const g = new QualityGovernor();
    for (let i = 0; i < 100; i++) g.congested();
    expect(g.current().maxSide).toBeGreaterThanOrEqual(480);
    expect(g.current().quality).toBeGreaterThanOrEqual(0.35);
  });
  it('recovers one step after a long clean run', () => {
    const g = new QualityGovernor();
    g.congested(); g.congested();
    const low = g.current();
    for (let i = 0; i < 60; i++) g.sent();
    expect(g.current().quality).toBeGreaterThan(low.quality);
  });
});
