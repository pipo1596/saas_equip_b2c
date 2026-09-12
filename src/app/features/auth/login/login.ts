import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth';
import { TenantSettingsService } from '../../../core/tenant/tenant-settings';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrls: ['../auth-shared.css', './login.css'],
})
export class Login implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly showPassword = signal(false);
  readonly submitting = signal(false);
  readonly loginError = signal<string | null>(null);
  readonly currentYear = new Date().getFullYear();

  // Tenant branding is per-hostname and fetched client-side only — it isn't
  // known at SSR prerender time, so the static shell renders with the
  // fallback mark below and swaps in the real logo/photo once this loads.
  readonly tenantSettings = this.tenantSettingsService.settings;

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    if (this.isBrowser) {
      this.tenantSettingsService.load().subscribe();
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();

    this.submitting.set(true);
    this.loginError.set(null);

    try {
      const response = await firstValueFrom(this.authService.login(email, password));

      if (!response.success) {
        this.loginError.set(response.message ?? 'Incorrect email or password.');
        return;
      }

      this.router.navigateByUrl(response.mfaRequired ? '/mfa' : '/home');
    } catch {
      this.loginError.set('We could not reach the sign-in service. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
