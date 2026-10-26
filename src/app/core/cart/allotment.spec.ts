import { AllotmentRule, preferSpecificCoverage, ruleForCategories } from './allotment';

const BASE_RULE: AllotmentRule = {
  ruleId: 1,
  ruleName: 'Base Rule',
  allotType: 'DOLLAR',
  primaryUnit: 'DOLLARS',
  isBarRule: 'N',
  dollars: { total: 500, used: 0, inCart: 0, available: 500 },
  units: null,
  points: null,
  cycle: {
    renewalBasis: 'FIXED',
    renewalPeriodMonths: 12,
    cycleStart: null,
    cycleEnd: null,
    renewsOn: null,
    expirationDate: null,
    onExpiration: 'SUSPEND',
  },
  covers: { allAssortments: 'Y', categories: [], unitGrants: [] },
  carryover: { type: 'FORFEIT', pct: null, capAmount: null, carriedIn: null },
  quotas: [],
  fallbacks: [],
};

describe('ruleForCategories', () => {
  it('returns null when nothing covers the category', () => {
    const specificRule: AllotmentRule = {
      ...BASE_RULE,
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };
    expect(ruleForCategories([specificRule], [999])).toBeNull();
  });

  it('returns a rule covering "any item in the catalog" for a category it has no specific entry for', () => {
    expect(ruleForCategories([BASE_RULE], [999])).toBe(BASE_RULE);
  });

  it('prefers a covering units rule over a dollar rule for the same category', () => {
    const unitsRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'Unit Allotment',
      allotType: 'UNITS',
      primaryUnit: 'UNITS',
      dollars: null,
      units: { total: 5, used: 0, inCart: 0, available: 5 },
      covers: { allAssortments: 'N', categories: [], unitGrants: [{ progCatId: 10, categoryName: 'Cap', unitQty: 5 }] },
    };
    const dollarRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 3,
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };

    expect(ruleForCategories([dollarRule, unitsRule], [10])).toBe(unitsRule);
  });

  it('skips an exhausted units rule in favor of a dollar rule that covers the same category', () => {
    const exhaustedUnitsRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      allotType: 'UNITS',
      primaryUnit: 'UNITS',
      dollars: null,
      units: { total: 5, used: 5, inCart: 0, available: 0 },
      covers: { allAssortments: 'N', categories: [], unitGrants: [{ progCatId: 10, categoryName: 'Cap', unitQty: 5 }] },
    };
    const dollarRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 3,
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };

    expect(ruleForCategories([exhaustedUnitsRule, dollarRule], [10])).toBe(dollarRule);
  });

  it('prefers a dollar rule scoped to the category over a generic "any item" dollar rule, regardless of array order', () => {
    const genericRule: AllotmentRule = { ...BASE_RULE, ruleId: 1, ruleName: 'General Allotment' };
    const specificRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'Cap Allowance',
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };

    // Generic rule listed first — a plain `.find()` would wrongly pick it.
    expect(ruleForCategories([genericRule, specificRule], [10])).toBe(specificRule);
    // Order-independent either way.
    expect(ruleForCategories([specificRule, genericRule], [10])).toBe(specificRule);
  });

  it('returns null (does not fall through to the generic rule or to points) when the specific dollar rule is in scope but empty', () => {
    const genericRule: AllotmentRule = { ...BASE_RULE, ruleId: 1, ruleName: 'General Allotment' };
    const emptySpecificRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'Cap Allowance',
      dollars: { total: 100, used: 100, inCart: 0, available: 0 },
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };
    const pointsRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 3,
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      dollars: null,
      points: { total: 100, used: 0, inCart: 0, available: 100 },
    };

    expect(ruleForCategories([genericRule, emptySpecificRule, pointsRule], [10])).toBeNull();
  });

  it('prefers a points rule scoped to the category over a generic one, among those that still have room', () => {
    const genericRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      ruleName: 'General Points',
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      dollars: null,
      points: { total: 500, used: 0, inCart: 0, available: 500 },
    };
    const specificRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'Cap Points',
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      dollars: null,
      points: { total: 100, used: 0, inCart: 0, available: 100 },
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };

    expect(ruleForCategories([genericRule, specificRule], [10])).toBe(specificRule);
  });

  it('skips an empty specific points rule in favor of a generic one that still has room', () => {
    const emptySpecificRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      ruleName: 'Cap Points',
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      dollars: null,
      points: { total: 100, used: 100, inCart: 0, available: 0 },
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };
    const genericRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'General Points',
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      dollars: null,
      points: { total: 500, used: 0, inCart: 0, available: 500 },
    };

    expect(ruleForCategories([emptySpecificRule, genericRule], [10])).toBe(genericRule);
  });
});

