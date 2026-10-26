// Shared checkout math — used by the cart page's own order summary and by
// the checkout page, so a shopper sees the exact same "paid from"/"due at
// checkout" figures in both places rather than two subtly different copies
// of the same calculation.

import {
  AllotmentQuota,
  AllotmentRule,
  AllotmentUnitGrant,
  Balance,
  Cart,
  CartItem,
  LineAllocation,
  LineTag,
  PayUnit,
  preferSpecificCoverage,
  tileBalance,
  unitGrantForCategories,
} from './cart';

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

export interface PaidFromLineCategory {
  categoryName: string;
  amount: number;
}

export interface PaidFromLine {
  ruleName: string;
  unit: PayUnit;
  amount: number;
  // Only for a units rule granting more than one assortment (e.g. Jacket
  // 2, Jobshirt 1, Trouser 2) — how much of `amount` each one is actually
  // supplying, so "Unit Allotment: 5 units" can expand into its own "3
  // categories" breakdown instead of a single pooled figure. Empty for a
  // dollars/points rule, or a units rule with only one assortment (nothing
  // to break down). Unlike `amount`, these aren't capped/prorated against
  // an over-drawn rule — they're a per-category explanation of what's in
  // the cart right now, not a second checkout-math figure.
  categoryBreakdown: PaidFromLineCategory[];
}

export interface QuotaStatus {
  quota: AllotmentQuota;
  ruleId: number;
  // In whatever unit `quota.limitType` implies — a quantity count for
  // UNITS, a dollar amount for DOLLARS, a points amount for POINTS.
  used: number;
  exceeded: boolean;
}

function quotaUsageAmount(quota: AllotmentQuota, item: CartItem): number {
  if (quota.limitType === 'DOLLARS') {
    return item.lineTotalPrice;
  }
  if (quota.limitType === 'POINTS') {
    return item.lineTotalPoints ?? 0;
  }
  return item.quantity;
}

// Every quota across every rule, with how much of it the cart currently
// uses — summing whichever of quantity/lineTotalPrice/lineTotalPoints
// matches the quota's own `limitType`, across every cart item whose
// `progCatIds` includes the quota's `progCatId`. This reads a quota as "you
// can't have more than N of this category in your cart at all", regardless
// of which rule's `lineTag` actually ends up paying for any one item — a
// quota is a sub-limit on the category itself, not on one funding source.
// A quota with no `progCatId` can't be matched against any cart item from
// here and is skipped — there's nothing client-side to check it against.
export function quotaStatuses(cart: Cart): QuotaStatus[] {
  const rules = cart.allotment?.rules ?? [];
  const statuses: QuotaStatus[] = [];
  for (const rule of rules) {
    for (const quota of rule.quotas) {
      if (quota.progCatId === null) {
        continue;
      }
      const used = cart.items
        .filter((item) => item.progCatIds.includes(quota.progCatId as number))
        .reduce((sum, item) => sum + quotaUsageAmount(quota, item), 0);
      statuses.push({ quota, ruleId: rule.ruleId, used, exceeded: used > quota.limitValue });
    }
  }
  return statuses;
}

export function exceededQuotas(cart: Cart): QuotaStatus[] {
  return quotaStatuses(cart).filter((status) => status.exceeded);
}

// "Your quota for 2 Caps is exceeded. Please adjust qty before checking
// out." — the category name's own casing/plural comes straight from
// `categoryName` as the API sent it (the API supplies a shared, non-count-
// sensitive label, so this is a best-effort "add an s" rather than true
// grammatical pluralization).
export function quotaExceededMessage(status: QuotaStatus): string {
  const { quota } = status;
  const label = quota.categoryName ?? 'item';
  const plural = quota.limitValue === 1 ? label : `${label}s`;
  return `Your quota for ${quota.limitValue} ${plural} is exceeded. Please adjust qty before checking out.`;
}

