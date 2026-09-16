import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth';

type Step = 'request' | 'reset' | 'done';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { mismatch: true }
    : null;
}

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forgot-password.html',
  styleUrls: ['../auth-shared.css'],
})
export class ForgotPassword {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly step = signal<Step>('request');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly submittedEmail = signal<string | null>(null);

  readonly requestForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly resetForm = this.formBuilder.nonNullable.group(
    {
      code: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  async submitRequest(): Promise<void> {
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    try {
      const { email } = this.requestForm.getRawValue();
      const response = await firstValueFrom(this.authService.requestPasswordReset(email));

      if (!response.success) {
        this.error.set(response.message ?? 'We could not send a reset code.');
        return;
      }

      this.submittedEmail.set(email);
      this.step.set('reset');
    } catch {
      this.error.set('We could not reach the sign-in service. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  async submitReset(): Promise<void> {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const email = this.submittedEmail();
    if (!email) {
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    try {
      const { code, newPassword } = this.resetForm.getRawValue();
      const response = await firstValueFrom(
        this.authService.resetPassword(email, code, newPassword),
      );

      if (!response.success) {
        this.error.set(response.message ?? 'We could not reset your password.');
        return;
      }

      this.step.set('done');
    } catch {
      this.error.set('We could not reach the sign-in service. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  async resendCode(): Promise<void> {
    const email = this.submittedEmail();
    if (!email) {
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    try {
      await firstValueFrom(this.authService.requestPasswordReset(email));
    } catch {
      this.error.set('We could not reach the sign-in service. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  backToRequest(): void {
    this.step.set('request');
    this.error.set(null);
  }
}
