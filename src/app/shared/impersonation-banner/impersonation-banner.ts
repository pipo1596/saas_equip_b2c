import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth';

@Component({
  selector: 'app-impersonation-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './impersonation-banner.html',
  styleUrl: './impersonation-banner.css',
})
export class ImpersonationBanner {
  private readonly authService = inject(AuthService);

  readonly impersonation = this.authService.impersonation;
  readonly fullName = this.authService.fullName;

  // Not a confirm dialog — the admin-side "Shop as" click already confirms
  // before issuing the link; ending it here is a direct action.
  endSession(): void {
    this.authService.endSession().subscribe({ error: () => {} });
  }
}
