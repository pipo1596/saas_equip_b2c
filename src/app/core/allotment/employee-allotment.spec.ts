import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  AllotmentTransactionsPage,
  EmployeeAllotment,
  EmployeeAllotmentService,
  allotmentTxnLabel,
  formatAllotmentTimestamp,
  formatSignedAllotmentAmount,
} from './employee-allotment';

const SUMMARY = {
  programId: 3,
  allotmentBar: { ruleId: 5, label: 'General Allotment', total: 500, used: 184.5, inCart: 0, available: 315.5 },
  ruleCount: 1,
  allotExclTaxFreight: 'N' as const,
  allowCcOverage: 'N' as const,
  rules: [
    {
      ruleId: 5,
      ruleName: 'Annual uniform allowance',
      allotType: 'DOLLAR' as const,
      primaryUnit: 'DOLLARS' as const,
      isBarRule: 'Y' as const,
      dollars: { total: 500, used: 184.5, inCart: 0, available: 315.5 },
      units: null,
      points: null,
      cycle: {
        renewalBasis: 'FIXED' as const,
        renewalPeriodMonths: 12,
        cycleStart: '2026-01-01',
        cycleEnd: '2026-12-31',
        renewsOn: '2027-01-01',
        expirationDate: null,
        onExpiration: 'SUSPEND' as const,
      },
      covers: { allAssortments: 'Y' as const, categories: [], unitGrants: [] },
      carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
      quotas: [],
      fallbacks: [],
    },
  ],
  approvals: { canApprove: 'N' as const, pendingApprovals: null, awaitingApproval: null },
  openOrders: 1,
  lineTags: [],
  productTag: null,
};

const TRANSACTION = {
  transactionId: 9102,
  postedTs: '2026-10-14 09:12:40',
  txnType: 'DEBIT' as const,
  ruleId: 5,
  ruleName: 'Annual uniform allowance',
  amountType: 'DOLLARS' as const,
  amount: 184.5,
  signedAmount: -184.5,
  balanceAfter: 315.5,
  orderId: 771,
  orderNumber: 'SO-000771',
  programName: null,
  progCatId: null,
  categoryName: null,
  cycleStart: '2026-01-01',
  cycleEnd: '2026-12-31',
  reason: 'Order SO-000771',
};

const PENDING_HOLD = {
  orderId: 802,
  orderNumber: 'SO-000802',
  placedTs: '2026-10-20 15:03:11',
  orderStatus: 'PENDING_APPROVAL' as const,
  ruleId: 5,
  ruleName: 'Annual uniform allowance',
  amountType: 'DOLLARS' as const,
  amount: 96,
  signedAmount: -96,
  progCatId: null,
  categoryName: null,
};

