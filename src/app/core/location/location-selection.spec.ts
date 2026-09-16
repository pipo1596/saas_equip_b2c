import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../auth/auth';
import { LocationSelectionService } from './location-selection';

const LOCATIONS = [
  { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
  { empLocId: 14999, locationId: 15, locationCode: '001', locationName: 'Edmonton Fire Dept Office' },
];

describe('LocationSelectionService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => localStorage.clear());

  it('defaults to no active location when logged out', () => {
    const service = TestBed.inject(LocationSelectionService);
    expect(service.activeLocation()).toBeNull();
  });

  it('defaults to the first assigned location once a session has locations', () => {
    const service = TestBed.inject(LocationSelectionService);
    const auth = TestBed.inject(AuthService);

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: LOCATIONS,
    });

    expect(service.activeLocation()?.locationName).toBe('Edmonton Fire Dept Chief');
  });

  it('switches the active location and persists the choice', () => {
    const service = TestBed.inject(LocationSelectionService);
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: LOCATIONS,
    });

    service.select(LOCATIONS[1]);

    expect(service.activeLocation()?.locationName).toBe('Edmonton Fire Dept Office');
    expect(localStorage.getItem('header.selectedLocationId')).toBe('15');
  });

  it('restores a previously selected location for a brand new instance (e.g. a fresh page load)', () => {
    localStorage.setItem('header.selectedLocationId', '15');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(LocationSelectionService);
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
      locations: LOCATIONS,
    });

    expect(service.activeLocation()?.locationName).toBe('Edmonton Fire Dept Office');
  });
});