// Every units (or dollar-units) rule whose balance the *cart itself* has
// driven negative — `available < 0` with something actually `inCart`
// against it, as opposed to a rule that was already over-drawn by real
// usage alone before this cart held anything of its own. Nothing caps the
// quantity stepper anymore (shoppers can add as many as they like); this
// is what the cart page warns about instead, and what blocks moving on to
// checkout.
export function exceededUnitRules(cart: Cart): AllotmentRule[] {
  const rules = cart.allotment?.rules ?? [];
  return rules.filter((rule) => rule.units !== null && rule.units.inCart > 0 && rule.units.available < 0);
}

// "Your Unit Allotment is exceeded. Please adjust qty before checking out."
export function unitRuleExceededMessage(rule: AllotmentRule): string {
  return `Your ${rule.ruleName} is exceeded. Please adjust qty before checking out.`;
}

// How much of a specific assortment grant this cart is actually drawing —
// counting only items *effectively* tagged as UNITS-covered by this rule
// (see `effectiveLineTags`), not just the raw server tag. Once a grant is
// genuinely exhausted, a line against it that a dollar allotment can really
// cover gets reattributed there instead — it was never going to charge
// against this grant at checkout, so it shouldn't count as drawing on it
// here either (that's exactly what left `exceededUnitGrants` wrongly
// blocking checkout on a line that would actually succeed by falling back
// to dollars). The same product's own `progCatIds` could just as easily be
// paid by another rule (or not at all), and this is meant to measure this
// rule's own draw on this one grant, not every cart item that merely
// happens to share a category.
function unitsDrawnFromGrant(rule: AllotmentRule, grant: AllotmentUnitGrant, cart: Cart): number {
  const byItemId = effectiveLineTags(cart);
  return cart.items
    .filter(
      (item) => byItemId.get(item.cartItemId)?.ruleId === rule.ruleId && item.progCatIds.includes(grant.progCatId),
    )
    .reduce((sum, item) => sum + item.quantity, 0);
}

// A single grant's own balance, scoped to just its one assortment — for a
// product detail page previewing a specific grant (via
// `unitGrantForCategories`), rather than the rule's pooled `units` total
// across every assortment it grants. The API gives a grant's `remaining`/
// `reserved` (posted balance, orders awaiting approval) but not a
// per-grant `inCart` — which grant a cart item actually draws from isn't
// decided until checkout — so `inCart` here is this cart's own best
// estimate: whatever's already sitting in it tagged to this exact
// category, the same category-matching `quotaStatuses` already uses.
export function unitGrantBalance(grant: AllotmentUnitGrant, cart: Cart): Balance {
  const total = grant.unitQty;
  const remaining = grant.remaining ?? grant.unitQty;
  const used = total - remaining;
  const reserved = grant.reserved ?? 0;
  const inCart = cart.items
    .filter((item) => item.progCatIds.includes(grant.progCatId))
    .reduce((sum, item) => sum + item.quantity, 0);
  return { total, used, reserved, inCart, available: remaining - reserved - inCart };
}

// A units rule's own per-assortment breakdown of what's actually in the
// cart against it — e.g. Jacket: 1, Jobshirt: 2, Trouser: 2, rather than
// just a pooled "5 units". Only ever non-empty for a units rule covering
// more than one assortment (a single-assortment units rule has nothing to
// break down — the one line already says it all). Counts only items this
// specific rule's own `lineTag` actually tagged as UNITS-covered — the
// same product's own `progCatIds` could just as easily be paid by another
// rule (or not at all), and this is meant to explain this rule's own
// amount, not every cart item that merely happens to share a category.
function unitCategoryBreakdown(rule: AllotmentRule, cart: Cart): PaidFromLineCategory[] {
  if (rule.primaryUnit !== 'UNITS' || rule.covers.unitGrants.length <= 1) {
    return [];
  }
  return rule.covers.unitGrants
    .map((grant) => ({ categoryName: grant.categoryName, amount: unitsDrawnFromGrant(rule, grant, cart) }))
    .filter((line) => line.amount > 0);
}

export interface ExceededUnitGrant {
  rule: AllotmentRule;
  grant: AllotmentUnitGrant;
}

