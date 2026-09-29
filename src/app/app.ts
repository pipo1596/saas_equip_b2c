import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { IdleTimeoutService } from './core/auth/idle-timeout';
import { ConfirmDialog } from './shared/confirm/confirm-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Injecting it here is what actually instantiates this singleton — a
  // `providedIn: 'root'` service otherwise never gets constructed until
  // something asks for it, and nothing else in the app has a reason to.
  private readonly idleTimeoutService = inject(IdleTimeoutService);
}