describe('ruleForCategories — category-depth tie-break', () => {
  // Apparel(0) > Outerwear(1) > Trousers(2) — mirrors the real catalog
  // shape: "Officer 700 Uniform" covers the broad "Outerwear" ancestor,
  // "Officer Pants $250" covers "Trousers" itself, a category nested
  // *under* Outerwear.
  const DEPTHS: Record<number, number> = { 1: 0, 10: 1, 20: 2 }; // Apparel, Outerwear, Trousers
  const categoryDepth = (progCatId: number) => DEPTHS[progCatId] ?? null;
  const TROUSER_PROG_CAT_IDS = [1, 10, 20];

  it('prefers the rule reaching the product through its deepest matching category, regardless of rule order', () => {
    const outerwearRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      ruleName: 'Officer 700 Uniform',
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Outerwear' }], unitGrants: [] },
    };
    const trousersRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'Officer Pants $250',
      covers: { allAssortments: 'N', categories: [{ progCatId: 20, categoryName: 'Trousers' }], unitGrants: [] },
    };

    expect(ruleForCategories([outerwearRule, trousersRule], TROUSER_PROG_CAT_IDS, categoryDepth)).toBe(trousersRule);
    expect(ruleForCategories([trousersRule, outerwearRule], TROUSER_PROG_CAT_IDS, categoryDepth)).toBe(trousersRule);
  });

  it('falls back to rule order when no categoryDepth resolver is given', () => {
    const outerwearRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      ruleName: 'Officer 700 Uniform',
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Outerwear' }], unitGrants: [] },
    };
    const trousersRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'Officer Pants $250',
      covers: { allAssortments: 'N', categories: [{ progCatId: 20, categoryName: 'Trousers' }], unitGrants: [] },
    };

    expect(ruleForCategories([outerwearRule, trousersRule], TROUSER_PROG_CAT_IDS)).toBe(outerwearRule);
  });

  it('does the same depth tie-break among points rules', () => {
    const genericPoints: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      ruleName: 'General Points',
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      dollars: null,
      points: { total: 500, used: 0, inCart: 0, available: 500 },
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Outerwear' }], unitGrants: [] },
    };
    const trouserPoints: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      ruleName: 'Trouser Points',
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      dollars: null,
      points: { total: 100, used: 0, inCart: 0, available: 100 },
      covers: { allAssortments: 'N', categories: [{ progCatId: 20, categoryName: 'Trousers' }], unitGrants: [] },
    };

    expect(ruleForCategories([genericPoints, trouserPoints], TROUSER_PROG_CAT_IDS, categoryDepth)).toBe(trouserPoints);
  });
});

describe('preferSpecificCoverage', () => {
  it('returns undefined for an empty list', () => {
    expect(preferSpecificCoverage([])).toBeUndefined();
  });

  it('returns the only candidate when there is just one', () => {
    expect(preferSpecificCoverage([BASE_RULE])).toBe(BASE_RULE);
  });

  it('returns the first generic ("any item") candidate when none is specific', () => {
    const second = { ...BASE_RULE, ruleId: 2 };
    expect(preferSpecificCoverage([BASE_RULE, second])).toBe(BASE_RULE);
  });

  it('prefers a specific candidate over a generic one, regardless of order', () => {
    const generic = { ...BASE_RULE, ruleId: 1 };
    const specific: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };
    expect(preferSpecificCoverage([generic, specific])).toBe(specific);
    expect(preferSpecificCoverage([specific, generic])).toBe(specific);
  });

  it('keeps the first specific candidate when more than one is specific and no categoryDepth is given', () => {
    const specificA: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Cap' }], unitGrants: [] },
    };
    const specificB: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      covers: { allAssortments: 'N', categories: [{ progCatId: 11, categoryName: 'Shirt' }], unitGrants: [] },
    };
    expect(preferSpecificCoverage([specificA, specificB])).toBe(specificA);
  });

  it('with a categoryDepth resolver, breaks a tie between two specific candidates by picking the deeper matching category', () => {
    const outerwear: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Outerwear' }], unitGrants: [] },
    };
    const trousers: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      covers: { allAssortments: 'N', categories: [{ progCatId: 20, categoryName: 'Trousers' }], unitGrants: [] },
    };
    const depth = (id: number) => ({ 10: 1, 20: 2 })[id as 10 | 20] ?? null;

    expect(preferSpecificCoverage([outerwear, trousers], [10, 20], depth)).toBe(trousers);
    expect(preferSpecificCoverage([trousers, outerwear], [10, 20], depth)).toBe(trousers);
  });

  it('ignores a candidate whose covered category is not actually in progCatIds when ranking by depth', () => {
    const outerwear: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 1,
      covers: { allAssortments: 'N', categories: [{ progCatId: 10, categoryName: 'Outerwear' }], unitGrants: [] },
    };
    // Covers a deep category the product doesn't actually belong to — must
    // not win just because its (irrelevant) category resolves a high depth.
    const unrelatedDeepRule: AllotmentRule = {
      ...BASE_RULE,
      ruleId: 2,
      covers: { allAssortments: 'N', categories: [{ progCatId: 99, categoryName: 'Somewhere else' }], unitGrants: [] },
    };
    const depth = (id: number) => ({ 10: 1, 99: 5 })[id as 10 | 99] ?? null;

    expect(preferSpecificCoverage([outerwear, unrelatedDeepRule], [10], depth)).toBe(outerwear);
  });
});
