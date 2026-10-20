import { Allotment, AllotmentQuota, AllotmentRule, Cart, CartItem, LineTag } from './cart';
import {
  amountDueAtCheckout,
  exceededQuotas,
  exceededUnitRules,
  paidFromLines,
  pointsShortfall,
  quotaExceededMessage,
  quotaStatuses,
  resolvedAllocations,
  unitRuleExceededMessage,
} from './cart-totals';
import { POINTS_ONLY_ALLOTMENT } from './cart.testing';

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartItemId: 81,
    skuId: 63416,
    quantity: 1,
    priceAtAdd: 128.91,
    pointsAtAdd: 2,
    lineTotalPrice: 128.91,
    lineTotalPoints: 2,
    productPk: 4576,
    productTitle: 'SHIRT | FIRST TACTICAL | MENS | V2 LONG SLEEVE | NAVY | 111006',
    handle: '111006-729-efd',
    skuCode: '111006-729-EFD-XS-REG',
    currentPrice: 128.91,
    currentPoints: 2,
    priceChanged: 'N',
    pointsChanged: 'N',
    isAvailable: 'Y',
    imageUrl: '/photos/partner-2/products/111006-729-EFD.JPG',
    options: [],
    progCatIds: [],
    ...overrides,
  };
}

function makeTag(overrides: Partial<LineTag> = {}): LineTag {
  return {
    cartItemId: 81,
    skuId: 63416,
    ruleId: 7,
    payUnit: 'POINTS',
    tagLabel: 'Uniform Allowance',
    allocations: [],
    ...overrides,
  };
}

describe('resolvedAllocations', () => {
  it('falls back to the line\'s own points total, not its quantity, for a POINTS tag', () => {
    const item = makeItem({ quantity: 1, lineTotalPoints: 2 });
    const tag = makeTag({ payUnit: 'POINTS' });

    const [allocation] = resolvedAllocations(item, tag);

    expect(allocation.amount).toBe(2);
  });

  it('still uses quantity as the fallback amount for a UNITS tag', () => {
    const item = makeItem({ quantity: 3, lineTotalPoints: null });
    const tag = makeTag({ payUnit: 'UNITS' });

    const [allocation] = resolvedAllocations(item, tag);

    expect(allocation.amount).toBe(3);
  });

  it('uses the line total price as the fallback amount for a DOLLARS tag', () => {
    const item = makeItem({ lineTotalPrice: 128.91 });
    const tag = makeTag({ payUnit: 'DOLLARS' });

    const [allocation] = resolvedAllocations(item, tag);

    expect(allocation.amount).toBe(128.91);
  });

  it('falls back to quantity for a POINTS tag whose line has no points total', () => {
    const item = makeItem({ quantity: 2, lineTotalPoints: null });
    const tag = makeTag({ payUnit: 'POINTS' });

    const [allocation] = resolvedAllocations(item, tag);

    expect(allocation.amount).toBe(2);
  });

  it('prefers the API\'s own detailed allocations when present', () => {
    const item = makeItem({ lineTotalPoints: 2 });
    const tag = makeTag({
      payUnit: 'POINTS',
      allocations: [{ ruleId: 7, payUnit: 'POINTS', amount: 2 }],
    });

    expect(resolvedAllocations(item, tag)).toEqual([{ ruleId: 7, payUnit: 'POINTS', amount: 2 }]);
  });

  it('returns nothing when there is no tag for this line', () => {
    expect(resolvedAllocations(makeItem(), undefined)).toEqual([]);
  });

  it('returns nothing when the tag has no rule applied', () => {
    const tag = makeTag({ ruleId: null, payUnit: null });
    expect(resolvedAllocations(makeItem(), tag)).toEqual([]);
  });
});

