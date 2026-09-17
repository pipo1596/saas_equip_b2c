import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth';
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
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Home);
    expect(fixture.componentInstance).toBeTruthy();
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
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
    auth.session.set({ empId: '1', sessionId: 's', firstName: 'aaron', lastName: 'ermis', locations: [] });

    expect(home.firstName()).toBe('Aaron');
  });
});
