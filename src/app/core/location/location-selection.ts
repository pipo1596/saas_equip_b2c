import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

import { AuthService, EmployeeLocation } from '../auth/auth';

const SELECTED_LOCATION_STORAGE_KEY = 'header.selectedLocationId';

// Shared across every page (not just the header) so the product list, and
// anything else that's location-scoped, sees the same active location the
// header's switcher shows — rather than each defaulting independently.
@Injectable({ providedIn: 'root' })
export class LocationSelectionService {
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly selectedLocationId = signal<number | null>(this.restore());

  // Falls back to the employee's first assigned location until they pick one
  // — self-corrects on login/logout since a stale id just won't be found.
  readonly activeLocation = computed<EmployeeLocation | null>(() => {
    const locations = this.authService.locations();
    const selectedId = this.selectedLocationId();
    return locations.find((location) => location.locationId === selectedId) ?? locations[0] ?? null;
  });

  select(location: EmployeeLocation): void {
    this.selectedLocationId.set(location.locationId);
    if (this.isBrowser) {
      localStorage.setItem(SELECTED_LOCATION_STORAGE_KEY, String(location.locationId));
    }
  }

  private restore(): number | null {
    if (!this.isBrowser) {
      return null;
    }
    const stored = localStorage.getItem(SELECTED_LOCATION_STORAGE_KEY);
    const parsed = stored === null ? NaN : Number(stored);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
