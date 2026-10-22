import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AllotmentPage } from './allotment-page';

const SUMMARY = {
  programId: 3,
  allotmentBar: { ruleId: 5, label: 'General Allotment', total: 500, used: 184.5, inCart: 0, available: 315.5 },
  ruleCount: 1,
  allotExclTaxFreight: 'N',
  rules: [
    {
      ruleId: 5,
      ruleName: 'Annual uniform allowance',
      allotType: 'DOLLAR',
      primaryUnit: 'DOLLARS',
      isBarRule: 'Y',
      dollars: { total: 500, used: 184.5, inCart: 0, available: 315.5 },
      units: null,
      points: null,
      cycle: {
        renewalBasis: 'FIXED',
        renewalPeriodMonths: 12,
        cycleStart: '2026-01-01',
        cycleEnd: '2026-12-31',
        renewsOn: '2027-01-01',
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
  openOrders: 1,
  lineTags: [],
  productTag: null,
};

const TRANSACTION = {
  transactionId: 9102,
  postedTs: '2026-10-14 09:12:40',
  txnType: 'DEBIT',
  ruleId: 5,
  ruleName: 'Annual uniform allowance',
  amountType: 'DOLLARS',
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
  orderStatus: 'PENDING_APPROVAL',
  ruleId: 5,
  ruleName: 'Annual uniform allowance',
  amountType: 'DOLLARS',
  amount: 96,
  signedAmount: -96,
  progCatId: null,
  categoryName: null,
};

function expectAllotmentRequest(httpMock: HttpTestingController) {
  return httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPALT');
}

function flushInitialLoad(
  httpMock: HttpTestingController,
  overrides: { summary?: object; transactions?: object } = {},
) {
  // `success: true` on every fixture here, matching the real API (unlike
  // `APCORDER`, a successful `APCEMPALT` response carries its own `success`
  // flag too) — catches a regression where the service misreads that as a
  // failure and nothing renders.
  expectAllotmentRequest(httpMock).flush({
    success: true,
    summary: overrides.summary ?? SUMMARY,
    transactions: overrides.transactions ?? {
      scope: 'CURRENT',
      ruleId: null,
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [TRANSACTION],
      pending: [PENDING_HOLD],
    },
  });
}

describe('AllotmentPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AllotmentPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own
    // ngOnInit/location effect always fires a tenant-settings and a cart
    // `*GET` too — drain those incidental requests before the strict
    // `verify()` below (see order-history.spec.ts for the precedent).
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
      .forEach((req) =>
        req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }),
      );
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('posts *GET with a large pageSize, so "list all" shows everything in one page', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();

    const req = expectAllotmentRequest(httpMock);
    expect(req.request.body).toEqual({ action: '*GET', pageSize: 200 });
    req.flush({
      success: true,
      summary: SUMMARY,
      transactions: {
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
        data: [],
        pending: [],
      },
    });
  });

  it('shows a skeleton placeholder while loading, then the real content once it resolves', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.textContent).not.toContain('Annual uniform allowance');

    flushInitialLoad(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Annual uniform allowance');
  });

  it('shows the allotment bar headline and renders a rule card per rule', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock);
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('General Allotment');
    expect(text).toContain('$315.50 available');
    expect(fixture.nativeElement.querySelectorAll('app-allotment-rule-card').length).toBe(1);
  });

  it('shows "No allotment is set up for your role." when there are no rules', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock, { summary: { ...SUMMARY, ruleCount: 0, rules: [], allotmentBar: null } });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No allotment is set up for your role.');
    expect(fixture.nativeElement.querySelector('app-allotment-rule-card')).toBeNull();
  });

  it('shows the API error message with a retry button on failure', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    expectAllotmentRequest(httpMock).flush({ success: false, message: 'Not logged in.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Not logged in.');

    const retry: HTMLButtonElement = fixture.nativeElement.querySelector('.alert-danger button');
    retry.click();
    expectAllotmentRequest(httpMock).flush({
      success: true,
      summary: SUMMARY,
      transactions: {
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
        data: [],
        pending: [],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Annual uniform allowance');
  });

  it('shows the "Waiting for approval" list only when there are pending holds', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Waiting for approval');
    expect(fixture.nativeElement.textContent).toContain('SO-000802');
    expect(fixture.nativeElement.textContent).toContain('−$96.00');
  });

  it('hides the "Waiting for approval" section when pending is empty', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock, {
      transactions: {
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [TRANSACTION],
        pending: [],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Waiting for approval');
  });

  it('renders a history row with the signed amount and a link to the order', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock);
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('−$184.50');
    expect(text).toContain('$315.50');
    expect(text).toContain('Order');
    const orderLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/orders/771"]');
    expect(orderLink.textContent).toContain('SO-000771');
  });

  it('groups transactions into one section per allotment, headed by its rule name', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    const unitsTransaction = {
      ...TRANSACTION,
      transactionId: 9103,
      ruleId: 7,
      ruleName: 'Unit Allotment',
      amountType: 'UNITS',
      amount: 1,
      signedAmount: -1,
      balanceAfter: 2,
      orderId: 771,
      orderNumber: 'SO-000771',
      categoryName: 'Cap',
    };
    flushInitialLoad(httpMock, {
      summary: {
        ...SUMMARY,
        rules: [
          ...SUMMARY.rules,
          {
            ...SUMMARY.rules[0],
            ruleId: 7,
            ruleName: 'Unit Allotment',
            allotType: 'UNITS',
            primaryUnit: 'UNITS',
            dollars: null,
            units: { total: 3, used: 1, inCart: 0, available: 2 },
          },
        ],
      },
      transactions: {
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 200, totalRows: 2, totalPages: 1 },
        data: [TRANSACTION, unitsTransaction],
        pending: [],
      },
    });
    fixture.detectChanges();

    const titles: string[] = Array.from(
      fixture.nativeElement.querySelectorAll('.allotment-page__history-group-title'),
    ).map((el) => (el as HTMLElement).textContent?.trim() ?? '');
    expect(titles[0]).toContain('Annual uniform allowance');
    expect(titles[0]).toContain('$500.00');
    expect(titles[1]).toContain('Unit Allotment');
    expect(titles[1]).not.toContain('$');

    const groups = fixture.nativeElement.querySelectorAll('.allotment-page__history-group');
    expect(groups.length).toBe(2);
    expect(groups[1].textContent).toContain('−1 Cap');
  });

  it('shows "No activity this cycle" with a link that switches to all history', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock, {
      transactions: {
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
        data: [],
        pending: [],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No activity this cycle.');

    const link: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-link');
    link.click();

    const req = expectAllotmentRequest(httpMock);
    expect(req.request.body).toEqual({ action: '*TXNS', ruleId: 0, scope: 'ALL', page: 1, pageSize: 200 });
  });

  it('posts *TXNS with the new scope when the "All history" toggle is clicked', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
      '.allotment-page__scope-toggle button',
    );
    const allHistoryButton = Array.from(buttons).find((btn) => btn.textContent?.includes('All history'))!;
    allHistoryButton.click();

    const req = expectAllotmentRequest(httpMock);
    expect(req.request.body).toEqual({ action: '*TXNS', ruleId: 0, scope: 'ALL', page: 1, pageSize: 200 });
  });

  it('pages the history forward without reloading the summary', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock, {
      transactions: {
        scope: 'CURRENT',
        ruleId: null,
        pagination: { page: 1, pageSize: 25, totalRows: 30, totalPages: 2 },
        data: [TRANSACTION],
        pending: [],
      },
    });
    fixture.detectChanges();

    const nextButton: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('.allotment-page__pager button'),
    ).find((btn): btn is HTMLButtonElement => (btn as HTMLButtonElement).textContent?.trim() === 'Next')!;
    nextButton.click();

    const req = expectAllotmentRequest(httpMock);
    expect(req.request.body).toEqual({ action: '*TXNS', ruleId: 0, scope: 'CURRENT', page: 2, pageSize: 200 });
    req.flush({
      success: true,
      scope: 'CURRENT',
      ruleId: null,
      pagination: { page: 2, pageSize: 25, totalRows: 30, totalPages: 2 },
      data: [TRANSACTION],
      pending: [],
    });
  });

  it('shows a transaction-level error with its own retry, without re-skeletoning the summary', () => {
    const fixture = TestBed.createComponent(AllotmentPage);
    fixture.detectChanges();
    flushInitialLoad(httpMock);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
      '.allotment-page__scope-toggle button',
    );
    const allHistoryButton = Array.from(buttons).find((btn) => btn.textContent?.includes('All history'))!;
    allHistoryButton.click();
    expectAllotmentRequest(httpMock).flush({ success: false, message: 'Could not load history.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load history.');
    expect(fixture.nativeElement.textContent).toContain('Annual uniform allowance');
  });
});
