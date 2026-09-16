import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CatalogView, CatalogViewService } from './catalog-view';

const SAMPLE: CatalogView = {
  viewId: 6,
  programId: 28,
  categoryCount: 2,
  menu: {
    clothing: [],
    footwear: [
      {
        progCatId: 310,
        parentProgCatId: null,
        categoryName: 'Footwear',
        sortOrder: 0,
        status: 'ACTIVE',
        children: [
          {
            progCatId: 321,
            parentProgCatId: 310,
            categoryName: 'Boot',
            sortOrder: 0,
            status: 'ACTIVE',
            children: [],
          },
        ],
      },
    ],
    gear: [
      {
        progCatId: 313,
        parentProgCatId: null,
        categoryName: 'Duty Gear',
        sortOrder: 0,
        status: 'ACTIVE',
        children: [],
      },
    ],
  },
};

describe('CatalogViewService', () => {
  let service: CatalogViewService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogViewService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts with no cached menu', () => {
    expect(service.menu()).toBeNull();
  });

  it('fetches the menu for a location and caches it', () => {
    let result: CatalogView | undefined;
    service.load(18).subscribe((view) => (result = view));

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ locationId: 18, action: '*MENU' });
    req.flush(SAMPLE);

    expect(result).toEqual(SAMPLE);
    expect(service.menu()).toEqual(SAMPLE.menu);
  });

  it('fetches fresh when the location changes', () => {
    service.load(18).subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(SAMPLE);

    service.load(15).subscribe();
    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({ locationId: 15, action: '*MENU' });
    req.flush({ ...SAMPLE, menu: { clothing: [], footwear: [], gear: [] } });

    expect(service.menu()).toEqual({ clothing: [], footwear: [], gear: [] });
  });

  it('reuses the cached response for a repeat call with the same location, without a new request', () => {
    let first: CatalogView | undefined;
    let second: CatalogView | undefined;
    service.load(18).subscribe((view) => (first = view));
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(SAMPLE);

    service.load(18).subscribe((view) => (second = view));

    httpMock.expectNone('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(first).toEqual(SAMPLE);
    expect(second).toEqual(SAMPLE);
  });

  it('shares one in-flight request between concurrent calls for the same location', () => {
    let first: CatalogView | undefined;
    let second: CatalogView | undefined;
    service.load(18).subscribe((view) => (first = view));
    service.load(18).subscribe((view) => (second = view));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(SAMPLE);

    expect(first).toEqual(SAMPLE);
    expect(second).toEqual(SAMPLE);
  });
});
