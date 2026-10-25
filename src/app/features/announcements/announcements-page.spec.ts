import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { Announcement } from '../../core/announcements/announcements';
import { AnnouncementsPage } from './announcements-page';

const NOTICES: Announcement[] = [
  {
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
  },
  {
    noticeId: 41,
    date: '2026-09-21',
    category: 'Allotment',
    title: 'Footwear allotment renewed',
    excerpt: 'Your 200-point footwear allotment renewed on Sep 21.',
    body: '<p>Points not used by the next renewal date do not carry over.</p>',
    postedBy: 'Edmonton Fire Dept Office',
    isLive: 'N',
    isEnded: 'N',
    linkType: 'ANNOUNCE',
    linkText: 'Read the update',
    linkProgCatId: null,
    linkProductPk: null,
    linkUrl: null,
  },
  {
    noticeId: 40,
    date: '2026-08-15',
    category: 'Catalog',
    title: 'New winter duty jacket added',
    excerpt: 'The new winter duty jacket is now in the Clothing catalog.',
    body: null,
    postedBy: null,
    isLive: 'N',
    isEnded: 'Y',
    linkType: 'NONE',
    linkText: null,
    linkProgCatId: null,
    linkProductPk: null,
    linkUrl: null,
  },
];

describe('AnnouncementsPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AnnouncementsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The embedded header independently fetches tenant settings, cart and
    // catalog nav — drain whatever a given test didn't itself handle before
    // the strict verify() below.
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
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
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  function flushArchive(data: Announcement[]) {
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC').flush({ data });
  }

  it('fetches *ARCHIVE on init', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    fixture.detectChanges();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCNTC');
    expect(req.request.body).toEqual({ action: '*ARCHIVE' });
    req.flush({ data: [] });
  });

  it('shows an empty state when there are no announcements', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    fixture.detectChanges();
    flushArchive([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('You have no announcements right now.');
    expect(fixture.nativeElement.querySelector('.announcements__current')).toBeNull();
  });

  it('shows the newest notice as Current and the rest as Previous notices, nothing expanded by default', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushArchive(NOTICES);
    fixture.detectChanges();

    expect(page.current()?.noticeId).toBe(42);
    expect(page.previous().map((n) => n.noticeId)).toEqual([41, 40]);
    expect(page.selectedIndex()).toBeNull();
    expect(fixture.nativeElement.querySelector('.announcements__body')).toBeNull();
    const rows = fixture.nativeElement.querySelectorAll('.announcements__row');
    expect(rows.length).toBe(2);
  });

  it('pre-selects the notice matching the noticeId input, opened', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    const page = fixture.componentInstance;
    fixture.componentRef.setInput('noticeId', '41');
    fixture.detectChanges();
    flushArchive(NOTICES);
    fixture.detectChanges();

    expect(page.selectedIndex()).toBe(1);
    expect(page.position()).toBe(2);
    expect(fixture.nativeElement.querySelector('.announcements__row--open')).not.toBeNull();
  });

  it('ignores an unknown noticeId and selects nothing', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    const page = fixture.componentInstance;
    fixture.componentRef.setInput('noticeId', '999');
    fixture.detectChanges();
    flushArchive(NOTICES);
    fixture.detectChanges();

    expect(page.selectedIndex()).toBeNull();
  });

  it('toggles the Current notice open and closed', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushArchive(NOTICES);
    fixture.detectChanges();

    const head: HTMLButtonElement = fixture.nativeElement.querySelector('.announcements__current-head');
    head.click();
    fixture.detectChanges();
    expect(page.selectedIndex()).toBe(0);
    expect(fixture.nativeElement.querySelector('.announcements__body')).not.toBeNull();

    head.click();
    fixture.detectChanges();
    expect(page.selectedIndex()).toBeNull();
  });

  it('hides the action link for an ANNOUNCE-type notice (it would point back at this page)', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushArchive(NOTICES);
    fixture.detectChanges();

    // NOTICES[1] (noticeId 41) is linkType ANNOUNCE.
    expect(page.actionLink(NOTICES[1])).toBeNull();
    // NOTICES[0] (noticeId 42) is linkType CATEGORY — unaffected.
    expect(page.actionLink(NOTICES[0])).toEqual({
      kind: 'route',
      label: 'Shop approved boots',
      routerLink: ['/products', 311],
    });
  });

  it('steps older/newer across the whole list and disables at both ends', () => {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushArchive(NOTICES);
    fixture.detectChanges();

    expect(page.atStart()).toBe(true);
    expect(page.atEnd()).toBe(true);

    page.goOlder();
    expect(page.selectedIndex()).toBe(0);
    expect(page.atStart()).toBe(true);
    expect(page.atEnd()).toBe(false);

    page.goOlder();
    expect(page.selectedIndex()).toBe(1);
    page.goOlder();
    expect(page.selectedIndex()).toBe(2);
    expect(page.atEnd()).toBe(true);
    // No further notices past the last one.
    page.goOlder();
    expect(page.selectedIndex()).toBe(2);

    page.goNewer();
    expect(page.selectedIndex()).toBe(1);
  });
});
