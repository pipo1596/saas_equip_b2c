import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth/auth';
import { IdleTimeoutService } from './core/auth/idle-timeout';
import { ConfirmDialog } from './shared/confirm/confirm-dialog';
import { ImpersonationBanner } from './shared/impersonation-banner/impersonation-banner';
import { ShopAsEnded } from './shared/shop-as-ended/shop-as-ended';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialog, ImpersonationBanner, ShopAsEnded],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Injecting it here is what actually instantiates this singleton — a
  // `providedIn: 'root'` service otherwise never gets constructed until
  // something asks for it, and nothing else in the app has a reason to.
  private readonly idleTimeoutService = inject(IdleTimeoutService);
  readonly authService = inject(AuthService);
}
