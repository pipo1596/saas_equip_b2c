import { CartItem, LineTag } from './cart';
import { resolvedAllocations } from './cart-totals';

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
