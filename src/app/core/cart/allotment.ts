// Shared by every `APCCART` action (*GET/*ADD_ITEM/*RMV_ITEM/*UPDATE_QT/
// *CLEAR) — the allotment block refreshes on every one of them, using
// whatever `locationId` (and, for `*GET` on the product detail page,
// `productPk`) was sent on that same call.

export type PayUnit = 'DOLLARS' | 'UNITS' | 'POINTS';

export interface Balance {
  total: number;
  used: number;
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
  requireApproval: 'Y' | 'N';
  allowCcFallback: 'Y' | 'N';
  // Ordered ruleIds this rule falls back to once its own balance runs out
  // on a given order (e.g. Uniform -> Footwear) — empty when nothing else
  // picks up the rest.
  fallbackRuleIds: number[];
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

interface RawAllotmentRule extends Omit<AllotmentRule, 'covers' | 'quotas' | 'fallbackRuleIds'> {
  covers: {
    allAssortments: 'Y' | 'N';
    categories: AllotmentCategoryRef[] | null;
    unitGrants: AllotmentUnitGrant[] | null;
  };
  quotas: AllotmentQuota[] | null;
  fallbackRuleIds: number[] | null;
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
      fallbackRuleIds: rule.fallbackRuleIds ?? [],
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

// The ordered rules this one falls back to once exhausted, resolved from
// `fallbackRuleIds` against the full rule list — e.g. Uniform's own chain
// resolves to `[Footwear]`. Skips any id that doesn't resolve to an actual
// rule rather than throwing; that shouldn't happen; only defensive.
export function fallbackChain(rule: AllotmentRule, rules: AllotmentRule[]): AllotmentRule[] {
  return rule.fallbackRuleIds
    .map((id) => rules.find((candidate) => candidate.ruleId === id))
    .filter((candidate): candidate is AllotmentRule => !!candidate);
}

// A meter can exceed 100% once the cart pushes a balance over its
// allotment — that's intentional (see the warning-style guidance), not
// clamped away here.
export function meterPct(balance: Balance): number {
  return balance.total > 0 ? ((balance.used + balance.inCart) / balance.total) * 100 : 0;
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
  const parts: string[] = [];
  if (rule.covers.categories.length > 0) {
    parts.push(rule.covers.categories.map((category) => category.categoryName).join(', '));
  }
  if (rule.covers.unitGrants.length > 0) {
    parts.push(`${rule.covers.unitGrants.map((grant) => grant.categoryName).join(', ')} items only`);
  }
  return parts.join(' · ') || 'Nothing yet';
}
