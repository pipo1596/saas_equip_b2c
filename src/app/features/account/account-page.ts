import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { EmployeeService } from '../../core/employee/employee';
import { AccountNav } from '../../shared/account-nav/account-nav';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

@Component({
  selector: 'app-account-page',
  imports: [Header, Footer, RouterLink, DatePipe, AccountNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-page.html',
  styleUrls: ['../../shared/shared.css', './account-page.css'],
})
export class AccountPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly employeeService = inject(EmployeeService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly fullName = this.authService.fullName;
  readonly initials = this.authService.initials;
  readonly profile = computed(() => this.employeeService.employee()?.profile ?? null);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly resetSent = signal(false);
  readonly resetPending = signal(false);
  readonly resetError = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    const session = this.authService.session();
    if (!session) {
      this.loading.set(false);
      return;
    }
    // Safe to call even if already fetched right after login — `load()`
    // reuses the cached record or an already-in-flight request rather than
    // firing a second one.
    this.employeeService.load(session.empId, session.sessionId).subscribe({
      next: () => this.loading.set(false),
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(
          err instanceof Error ? err.message : 'We could not load your account right now.',
        );
      },
    });
  }

  // Timestamps like `passwordChangedTs` are `'YYYY-MM-DD HH:MM:SS'` with no
  // timezone — same convention as order timestamps elsewhere (see
  // order-history's `orderDate`) — this only needs the date half.
  dateOnly(ts: string): string {
    return ts.split(' ')[0] ?? ts;
  }

  // Sends a reset link to the address on file — unlike the logged-out
  // forgot-password flow, there's no code-entry step here; the emailed link
  // handles the rest.
  async requestPasswordReset(): Promise<void> {
    const email = this.profile()?.personal.email;
    if (!email || this.resetPending()) {
      return;
    }
    this.resetPending.set(true);
    this.resetError.set(null);
    try {
      const response = await firstValueFrom(this.authService.requestPasswordReset(email));
      if (!response.success) {
        this.resetError.set(response.message ?? 'We could not send that email. Please try again.');
        return;
      }
      this.resetSent.set(true);
    } catch {
      this.resetError.set('We could not reach the sign-in service. Please try again.');
    } finally {
      this.resetPending.set(false);
    }
  }
}
