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
    .map((entry) => {
      const balance = entry.balance!;
      // `inCart` is what was *requested* against this rule, which can run
      // past what it actually has left (a negative `available`) once
      // there isn't enough to cover everything tagged to it — cap the
      // claimed amount at the rule's real remaining balance so this line
      // never states more than the rule can actually give. A dollar rule
      // still has the "Balance" row to cover the true remainder by card;
      // a points rule has no such fallback, so overstating it here would
      // be the only number shown, and it'd be wrong.
      const amount = Math.max(0, Math.min(balance.inCart, balance.total - balance.used));
      return { ruleName: entry.rule.ruleName, unit: entry.rule.primaryUnit, amount };
    });
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

// The points equivalent of `amountDueAtCheckout` — how many points, in
// total, nothing in this cart's allotment can actually pay for. Two
// contributions, neither needing `amountDueAtCheckout`'s dollar-value
// proration (there's no unit conversion to estimate — points stay points):
//   - a line with no points allocation at all (no rule covers it, the same
//     case that would fall to a credit-card balance in dollar mode) adds
//     its own `lineTotalPoints` straight to the total.
//   - a points rule that's actually over-drawn adds the exact amount past
//     its own `available` balance — that figure already states the
//     shortfall directly, no per-line estimate needed.
export function pointsShortfall(cart: Cart): number {
  const rules = cart.allotment?.rules ?? [];
  const byItemId = lineTagByItemId(cart);

  const uncovered = cart.items.reduce((sum, item) => {
    if (item.lineTotalPoints === null) {
      return sum;
    }
    const hasPointsCoverage = resolvedAllocations(item, byItemId.get(item.cartItemId)).some(
      (allocation) => allocation.payUnit === 'POINTS',
    );
    return hasPointsCoverage ? sum : sum + item.lineTotalPoints;
  }, 0);

  const ruleShortfall = rules.reduce((sum, rule) => {
    if (rule.primaryUnit !== 'POINTS') {
      return sum;
    }
    const balance = tileBalance(rule);
    return balance && balance.available < 0 ? sum - balance.available : sum;
  }, 0);

  return uncovered + ruleShortfall;
}
