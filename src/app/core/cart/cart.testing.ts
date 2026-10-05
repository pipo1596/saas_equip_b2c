// Shared fixture for specs that need to simulate an employee whose
// allotment is points-only (every rule pays in points) — see
// `CartService.pointsOnly`. Defined once so every spec file that needs to
// flip a page into points-only mode doesn't reinvent (and keep in sync) a
// full `Allotment` shape of its own.

import { Allotment } from './cart';

export const POINTS_ONLY_ALLOTMENT: Allotment = {
  programId: 3,
  allotmentBar: null,
  ruleCount: 1,
  allotExclTaxFreight: 'N',
  rules: [
    {
      ruleId: 90,
      ruleName: 'Points Allowance',
      allotType: 'POINTS',
      primaryUnit: 'POINTS',
      isBarRule: 'N',
      dollars: null,
      units: null,
      points: { total: 1000, used: 300, inCart: 150, available: 550 },
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
      requireApproval: 'N',
      allowCcFallback: 'N',
      fallbackRuleIds: [],
    },
  ],
  approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
  openOrders: null,
  lineTags: [],
  productTag: null,
};
