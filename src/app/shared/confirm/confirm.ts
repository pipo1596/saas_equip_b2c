import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Renders the confirm button as a warning color — for a destructive
  // action (remove, clear) rather than a routine one.
  danger?: boolean;
}

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly danger: boolean;
}

// Backs a single app-wide confirmation dialog (mounted once at the app
// root — see `ConfirmDialog`) that any component can trigger without
// needing its own modal markup. Only one confirmation can be pending at a
// time, matching how a real modal works (it blocks everything behind it
// anyway).
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);
  private pendingResolve: ((confirmed: boolean) => void) | null = null;

  ask(options: ConfirmOptions): Observable<boolean> {
    return new Observable<boolean>((subscriber) => {
      this.request.set({
        title: options.title ?? 'Please confirm',
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        danger: options.danger ?? false,
      });
      this.pendingResolve = (confirmed) => {
        subscriber.next(confirmed);
        subscriber.complete();
      };
    });
  }

  respond(confirmed: boolean): void {
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.request.set(null);
    resolve?.(confirmed);
  }
}
