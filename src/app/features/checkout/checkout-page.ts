import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  afterRenderEffect,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { CartService, formatBalanceAmount, formatCartItemOptions } from '../../core/cart/cart';
import { amountDueAtCheckout, paidFromLines } from '../../core/cart/cart-totals';
import {
  CheckoutService,
  CustomerAddress,
  CustomerShippingMethod,
  ProvinceTaxRate,
} from '../../core/checkout/checkout';
import { LocationSelectionService } from '../../core/location/location-selection';
import { OrderService } from '../../core/order/order';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

// Reformats to "(780) 555-0142" as digits are typed. Always ends in a
// digit (never a bare "(", ") " or "-"), so reformatting fresh from the
// digit count on every keystroke can't get stuck re-inserting a separator
// the user just deleted — unlike the expiry-date formatter this checkout
// page used to have, which needed an explicit "is this a delete" guard
// because its last character legitimately could be the literal "/".
function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) {
    return '';
  }
  if (digits.length <= 3) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// `crypto.randomUUID()` only exists in a "secure context" (HTTPS, or
// localhost) — calling it on a plain-HTTP deployment throws instead of
// just being `undefined`, which would otherwise crash checkout on load.
// The checkoutKey only needs to be unique enough to key a single
// attempt, not a strict RFC 4122 UUID, so this falls back to a
// timestamp + random-suffix string wherever `randomUUID` isn't there.
function generateCheckoutKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ckt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