function makeOverdrawnPointsCart(overdraftPoints: number): Cart {
  const rule: AllotmentRule = {
    ...POINTS_ONLY_ALLOTMENT.rules[0],
    points: { total: 400, used: 0, inCart: 400 + overdraftPoints, available: -overdraftPoints },
  };
  const allotment: Allotment = { ...POINTS_ONLY_ALLOTMENT, rules: [rule] };
  // A pure-points SKU with no real dollar price at all — the case that
  // silently defeated `amountDueAtCheckout`'s dollar-prorated shortfall.
  const item = makeItem({
    cartItemId: 81,
    lineTotalPrice: 0,
    lineTotalPoints: 400 + overdraftPoints,
    quantity: 1,
  });
  return {
    cartId: 1,
    itemCount: 1,
    subtotalPrice: 0,
    subtotalPoints: 400 + overdraftPoints,
    items: [item],
    allotment: {
      ...allotment,
      lineTags: [
        { cartItemId: 81, skuId: 63416, ruleId: rule.ruleId, payUnit: 'POINTS', tagLabel: 'Points Allowance', allocations: [] },
      ],
    },
  };
}

describe('pointsShortfall', () => {
  it("is 0 when the points rule's balance is not over-drawn", () => {
    const cart = makeOverdrawnPointsCart(-100);
    expect(pointsShortfall(cart)).toBe(0);
  });

  it("is the exact over-drawn amount when the points rule's balance is negative", () => {
    const cart = makeOverdrawnPointsCart(250);
    expect(pointsShortfall(cart)).toBe(250);
  });

  it('ignores a dollar or units rule even if over-drawn — points-only', () => {
    const dollarRule: AllotmentRule = {
      ...POINTS_ONLY_ALLOTMENT.rules[0],
      primaryUnit: 'DOLLARS',
      dollars: { total: 100, used: 0, inCart: 150, available: -50 },
      points: null,
    };
    // Not points-priced at all — this cart's only rule pays in dollars, so
    // there'd be nothing for a points allocation to mean here.
    const base = makeOverdrawnPointsCart(0);
    const cart: Cart = {
      ...base,
      items: [{ ...base.items[0], lineTotalPoints: null }],
      allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [dollarRule] },
    };
    expect(pointsShortfall(cart)).toBe(0);
  });

  it("adds a line's full points when nothing tags it to any rule at all, even though no rule is over-drawn", () => {
    // Rule balance is fine on its own (13 of 30 left) — the problem is
    // purely that the second line was never tagged to it (or anything).
    const rule: AllotmentRule = {
      ...POINTS_ONLY_ALLOTMENT.rules[0],
      points: { total: 30, used: 0, inCart: 17, available: 13 },
    };
    const coveredItem = makeItem({ cartItemId: 81, lineTotalPrice: 0, lineTotalPoints: 17, quantity: 1 });
    const uncoveredItem = makeItem({ cartItemId: 82, lineTotalPrice: 0, lineTotalPoints: 2, quantity: 1 });
    const cart: Cart = {
      cartId: 1,
      itemCount: 2,
      subtotalPrice: 0,
      subtotalPoints: 19,
      items: [coveredItem, uncoveredItem],
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [rule],
        lineTags: [
          { cartItemId: 81, skuId: 63416, ruleId: rule.ruleId, payUnit: 'POINTS', tagLabel: 'Points Allowance', allocations: [] },
          // No entry at all for cartItemId 82 — nothing covers it.
        ],
      },
    };

    expect(pointsShortfall(cart)).toBe(2);
  });

  it('sums an uncovered line on top of a separate over-drawn rule, rather than one masking the other', () => {
    const cart = makeOverdrawnPointsCart(250);
    const uncoveredItem = makeItem({ cartItemId: 82, lineTotalPrice: 0, lineTotalPoints: 5, quantity: 1 });
    const cartWithExtraUncoveredItem: Cart = {
      ...cart,
      items: [...cart.items, uncoveredItem],
      subtotalPoints: (cart.subtotalPoints ?? 0) + 5,
    };

    expect(pointsShortfall(cartWithExtraUncoveredItem)).toBe(255);
  });
});