// A specific assortment grant this cart has drawn past what it really has
// — even when the rule's own pooled total (`exceededUnitRules`) still
// looks fine, because another category inside the same rule has enough
// surplus to offset it there. A rule with only one assortment is already
// fully covered by `exceededUnitRules` (its one grant and its pooled total
// move in lockstep, so nothing to add here); this only ever surfaces
// something new for a rule granting more than one.
export function exceededUnitGrants(cart: Cart): ExceededUnitGrant[] {
  const rules = cart.allotment?.rules ?? [];
  const exceeded: ExceededUnitGrant[] = [];
  for (const rule of rules) {
    if (rule.primaryUnit !== 'UNITS' || rule.covers.unitGrants.length <= 1) {
      continue;
    }
    for (const grant of rule.covers.unitGrants) {
      const drawn = unitsDrawnFromGrant(rule, grant, cart);
      const trulyAvailable = (grant.remaining ?? grant.unitQty) - (grant.reserved ?? 0);
      if (drawn > 0 && drawn > trulyAvailable) {
        exceeded.push({ rule, grant });
      }
    }
  }
  return exceeded;
}

// "Your Unit Allotment for Cap is exceeded. Please adjust qty before
// checking out."
export function unitGrantExceededMessage(exceeded: ExceededUnitGrant): string {
  return `Your ${exceeded.rule.ruleName} for ${exceeded.grant.categoryName} is exceeded. Please adjust qty before checking out.`;
}

// The same `lineTagByItemId` map, except a line whose own category grant
// has *nothing real left at all* (not just "less than this line's own
// quantity needs") gets reattributed to a dollar (or dollar-units) rule
// that still has real room for it, if one exists in scope. As long as the
// grant still has *any* real room — even just enough for part of this
// line's quantity, with the rest genuinely overflowing — the line stays
// put under its real units rule; raising the quantity further doesn't move
// it on its own. Only once the category itself is completely spent does
// moving it make sense, since at that point none of it could ever really
// be unit-covered. Nothing changes about the real backend charge
// (`exceededUnitGrants`/`amountDueAtCheckout`/`paidFromLines` all still
// read the real tag via `lineTagByItemId`) — this is purely what the cart
// *shows* for a line that would really be funded elsewhere. A line whose
// category is exhausted with no dollar fallback in scope keeps its real
// units tag (nothing to move it to).
export function effectiveLineTags(cart: Cart): Map<number, LineTag> {
  const real = lineTagByItemId(cart);
  const rules = cart.allotment?.rules ?? [];
  const effective = new Map(real);
  for (const item of cart.items) {
    const tag = real.get(item.cartItemId);
    if (!tag || tag.payUnit !== 'UNITS' || tag.ruleId === null) {
      continue;
    }
    const rule = rules.find((candidate) => candidate.ruleId === tag.ruleId);
    if (!rule) {
      continue;
    }
    const grant = unitGrantForCategories(rule, item.progCatIds);
    if (!grant) {
      continue;
    }
    const trulyAvailable = (grant.remaining ?? grant.unitQty) - (grant.reserved ?? 0);
    if (trulyAvailable > 0) {
      continue;
    }
    // Prefer a dollar rule scoped to this item's own categories over a
    // generic "any item" one, same as `ruleForCategories` does for the
    // catalog preview — a department's own bespoke allotment should pick up
    // the overflow before a catch-all does.
    const dollarRule = preferSpecificCoverage(
      rules.filter(
        (candidate) =>
          (candidate.allotType === 'DOLLAR' || candidate.allotType === 'DOLLAR_UNITS') &&
          candidate.ruleId !== tag.ruleId &&
          (candidate.covers.allAssortments === 'Y' ||
            candidate.covers.categories.some((category) => item.progCatIds.includes(category.progCatId))) &&
          (candidate.dollars?.available ?? 0) > 0,
      ),
    );
    if (dollarRule) {
      effective.set(item.cartItemId, {
        cartItemId: item.cartItemId,
        skuId: item.skuId,
        ruleId: dollarRule.ruleId,
        payUnit: 'DOLLARS',
        tagLabel: '$ allotment',
        allocations: [],
      });
    }
  }
  return effective;
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
      return {
        ruleName: entry.rule.ruleName,
        unit: entry.rule.primaryUnit,
        amount,
        categoryBreakdown: unitCategoryBreakdown(entry.rule, cart),
      };
    });
}