@Component({
  selector: 'app-checkout-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-page.html',
  styleUrls: ['../../shared/shared.css', './checkout-page.css'],
})
export class CheckoutPage implements OnInit, AfterViewInit {
  private readonly cartService = inject(CartService);
  private readonly checkoutService = inject(CheckoutService);
  private readonly orderService = inject(OrderService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hostElementRef = inject(ElementRef<HTMLElement>);

  // Pre-filled from the logged-in session, which now has all four.
  readonly contactForm = this.formBuilder.nonNullable.group({
    email: [this.authService.session()?.email ?? '', [Validators.required, Validators.email]],
    firstName: [this.authService.session()?.firstName ?? '', Validators.required],
    lastName: [this.authService.session()?.lastName ?? '', Validators.required],
    phone: [formatPhoneNumber(this.authService.session()?.phone ?? ''), Validators.required],
    extension: [''],
  });

  // `FormGroup.valid` is a plain getter, not a signal — reading it directly
  // inside a `computed()` wouldn't register it as a dependency, so that
  // computed would never re-run once the form's validity actually changes
  // (e.g. the shopper typing a valid email) and the Place order button
  // would stay stuck showing whatever its very first validity happened to
  // be. Bridging `statusChanges` through `toSignal` makes it reactive.
  private readonly contactFormStatus = toSignal(this.contactForm.statusChanges, {
    initialValue: this.contactForm.status,
  });

  // Subscribes to `valueChanges` (not an `(input)` handler) so it doesn't
  // race with ReactiveFormsModule's own value accessor — `emitEvent: false`
  // on the write-back stops that write from re-triggering this same
  // subscription.
  private readonly reformatPhoneOnChange = this.contactForm.controls.phone.valueChanges
    .pipe(takeUntilDestroyed())
    .subscribe((value) => {
      const formatted = formatPhoneNumber(value);
      if (formatted !== value) {
        this.contactForm.controls.phone.setValue(formatted, { emitEvent: false });
      }
    });

  @ViewChild('addressDialogEl') private readonly addressDialogEl?: ElementRef<HTMLDialogElement>;

  readonly cart = this.cartService.cart;
  readonly pointsOnly = this.cartService.pointsOnly;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly shipAddrs = signal<CustomerAddress[]>([]);
  readonly shipMthds = signal<CustomerShippingMethod[]>([]);
  readonly taxRates = signal<ProvinceTaxRate[]>([]);

  readonly selectedAddressId = signal<number | null>(null);
  readonly selectedShipMethodId = signal<number | null>(null);
  readonly addressPickerOpen = signal(false);

  readonly formatOptions = formatCartItemOptions;
  readonly formatAmount = formatBalanceAmount;

  readonly selectedAddress = computed(
    () => this.shipAddrs().find((address) => address.addressId === this.selectedAddressId()) ?? null,
  );
  readonly selectedShipMethod = computed(
    () => this.shipMthds().find((method) => method.shipMethodId === this.selectedShipMethodId()) ?? null,
  );

  // Same math the cart page's own order summary uses, so the two never
  // disagree on what an allotment covers vs. what's left to pay.
  readonly paidFromLines = computed(() => paidFromLines(this.cart()));
  readonly subtotalDue = computed(() => amountDueAtCheckout(this.cart()));

  // `FLAT` is the only rate type the API gives a cost for today — anything
  // else has nothing to show yet, so it's treated as "not costed" rather
  // than guessed at.
  readonly shippingCost = computed(() => {
    const method = this.selectedShipMethod();
    return method && method.rateType === 'FLAT' ? (method.flatAmount ?? 0) : 0;
  });

  // Canadian provinces only — the API's own `tax_rates` table doesn't cover
  // any other country yet, so a non-CA address (or one with no matching
  // province) simply charges no tax rather than guessing at a rate.
  readonly taxRate = computed(() => {
    const address = this.selectedAddress();
    if (!address || address.country !== 'CA') {
      return 0;
    }
    return this.taxRates().find((rate) => rate.province === address.province)?.tax_rate ?? 0;
  });

  // Charged on every item in the cart, not just the portion still due at
  // checkout — an allotment covering the goods doesn't exempt them from
  // tax, so this taxes the full order value plus shipping.
  readonly taxAmount = computed(() => (this.cart().subtotalPrice + this.shippingCost()) * (this.taxRate() / 100));

  // Only an explicit 'N' means the allotment itself covers shipping/tax —
  // no allotment at all, or an explicit 'Y', both mean they're a
  // credit-card balance like today.
  readonly shippingAndTaxCoveredByAllotment = computed(
    () => this.cart().allotment?.allotExclTaxFreight === 'N',
  );

  readonly orderTotal = computed(() =>
    this.shippingAndTaxCoveredByAllotment()
      ? this.subtotalDue()
      : this.subtotalDue() + this.shippingCost() + this.taxAmount(),
  );

  readonly submitting = signal(false);
  readonly placeOrderError = signal<string | null>(null);
  // `PCH` is a warning, not a blocking error — the cart's just been
  // reloaded with fresh prices and the employee can simply try again.
  readonly placeOrderWarning = signal<string | null>(null);

  readonly canPlaceOrder = computed(
    () =>
      this.orderTotal() === 0 &&
      !!this.selectedAddress() &&
      !!this.selectedShipMethod() &&
      this.contactFormStatus() === 'VALID' &&
      !this.submitting(),
  );

  readonly placeOrderSubtitle = computed(() => {
    if (this.orderTotal() > 0) {
      // No dollar figure for a points-only employee — they never pay in
      // dollars at all, so naming a balance here wouldn't mean anything.
      return this.pointsOnly()
        ? "This order isn't fully covered by your points allotment yet"
        : 'Balance must be $0.00 to continue';
    }
    if (this.submitting()) {
      return 'Submitting your order…';
    }
    if (!this.canPlaceOrder()) {
      return 'Complete the required fields to continue';
    }
    return null;
  });

  // Idempotency key for `*PLACE` (see the API guide) — the same key is
  // reused across retries of the *same* attempt (timeouts, the "busy"
  // error, a double click) so a retried request can't ever create a
  // second order; a fresh one is only minted once the employee actually
  // changes something (the `PCH` cart-changed path below).
  private checkoutKey = '';

  // Opens/closes the native <dialog> to track the picker — a plain effect()
  // only guarantees running after change detection, not after the <dialog>
  // has actually been created/updated in the DOM, so this uses
  // afterRenderEffect like the rest of the app's own DOM-imperative reads/
  // writes (see ConfirmDialog for the same pattern).
  private readonly syncAddressDialogOpenState = afterRenderEffect(() => {
    const dialog = this.addressDialogEl?.nativeElement;
    // jsdom (used in tests) doesn't implement showModal()/close() at all —
    // in a real browser this drives the native modal, focus trap, and
    // Escape-to-close; in tests the dialog just never actually opens, and
    // the picker is exercised directly via chooseAddress()/closeAddressPicker().
    if (!dialog || typeof dialog.showModal !== 'function') {
      return;
    }
    if (this.addressPickerOpen() && !dialog.open) {
      dialog.showModal();
    } else if (!this.addressPickerOpen() && dialog.open) {
      dialog.close();
    }
  });

  private currentLocationId(): number | null {
    return this.locationSelectionService.activeLocation()?.locationId ?? null;
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.checkoutKey = generateCheckoutKey();

    // Fire-and-forget refresh of the shared cart signal — same reasoning
    // as product detail's own piggyback load: there's nowhere on this page
    // to surface a failure beyond just not updating the totals.
    this.cartService.load(this.currentLocationId()).subscribe({ error: () => {} });

    this.loading.set(true);
    this.error.set(null);
    this.checkoutService.load().subscribe({
      next: (data) => {
        this.shipAddrs.set(data.shipAddrs);
        this.shipMthds.set(data.shipMthds);
        this.taxRates.set(data.taxRates);
        // Primary address first, default shipping method first — same
        // ordering the API itself already returns these in.
        this.selectedAddressId.set(data.shipAddrs[0]?.addressId ?? null);
        this.selectedShipMethodId.set(
          data.shipMthds.find((method) => method.isDefault === 'Y')?.shipMethodId ??
            data.shipMthds[0]?.shipMethodId ??
            null,
        );
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(err instanceof Error ? err.message : 'We could not load checkout details.');
      },
    });
  }

  ngAfterViewInit(): void {
    // Same reasoning as the cart page's own scroll-to-top — guarded since
    // jsdom (used in tests) doesn't implement `scrollIntoView` at all.
    const target = this.hostElementRef.nativeElement;
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  selectAddress(addressId: number): void {
    this.selectedAddressId.set(addressId);
  }

  selectShipMethod(shipMethodId: number): void {
    this.selectedShipMethodId.set(shipMethodId);
  }

  openAddressPicker(): void {
    this.addressPickerOpen.set(true);
  }

  closeAddressPicker(): void {
    this.addressPickerOpen.set(false);
  }

  chooseAddress(addressId: number): void {
    this.selectAddress(addressId);
    this.closeAddressPicker();
  }

  // The standard "click the backdrop to dismiss" trick for <dialog>: a
  // click lands on the dialog element itself only when it hits the
  // backdrop area, since the real content always has some element in
  // between.
  onAddressDialogBackdropClick(event: MouseEvent): void {
    if (event.target === this.addressDialogEl?.nativeElement) {
      this.closeAddressPicker();
    }
  }

  placeOrder(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }
    const address = this.selectedAddress();
    const shipMethod = this.selectedShipMethod();
    const locationId = this.currentLocationId();
    // The button is already disabled whenever any of this is missing (see
    // `canPlaceOrder`) — this is just the defensive version for a stray
    // call, not a path a shopper can actually reach.
    if (!this.canPlaceOrder() || !address || !shipMethod || locationId === null) {
      return;
    }

    const { email, firstName, lastName, phone, extension } = this.contactForm.getRawValue();

    this.submitting.set(true);
    this.placeOrderError.set(null);
    this.placeOrderWarning.set(null);

    this.orderService
      .place({
        locationId,
        checkoutKey: this.checkoutKey,
        addressId: address.addressId,
        shipMethodId: shipMethod.shipMethodId,
        email,
        firstName,
        lastName,
        phone,
        ...(extension ? { phoneExt: extension } : {}),
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result.success) {
            // The server already emptied the cart — refresh the shared
            // signal so the header's badge/drawer reflect that too.
            this.cartService.load(locationId).subscribe({ error: () => {} });
            this.router.navigate(['/orders', result.orderId], { state: { justPlaced: true } });
            return;
          }
          if (result.code === 'PCH') {
            this.cartService.load(locationId).subscribe({ error: () => {} });
            // A new attempt — prices/cart just changed, so this is no
            // longer a retry of the one that failed.
            this.checkoutKey = generateCheckoutKey();
            this.placeOrderWarning.set(result.message);
            return;
          }
          // `INS`, `NFD`, `BOP`, and plain `ERR` all just show the
          // message — the checkoutKey is kept as-is so Retry doesn't
          // risk placing a second order.
          this.placeOrderError.set(result.message);
        },
        error: () => {
          this.submitting.set(false);
          this.placeOrderError.set('We could not reach the order service. Please try again.');
        },
      });
  }
}
