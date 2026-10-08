import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  QueryList,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth';

const CODE_LENGTH = 6;

@Component({
  selector: 'app-mfa',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mfa.html',
  styleUrls: ['../auth-shared.css', './mfa.css'],
})
export class Mfa implements AfterViewInit {
  @ViewChildren('digitInput') private readonly digitInputs!: QueryList<
    ElementRef<HTMLInputElement>
  >;

  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);
  readonly resending = signal(false);
  readonly resent = signal(false);

  readonly form = this.formBuilder.group({
    digits: this.formBuilder.nonNullable.array(
      Array.from({ length: CODE_LENGTH }, () =>
        this.formBuilder.nonNullable.control('', [
          Validators.required,
          Validators.pattern(/^\d$/),
        ]),
      ),
    ),
  });

  get digits() {
    return this.form.controls.digits;
  }

  ngAfterViewInit(): void {
    // Focusing/selecting an input has no meaning during SSR prerendering,
    // and the server's DOM implementation doesn't provide `.select()`.
    if (this.isBrowser) {
      this.focusInput(0);
    }
  }

  onFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  onDigitInput(event: Event, index: number): void {
    this.resent.set(false);
    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    this.digits.at(index).setValue(digit, { emitEvent: false });
    input.value = digit;
    if (digit && index < CODE_LENGTH - 1) {
      this.focusInput(index + 1);
    }
  }

  onDigitKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.digits.at(index).value && index > 0) {
      this.digits.at(index - 1).setValue('');
      this.focusInput(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusInput(index - 1);
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      this.focusInput(index + 1);
    }
  }

  onPaste(event: ClipboardEvent): void {
    this.resent.set(false);
    event.preventDefault();
    const digits = (event.clipboardData?.getData('text') ?? '')
      .replace(/\D/g, '')
      .slice(0, CODE_LENGTH)
      .split('');
    digits.forEach((digit, index) => this.digits.at(index).setValue(digit));
    this.focusInput(Math.min(digits.length, CODE_LENGTH - 1));
  }

  cancel(): void {
    this.authService.logout();
    this.router.navigateByUrl('/');
  }

  // There's no dedicated resend action — this replays the original `login`
  // call instead, since that's what actually sends the code in the first
  // place. `resendMfa` comes back `null` once the credentials it needs are
  // no longer held in memory (e.g. this tab was refreshed mid-challenge);
  // there's nothing to replay at that point, so send the employee back to
  // sign in properly instead of leaving them stuck on a resend that can
  // never succeed.
  async resendCode(): Promise<void> {
    this.error.set(null);
    this.resent.set(false);

    const resend = this.authService.resendMfa();
    if (!resend) {
      this.error.set('Your session has expired. Please sign in again.');
      this.cancel();
      return;
    }

    this.resending.set(true);

    try {
      const response = await firstValueFrom(resend);

      if (!response.success) {
        this.error.set(response.message ?? 'We could not send a new code.');
        return;
      }

      if (!response.mfaRequired) {
        // The backend didn't ask for a code at all this time — nothing left
        // to verify, so finish the same way a successful code entry would.
        this.router.navigateByUrl('/home');
        return;
      }

      // The old code is no longer valid once a new one's been sent — clear
      // the entered digits so the employee can't resubmit it by mistake.
      this.digits.reset();
      this.submitted.set(false);
      this.resent.set(true);
      if (this.isBrowser) {
        this.focusInput(0);
      }
    } catch {
      this.error.set('We could not reach the sign-in service. Please try again.');
    } finally {
      this.resending.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    this.submitted.set(true);

    if (this.digits.invalid) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    try {
      const code = this.digits.getRawValue().join('');
      const response = await firstValueFrom(this.authService.verifyMfa(code));

      if (!response.success) {
        this.error.set(response.message ?? 'That code was not valid.');
        return;
      }

      if (response.mfaRequired) {
        this.error.set('Verification did not complete. Please try again.');
        return;
      }

      this.router.navigateByUrl('/home');
    } catch {
      this.error.set('We could not reach the sign-in service. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  private focusInput(index: number): void {
    const input = this.digitInputs.get(index)?.nativeElement;
    input?.focus();
    input?.select();
  }
}