describe('paidFromLines', () => {
  it("caps the claimed amount at the rule's real remaining balance (total - used), not the over-requested inCart amount", () => {
    // Total 400, used 0, but 420 was requested against it (20 over) —
    // matches the reported case: the rule can really only give 400.
    const cart = makeOverdrawnPointsCart(20);

    expect(paidFromLines(cart)).toEqual([{ ruleName: 'Points Allowance', unit: 'POINTS', amount: 400 }]);
  });

  it('shows the plain inCart amount unchanged when the rule is not over-drawn', () => {
    const cart = makeOverdrawnPointsCart(-50);

    expect(paidFromLines(cart)).toEqual([{ ruleName: 'Points Allowance', unit: 'POINTS', amount: 350 }]);
  });

  it('omits a rule with nothing in cart', () => {
    const cart = makeOverdrawnPointsCart(-400);

    expect(paidFromLines(cart)).toEqual([]);
  });
});

describe('amountDueAtCheckout', () => {
  it("stays 0 for a pure-points SKU (no dollar price) even when its points rule is badly over-drawn — the gap pointsShortfall exists to cover", () => {
    // Documents why `amountDueAtCheckout` alone can't gate a points-only
    // checkout: its shortfall is prorated through `item.lineTotalPrice`,
    // which is 0 here, so it can never reflect a points overage.
    const cart = makeOverdrawnPointsCart(1100);
    expect(amountDueAtCheckout(cart)).toBe(0);
    expect(pointsShortfall(cart)).toBe(1100);
  });
});

const CAP_QUOTA: AllotmentQuota = {
  quotaId: 12,
  programId: 3,
  programName: "St John's Fire",
  progCatId: 63,
  categoryName: 'Cap',
  limitType: 'UNITS',
  limitValue: 2,
};

const SHOE_QUOTA: AllotmentQuota = {
  quotaId: 13,
  programId: 3,
  programName: "St John's Fire",
  progCatId: 66,
  categoryName: 'Shoe',
  limitType: 'UNITS',
  limitValue: 2,
};

function cartWithQuotas(quotas: AllotmentQuota[], items: CartItem[]): Cart {
  const rule: AllotmentRule = { ...POINTS_ONLY_ALLOTMENT.rules[0], quotas };
  return {
    cartId: 1,
    itemCount: items.length,
    subtotalPrice: 0,
    subtotalPoints: 0,
    items,
    allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] },
  };
}

describe('quotaStatuses / exceededQuotas', () => {
  it('is not exceeded when the matching items stay at or under the limit', () => {
    const cap = makeItem({ cartItemId: 1, quantity: 2, progCatIds: [63] });
    const cart = cartWithQuotas([CAP_QUOTA], [cap]);

    const [status] = quotaStatuses(cart);
    expect(status.used).toBe(2);
    expect(status.exceeded).toBe(false);
    expect(exceededQuotas(cart)).toEqual([]);
  });

  it('is exceeded once the matching items go over the limit, matching the real reported case (qty 5 against a 2-unit Cap quota)', () => {
    const cap = makeItem({ cartItemId: 1, quantity: 5, progCatIds: [63] });
    const cart = cartWithQuotas([CAP_QUOTA], [cap]);

    const [status] = quotaStatuses(cart);
    expect(status.used).toBe(5);
    expect(status.exceeded).toBe(true);
    expect(exceededQuotas(cart)).toEqual([status]);
  });

  it('sums every matching line toward the same quota, across different cart items', () => {
    const capA = makeItem({ cartItemId: 1, quantity: 1, progCatIds: [63] });
    const capB = makeItem({ cartItemId: 2, quantity: 2, progCatIds: [63] });
    const cart = cartWithQuotas([CAP_QUOTA], [capA, capB]);

    expect(quotaStatuses(cart)[0].used).toBe(3);
    expect(quotaStatuses(cart)[0].exceeded).toBe(true);
  });

  it('keeps two distinct quotas on the same rule independent, even with the same limit value — not a duplicate', () => {
    const cap = makeItem({ cartItemId: 1, quantity: 5, progCatIds: [63] });
    const shoe = makeItem({ cartItemId: 2, quantity: 1, progCatIds: [66] });
    const cart = cartWithQuotas([CAP_QUOTA, SHOE_QUOTA], [cap, shoe]);

    const statuses = quotaStatuses(cart);
    expect(statuses).toHaveLength(2);
    expect(statuses.find((s) => s.quota.quotaId === 12)?.exceeded).toBe(true);
    expect(statuses.find((s) => s.quota.quotaId === 13)?.exceeded).toBe(false);
  });

  it('skips a quota with no progCatId — nothing client-side to match it against', () => {
    const item = makeItem({ cartItemId: 1, quantity: 10, progCatIds: [] });
    const cart = cartWithQuotas([{ ...CAP_QUOTA, progCatId: null, categoryName: null }], [item]);

    expect(quotaStatuses(cart)).toEqual([]);
  });

  it('sums dollars (not quantity) for a DOLLARS-type quota', () => {
    const item = makeItem({ cartItemId: 1, quantity: 1, lineTotalPrice: 150, progCatIds: [63] });
    const dollarQuota: AllotmentQuota = { ...CAP_QUOTA, limitType: 'DOLLARS', limitValue: 100 };
    const cart = cartWithQuotas([dollarQuota], [item]);

    const [status] = quotaStatuses(cart);
    expect(status.used).toBe(150);
    expect(status.exceeded).toBe(true);
  });
});

