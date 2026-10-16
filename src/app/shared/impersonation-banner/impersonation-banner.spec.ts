import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth';
import { FAKE_SESSION } from '../../core/auth/auth.testing';
import { ImpersonationBanner } from './impersonation-banner';

describe('ImpersonationBanner', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ImpersonationBanner],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders nothing for a normal (non-impersonating) session', () => {
    const auth = TestBed.inject(AuthService);
    auth.session.set(FAKE_SESSION);
    const fixture = TestBed.createComponent(ImpersonationBanner);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.impersonation-banner')).toBeNull();
  });

  it('renders nothing when there is no session at all', () => {
    const fixture = TestBed.createComponent(ImpersonationBanner);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.impersonation-banner')).toBeNull();
  });

  it('shows the employee and actor names while impersonating', () => {
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      ...FAKE_SESSION,
      impersonation: { active: true, actorName: 'Pat Admin', actorLevel: 'L1' },
    });
    const fixture = TestBed.createComponent(ImpersonationBanner);
    fixture.detectChanges();

    const banner: HTMLElement = fixture.nativeElement.querySelector('.impersonation-banner');
    expect(banner.textContent).toContain('Pat Doe');
    expect(banner.textContent).toContain('Pat Admin');
  });

  it('posts SHOPEND when End is clicked', () => {
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      ...FAKE_SESSION,
      impersonation: { active: true, actorName: 'Pat Admin', actorLevel: 'L1' },
    });
    const fixture = TestBed.createComponent(ImpersonationBanner);
    fixture.detectChanges();

    const endBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.impersonation-banner button');
    endBtn.click();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(req.request.body).toEqual({ action: 'SHOPEND' });
    req.flush({ success: true, wasImpersonating: true, message: null });

    expect(auth.sessionEnded()).toBe(true);
  });
});
