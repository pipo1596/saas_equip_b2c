import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  afterRenderEffect,
  inject,
} from '@angular/core';

import { ConfirmService } from './confirm';

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialogEl
      class="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      (close)="onNativeClose()"
      (click)="onBackdropClick($event)"
    >
      @if (request(); as request) {
        <div class="modal-content shadow-lg">
          <div class="modal-header">
            <h2 id="confirm-dialog-title" class="modal-title fs-5">{{ request.title }}</h2>
            <button type="button" class="btn-close" aria-label="Close" (click)="cancel()"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0">{{ request.message }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" (click)="cancel()">
              {{ request.cancelLabel }}
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-danger]="request.danger"
              [class.btn-primary]="!request.danger"
              (click)="confirmAction()"
            >
              {{ request.confirmLabel }}
            </button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    .confirm-dialog {
      /* Bootstrap only defines these custom properties on its own .modal
         wrapper, which this deliberately doesn't use (the native <dialog>
         handles positioning/backdrop itself) — without redeclaring them
         here, .modal-content's background/border/padding below all resolve
         to nothing, rendering as unstyled, see-through text. */
      --bs-modal-padding: 1rem;
      --bs-modal-color: var(--bs-body-color);
      --bs-modal-bg: var(--bs-body-bg);
      --bs-modal-border-color: var(--bs-border-color-translucent);
      --bs-modal-border-width: var(--bs-border-width);
      --bs-modal-border-radius: var(--bs-border-radius-lg);
      --bs-modal-inner-border-radius: calc(var(--bs-border-radius-lg) - var(--bs-border-width));
      --bs-modal-header-padding-x: 1rem;
      --bs-modal-header-padding-y: 1rem;
      --bs-modal-header-padding: 1rem 1rem;
      --bs-modal-header-border-color: var(--bs-border-color);
      --bs-modal-header-border-width: var(--bs-border-width);
      --bs-modal-title-line-height: 1.5;
      --bs-modal-footer-gap: 0.5rem;
      --bs-modal-footer-bg: ;
      --bs-modal-footer-border-color: var(--bs-border-color);
      --bs-modal-footer-border-width: var(--bs-border-width);
      padding: 0;
      border: none;
      background: transparent;
      width: min(440px, calc(100vw - 32px));
      max-width: none;
    }
    .confirm-dialog::backdrop {
      background: rgba(15, 23, 42, 0.5);
    }
  `,
})
export class ConfirmDialog {
  private readonly confirmService = inject(ConfirmService);
  @ViewChild('dialogEl') private readonly dialogEl?: ElementRef<HTMLDialogElement>;

  readonly request = this.confirmService.request;

  // Opens/closes the native <dialog> to track whether a confirmation is
  // pending — a plain effect() only guarantees running after change
  // detection, not after the <dialog> has actually been created/updated in
  // the DOM, so this uses afterRenderEffect like the rest of the app's own
  // DOM-imperative reads/writes.
  private readonly syncDialogOpenState = afterRenderEffect(() => {
    const dialog = this.dialogEl?.nativeElement;
    // jsdom (used in tests) doesn't implement showModal()/close() at all —
    // in a real browser this drives the native modal, focus trap, and
    // Escape-to-close; in tests the dialog just never actually opens, and
    // the confirm/cancel flow is exercised directly via the buttons below.
    if (!dialog || typeof dialog.showModal !== 'function') {
      return;
    }
    if (this.request() && !dialog.open) {
      dialog.showModal();
    } else if (!this.request() && dialog.open) {
      dialog.close();
    }
  });

  cancel(): void {
    this.confirmService.respond(false);
  }

  confirmAction(): void {
    this.confirmService.respond(true);
  }

  // Fires for a close the browser triggered itself (Escape, most notably)
  // rather than one of the buttons above — those already clear `request`
  // before this can fire, making it a no-op then.
  onNativeClose(): void {
    if (this.request()) {
      this.cancel();
    }
  }

  // The standard "click the backdrop to dismiss" trick for <dialog>: a
  // click lands on the dialog element itself only when it hits the
  // backdrop area, since the real content always has some element in
  // between.
  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl?.nativeElement) {
      this.cancel();
    }
  }
}
