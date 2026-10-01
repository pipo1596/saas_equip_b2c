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

  it('should render without a logo (and without crashing NgOptimizedImage) when logo_url is empty', () => {
    const fixture = TestBed.createComponent(Footer);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({ copyrg_txt: 'Copyright test' } as never);

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.querySelector('.foot__logo')).toBeNull();
  });

  it('should grow the footer logo box taller for a squarer logo, capped at the max height', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    expect(footer.footLogoHeight()).toBe(40);

    // Roughly square (200x180) — at the box's fixed 130px width that ratio
    // implies ~117px tall, well past the cap, so it should clamp to it.
    footer.onFootLogoLoad({ target: { naturalWidth: 200, naturalHeight: 180 } } as unknown as Event);
    expect(footer.footLogoHeight()).toBe(58);

    // A wide banner logo (400x60) implies ~19.5px at that width — below the
    // floor, so it should clamp back up to the box's minimum height.
    footer.onFootLogoLoad({ target: { naturalWidth: 400, naturalHeight: 60 } } as unknown as Event);
    expect(footer.footLogoHeight()).toBe(40);
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
        cont_name: 'Test Contact',
        pric_phn: '555-0100',
        pric_eml: 'contact@example.com',
        addr_line1: '123 Test St',
        addr_line2: 'Suite 100',
        city: 'Testville',
        province: 'NS',
        postal_code: 'A1A 1A1',
      } as never);

    expect(footer.departmentContact()).toEqual({
      name: 'Test Contact',
      phone: '555-0100',
      phoneHref: 'tel:5550100',
      email: 'contact@example.com',
    });
    expect(footer.departmentAddress()).toEqual({
      line1: '123 Test St',
      line2: 'Suite 100',
      cityLine: 'Testville, NS A1A 1A1',
    });
  });

  it('should normalize social URLs and add a protocol when missing', () => {
    const fixture = TestBed.createComponent(Footer);
    const footer = fixture.componentInstance;

    footer.ngOnInit();
    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({
        facebk_url: 'facebook.com/test',
        twiter_url: 'x.com/test',
        instag_url: 'instagram.com/test',
        youtub_url: '',
        linkdin_url: null,
      } as never);

    expect(footer.socialLinks()).toEqual({
      facebook: 'https://facebook.com/test',
      twitter: 'https://x.com/test',
      instagram: 'https://instagram.com/test',
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
