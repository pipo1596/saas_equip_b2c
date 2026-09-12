import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Footer } from './footer';

describe('Footer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Footer],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Footer);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should load tenant settings on init', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    footer.ngOnInit();

    const req = TestBed.inject(HttpTestingController).expectOne(
      '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS',
    );
    req.flush({ logo_url: '/photos/partner-2/logo.jpg', copyrg_txt: 'Copyright test' } as never);

    expect(footer.tenantSettings()?.copyrg_txt).toBe('Copyright test');
  });

  it('should fall back to placeholder department contact details before settings load', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    expect(footer.departmentContact()).toEqual({
      name: 'Lt. J. Lufrano',
      phone: '1-800-SEAVIEW',
      phoneHref: 'tel:1800',
      email: 'J.Lufrano@SeaviewSecurity.com',
    });
    expect(footer.departmentAddress()).toBeNull();
  });

  it('should use the tenant contact/address once settings load', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    footer.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({
        cont_name: 'Seth Bailey',
        pric_phn: '(902) 468-4314',
        pric_eml: 'bailey-seth@galls.com',
        addr_line1: '89 Cutler Ave',
        addr_line2: 'Unit 105',
        city: 'Dartmouth',
        province: 'NS',
        postal_code: 'NS B3B 0J5',
      } as never);

    expect(footer.departmentContact()).toEqual({
      name: 'Seth Bailey',
      phone: '(902) 468-4314',
      phoneHref: 'tel:9024684314',
      email: 'bailey-seth@galls.com',
    });
    expect(footer.departmentAddress()).toEqual({
      line1: '89 Cutler Ave',
      line2: 'Unit 105',
      cityLine: 'Dartmouth, NS NS B3B 0J5',
    });
  });

  it('should normalize social URLs and add a protocol when missing', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    footer.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({
        facebk_url: 'http://facebook.com',
        twiter_url: 'x.com',
        instag_url: 'https://instagram.com',
        youtub_url: '',
        linkdin_url: null,
      } as never);

    expect(footer.socialLinks()).toEqual({
      facebook: 'http://facebook.com',
      twitter: 'https://x.com',
      instagram: 'https://instagram.com',
      youtube: null,
      linkedin: null,
    });
  });

  it('should report no social links when every field is blank', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    footer.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({
        facebk_url: '',
        twiter_url: null,
        instag_url: undefined,
        youtub_url: '',
        linkdin_url: null,
      } as never);

    expect(footer.hasSocialLinks()).toBe(false);
  });

  it('should report social links present when at least one field is set', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    footer.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({ facebk_url: 'facebook.com' } as never);

    expect(footer.hasSocialLinks()).toBe(true);
  });
});
