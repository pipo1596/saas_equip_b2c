import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { TenantSettings } from '../../core/tenant/tenant-settings';
import { SupportPage } from './support-page';

describe('SupportPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SupportPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
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
    const fixture = TestBed.createComponent(SupportPage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the title and a tile for each resource', () => {
    const fixture = TestBed.createComponent(SupportPage);
    fixture.detectChanges();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({} as TenantSettings);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.support-page__title')?.textContent).toContain('Support & resources');
    const cards: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('.support-page__card');
    const titles = Array.from(cards).map((el) => el.querySelector('.support-page__card-title')?.textContent?.trim());
    expect(titles).toEqual(['Sizing guide', 'Platform videos', 'Announcements', 'Contact support']);
  });

  it('links the Announcements tile to the announcements page', () => {
    const fixture = TestBed.createComponent(SupportPage);
    fixture.detectChanges();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({} as TenantSettings);
    fixture.detectChanges();

    const cards: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('.support-page__card');
    const announcements = Array.from(cards).find((el) => el.textContent?.includes('Announcements'));
    expect(announcements?.getAttribute('href')).toBe('/announcements');
  });

  it('mailtos the tenant\'s own support contact when one is set', () => {
    const fixture = TestBed.createComponent(SupportPage);
    fixture.detectChanges();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({ supprt_eml: 'help@example-dept.ca' } as TenantSettings);
    fixture.detectChanges();

    const cards: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('.support-page__card');
    const contact = Array.from(cards).find((el) => el.textContent?.includes('Contact support'));
    expect(contact?.getAttribute('href')).toBe('mailto:help@example-dept.ca');
  });

  it('falls back to the primary contact email, then a generic address, when no support email is set', () => {
    const fixture = TestBed.createComponent(SupportPage);
    fixture.detectChanges();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({ supprt_eml: null, pric_eml: 'contact@example-dept.ca' } as TenantSettings);
    fixture.detectChanges();

    const cards: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('.support-page__card');
    const contact = Array.from(cards).find((el) => el.textContent?.includes('Contact support'));
    expect(contact?.getAttribute('href')).toBe('mailto:contact@example-dept.ca');
  });
});
