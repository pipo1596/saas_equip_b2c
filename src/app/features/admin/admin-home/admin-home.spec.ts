import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../../core/auth/auth';
import { FAKE_SESSION } from '../../../core/auth/auth.testing';
import { AdminHome } from './admin-home';

describe('AdminHome', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminHome],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own
    // ngOnInit/location effect always fires a tenant-settings and a cart
    // `*GET` too — drain those incidental requests before the strict
    // `verify()` below. A non-impersonating session also fires this page's
    // own `*ADMAPRQ` probe (see `showApprovals`); tests that don't care
    // about it get a plain `ERR` here, same as a non-administrator really
    // would.
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
      .forEach((req) =>
        req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }),
      );
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER')
      .forEach((req) => req.flush({ success: false, code: 'ERR', message: 'Only an administrator can open the approvals screen.' }));
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AdminHome);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('links to the Employees screen', () => {
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/admin/employees"]');
    expect(link.textContent).toContain('Employees');
  });

  it('links to the Orders screen', () => {
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/admin/orders"]');
    expect(link.textContent).toContain('Orders');
  });

  it('shows the Approvals entry immediately in a shop-as session, without probing the server', () => {
    TestBed.inject(AuthService).session.set({
      ...FAKE_SESSION,
      impersonation: { active: true, actorName: 'Pat Admin', actorLevel: 'L1' },
    });
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();

    httpMock.expectNone((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/admin/approvals"]');
    expect(link.textContent).toContain('Approvals');
  });

  it('shows the Approvals entry once the *ADMAPRQ probe succeeds for a customer administrator', () => {
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/admin/approvals"]')).toBeNull();

    httpMock
      .expectOne((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER')
      .flush({ pagination: { page: 1, pageSize: 1, totalRows: 0, totalPages: 0 }, data: [] });
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/admin/approvals"]');
    expect(link.textContent).toContain('Approvals');
  });

  it('keeps the Approvals entry hidden when the *ADMAPRQ probe fails', () => {
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();

    httpMock
      .expectOne((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER')
      .flush({ success: false, code: 'ERR', message: 'Only an administrator can open the approvals screen.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/admin/approvals"]')).toBeNull();
  });
});
