import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth';
import { CatalogView } from '../../core/catalog/catalog-view';
import { TenantSettings, TenantSettingsService } from '../../core/tenant/tenant-settings';
import { Header } from './header';

const CATEGORY = {
  parentProgCatId: null,
  sortOrder: 0,
  status: 'ACTIVE',
  children: [],
};

describe('Header', () => {
  beforeEach(async () => {
    // AuthService restores its session from localStorage, which (unlike
    // TestBed's DI container) isn't reset between spec files — clear it so
    // a prior test's persisted login doesn't leak in here.
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('should create', () => {
    const fixture = TestBed.createComponent(Header);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show no wordmark logo until tenant settings load, then the tenant logo', () => {
    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.wordmark__logo')).toBeNull();

    const tenantSettings = TestBed.inject(TenantSettingsService);
    tenantSettings.settings.set({
      logo_url: '/photos/partner-2/logo.jpg',
      comp_name: 'Edmonton Fire Dept',
    } as TenantSettings);
    fixture.detectChanges();

    const logo = fixture.nativeElement.querySelector('.wordmark__logo img');
    expect(logo.getAttribute('src')).toContain('/photos/partner-2/logo.jpg');
    expect(logo.getAttribute('alt')).toBe('Edmonton Fire Dept');
    expect(fixture.nativeElement.querySelector('.wordmark').textContent.trim()).toBe('');
  });

  it('should show no locations and no active location when logged out', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.locations()).toEqual([]);
    expect(header.activeLocation()).toBeNull();
  });

  it('should default to the employee\'s first location and allow switching, toggling the menu', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;
    const auth = TestBed.inject(AuthService);

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [
        { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
        { empLocId: 14999, locationId: 15, locationCode: '001', locationName: 'Edmonton Fire Dept Office' },
      ],
    });

    expect(header.activeLocation()?.locationName).toBe('Edmonton Fire Dept Chief');
    expect(header.deptMenuOpen()).toBe(false);

    header.toggleDeptMenu();
    expect(header.deptMenuOpen()).toBe(true);

    header.selectLocation(header.locations()[1]);
    expect(header.activeLocation()?.locationName).toBe('Edmonton Fire Dept Office');
    expect(header.deptMenuOpen()).toBe(false);
  });

  it('should load the catalog menu for the default location, and again when the location changes', () => {
    const fixture = TestBed.createComponent(Header);
    const auth = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);

    const locations = [
      { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
      { empLocId: 14999, locationId: 15, locationCode: '001', locationName: 'Edmonton Fire Dept Office' },
    ];
    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations,
    });
    TestBed.tick();

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({} as never);

    const firstReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(firstReq.request.body).toEqual({ locationId: 18, action: '*MENU' });
    firstReq.flush({
      viewId: 6,
      programId: 28,
      categoryCount: 1,
      menu: {
        clothing: [],
        footwear: [{ progCatId: 310, categoryName: 'Footwear', ...CATEGORY }],
        gear: [],
      },
    } satisfies CatalogView);

    expect(fixture.componentInstance.catalogNavItems()).toEqual([
      {
        key: 'footwear',
        label: 'Footwear',
        imageField: 'men_ftw_im',
        image: null,
        categories: [{ progCatId: 310, categoryName: 'Footwear', children: [] }],
        columnCount: 1,
      },
    ]);

    fixture.componentInstance.selectLocation(locations[1]);
    TestBed.tick();

    const secondReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(secondReq.request.body).toEqual({ locationId: 15, action: '*MENU' });
    secondReq.flush({
      viewId: 6,
      programId: 28,
      categoryCount: 0,
      menu: { clothing: [], footwear: [], gear: [] },
    } satisfies CatalogView);

    expect(fixture.componentInstance.catalogNavItems()).toEqual([]);

    httpMock.verify();
  });

  it('should link "View all X" to /products/<bucket-key> with the label as a query param', () => {
    const fixture = TestBed.createComponent(Header);
    const auth = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [
        { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
      ],
    });
    TestBed.tick();

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({} as never);
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      viewId: 6,
      programId: 28,
      categoryCount: 1,
      menu: {
        clothing: [],
        footwear: [{ progCatId: 310, categoryName: 'Footwear', ...CATEGORY }],
        gear: [],
      },
    } satisfies CatalogView);

    fixture.componentInstance.toggleCatalogNav('footwear');
    fixture.detectChanges();

    const viewAllLink = fixture.nativeElement.querySelector(
      '.mega-menu__viewall',
    ) as HTMLAnchorElement;
    expect(viewAllLink.getAttribute('href')).toBe('/products/footwear?name=Footwear');
  });

  it('should resolve each catalog nav item\'s image from the matching tenant setting', () => {
    const fixture = TestBed.createComponent(Header);
    const auth = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);
    const tenantSettings = TestBed.inject(TenantSettingsService);

    tenantSettings.settings.set({
      men_ftw_im: '/photos/partner-2/foot.jpg',
    } as TenantSettings);

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [
        { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
      ],
    });
    TestBed.tick();

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      viewId: 6,
      programId: 28,
      categoryCount: 2,
      menu: {
        clothing: [],
        footwear: [
          {
            progCatId: 310,
            categoryName: 'Footwear',
            ...CATEGORY,
            children: [{ progCatId: 321, categoryName: 'Boot', ...CATEGORY }],
          },
        ],
        gear: [],
      },
    } satisfies CatalogView);

    expect(fixture.componentInstance.catalogNavItems()[0].image).toBe('/photos/partner-2/foot.jpg');

    expect(fixture.componentInstance.activeCatalogNavItem()).toBeNull();
    fixture.componentInstance.toggleCatalogNav('footwear');
    expect(fixture.componentInstance.activeCatalogNavItem()?.key).toBe('footwear');
    fixture.detectChanges();

    // Rendered as a nested tree — "Boot" sits inside its own nested list
    // under "Footwear", rather than as a sibling.
    const rootLink = fixture.nativeElement.querySelector(
      '.mega-menu__grid > .cat-flyout__list > li > a',
    );
    expect(rootLink.textContent.trim()).toBe('Footwear');
    const nestedLink = fixture.nativeElement.querySelector(
      '.mega-menu__grid .cat-flyout__list .cat-flyout__list a',
    );
    expect(nestedLink.textContent.trim()).toBe('Boot');

    fixture.componentInstance.closeCatalogNav();
    expect(fixture.componentInstance.activeCatalogNavItem()).toBeNull();
  });

  it('should collapse categories with no direct leaf child into a " > "-prefixed label on their descendants', () => {
    const fixture = TestBed.createComponent(Header);
    const auth = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [
        { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
      ],
    });
    TestBed.tick();

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({} as never);
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      viewId: 6,
      programId: 28,
      categoryCount: 1,
      menu: {
        // "Apparel" has no direct leaf child — both Outerwear and Pant have
        // children of their own — so it should never appear as its own
        // header; its name should prefix whatever does become one instead.
        clothing: [
          {
            progCatId: 308,
            categoryName: 'Apparel',
            ...CATEGORY,
            children: [
              {
                progCatId: 320,
                categoryName: 'Outerwear',
                ...CATEGORY,
                children: [{ progCatId: 334, categoryName: 'Jacket', ...CATEGORY }],
              },
              {
                progCatId: 319,
                categoryName: 'Pant',
                ...CATEGORY,
                children: [
                  {
                    progCatId: 332,
                    categoryName: 'Uniform',
                    ...CATEGORY,
                    children: [{ progCatId: 339, categoryName: 'Trouser', ...CATEGORY }],
                  },
                  { progCatId: 331, categoryName: 'Tactical', ...CATEGORY },
                ],
              },
            ],
          },
        ],
        footwear: [],
        gear: [],
      },
    } satisfies CatalogView);

    expect(fixture.componentInstance.catalogNavItems()[0].categories).toEqual([
      {
        progCatId: 320,
        categoryName: 'Apparel > Outerwear',
        children: [{ progCatId: 334, categoryName: 'Jacket', children: [] }],
      },
      {
        progCatId: 319,
        categoryName: 'Apparel > Pant',
        children: [
          {
            progCatId: 332,
            categoryName: 'Uniform',
            children: [{ progCatId: 339, categoryName: 'Trouser', children: [] }],
          },
          { progCatId: 331, categoryName: 'Tactical', children: [] },
        ],
      },
    ]);
  });

  it('should size the grid to the section count, capped at 4', () => {
    const fixture = TestBed.createComponent(Header);
    const auth = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);

    const leaf = (progCatId: number, categoryName: string) => ({
      progCatId,
      categoryName,
      ...CATEGORY,
    });

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [
        { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
      ],
    });
    TestBed.tick();

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({} as never);
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      viewId: 6,
      programId: 28,
      categoryCount: 8,
      menu: {
        clothing: [],
        footwear: [],
        gear: Array.from({ length: 6 }, (_, i) => leaf(400 + i, `Section ${i}`)),
      },
    } satisfies CatalogView);

    expect(fixture.componentInstance.catalogNavItems()[0].columnCount).toBe(4);
  });

  it('should toggle a catalog nav flyout open/closed, closing other menus and vice versa', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    header.toggleCatalogNav('footwear');
    expect(header.openCatalogNavKey()).toBe('footwear');

    header.toggleCatalogNav('footwear');
    expect(header.openCatalogNavKey()).toBeNull();

    header.toggleCatalogNav('gear');
    expect(header.openCatalogNavKey()).toBe('gear');

    header.toggleDeptMenu();
    expect(header.openCatalogNavKey()).toBeNull();
    expect(header.deptMenuOpen()).toBe(true);

    header.toggleCatalogNav('gear');
    expect(header.deptMenuOpen()).toBe(false);
    expect(header.openCatalogNavKey()).toBe('gear');
  });

  it('should navigate to /products with the search term as a query param', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    header.searchForm.controls.term.setValue('  steel toe boots  ');
    header.search();

    expect(navigateSpy).toHaveBeenCalledWith(['/products'], {
      queryParams: { q: 'steel toe boots' },
    });
  });

  it('should not navigate when the search box is empty or blank', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    header.search();
    header.searchForm.controls.term.setValue('   ');
    header.search();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('should wire the real <form> submit to search() instead of doing a native page reload', () => {
    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const form = fixture.nativeElement.querySelector('form.appbar__search') as HTMLFormElement;
    const input = form.querySelector('input[formcontrolname="term"]') as HTMLInputElement;

    input.value = 'steel toe boots';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // A bare <form> has no directive providing `ngSubmit` unless it's bound
    // to a formGroup — without that, this dispatch would fall through to a
    // native submit (defaultPrevented stays false, search() never runs).
    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);
    fixture.detectChanges();

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith(['/products'], {
      queryParams: { q: 'steel toe boots' },
    });
  });

  it('should remember the selected location across a page refresh', () => {
    const fixtureA = TestBed.createComponent(Header);
    const headerA = fixtureA.componentInstance;
    const auth = TestBed.inject(AuthService);

    const locations = [
      { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
      { empLocId: 14999, locationId: 15, locationCode: '001', locationName: 'Edmonton Fire Dept Office' },
    ];
    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations,
    });

    headerA.selectLocation(locations[1]);
    expect(localStorage.getItem('header.selectedLocationId')).toBe('15');

    // Simulate a page refresh: a brand new Header instance, same persisted
    // session and localStorage.
    const headerB = TestBed.createComponent(Header).componentInstance;
    expect(headerB.activeLocation()?.locationName).toBe('Edmonton Fire Dept Office');
  });

  it('should close the department menu when the rules menu opens, and vice versa', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    header.toggleDeptMenu();
    expect(header.deptMenuOpen()).toBe(true);

    header.toggleRulesMenu();
    expect(header.rulesMenuOpen()).toBe(true);
    expect(header.deptMenuOpen()).toBe(false);
  });

  it('should open and close the cart drawer', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.cartOpen()).toBe(false);
    header.openCart();
    expect(header.cartOpen()).toBe(true);
    header.closeCart();
    expect(header.cartOpen()).toBe(false);
  });

  it('should start with an empty cart', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.cartLines()).toEqual([]);
    expect(header.cartCount()).toBe(0);
    expect(header.cartSubtotal()).toBe(0);
  });

  it('should show no name/initials when logged out', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.firstName()).toBeNull();
    expect(header.fullName()).toBeNull();
    expect(header.initials()).toBeNull();
  });

  it('should derive a capitalized name and initials from the session', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;
    const auth = TestBed.inject(AuthService);

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [],
    });

    expect(header.firstName()).toBe('Pierre');
    expect(header.fullName()).toBe('Pierre Achkar');
    expect(header.initials()).toBe('PA');
  });

  it('should close the user menu, clear the session and navigate to / on log off', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [],
    });
    header.toggleUserMenu();
    expect(header.userMenuOpen()).toBe(true);

    header.logOut();

    expect(header.userMenuOpen()).toBe(false);
    expect(auth.session()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });
});
