// Shared by every `APCCART` action (*GET/*ADD_ITEM/*RMV_ITEM/*UPDATE_QT/
// *CLEAR) — the allotment block refreshes on every one of them, using
// whatever `locationId` (and, for `*GET` on the product detail page,
// `productPk`) was sent on that same call.

export type PayUnit = 'DOLLARS' | 'UNITS' | 'POINTS';

export interface Balance {
  total: number;
  used: number;
  // Held by an order still awaiting approval — already subtracted out of
  // `available` server-side, same as `inCart` is. Optional (rather than
  // normalized to `0`) since nothing reads it today; not shown anywhere in
  // the UI yet, just here so the type matches the real payload when it's
  // needed.
  reserved?: number;
  inCart: number;
  available: number;
}

export interface AllotmentBar extends Balance {
  ruleId: number;
  label: string;
  unit: 'DOLLARS';
}

export interface AllotmentCycle {
  renewalBasis: 'FIXED' | 'HIRE' | 'HIREDAYS';
  renewalPeriodMonths: number;
  // All three can be `null` before a new cycle's balance row has been
  // processed yet — show the balances, just hide the renewal line.
  cycleStart: string | null;
  cycleEnd: string | null;
  renewsOn: string | null;
  expirationDate: string | null;
  onExpiration: 'SUSPEND' | 'CC_ONLY' | 'AUTO_RENEW';
}

export interface AllotmentCategoryRef {
  progCatId: number;
  categoryName: string;
}

export interface AllotmentUnitGrant extends AllotmentCategoryRef {
  unitQty: number;
  // Per-assortment balance detail — optional since a grant with no posted
  // balance yet (nothing used, nothing adjusted) may not carry these at
  // all; `remaining` on its own would then just be `unitQty` again (see
  // `unitGrantLines` in the Rules panel, which falls back the same way).
  remaining?: number;
  // An order against this grant still awaiting approval — a real
  // commitment against `remaining`, not yet posted.
  reserved?: number;
  // `remaining - reserved`, before this cart's own contents are considered
  // — which grant a cart item actually draws from isn't decided until
  // checkout (most specific assortment first, then its parent), so this
  // can't net out the cart itself the way the rule-level `units.available`
  // does.
  availableBeforeCart?: number;
}

export interface AllotmentCovers {
  allAssortments: 'Y' | 'N';
  categories: AllotmentCategoryRef[];
  unitGrants: AllotmentUnitGrant[];
}

export interface AllotmentCarryover {
  type: 'FORFEIT' | 'PARTIAL' | 'FULL';
  pct: number | null;
  capAmount: number | null;
  carriedIn: number | null;
}

export interface AllotmentQuota {
  quotaId: number;
  programId: number;
  programName: string;
  progCatId: number | null;
  categoryName: string | null;
  limitType: 'UNITS' | 'DOLLARS' | 'POINTS';
  limitValue: number;
}

// One rule this one falls back to once its own balance runs out, in
// priority order (`seq`) — up to two (2nd and 3rd priority). Carries its own
// name/unit/`available` straight from the API, so nothing needs to re-look
// it up against the full rule list to show it. `available` is that
// fallback rule's *own* balance, same figure its own tile shows — never add
// it to this rule's own numbers. Always `[]` for a units rule; the fallback
// mechanism only applies to dollars/points.
export interface AllotmentFallback {
  seq: number;
  ruleId: number;
  ruleName: string;
  unit: PayUnit;
  available: number;
}

export interface AllotmentRule {
  ruleId: number;
  ruleName: string;
  allotType: 'DOLLAR' | 'UNITS' | 'DOLLAR_UNITS' | 'POINTS';
  primaryUnit: PayUnit;
  isBarRule: 'Y' | 'N';
  dollars: Balance | null;
  units: Balance | null;
  points: Balance | null;
  cycle: AllotmentCycle;
  covers: AllotmentCovers;
  carryover: AllotmentCarryover;
  quotas: AllotmentQuota[];
  fallbacks: AllotmentFallback[];
}

export interface PayTag {
  ruleId: number | null;
  payUnit: PayUnit | null;
  tagLabel: string | null;
}

// One allotment actually paying toward this line, and how much of it —
// dollars, units, or points depending on that rule's own `primaryUnit`.
export interface LineAllocation {
  ruleId: number;
  payUnit: PayUnit;
  amount: number;
}

