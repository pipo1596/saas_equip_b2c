import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { Home } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
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
});
