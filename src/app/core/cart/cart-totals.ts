// Shared checkout math — used by the cart page's own order summary and by
// the checkout page, so a shopper sees the exact same "paid from"/"due at
// checkout" figures in both places rather than two subtly different copies
// of the same calculation.

import { Cart, CartItem, LineAllocation, LineTag, PayUnit, tileBalance } from './cart';

export function lineTagByItemId(cart: Cart): Map<number, LineTag> {
  return new Map((cart.allotment?.lineTags ?? []).map((tag) => [tag.cartItemId, tag]));
}

// The API's own `allocations` (split-funding detail) may not be populated
// yet even though the simpler single-rule `ruleId`/`payUnit` tag is — fall
// back to treating that single tag as this line's whole allocation so
// grouping/checkout math still work against today's data, not just once
// the richer per-line breakdown ships.
export function resolvedAllocations(item: CartItem, tag: LineTag | undefined): LineAllocation[] {
  if (!tag) {
    return [];
  }
  if (tag.allocations.length > 0) {
    return tag.allocations;
  }
  if (tag.ruleId === null || tag.payUnit === null) {
    return [];
  }
  return [
    {
      ruleId: tag.ruleId,
      payUnit: tag.payUnit,
      amount:
        tag.payUnit === 'DOLLARS'
          ? item.lineTotalPrice
          : tag.payUnit === 'POINTS'
            ? (item.lineTotalPoints ?? item.quantity)
            : item.quantity,
    },
  ];
}

export interface PaidFromLine {
  ruleName: string;
  unit: PayUnit;
  amount: number;
}

// What actually pays for this order, one line per rule with anything
// `inCart` right now — including a rule with no home items of its own,
// since its own balance already folds in whatever it lent elsewhere.
export function paidFromLines(cart: Cart): PaidFromLine[] {
  const rules = cart.allotment?.rules ?? [];
  return rules
    .map((rule) => ({ rule, balance: tileBalance(rule) }))
    .filter((entry) => !!entry.balance && entry.balance.inCart > 0)
    .map((entry) => ({
      ruleName: entry.rule.ruleName,
      unit: entry.rule.primaryUnit,
      amount: entry.balance!.inCart,
    }));
}

// Subtotal minus whatever every line's own allocations cover, corrected
// back down for any rule that's actually over-drawn (a negative
// `available` — its lines were tagged as covered, but the rule can't
// really pay for all of them). A dollar rule's own shortfall is exact; a
// units/points rule's shortfall is only a *count*, so it's prorated
// across that rule's own lines by their share of the requested units, for
// lack of a per-unit dollar rate to convert it exactly.
export function amountDueAtCheckout(cart: Cart): number {
  const rules = cart.allotment?.rules ?? [];
  const byItemId = lineTagByItemId(cart);
  const requestedByRuleId = new Map<number, { units: number; dollarValue: number }>();

  const covered = cart.items.reduce((sum, item) => {
    const allocations = resolvedAllocations(item, byItemId.get(item.cartItemId));
    if (allocations.length === 0) {
      return sum;
    }
    const dollarsCovered = allocations
      .filter((allocation) => allocation.payUnit === 'DOLLARS')
      .reduce((total, allocation) => total + allocation.amount, 0);
    const nonDollarAllocations = allocations.filter((allocation) => allocation.payUnit !== 'DOLLARS');
    for (const allocation of nonDollarAllocations) {
      const requested = requestedByRuleId.get(allocation.ruleId) ?? { units: 0, dollarValue: 0 };
      requested.units += allocation.amount;
      requested.dollarValue += item.lineTotalPrice;
      requestedByRuleId.set(allocation.ruleId, requested);
    }
    return sum + dollarsCovered + (nonDollarAllocations.length > 0 ? item.lineTotalPrice : 0);
  }, 0);

  const shortfall = rules.reduce((sum, rule) => {
    const balance = tileBalance(rule);
    if (!balance || balance.available >= 0) {
      return sum;
    }
    if (rule.primaryUnit === 'DOLLARS') {
      return sum - balance.available;
    }
    const requested = requestedByRuleId.get(rule.ruleId);
    if (!requested || requested.units <= 0) {
      return sum;
    }
    const shortfallUnits = Math.min(-balance.available, requested.units);
    return sum + requested.dollarValue * (shortfallUnits / requested.units);
  }, 0);

  return Math.max(0, cart.subtotalPrice - covered + shortfall);
}