describe('quotaExceededMessage', () => {
  it('matches the exact reported wording', () => {
    const status = { quota: CAP_QUOTA, ruleId: 90, used: 5, exceeded: true };
    expect(quotaExceededMessage(status)).toBe(
      "Your quota for 2 Caps is exceeded. Please adjust qty before checking out.",
    );
  });

  it('does not pluralize a limit of 1', () => {
    const status = { quota: { ...CAP_QUOTA, limitValue: 1 }, ruleId: 90, used: 2, exceeded: true };
    expect(quotaExceededMessage(status)).toBe(
      "Your quota for 1 Cap is exceeded. Please adjust qty before checking out.",
    );
  });
});

function ruleWithUnits(overrides: Partial<AllotmentRule> = {}): AllotmentRule {
  return {
    ...POINTS_ONLY_ALLOTMENT.rules[0],
    ruleId: 7,
    ruleName: 'Uniform Allowance',
    allotType: 'UNITS',
    primaryUnit: 'UNITS',
    points: null,
    units: { total: 10, used: 0, inCart: 5, available: 5 },
    ...overrides,
  };
}

describe('exceededUnitRules', () => {
  it('is empty when a units rule is not over-drawn', () => {
    const rule = ruleWithUnits({ units: { total: 10, used: 0, inCart: 5, available: 5 } });
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

    expect(exceededUnitRules(cart)).toEqual([]);
  });

  it("includes a units rule the cart's own contents have driven negative", () => {
    const rule = ruleWithUnits({ units: { total: 10, used: 4, inCart: 8, available: -2 } });
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

    expect(exceededUnitRules(cart)).toEqual([rule]);
  });

  it('excludes a rule that is over-drawn but has nothing in the cart against it', () => {
    const rule = ruleWithUnits({ units: { total: 10, used: 12, inCart: 0, available: -2 } });
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

    expect(exceededUnitRules(cart)).toEqual([]);
  });

  it('excludes a rule with no units balance at all (a dollars/points-only rule)', () => {
    const rule = ruleWithUnits({ units: null });
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

    expect(exceededUnitRules(cart)).toEqual([]);
  });
});

describe('unitRuleExceededMessage', () => {
  it('matches the expected wording', () => {
    const rule = ruleWithUnits({ ruleName: 'Uniform Allowance' });
    expect(unitRuleExceededMessage(rule)).toBe(
      'Your Uniform Allowance is exceeded. Please adjust qty before checking out.',
    );
  });
});
