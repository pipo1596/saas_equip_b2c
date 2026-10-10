import { AllocationBalance, allocateLine } from './allocation';

// A balance that covers every line it's asked about — most of the worked
// examples below aren't testing the coverage/scope test itself, just the
// draw arithmetic and ordering.
function coveringBalance(overrides: Partial<AllocationBalance> & { ruleId: number; available: number }): AllocationBalance {
  return { balanceId: overrides.ruleId, cycleEnd: null, coversLine: () => true, ...overrides };
}

const NONE: AllocationBalance[] = [];

describe('allocateLine', () => {
  // Each `it` title/scenario below is one row of the worked-examples table
  // in the allocation spec, kept in the same order and wording so a failure
  // here points straight back at the row it came from.

  it('Units + points, enough units: 3 x 50 pts, 5 units / 400 pts available -> 3 units, points untouched', () => {
    const units = [coveringBalance({ ruleId: 1, available: 5 })];
    const points = [coveringBalance({ ruleId: 2, available: 400 })];

    const result = allocateLine({ qty: 3, priceAtAdd: 0, pointsAtAdd: 50 }, { units, dollars: NONE, points });

    expect(result).toEqual({ draws: [{ type: 'UNITS', balanceId: 1, ruleId: 1, amount: 3 }], short: false });
  });

  it('Units + points, units run out: 3 x 50 pts, 2 units / 400 pts available -> 2 units + 50 pts', () => {
    const units = [coveringBalance({ ruleId: 1, available: 2 })];
    const points = [coveringBalance({ ruleId: 2, available: 400 })];

    const result = allocateLine({ qty: 3, priceAtAdd: 0, pointsAtAdd: 50 }, { units, dollars: NONE, points });

    expect(result).toEqual({
      draws: [
        { type: 'UNITS', balanceId: 1, ruleId: 1, amount: 2 },
        { type: 'POINTS', balanceId: 2, ruleId: 2, amount: 50 },
      ],
      short: false,
    });
  });

  it('Units + points, both short: 3 x 50 pts, 2 units / 20 pts available -> short', () => {
    const units = [coveringBalance({ ruleId: 1, available: 2 })];
    const points = [coveringBalance({ ruleId: 2, available: 20 })];

    const result = allocateLine({ qty: 3, priceAtAdd: 0, pointsAtAdd: 50 }, { units, dollars: NONE, points });

    expect(result.short).toBe(true);
    expect(result.draws).toEqual([
      { type: 'UNITS', balanceId: 1, ruleId: 1, amount: 2 },
      { type: 'POINTS', balanceId: 2, ruleId: 2, amount: 20 },
    ]);
  });

  it('Units + dollars + points all cover: 3 x $40 / 50 pts, 2 units / $100 / 400 pts -> 2 units + $40, points never used', () => {
    const units = [coveringBalance({ ruleId: 1, available: 2 })];
    const dollars = [coveringBalance({ ruleId: 2, available: 100 })];
    const points = [coveringBalance({ ruleId: 3, available: 400 })];

    const result = allocateLine({ qty: 3, priceAtAdd: 40, pointsAtAdd: 50 }, { units, dollars, points });

    expect(result).toEqual({
      draws: [
        { type: 'UNITS', balanceId: 1, ruleId: 1, amount: 2 },
        { type: 'DOLLARS', balanceId: 2, ruleId: 2, amount: 40 },
      ],
      short: false,
    });
  });

  it('Dollars + points, dollars short: 2 x $40 / 50 pts, $50 / 400 pts available -> short (points are not a fallback for dollars)', () => {
    const dollars = [coveringBalance({ ruleId: 1, available: 50 })];
    const points = [coveringBalance({ ruleId: 2, available: 400 })];

    const result = allocateLine({ qty: 2, priceAtAdd: 40, pointsAtAdd: 50 }, { units: NONE, dollars, points });

    expect(result.short).toBe(true);
    // Only the dollar draw — points must never be touched once a dollar
    // rule is in scope, no matter how short that dollar balance runs.
    expect(result.draws).toEqual([{ type: 'DOLLARS', balanceId: 1, ruleId: 1, amount: 50 }]);
  });

  it('Points only: 2 x 50 pts, 400 pts available -> 100 pts', () => {
    const points = [coveringBalance({ ruleId: 1, available: 400 })];

    const result = allocateLine({ qty: 2, priceAtAdd: 0, pointsAtAdd: 50 }, { units: NONE, dollars: NONE, points });

    expect(result).toEqual({ draws: [{ type: 'POINTS', balanceId: 1, ruleId: 1, amount: 100 }], short: false });
  });

  it('Free item, unit category, units gone: 1 x $0, 0 units / $100 available -> short (a $0 line cannot bypass an exhausted unit grant)', () => {
    const units = [coveringBalance({ ruleId: 1, available: 0 })];
    const dollars = [coveringBalance({ ruleId: 2, available: 100 })];

    const result = allocateLine({ qty: 1, priceAtAdd: 0, pointsAtAdd: 0 }, { units, dollars, points: NONE });

    expect(result).toEqual({ draws: [], short: true });
  });

  it('Free item, no unit grant: 1 x $0, $100 available -> covered, draws nothing', () => {
    const dollars = [coveringBalance({ ruleId: 1, available: 100 })];

    const result = allocateLine({ qty: 1, priceAtAdd: 0, pointsAtAdd: 0 }, { units: NONE, dollars, points: NONE });

    expect(result).toEqual({ draws: [], short: false });
  });

  it('Two balances, same type: 4 units needed, 3 units (expires Dec) + 5 units (expires Jun) -> all 4 from the June balance', () => {
    const units = [
      coveringBalance({ balanceId: 1, ruleId: 1, available: 3, cycleEnd: '2026-12-31' }),
      coveringBalance({ balanceId: 2, ruleId: 2, available: 5, cycleEnd: '2026-06-30' }),
    ];

    const result = allocateLine({ qty: 4, priceAtAdd: 0, pointsAtAdd: 0 }, { units, dollars: NONE, points: NONE });

    expect(result).toEqual({ draws: [{ type: 'UNITS', balanceId: 2, ruleId: 2, amount: 4 }], short: false });
  });

  it('splits a single line across units then dollars when neither alone covers it', () => {
    const units = [coveringBalance({ ruleId: 1, available: 2 })];
    const dollars = [coveringBalance({ ruleId: 2, available: 1000 })];

    const result = allocateLine({ qty: 5, priceAtAdd: 25, pointsAtAdd: 0 }, { units, dollars, points: NONE });

    // 2 units cover 2 of the 5; the remaining 3 x $25 = $75 comes from dollars.
    expect(result).toEqual({
      draws: [
        { type: 'UNITS', balanceId: 1, ruleId: 1, amount: 2 },
        { type: 'DOLLARS', balanceId: 2, ruleId: 2, amount: 75 },
      ],
      short: false,
    });
  });

  it('ignores a balance whose coversLine test fails, even if it has plenty available', () => {
    const units = [{ balanceId: 1, ruleId: 1, cycleEnd: null, available: 10, coversLine: () => false }];

    const result = allocateLine({ qty: 1, priceAtAdd: 0, pointsAtAdd: 0 }, { units, dollars: NONE, points: NONE });

    expect(result).toEqual({ draws: [], short: false });
  });

  it('mutates the balance objects it draws from, so a later call sees the reduced amount', () => {
    const sharedUnitBalance = coveringBalance({ ruleId: 1, available: 5 });

    allocateLine({ qty: 3, priceAtAdd: 0, pointsAtAdd: 0 }, { units: [sharedUnitBalance], dollars: NONE, points: NONE });
    expect(sharedUnitBalance.available).toBe(2);

    const second = allocateLine(
      { qty: 2, priceAtAdd: 0, pointsAtAdd: 0 },
      { units: [sharedUnitBalance], dollars: NONE, points: NONE },
    );
    expect(second).toEqual({ draws: [{ type: 'UNITS', balanceId: 1, ruleId: 1, amount: 2 }], short: false });
    expect(sharedUnitBalance.available).toBe(0);
  });
});
