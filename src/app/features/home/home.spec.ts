import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth';
import { FAKE_SESSION } from '../../core/auth/auth.testing';
import { Home } from './home';

describe('Home', () => {
  beforeEach(async () => {
    // AuthService restores its session from localStorage, which (unlike
    // TestBed's DI container) isn't reset between spec files.
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    // Rendering Home also renders `<app-header/>`, whose own `ngOnInit` now
    // always fires a cart `*GET` too (alongside tenant settings and, once a
    // location is set, the catalog menu) — drain whatever a given test
    // didn't itself already handle before the strict `verify()` below, so
    // one test's incidental request can't leave a dangling subscription
    // that bleeds into whichever spec file runs next in this worker.
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .forEach((req) => req.flush({}));
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
      .forEach((req) =>
        req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }),
      );
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW')
      .forEach((req) =>
        req.flush({
          viewId: 1,
          programId: 1,
          categoryCount: 0,
          menu: { clothing: [], footwear: [], gear: [] },
        }),
      );
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCNTC')
      .forEach((req) => req.flush({ banner: null }));
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Home);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it("links the 'View order history' button to order history", () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.hero__cta a');
    expect(link.textContent?.trim()).toBe('View order history');
    expect(link.getAttribute('href')).toBe('/orders');
  });

  it('should load tenant settings on init', () => {
    const fixture = TestBed.createComponent(Home);
    const home = fixture.componentInstance;

    home.ngOnInit();

    const req = TestBed.inject(HttpTestingController).expectOne(
      '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS',
    );
    req.flush({ hero_img: '/photos/partner-2/hero.jpg' } as never);

    expect(home.tenantSettings()?.hero_img).toBe('/photos/partner-2/hero.jpg');
  });

  it("shows the active location and tenant's company name in the hero eyebrow", () => {
    const fixture = TestBed.createComponent(Home);
    const home = fixture.componentInstance;
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      ...FAKE_SESSION,
      locations: [
        { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Metro EMS Station 4' },
      ],
    });
    home.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({ comp_name: 'Metro EMS', cust_name: 'Metro EMS' } as never);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hero__eyebrow')?.textContent?.trim()).toBe(
      'Metro EMS Station 4 · Metro EMS',
    );
  });

  it("falls back to \"Select location\" in the hero eyebrow when no location is active yet", () => {
    const fixture = TestBed.createComponent(Home);
    const home = fixture.componentInstance;
    home.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({ comp_name: 'Metro EMS', cust_name: 'Metro EMS' } as never);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hero__eyebrow')?.textContent?.trim()).toBe(
      'Select location · Metro EMS',
    );
  });

  it('should not throw when scrolling the category carousel before it renders', () => {
    const fixture = TestBed.createComponent(Home);
    const home = fixture.componentInstance;
    expect(() => home.scrollCategories(1)).not.toThrow();
  });

  it('should not fetch categories when no location is active yet', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.componentInstance.ngOnInit();
    TestBed.tick();

    // `ngOnInit` always fires its own tenant-settings fetch regardless of
    // location — flush that incidental request so it doesn't linger.
    TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({});

    expect(
      TestBed.inject(HttpTestingController).match(
        (req) =>
          req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*CATEGORIES',
      ),
    ).toHaveLength(0);
  });

  it('should load the "Shop by category" list once a location is active', () => {
    const fixture = TestBed.createComponent(Home);
    const home = fixture.componentInstance;
    const auth = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);
    home.ngOnInit();

    auth.session.set({
      ...FAKE_SESSION,
      locations: [
        {
          empLocId: 14998,
          locationId: 18,
          locationCode: '004',
          locationName: 'Edmonton Fire Dept Chief',
        },
      ],
    });
    TestBed.tick();

    // Rendering Home also renders `<app-header/>`, which independently
    // hits tenant settings and this exact same SEPGM (APCTPCVEW, for its
    // own `*MENU` catalog nav) — flush both incidental requests so a plain
    // `expectOne(url)` isn't confused by them.
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({});
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*MENU')
      .forEach((req) =>
        req.flush({
          viewId: 1,
          programId: 1,
          categoryCount: 0,
          menu: { clothing: [], footwear: [], gear: [] },
        }),
      );

    const matches = httpMock.match(
      (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*CATEGORIES',
    );
    expect(matches.length).toBe(1);
    const req = matches[0];
    expect(req.request.body).toEqual({ locationId: 18, action: '*CATEGORIES' });
    req.flush({
      categories: [
        {
          progCatId: 5510,
          categoryName: 'Long sleeve',
          productCount: 14,
          imageUrl: 'https://cdn.example.com/long-sleeve.jpg',
        },
      ],
    });

    expect(home.categories()).toEqual([
      {
        progCatId: 5510,
        categoryName: 'Long sleeve',
        productCount: 14,
        imageUrl: 'https://cdn.example.com/long-sleeve.jpg',
      },
    ]);
  });

  it("should greet the logged-in employee by first name, and fall back when logged out", () => {
    const fixture = TestBed.createComponent(Home);
    const home = fixture.componentInstance;
    expect(home.firstName()).toBeNull();

    const auth = TestBed.inject(AuthService);
    // Deliberately lowercase here — this test is specifically checking
    // that Home capitalizes the session's raw name for display.
    auth.session.set({ ...FAKE_SESSION, firstName: 'pat', lastName: 'doe', locations: [] });

    expect(home.firstName()).toBe('Pat');
  });

  describe('allotment hero tiles', () => {
    const DOLLAR_RULE = {
      ruleId: 11,
      ruleName: 'ANB Employee Allowance',
      allotType: 'DOLLAR' as const,
      primaryUnit: 'DOLLARS' as const,
      isBarRule: 'Y' as const,
      dollars: { total: 600, used: 180, inCart: 95, available: 325 },
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
      requireApproval: 'N' as const,
      allowCcFallback: 'N' as const,
    };

    function flushCartWithAllotment(allotment: object) {
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART')
        .flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [], allotment });
    }

    it('renders one hero tile per rule, each in its own unit, with a renewal date', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushCartWithAllotment({
        programId: 3,
        allotmentBar: null,
        ruleCount: 2,
        allotExclTaxFreight: 'N',
        rules: [
          DOLLAR_RULE,
          {
            ...DOLLAR_RULE,
            ruleId: 12,
            ruleName: 'Tactical Gear',
            allotType: 'UNITS',
            primaryUnit: 'UNITS',
            isBarRule: 'N',
            dollars: null,
            units: { total: 4, used: 1, inCart: 1, available: 2 },
            cycle: { ...DOLLAR_RULE.cycle, renewsOn: null },
          },
        ],
        approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [],
        productTag: null,
      });
      fixture.detectChanges();

      const stats: HTMLElement[] = fixture.nativeElement.querySelectorAll('.stat');
      expect(stats[0].querySelector('.stat__label')?.textContent).toContain('ANB Employee Allowance');
      expect(stats[0].querySelector('.stat__value')?.textContent?.trim()).toBe('$325.00');
      expect(stats[0].querySelector('.stat__meta')?.textContent).toContain('Renews');

      expect(stats[1].querySelector('.stat__label')?.textContent).toContain('Tactical Gear');
      expect(stats[1].querySelector('.stat__value')?.textContent?.trim()).toBe('2 units');
      // No renewsOn on this one — the renewal line is omitted entirely.
      expect(stats[1].querySelector('.stat__meta')).toBeNull();

      expect(stats[0].getAttribute('href')).toBe('/allotment');
      expect(stats[1].getAttribute('href')).toBe('/allotment');
    });

    it('clamps the meter at 0% rather than going negative when a credit pushes "used" below zero', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushCartWithAllotment({
        programId: 3,
        allotmentBar: null,
        ruleCount: 1,
        allotExclTaxFreight: 'N',
        rules: [
          {
            ...DOLLAR_RULE,
            allotType: 'POINTS',
            primaryUnit: 'POINTS',
            dollars: null,
            points: { total: 20, used: -3, reserved: 0, inCart: 0, available: 23 },
          },
        ],
        approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [],
        productTag: null,
      });
      fixture.detectChanges();

      const meter: HTMLElement = fixture.nativeElement.querySelector('.track i');
      expect(meter.style.width).toBe('0%');
    });

    it('shows Open orders as "—" (always null until there is a real orders table)', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushCartWithAllotment({
        programId: 3,
        allotmentBar: null,
        ruleCount: 0,
        allotExclTaxFreight: 'N',
        rules: [],
        approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [],
        productTag: null,
      });
      fixture.detectChanges();

      const stats: HTMLElement[] = fixture.nativeElement.querySelectorAll('.stat');
      const openOrdersStat = Array.from(stats).find((el) => el.textContent?.includes('Open orders'));
      expect(openOrdersStat?.querySelector('.stat__value')?.textContent?.trim()).toBe('—');
      expect(openOrdersStat?.getAttribute('href')).toBe('/orders');
    });

    it('shows an Approvals tile (with a "—" count) when the shopper can approve orders', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushCartWithAllotment({
        programId: 3,
        allotmentBar: null,
        ruleCount: 0,
        allotExclTaxFreight: 'N',
        rules: [],
        approvals: { canApprove: 'Y', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [],
        productTag: null,
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Approvals');
      expect(fixture.nativeElement.textContent).not.toContain('Awaiting approval');
      const stats: HTMLElement[] = fixture.nativeElement.querySelectorAll('.stat');
      const approvalsStat = Array.from(stats).find((el) => el.textContent?.includes('Approvals'));
      expect(approvalsStat?.getAttribute('href')).toBe('/approvals');
    });

    it("shows an Awaiting approval tile when the shopper's own orders wait on someone else", () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushCartWithAllotment({
        programId: 3,
        allotmentBar: null,
        ruleCount: 0,
        allotExclTaxFreight: 'N',
        rules: [],
        approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [],
        productTag: null,
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Awaiting approval');
      const stats: HTMLElement[] = fixture.nativeElement.querySelectorAll('.stat');
      const awaitingStat = Array.from(stats).find((el) => el.textContent?.includes('Awaiting approval'));
      expect(awaitingStat?.getAttribute('href')).toBe('/orders?status=PENDING_APPROVAL');
    });
  });

  describe('home page banner', () => {
    function flushTenantSettings() {
      TestBed.inject(HttpTestingController)
        .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
        .forEach((req) => req.flush({}));
    }

    it('renders the banner message and its link', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushTenantSettings();
      TestBed.inject(HttpTestingController)
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC')
        .flush({
          banner: {
            noticeId: 42,
            message: 'Latest news from Metro EMS: the 2026 station-boot policy is now in effect.',
            style: 'INFO',
            linkType: 'ANNOUNCE',
            linkText: 'Read the update',
            linkProgCatId: null,
            linkProductPk: null,
            linkUrl: null,
          },
        });
      fixture.detectChanges();

      const strip: HTMLElement = fixture.nativeElement.querySelector('.announce__in');
      expect(strip.textContent).toContain('Latest news from Metro EMS');
      const link: HTMLAnchorElement = strip.querySelector('a')!;
      expect(link.textContent?.trim()).toBe('Read the update');
      expect(link.getAttribute('href')).toBe('/announcements?noticeId=42');
    });

    it('hides the banner strip entirely when there is no qualifying notice', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushTenantSettings();
      TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC').flush({ banner: null });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.announce')).toBeNull();
    });

    it('applies the urgent style class and omits the link when linkType is NONE', () => {
      const fixture = TestBed.createComponent(Home);
      fixture.detectChanges();
      flushTenantSettings();
      TestBed.inject(HttpTestingController)
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC')
        .flush({
          banner: {
            noticeId: 7,
            message: 'Urgent notice',
            style: 'URGENT',
            linkType: 'NONE',
            linkText: null,
            linkProgCatId: null,
            linkProductPk: null,
            linkUrl: null,
          },
        });
      fixture.detectChanges();

      const strip: HTMLElement = fixture.nativeElement.querySelector('.announce__in');
      expect(strip.classList).toContain('notice--urgent');
      expect(strip.querySelector('a')).toBeNull();
    });
  });

  it('links the "My account" quick-action tile to the account page', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    const actions: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('.action');
    const myAccount = Array.from(actions).find((el) => el.textContent?.includes('My account'));
    expect(myAccount?.getAttribute('href')).toBe('/account');
  });
});
