import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';

import { AuthService } from '../../core/auth/auth';
import { TenantSettingsService } from '../../core/tenant/tenant-settings';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

@Component({
  selector: 'app-home',
  imports: [Header, Footer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrls: ['../../shared/shared.css', './home.css'],
})
export class Home implements OnInit {
  @ViewChild('categoryTrack') private readonly categoryTrack?: ElementRef<HTMLElement>;

  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tenantSettings = this.tenantSettingsService.settings;
  readonly firstName = this.authService.firstName;

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