describe('EmployeeAllotmentService', () => {
  let service: EmployeeAllotmentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EmployeeAllotmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('load', () => {
    it('posts *GET with no filters', () => {
      service.load().subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT');
      expect(req.request.body).toEqual({ action: '*GET' });
      req.flush({
        summary: SUMMARY,
        transactions: {
          scope: 'CURRENT',
          ruleId: null,
          pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
          data: [TRANSACTION],
          pending: [PENDING_HOLD],
        },
      });
    });

    it('returns the normalized summary and transactions on success', () => {
      let result: EmployeeAllotment | undefined;
      service.load().subscribe((response) => {
        if (!('success' in response)) {
          result = response;
        }
      });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT').flush({
        summary: SUMMARY,
        transactions: {
          scope: 'CURRENT',
          ruleId: null,
          pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
          data: [TRANSACTION],
          pending: [PENDING_HOLD],
        },
      });

      expect(result?.summary.rules[0].ruleName).toBe('Annual uniform allowance');
      expect(result?.transactions.data).toEqual([TRANSACTION]);
      expect(result?.transactions.pending).toEqual([PENDING_HOLD]);
    });

    it('normalizes missing transactions data/pending arrays to []', () => {
      let result: EmployeeAllotment | undefined;
      service.load().subscribe((response) => {
        if (!('success' in response)) {
          result = response;
        }
      });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT').flush({
        summary: SUMMARY,
        transactions: {
          scope: 'CURRENT',
          ruleId: null,
          pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
          data: null,
          pending: null,
        },
      });

      expect(result?.transactions.data).toEqual([]);
      expect(result?.transactions.pending).toEqual([]);
    });

    it('normalizes an empty rules list on the summary (no allotment set up)', () => {
      let result: EmployeeAllotment | undefined;
      service.load().subscribe((response) => {
        if (!('success' in response)) {
          result = response;
        }
      });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT').flush({
        summary: { ...SUMMARY, ruleCount: 0, rules: null, allotmentBar: null },
        transactions: {
          scope: 'CURRENT',
          ruleId: null,
          pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
          data: [],
          pending: [],
        },
      });

      expect(result?.summary.rules).toEqual([]);
      expect(result?.summary.allotmentBar).toBeNull();
    });

    it('passes through a failure as-is', () => {
      let result: EmployeeAllotment | { success: false; message: string | null } | undefined;
      service.load().subscribe((response) => (result = response));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT')
        .flush({ success: false, message: 'Not logged in.' });

      expect(result).toEqual({ success: false, message: 'Not logged in.' });
    });

    // Regression: a real success response from this endpoint carries its
    // own `success: true` alongside `summary`/`transactions` — unlike
    // `APCORDER`, which never sends `success` on a real success response.
    // Discriminating on `'success' in response` alone misread every real
    // success as a failure (nothing ever rendered); it must key off
    // `summary` instead.
    it('still returns the normalized summary when the response also carries success: true', () => {
      let result: EmployeeAllotment | undefined;
      service.load().subscribe((response) => {
        if ('summary' in response) {
          result = response;
        }
      });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT').flush({
        success: true,
        summary: SUMMARY,
        transactions: {
          scope: 'CURRENT',
          ruleId: null,
          pagination: { page: 1, pageSize: 200, totalRows: 1, totalPages: 1 },
          data: [TRANSACTION],
          pending: [PENDING_HOLD],
        },
      });

      expect(result?.summary.rules[0].ruleName).toBe('Annual uniform allowance');
      expect(result?.transactions.data).toEqual([TRANSACTION]);
    });
  });

  describe('loadTransactions', () => {
    it('posts *TXNS with ruleId, scope, page, and the default pageSize', () => {
      service.loadTransactions({ ruleId: 0, scope: 'CURRENT', page: 1 }).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT');
      expect(req.request.body).toEqual({
        action: '*TXNS',
        ruleId: 0,
        scope: 'CURRENT',
        page: 1,
        pageSize: 25,
      });
      req.flush({
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
        data: [],
        pending: [],
      });
    });

    it('sends an explicit pageSize when given', () => {
      service.loadTransactions({ ruleId: 5, scope: 'ALL', page: 2, pageSize: 50 }).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT');
      expect(req.request.body).toEqual({
        action: '*TXNS',
        ruleId: 5,
        scope: 'ALL',
        page: 2,
        pageSize: 50,
      });
      req.flush({
        scope: 'ALL',
        ruleId: 5,
        pagination: { page: 2, pageSize: 50, totalRows: 60, totalPages: 2 },
        data: [],
        pending: [],
      });
    });

    it('returns the normalized transactions page on success', () => {
      let result: AllotmentTransactionsPage | undefined;
      service.loadTransactions({ ruleId: 0, scope: 'CURRENT', page: 1 }).subscribe((response) => {
        if (!('success' in response)) {
          result = response;
        }
      });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT').flush({
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [TRANSACTION],
        pending: [PENDING_HOLD],
      });

      expect(result?.data).toEqual([TRANSACTION]);
      expect(result?.pending).toEqual([PENDING_HOLD]);
    });

    it('passes through a failure as-is', () => {
      let result: AllotmentTransactionsPage | { success: false; message: string | null } | undefined;
      service
        .loadTransactions({ ruleId: 0, scope: 'CURRENT', page: 1 })
        .subscribe((response) => (result = response));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT')
        .flush({ success: false, message: 'Something went wrong.' });

      expect(result).toEqual({ success: false, message: 'Something went wrong.' });
    });

    // Regression — see the equivalent `load()` test above for why.
    it('still returns the normalized page when the response also carries success: true', () => {
      let result: AllotmentTransactionsPage | undefined;
      service.loadTransactions({ ruleId: 0, scope: 'CURRENT', page: 1 }).subscribe((response) => {
        if ('data' in response) {
          result = response;
        }
      });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT').flush({
        success: true,
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 200, totalRows: 1, totalPages: 1 },
        data: [TRANSACTION],
        pending: [PENDING_HOLD],
      });

      expect(result?.data).toEqual([TRANSACTION]);
    });
  });
});

describe('allotmentTxnLabel', () => {
  it('labels every non-adjustment transaction type regardless of direction', () => {
    expect(allotmentTxnLabel('DEBIT', -184.5)).toBe('Order');
    expect(allotmentTxnLabel('CREDIT', 184.5)).toBe('Refund');
    expect(allotmentTxnLabel('RENEWAL', 500)).toBe('Allotment renewed');
    expect(allotmentTxnLabel('CARRYOVER', 50)).toBe('Carried over from last cycle');
    expect(allotmentTxnLabel('EXPIRE', -50)).toBe('Expired at end of cycle');
  });

  it('splits ADJUSTMENT into Credit/Debit based on signedAmount', () => {
    expect(allotmentTxnLabel('ADJUSTMENT', 1)).toBe('Adjustment (Credit)');
    expect(allotmentTxnLabel('ADJUSTMENT', -1)).toBe('Adjustment (Debit)');
  });
});

describe('formatSignedAllotmentAmount', () => {
  it('formats a negative dollar amount with a minus sign and currency', () => {
    expect(
      formatSignedAllotmentAmount({ amountType: 'DOLLARS', signedAmount: -184.5, categoryName: null }),
    ).toBe('−$184.50');
  });

  it('formats a positive dollar amount with a plus sign', () => {
    expect(
      formatSignedAllotmentAmount({ amountType: 'DOLLARS', signedAmount: 96, categoryName: null }),
    ).toBe('+$96.00');
  });

  it('formats points without currency', () => {
    expect(
      formatSignedAllotmentAmount({ amountType: 'POINTS', signedAmount: 140, categoryName: null }),
    ).toBe('+140 pts');
  });

  it('formats units with the category name and drops decimals', () => {
    expect(
      formatSignedAllotmentAmount({ amountType: 'UNITS', signedAmount: -1, categoryName: 'Boots' }),
    ).toBe('−1 Boots');
  });

  it('falls back to the generic word "units" when no category is given', () => {
    expect(
      formatSignedAllotmentAmount({ amountType: 'UNITS', signedAmount: 2, categoryName: null }),
    ).toBe('+2 units');
  });
});

describe('formatAllotmentTimestamp', () => {
  it('formats a server timestamp as UTC wall-clock time, not the local zone', () => {
    expect(formatAllotmentTimestamp('2026-10-14 09:12:40')).toBe('Oct 14, 2026, 9:12 AM');
  });
});