export interface LineTag extends PayTag {
  cartItemId: number;
  skuId: number | null;
  // Every allotment that actually pays for this line, in the order they
  // were applied — more than one entry means its own ran out partway
  // through and a fallback rule picked up the rest. Empty when nothing
  // covers this line at all (same case `tagLabel` being `null` covers).
  allocations: LineAllocation[];
}

export interface ProductTag extends PayTag {
  productPk: number;
}

export interface AllotmentApprovals {
  canApprove: 'Y' | 'N';
  // Always `null` today — there's no orders table yet. Show "—" rather
  // than treating a null count as zero.
  pendingApprovals: number | null;
  awaitingApproval: number | null;
}

export interface Allotment {
  // `null` when the shopper's location can't be resolved — balances are
  // still fine, but every tag comes back `null` too (nothing to match a
  // rule to).
  programId: number | null;
  allotmentBar: AllotmentBar | null;
  ruleCount: number;
  // The role's own flag — not a per-rule setting. When "Y", whatever an
  // item's rule (plus its fallbacks) can't cover is charged to the
  // employee's personal card instead of blocking the order; when "N", an
  // uncovered balance still refuses the order (`INS`). Points shortfalls
  // never go to the card either way.
  allowCcOverage: 'Y' | 'N';
  // 'Y' means shipping and tax are excluded from allotment coverage — they
  // become a credit-card balance at checkout regardless of how much of the
  // goods themselves the allotment covers. 'N' means the allotment covers
  // them too, so they don't add to that balance.
  allotExclTaxFreight: 'Y' | 'N';
  rules: AllotmentRule[];
  approvals: AllotmentApprovals;
  openOrders: number | null;
  lineTags: LineTag[];
  // Only meaningful on the response from the *one* call that sent
  // `productPk` — a later call without it comes back with this `null`
  // again, so a caller that wants to keep showing the tag (e.g. the
  // product detail page after "Add to Cart") needs to hold onto it itself
  // rather than re-reading it off the shared cart signal each time.
  productTag: ProductTag | null;
}

interface RawAllotmentRule extends Omit<AllotmentRule, 'covers' | 'quotas' | 'fallbacks'> {
  covers: {
    allAssortments: 'Y' | 'N';
    categories: AllotmentCategoryRef[] | null;
    unitGrants: AllotmentUnitGrant[] | null;
  };
  quotas: AllotmentQuota[] | null;
  fallbacks: AllotmentFallback[] | null;
}

interface RawLineTag extends Omit<LineTag, 'allocations'> {
  allocations: LineAllocation[] | null;
}

export interface RawAllotment extends Omit<Allotment, 'rules' | 'lineTags'> {
  rules: RawAllotmentRule[] | null;
  lineTags: RawLineTag[] | null;
}

// The live API sometimes sends `null` for an array field instead of `[]` —
// normalize once here so nothing downstream has to defensively null-check
// every list. The outer `allotment` object itself staying `null` is left
// alone: that's a real "lookup failed" state (see the guide's edge cases),
// not something to paper over.
export function normalizeAllotment(raw: RawAllotment | null | undefined): Allotment | null {
  if (!raw) {
    return null;
  }
  return {
    ...raw,
    rules: (raw.rules ?? []).map((rule) => ({
      ...rule,
      covers: {
        ...rule.covers,
        categories: rule.covers.categories ?? [],
        unitGrants: rule.covers.unitGrants ?? [],
      },
      quotas: rule.quotas ?? [],
      fallbacks: rule.fallbacks ?? [],
    })),
    lineTags: (raw.lineTags ?? []).map((tag) => ({ ...tag, allocations: tag.allocations ?? [] })),
  };
}

// Which balance a rule's hero tile shows — always the one matching its own
// `primaryUnit`, even for a `DOLLAR_UNITS` rule (its units only show in the
// Rules panel, not a second tile).
export function tileBalance(rule: AllotmentRule): Balance | null {
  if (rule.primaryUnit === 'UNITS') {
    return rule.units;
  }
  if (rule.primaryUnit === 'POINTS') {
    return rule.points;
  }
  return rule.dollars;
}

// A meter can exceed 100% once the cart pushes a balance over its
// allotment — that's intentional (see the warning-style guidance), not
// clamped away here. The *low* end is clamped to 0, though: `used` can go
// negative (e.g. a return/credit that exceeds what was actually consumed),
// which would otherwise draw a meter with negative fill.
export function meterPct(balance: Balance): number {
  if (balance.total <= 0) {
    return 0;
  }
  return Math.max(0, ((balance.used + balance.inCart) / balance.total) * 100);
}

