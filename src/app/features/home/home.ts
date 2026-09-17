import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { CatalogViewService } from '../../core/catalog/catalog-view';
import { LocationSelectionService } from '../../core/location/location-selection';
import { TenantSettingsService } from '../../core/tenant/tenant-settings';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

@Component({
  selector: 'app-home',
  imports: [Header, Footer, RouterLink, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrls: ['../../shared/shared.css', './home.css'],
})
export class Home implements OnInit {
  @ViewChild('categoryTrack') private readonly categoryTrack?: ElementRef<HTMLElement>;

  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly authService = inject(AuthService);
  private readonly catalogViewService = inject(CatalogViewService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tenantSettings = this.tenantSettingsService.settings;
  readonly firstName = this.authService.firstName;
  readonly categories = this.catalogViewService.categories;

  // Refreshes the "Shop by category" list whenever the active location
  // defaults or changes, same as the header's own catalog menu load.
  private readonly loadCategoriesOnLocationChange = effect(() => {
    const location = this.locationSelectionService.activeLocation();
    if (location && this.isBrowser) {
      this.catalogViewService.loadCategories(location.locationId).subscribe();
    }
  });

  ngOnInit(): void {
    if (this.isBrowser) {
      this.tenantSettingsService.load().subscribe();
    }
  }

  scrollCategories(direction: -1 | 1): void {
    const track = this.categoryTrack?.nativeElement;
    if (!track) {
      return;
    }
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' });
  }
}
