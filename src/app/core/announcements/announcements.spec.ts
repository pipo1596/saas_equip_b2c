import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Announcement, AnnouncementsService, NoticeBanner, noticeLink, noticeStyleClass } from './announcements';

const RAW_BANNER: NoticeBanner = {
  noticeId: 42,
  message: 'Latest news from Metro EMS: the 2026 station-boot policy is now in effect.',
  style: 'INFO',
  linkType: 'ANNOUNCE',
  linkText: 'Read the update',
  linkProgCatId: null,
  linkProductPk: null,
  linkUrl: null,
};

const RAW_ANNOUNCEMENT: Announcement = {
  noticeId: 42,
  date: '2026-10-01',
  category: 'Policy',
  title: '2026 station-boot policy now in effect',
  excerpt: 'Latest news from Metro EMS: the 2026 station-boot policy is now in effect.',
  body: '<p>Effective October 1, 2026, all field staff must wear an approved station boot on shift.</p>',
  postedBy: 'Metro EMS Logistics',
  isLive: 'Y',
  isEnded: 'N',
  linkType: 'CATEGORY',
  linkText: 'Shop approved boots',
  linkProgCatId: 311,
  linkProductPk: null,
  linkUrl: null,
};

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnnouncementsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('banner', () => {
    it('posts *BANNER and returns the banner', () => {
      let result: NoticeBanner | null | undefined;
      service.banner().subscribe((banner) => (result = banner));

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC');
      expect(req.request.body).toEqual({ action: '*BANNER' });
      req.flush({ banner: RAW_BANNER });

      expect(result).toEqual(RAW_BANNER);
    });

    it('resolves to null when there is no qualifying notice', () => {
      let result: NoticeBanner | null | undefined;
      service.banner().subscribe((banner) => (result = banner));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC').flush({ banner: null });

      expect(result).toBeNull();
    });

    it('resolves to null on a success:false envelope instead of erroring', () => {
      let result: NoticeBanner | null | undefined;
      service.banner().subscribe((banner) => (result = banner));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC')
        .flush({ success: false, message: 'Session expired.' });

      expect(result).toBeNull();
    });

    it('resolves to null on a network error instead of erroring', () => {
      let result: NoticeBanner | null | undefined;
      let errored = false;
      service.banner().subscribe({ next: (banner) => (result = banner), error: () => (errored = true) });

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC')
        .flush('boom', { status: 500, statusText: 'Server error' });

      expect(errored).toBe(false);
      expect(result).toBeNull();
    });
  });

  describe('archive', () => {
    it('posts *ARCHIVE and returns the list', () => {
      let result: Announcement[] | undefined;
      service.archive().subscribe((data) => (result = data));

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC');
      expect(req.request.body).toEqual({ action: '*ARCHIVE' });
      req.flush({ data: [RAW_ANNOUNCEMENT] });

      expect(result).toEqual([RAW_ANNOUNCEMENT]);
    });

    it('resolves to an empty list on a success:false envelope instead of erroring', () => {
      let result: Announcement[] | undefined;
      service.archive().subscribe((data) => (result = data));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC')
        .flush({ success: false, message: 'Session expired.' });

      expect(result).toEqual([]);
    });
  });
});

describe('noticeLink', () => {
  it('returns null for NONE', () => {
    expect(noticeLink({ ...RAW_BANNER, linkType: 'NONE', linkText: null })).toBeNull();
  });

  it('returns null when linkText is missing, regardless of type', () => {
    expect(noticeLink({ ...RAW_BANNER, linkText: null })).toBeNull();
  });

  it('builds a route to /announcements for ANNOUNCE, carrying the noticeId', () => {
    expect(noticeLink(RAW_BANNER)).toEqual({
      kind: 'route',
      label: 'Read the update',
      routerLink: ['/announcements'],
      queryParams: { noticeId: 42 },
    });
  });

  it('suppresses ANNOUNCE when excludeAnnounce is set (the Announcements page itself)', () => {
    expect(noticeLink(RAW_BANNER, { excludeAnnounce: true })).toBeNull();
  });

  it('builds a route to /products/:progCatId for CATEGORY', () => {
    expect(
      noticeLink({ ...RAW_BANNER, linkType: 'CATEGORY', linkProgCatId: 311, linkText: 'Shop approved boots' }),
    ).toEqual({ kind: 'route', label: 'Shop approved boots', routerLink: ['/products', 311] });
  });

  it('hides a CATEGORY link with no category id', () => {
    expect(
      noticeLink({ ...RAW_BANNER, linkType: 'CATEGORY', linkProgCatId: null, linkText: 'Shop approved boots' }),
    ).toBeNull();
  });

  it('builds a route to /product/:productPk for PRODUCT', () => {
    expect(
      noticeLink({ ...RAW_BANNER, linkType: 'PRODUCT', linkProductPk: 9001, linkText: 'View product' }),
    ).toEqual({ kind: 'route', label: 'View product', routerLink: ['/product', 9001] });
  });

  it('hides a PRODUCT link with no product id', () => {
    expect(
      noticeLink({ ...RAW_BANNER, linkType: 'PRODUCT', linkProductPk: null, linkText: 'View product' }),
    ).toBeNull();
  });

  it('builds an external link for EXTERNAL', () => {
    expect(
      noticeLink({ ...RAW_BANNER, linkType: 'EXTERNAL', linkUrl: 'https://example.com', linkText: 'Learn more' }),
    ).toEqual({ kind: 'external', label: 'Learn more', href: 'https://example.com' });
  });

  it('hides an EXTERNAL link with no url', () => {
    expect(
      noticeLink({ ...RAW_BANNER, linkType: 'EXTERNAL', linkUrl: null, linkText: 'Learn more' }),
    ).toBeNull();
  });
});

describe('noticeStyleClass', () => {
  it('maps IMPORTANT and URGENT to their modifier classes, and INFO to none', () => {
    expect(noticeStyleClass('IMPORTANT')).toBe('notice--important');
    expect(noticeStyleClass('URGENT')).toBe('notice--urgent');
    expect(noticeStyleClass('INFO')).toBe('');
  });
});
