import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth';

const NO_RETRY_MESSAGE = 'This link has expired. Go back to the admin console and click Shop as again.';

@Component({
  selector: 'app-shop-as',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shop-as.html',
  styleUrls: ['../auth-shared.css'],
})
export class ShopAs implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly state = signal<'loading' | 'error'>('loading');
  readonly errorMessage = signal(NO_RETRY_MESSAGE);

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.redeem();
  }

  private async redeem(): Promise<void> {
    // The token travels in the fragment on purpose — browsers never send it
    // to the server, keeping it out of web-server logs and Referer headers.
    // Stripped from the address bar immediately, before the network call,
    // so it never lingers in history, bookmarks, or a screenshot.
    const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('t');
    history.replaceState(null, '', '/shop-as');

    if (!token) {
      this.state.set('error');
      return;
    }

    try {
      const response = await firstValueFrom(this.authService.redeemShopAs(token));
      if (!response.success) {
        this.errorMessage.set(response.message ?? NO_RETRY_MESSAGE);
        this.state.set('error');
        return;
      }
      this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch {
      this.errorMessage.set(NO_RETRY_MESSAGE);
      this.state.set('error');
    }
  }
}