// Subtotal minus whatever every line's own allocations cover, corrected
// back down for any rule that's actually over-drawn. A units/points rule's
// shortfall is only a *count*, so it's prorated across that rule's own
// lines by their share of the requested units, for lack of a per-unit
// dollar rate to convert it exactly.
//
// The dollar side deliberately does *not* try to attribute each line's
// dollar value to whichever specific rule its own tag names — a line's tag
// names a "home" rule for display/grouping, but once that rule's own
// balance runs out, the real charge can land entirely on a fallback rule
// instead, with the line's tag never updated to say so (it can even still
// read $0 `available`-but-not-negative on its *home* rule while the
// fallback rule's own pooled `inCart` already reflects the true, full
// charge). Trusting the per-line tag here either overstates coverage (two
// rules' line-level claims add up to more than either can really give) or
// understates it (a line's tag claims its empty home rule when the
// fallback actually covered it in full) depending on exactly what the
// per-line data happens to say — neither of which matches what the dollar
// rules' own pooled balances already report actually happened.
//
// So instead: total up every dollar-tagged line's value (`dollarEligible`,
// regardless of which specific rule it names) and compare that against the
// combined real capacity of every dollar rule together (`dollarCovered`,
// each capped at its own `total - used` the same way `paidFromLines` caps
// its own display) — whatever the combined pool can't give is the real
// shortfall. Units/points allocations are excluded from this and still
// handled per-rule below, same as before.
export function amountDueAtCheckout(cart: Cart): number {
  const rules = cart.allotment?.rules ?? [];
  const byItemId = lineTagByItemId(cart);
  const requestedByRuleId = new Map<number, { units: number; dollarValue: number }>();
  let dollarEligible = 0;

  const covered = cart.items.reduce((sum, item) => {
    const allocations = resolvedAllocations(item, byItemId.get(item.cartItemId));
    if (allocations.length === 0) {
      return sum;
    }
    const nonDollarAllocations = allocations.filter((allocation) => allocation.payUnit !== 'DOLLARS');
    for (const allocation of nonDollarAllocations) {
      const requested = requestedByRuleId.get(allocation.ruleId) ?? { units: 0, dollarValue: 0 };
      requested.units += allocation.amount;
      requested.dollarValue += item.lineTotalPrice;
      requestedByRuleId.set(allocation.ruleId, requested);
    }
    if (nonDollarAllocations.length > 0) {
      return sum + item.lineTotalPrice;
    }
    // Every allocation on this line is DOLLARS — counted against the
    // combined dollar pool below, not this one line's own tagged rule.
    dollarEligible += item.lineTotalPrice;
    return sum;
  }, 0);

  const dollarCovered = rules.reduce((sum, rule) => {
    if (rule.primaryUnit !== 'DOLLARS') {
      return sum;
    }
    const balance = tileBalance(rule);
    return balance ? sum + Math.max(0, Math.min(balance.inCart, balance.total - balance.used)) : sum;
  }, 0);
  const dollarShortfall = Math.max(0, dollarEligible - dollarCovered);

  const nonDollarShortfall = rules.reduce((sum, rule) => {
    if (rule.primaryUnit === 'DOLLARS') {
      return sum;
    }
    const balance = tileBalance(rule);
    if (!balance || balance.available >= 0) {
      return sum;
    }
    const requested = requestedByRuleId.get(rule.ruleId);
    if (!requested || requested.units <= 0) {
      return sum;
    }
    const shortfallUnits = Math.min(-balance.available, requested.units);
    return sum + requested.dollarValue * (shortfallUnits / requested.units);
  }, 0);

  return Math.max(0, cart.subtotalPrice - covered - dollarEligible + dollarShortfall + nonDollarShortfall);
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