const DOLLAR_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Shared by the hero tiles and the Rules panel — same "$325.00" / "2 units"
// / "140 pts" formatting either place a balance figure shows up.
export function formatBalanceAmount(value: number, unit: PayUnit): string {
  if (unit === 'DOLLARS') {
    return DOLLAR_FORMATTER.format(value);
  }
  return unit === 'UNITS' ? `${value} units` : `${value} pts`;
}

// What a rule covers, in a single short phrase — "Any item in the catalog"
// for an all-assortments dollar rule, the specific categories/unit grants
// otherwise. Shared by the Rules panel and the product detail page's own
// "Covered by your {rule}" card.
export function coverageLabel(rule: AllotmentRule): string {
  if (rule.covers.allAssortments === 'Y') {
    return 'Any item in the catalog';
  }
  const categoryNames = rule.covers.categories.map((category) => category.categoryName);
  const grantNames = rule.covers.unitGrants.map((grant) => grant.categoryName);
  // `categories` (dollars/points coverage) and `unitGrants` (the per-
  // assortment units breakdown) describe genuinely different things on a
  // `DOLLAR_UNITS` rule that covers some categories by dollars and others
  // by units — but when they name the exact same categories, that's the
  // same coverage listed twice over, not two distinct coverages, and
  // showing both reads as a flat-out duplicate ("Jacket, Jobshirt, Trouser
  // · Jacket, Jobshirt, Trouser items only"). The units phrasing is the
  // more specific of the two, so it's the one that stays.
  const namesMatch =
    categoryNames.length > 0 &&
    categoryNames.length === grantNames.length &&
    categoryNames.every((name) => grantNames.includes(name));
  const parts: string[] = [];
  if (categoryNames.length > 0 && !namesMatch) {
    parts.push(categoryNames.join(', '));
  }
  if (grantNames.length > 0) {
    parts.push(`${grantNames.join(', ')} items only`);
  }
  return parts.join(' · ') || 'Nothing yet';
}

// Whether a units balance is *really* out — its true remaining capacity
// (`total - used`, same as a completed order would draw down), ignoring
// `inCart`. `inCart` is just what's sitting in a cart right now, not yet
// checked out — still speculative, so it shouldn't disqualify a unit
// allotment from being shown as the covering rule the way an actually
// exhausted one should. `reserved` (an order already awaiting approval) is
// a real commitment, so it does count against it, same as `used`.
function unitsReallyExhausted(units: Balance): boolean {
  return units.total - units.used - (units.reserved ?? 0) <= 0;
}

// A category's own depth in the catalog tree (root = shallowest) — supplied
// by a caller that actually has the tree (the catalog pages do; the cart
// doesn't), so `preferSpecificCoverage`/`ruleForCategories` can rank two
// category-*specific* rules against each other, not just tell "any item"
// apart from "specific". `null` when the category can't be found (an id
// that's gone stale, or no tree was supplied at all).
export type CategoryDepth = (progCatId: number) => number | null;

// Prefers a rule scoped to specific categories over one that covers "any
// item in the catalog" (`allAssortments: 'Y'`) when more than one rule of
// the same pay type covers the same product — a department's own bespoke
// allotment should get used ahead of a generic catch-all that happens to
// cover everything else too. `candidates` is expected pre-filtered to rules
// that already cover the product and (where relevant) still have room.
//
// When more than one candidate is itself category-specific — e.g. one rule
// covers "Outerwear" and another covers "Trousers", a category nested
// *under* Outerwear — `categoryDepth` (when given) breaks that tie by
// depth: the rule reaching this product through its deepest, most specific
// matching category wins, the same way a shopper would expect a
// trouser-only allotment to apply ahead of a broader outerwear one. Without
// `categoryDepth` (or when neither candidate's matching category resolves a
// depth), ties keep whichever comes first in the API's own rule order, same
// as a plain `.find()` would.
export function preferSpecificCoverage<T extends AllotmentRule>(
  candidates: T[],
  progCatIds?: readonly number[],
  categoryDepth?: CategoryDepth,
): T | undefined {
  const specific = candidates.filter((rule) => rule.covers.allAssortments === 'N');
  const pool = specific.length > 0 ? specific : candidates;
  if (pool.length <= 1 || !progCatIds || !categoryDepth) {
    return pool[0];
  }

  // The deepest depth among a rule's own covered categories that actually
  // matches this product — `-1` (never wins a tie) when none of its
  // categories match or resolve a depth at all.
  const deepestMatch = (rule: T): number =>
    rule.covers.categories.reduce((deepest, category) => {
      if (!progCatIds.includes(category.progCatId)) {
        return deepest;
      }
      const depth = categoryDepth(category.progCatId);
      return depth !== null && depth > deepest ? depth : deepest;
    }, -1);

  return pool.reduce((deepest, rule) => (deepestMatch(rule) > deepestMatch(deepest) ? rule : deepest));
}

