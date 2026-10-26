import { Allotment, AllotmentQuota, AllotmentRule, AllotmentUnitGrant, Cart, CartItem, LineTag } from './cart';
import {
  amountDueAtCheckout,
  effectiveLineTags,
  exceededQuotas,
  exceededUnitGrants,
  exceededUnitRules,
  lineTagByItemId,
  paidFromLines,
  pointsShortfall,
  quotaExceededMessage,
  quotaStatuses,
  resolvedAllocations,
  unitGrantBalance,
  unitGrantExceededMessage,
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
    roleRequiresApproval: 'N',
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
      roleRequiresApproval: 'N',
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

    expect(paidFromLines(cart)).toEqual([
      { ruleName: 'Points Allowance', unit: 'POINTS', amount: 400, categoryBreakdown: [] },
    ]);
  });

  it('shows the plain inCart amount unchanged when the rule is not over-drawn', () => {
    const cart = makeOverdrawnPointsCart(-50);

    expect(paidFromLines(cart)).toEqual([
      { ruleName: 'Points Allowance', unit: 'POINTS', amount: 350, categoryBreakdown: [] },
    ]);
  });

  it('omits a rule with nothing in cart', () => {
    const cart = makeOverdrawnPointsCart(-400);

    expect(paidFromLines(cart)).toEqual([]);
  });

  function unitsRuleWithGrants(): AllotmentRule {
    return {
      ...POINTS_ONLY_ALLOTMENT.rules[0],
      ruleId: 12,
      ruleName: 'Unit Allotment',
      allotType: 'UNITS',
      primaryUnit: 'UNITS',
      points: null,
      units: { total: 5, used: 0, inCart: 4, available: 1 },
      covers: {
        allAssortments: 'N',
        categories: [],
        unitGrants: [
          { progCatId: 52, categoryName: 'Jacket', unitQty: 2 },
          { progCatId: 53, categoryName: 'Jobshirt', unitQty: 1 },
          { progCatId: 54, categoryName: 'Trouser', unitQty: 2 },
        ],
      },
    };
  }

  it("breaks a multi-assortment units rule's own amount down by category, counting only items this rule actually tagged", () => {
    const rule = unitsRuleWithGrants();
    const jacket = makeItem({ cartItemId: 1, skuId: 1, quantity: 1, progCatIds: [52] });
    const jobshirt = makeItem({ cartItemId: 2, skuId: 2, quantity: 2, progCatIds: [53] });
    const trouser = makeItem({ cartItemId: 3, skuId: 3, quantity: 1, progCatIds: [54] });
    // Same category as the jacket, but tagged to a *different* rule — must
    // not be folded into this rule's own breakdown.
    const otherRuleJacket = makeItem({ cartItemId: 4, skuId: 4, quantity: 9, progCatIds: [52] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 4,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [jacket, jobshirt, trouser, otherRuleJacket],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [rule],
        lineTags: [
          makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' }),
          makeTag({ cartItemId: 2, skuId: 2, ruleId: 12, payUnit: 'UNITS' }),
          makeTag({ cartItemId: 3, skuId: 3, ruleId: 12, payUnit: 'UNITS' }),
          makeTag({ cartItemId: 4, skuId: 4, ruleId: 999, payUnit: 'UNITS' }),
        ],
      },
    };

    const [line] = paidFromLines(cart);
    expect(line.categoryBreakdown).toEqual([
      { categoryName: 'Jacket', amount: 1 },
      { categoryName: 'Jobshirt', amount: 2 },
      { categoryName: 'Trouser', amount: 1 },
    ]);
  });

  it('omits a category with nothing tagged to it, rather than showing a zero line', () => {
    const rule = unitsRuleWithGrants();
    const jacket = makeItem({ cartItemId: 1, skuId: 1, quantity: 1, progCatIds: [52] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [jacket],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [{ ...rule, units: { total: 5, used: 0, inCart: 1, available: 4 } }],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(paidFromLines(cart)[0].categoryBreakdown).toEqual([{ categoryName: 'Jacket', amount: 1 }]);
  });

  it('leaves the breakdown empty for a units rule with only one assortment — nothing to break down', () => {
    const rule: AllotmentRule = {
      ...unitsRuleWithGrants(),
      covers: {
        allAssortments: 'N',
        categories: [],
        unitGrants: [{ progCatId: 52, categoryName: 'Jacket', unitQty: 5 }],
      },
    };
    const jacket = makeItem({ cartItemId: 1, skuId: 1, quantity: 4, progCatIds: [52] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [jacket],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [rule],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(paidFromLines(cart)[0].categoryBreakdown).toEqual([]);
  });

  it('leaves the breakdown empty for a non-units rule, even one with multiple unit grants on it', () => {
    const rule: AllotmentRule = {
      ...unitsRuleWithGrants(),
      allotType: 'DOLLAR_UNITS',
      primaryUnit: 'DOLLARS',
      dollars: { total: 200, used: 0, inCart: 50, available: 150 },
    };
    const jacket = makeItem({ cartItemId: 1, skuId: 1, quantity: 1, progCatIds: [52], lineTotalPrice: 50 });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 50,
      subtotalPoints: 0,
      items: [jacket],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [rule],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'DOLLARS' })],
      },
    };

    const [line] = paidFromLines(cart);
    expect(line.unit).toBe('DOLLARS');
    expect(line.categoryBreakdown).toEqual([]);
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
    roleRequiresApproval: 'N',
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
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], roleRequiresApproval: 'N', allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

    expect(exceededUnitRules(cart)).toEqual([]);
  });

  it("includes a units rule the cart's own contents have driven negative", () => {
    const rule = ruleWithUnits({ units: { total: 10, used: 4, inCart: 8, available: -2 } });
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], roleRequiresApproval: 'N', allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

    expect(exceededUnitRules(cart)).toEqual([rule]);
  });

  it('excludes a rule that is over-drawn but has nothing in the cart against it', () => {
    const rule = ruleWithUnits({ units: { total: 10, used: 12, inCart: 0, available: -2 } });
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], roleRequiresApproval: 'N', allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

    expect(exceededUnitRules(cart)).toEqual([]);
  });

  it('excludes a rule with no units balance at all (a dollars/points-only rule)', () => {
    const rule = ruleWithUnits({ units: null });
    const cart: Cart = { cartId: 1, itemCount: 0, subtotalPrice: 0, subtotalPoints: 0, items: [], roleRequiresApproval: 'N', allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [rule] } };

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

describe('unitGrantBalance', () => {
  const CAP_GRANT: AllotmentUnitGrant = {
    progCatId: 310,
    categoryName: 'Cap',
    unitQty: 2,
    remaining: 1,
    reserved: 1,
    availableBeforeCart: 0,
  };

  function emptyCart(items: CartItem[] = []): Cart {
    return { cartId: 1, itemCount: items.length, subtotalPrice: 0, subtotalPoints: 0, items, roleRequiresApproval: 'N', allotment: POINTS_ONLY_ALLOTMENT };
  }

  it("builds the grant's own Total/Used/In cart/Available straight off its posted remaining/reserved", () => {
    expect(unitGrantBalance(CAP_GRANT, emptyCart())).toEqual({
      total: 2,
      used: 1,
      reserved: 1,
      inCart: 0,
      available: 0,
    });
  });

  it('falls back to "fully available, nothing posted" when the grant carries no remaining/reserved yet', () => {
    const freshGrant: AllotmentUnitGrant = { progCatId: 60, categoryName: 'Tactical', unitQty: 5 };
    expect(unitGrantBalance(freshGrant, emptyCart())).toEqual({
      total: 5,
      used: 0,
      reserved: 0,
      inCart: 0,
      available: 5,
    });
  });

  it("sums this cart's own items tagged to the grant's category as inCart, netting it out of available", () => {
    const capInCart = makeItem({ cartItemId: 1, quantity: 1, progCatIds: [310] });
    expect(unitGrantBalance(CAP_GRANT, emptyCart([capInCart]))).toEqual({
      total: 2,
      used: 1,
      reserved: 1,
      inCart: 1,
      available: -1,
    });
  });

  it("ignores a cart item tagged to a different category entirely", () => {
    const shoeInCart = makeItem({ cartItemId: 1, quantity: 3, progCatIds: [322] });
    expect(unitGrantBalance(CAP_GRANT, emptyCart([shoeInCart])).inCart).toBe(0);
  });
});

describe('exceededUnitGrants / unitGrantExceededMessage', () => {
  function unitsRuleWithGrants(): AllotmentRule {
    return {
      ...POINTS_ONLY_ALLOTMENT.rules[0],
      ruleId: 12,
      ruleName: 'Unit Allotment',
      allotType: 'UNITS',
      primaryUnit: 'UNITS',
      points: null,
      // Pooled total still has plenty of room (7 of 11 left) — the
      // real-world case this exists for: Cap is drowning in overdraft
      // (13 against a 2-unit grant) but Tactical/Polo's own surplus hides
      // it from the rule's own pooled `available`.
      units: { total: 11, used: 4, inCart: 13, available: 7 },
      covers: {
        allAssortments: 'N',
        categories: [],
        unitGrants: [
          { progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 2, reserved: 0 },
          { progCatId: 322, categoryName: 'Polo', unitQty: 1, remaining: 1, reserved: 0 },
          { progCatId: 60, categoryName: 'Tactical', unitQty: 5, remaining: 5, reserved: 0 },
        ],
      },
    };
  }

  it("flags a specific grant the cart has drawn past its own real room, even though the rule's pooled total still looks fine", () => {
    const rule = unitsRuleWithGrants();
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 13, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [rule],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    const exceeded = exceededUnitGrants(cart);
    expect(exceeded).toHaveLength(1);
    expect(exceeded[0].grant.categoryName).toBe('Cap');
    expect(unitGrantExceededMessage(exceeded[0])).toBe(
      'Your Unit Allotment for Cap is exceeded. Please adjust qty before checking out.',
    );
  });

  it('stays empty when every grant is within its own room', () => {
    const rule = unitsRuleWithGrants();
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 2, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [{ ...rule, units: { total: 11, used: 4, inCart: 2, available: 5 } }],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(exceededUnitGrants(cart)).toEqual([]);
  });

  it('stays empty for a rule with only one assortment — already fully covered by exceededUnitRules', () => {
    const singleGrantRule: AllotmentRule = {
      ...unitsRuleWithGrants(),
      units: { total: 2, used: 0, inCart: 13, available: -11 },
      covers: {
        allAssortments: 'N',
        categories: [],
        unitGrants: [{ progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 2, reserved: 0 }],
      },
    };
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 13, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [singleGrantRule],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(exceededUnitGrants(cart)).toEqual([]);
  });

  it('ignores a cart item tagged to a different rule entirely, even if it shares the exhausted category', () => {
    const rule = unitsRuleWithGrants();
    const capUnderThisRule = makeItem({ cartItemId: 1, skuId: 1, quantity: 1, progCatIds: [310] });
    const capUnderOtherRule = makeItem({ cartItemId: 2, skuId: 2, quantity: 9, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 2,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [capUnderThisRule, capUnderOtherRule],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [rule],
        lineTags: [
          makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' }),
          makeTag({ cartItemId: 2, skuId: 2, ruleId: 999, payUnit: 'UNITS' }),
        ],
      },
    };

    expect(exceededUnitGrants(cart)).toEqual([]);
  });
});

describe('effectiveLineTags', () => {
  const UNITS_RULE: AllotmentRule = {
    ...POINTS_ONLY_ALLOTMENT.rules[0],
    ruleId: 12,
    ruleName: 'Unit Allotment',
    allotType: 'UNITS',
    primaryUnit: 'UNITS',
    points: null,
    units: { total: 11, used: 4, inCart: 13, available: 7 },
    covers: {
      allAssortments: 'N',
      categories: [],
      unitGrants: [
        { progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 2, reserved: 0 },
        { progCatId: 60, categoryName: 'Tactical', unitQty: 9, remaining: 9, reserved: 0 },
      ],
    },
  };

  const DOLLAR_RULE: AllotmentRule = {
    ...POINTS_ONLY_ALLOTMENT.rules[0],
    ruleId: 40,
    ruleName: 'General Allotment',
    allotType: 'DOLLAR',
    primaryUnit: 'DOLLARS',
    points: null,
    dollars: { total: 500, used: 0, inCart: 0, available: 500 },
    units: null,
    covers: { allAssortments: 'Y', categories: [], unitGrants: [] },
  };

  it("reattributes a line to a dollar rule that still has room, once its own category has nothing real left at all", () => {
    const exhaustedUnitsRule: AllotmentRule = {
      ...UNITS_RULE,
      covers: {
        ...UNITS_RULE.covers,
        unitGrants: [
          { progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 0, reserved: 0 },
          { progCatId: 60, categoryName: 'Tactical', unitQty: 9, remaining: 9, reserved: 0 },
        ],
      },
    };
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 13, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [exhaustedUnitsRule, DOLLAR_RULE],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    const effective = effectiveLineTags(cart);
    expect(effective.get(1)).toEqual({
      cartItemId: 1,
      skuId: 1,
      ruleId: 40,
      payUnit: 'DOLLARS',
      tagLabel: '$ allotment',
      allocations: [],
    });
    // The real tag used for checkout math is untouched.
    expect(lineTagByItemId(cart).get(1)?.ruleId).toBe(12);
  });

  it('prefers a dollar rule scoped to the item\'s own category over a generic "any item" one, once units are exhausted', () => {
    const exhaustedUnitsRule: AllotmentRule = {
      ...UNITS_RULE,
      covers: {
        ...UNITS_RULE.covers,
        unitGrants: [
          { progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 0, reserved: 0 },
          { progCatId: 60, categoryName: 'Tactical', unitQty: 9, remaining: 9, reserved: 0 },
        ],
      },
    };
    const capSpecificDollarRule: AllotmentRule = {
      ...DOLLAR_RULE,
      ruleId: 41,
      ruleName: 'Cap Allowance',
      covers: { allAssortments: 'N', categories: [{ progCatId: 310, categoryName: 'Cap' }], unitGrants: [] },
    };
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 13, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        // The generic rule comes first in rule order — a plain `.find()`
        // would wrongly pick it over the Cap-specific one.
        rules: [exhaustedUnitsRule, DOLLAR_RULE, capSpecificDollarRule],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(effectiveLineTags(cart).get(1)?.ruleId).toBe(41);
  });

  it("keeps a line under its real units rule as long as its category still has *any* real room left, no matter how far the quantity is raised past it", () => {
    // Cap only grants 2, and 13 are in the cart — wildly over — but the
    // grant's own `remaining` (2) hasn't been touched by real usage, so
    // there's still something genuine to cover part of this line with.
    // Raising the quantity further must not move it on its own.
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 13, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [UNITS_RULE, DOLLAR_RULE],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(effectiveLineTags(cart).get(1)?.ruleId).toBe(12);
  });

  it('leaves a line tagged to its real units rule when no dollar rule in scope has room for it, even once its category is fully spent', () => {
    const exhaustedUnitsRule: AllotmentRule = {
      ...UNITS_RULE,
      covers: {
        ...UNITS_RULE.covers,
        unitGrants: [
          { progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 0, reserved: 0 },
          { progCatId: 60, categoryName: 'Tactical', unitQty: 9, remaining: 9, reserved: 0 },
        ],
      },
    };
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 13, progCatIds: [310] });
    const emptyDollarRule = { ...DOLLAR_RULE, dollars: { total: 500, used: 500, inCart: 0, available: 0 } };
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [exhaustedUnitsRule, emptyDollarRule],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(effectiveLineTags(cart).get(1)?.ruleId).toBe(12);
  });

  it('leaves a line within its own category room untouched, even with a dollar rule in scope', () => {
    const cap = makeItem({ cartItemId: 1, skuId: 1, quantity: 2, progCatIds: [310] });
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [cap],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [{ ...UNITS_RULE, units: { total: 11, used: 4, inCart: 2, available: 5 } }, DOLLAR_RULE],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 12, payUnit: 'UNITS' })],
      },
    };

    expect(effectiveLineTags(cart).get(1)?.ruleId).toBe(12);
  });

  it('leaves a dollars/points tag alone — only a units tag is ever reattributed', () => {
    const cart: Cart = {
      cartId: 1,
      itemCount: 1,
      subtotalPrice: 0,
      subtotalPoints: 0,
      items: [makeItem({ cartItemId: 1, skuId: 1, quantity: 1 })],
      roleRequiresApproval: 'N',
      allotment: {
        ...POINTS_ONLY_ALLOTMENT,
        rules: [UNITS_RULE, DOLLAR_RULE],
        lineTags: [makeTag({ cartItemId: 1, skuId: 1, ruleId: 40, payUnit: 'DOLLARS' })],
      },
    };

    expect(effectiveLineTags(cart).get(1)).toEqual(lineTagByItemId(cart).get(1));
  });
});
