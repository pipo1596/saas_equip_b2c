import { Allotment, AllotmentRule, Cart, CartItem, LineTag } from './cart';
import { amountDueAtCheckout, paidFromLines, pointsShortfall, resolvedAllocations } from './cart-totals';
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
    const cart: Cart = { ...makeOverdrawnPointsCart(0), allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [dollarRule] } };
    expect(pointsShortfall(cart)).toBe(0);
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