// Which rule (if any) a product is likely covered by, found by matching its
// own program-category ids against each rule's covered categories, in the
// same Units -> Dollars -> Points priority the real checkout allocation
// (`allocateLine`) draws in. This is a client-computed *preview* for
// browsing — a listing card only knows a product's price/points *range*
// (not one SKU's exact figures), so unlike `allocateLine` this only answers
// "which rule would this likely draw from", never "exactly how much" or
// "would this come up short" — the authoritative tag is always whatever the
// cart's own `lineTags`/`productTag` says once a specific SKU is added.
// Deliberately pooled-total-only (not per-grant): a real cart can keep
// drawing units against an individual assortment well past its own grant
// once the rule as a whole still has room elsewhere (see `exceededUnitRules`
// for the actual over-draw warning this produces) — a listing preview
// guessing a dollar fallback the real checkout wouldn't actually take would
// be its own, worse kind of wrong.
//
// A units rule here only gets skipped in favor of the next one down once
// it's *really* exhausted (see `unitsReallyExhausted`) — not just because
// the cart's own current contents happen to be using up its room right
// now. Otherwise adding a few of these items would make the preview
// reattribute the product to a dollar rule it doesn't actually belong to,
// purely as a side effect of what's already sitting in the cart.
export function ruleForCategories(
  rules: readonly AllotmentRule[],
  progCatIds: readonly number[],
  categoryDepth?: CategoryDepth,
): AllotmentRule | null {
  // Units coverage is tested against a rule's `unitGrants`, never its
  // `categories` — the two are separate coverage lists on the same rule
  // (see `coverageLabel` above), covering Units and Dollars/Points
  // respectively.
  const unitsRule = rules.find(
    (rule) =>
      (rule.allotType === 'UNITS' || rule.allotType === 'DOLLAR_UNITS') &&
      rule.covers.unitGrants.some((grant) => progCatIds.includes(grant.progCatId)) &&
      rule.units &&
      !unitsReallyExhausted(rule.units),
  );
  if (unitsRule) {
    return unitsRule;
  }

  const coveredByAssortments = (rule: AllotmentRule) =>
    rule.covers.allAssortments === 'Y' || rule.covers.categories.some((category) => progCatIds.includes(category.progCatId));

  const dollarsRule = preferSpecificCoverage(
    rules.filter((rule) => (rule.allotType === 'DOLLAR' || rule.allotType === 'DOLLAR_UNITS') && coveredByAssortments(rule)),
    progCatIds,
    categoryDepth,
  );
  if (dollarsRule) {
    // A dollar rule that's in scope but empty still blocks points — it
    // doesn't fall through to the next check below.
    return (dollarsRule.dollars?.available ?? 0) > 0 ? dollarsRule : null;
  }

  const pointsRule = preferSpecificCoverage(
    rules.filter((rule) => rule.allotType === 'POINTS' && coveredByAssortments(rule) && (rule.points?.available ?? 0) > 0),
    progCatIds,
    categoryDepth,
  );
  return pointsRule ?? null;
}

// The one grant on a units (or dollar-units) rule that actually matches a
// product's own categories — now that units are tracked per assortment
// (Cap 2, Polo 1, Shirt 3, ... rather than one pooled total), a product
// detail page showing this rule needs the specific grant it draws from,
// not the rule's aggregate `units` balance across every assortment it
// covers. `null` when the rule covers no matching grant at all (e.g. a
// dollars-only rule, or `progCatIds` that don't actually match any of this
// rule's grants).
export function unitGrantForCategories(
  rule: AllotmentRule,
  progCatIds: readonly number[],
): AllotmentUnitGrant | null {
  return rule.covers.unitGrants.find((grant) => progCatIds.includes(grant.progCatId)) ?? null;
}
