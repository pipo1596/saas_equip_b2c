import { CurrencyPipe, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CartService, formatBalanceAmount, formatCartItemOptions } from '../../core/cart/cart';
import { amountDueAtCheckout, paidFromLines } from '../../core/cart/cart-totals';
import {
  CheckoutService,
  CustomerAddress,
  CustomerShippingMethod,
  ProvinceTaxRate,
} from '../../core/checkout/checkout';
import { LocationSelectionService } from '../../core/location/location-selection';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

// "1234 5678 9012 3456" — digits only, grouped in 4s, capped at 16 digits.
// The trailing lookahead keeps the last group from getting a dangling space
// while it's still being typed.
function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})(?=.)/g, '$1 ');
}

// "MM/YY" — digits only, capped at 4, with the slash inserted as soon as
// the month's 2nd digit is typed (not just once a 3rd digit shows up) so
// typing "1225" reads "12/25" the moment the "2" lands. `isDeleting` skips
// that auto-insert, or backspacing away the year digits would immediately
// re-add the slash it just removed and get stuck unable to reach "12" or
// less.
function formatExpiry(value: string, isDeleting: boolean): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  const threshold = isDeleting ? 2 : 1;
  return digits.length > threshold ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

// Digits only, capped at `maxLength` — shared by CVC (4) and anything else
// that's just a plain numeric code.
function formatDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

@Component({
  selector: 'app-checkout-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe, ReactiveFormsModule, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-page.html',
  styleUrls: ['../../shared/shared.css', './checkout-page.css'],
})
export class CheckoutPage implements OnInit, AfterViewInit {
  private readonly cartService = inject(CartService);
  private readonly checkoutService = inject(CheckoutService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hostElementRef = inject(ElementRef<HTMLElement>);

  // Nothing submits this yet (there's no order/payment endpoint) — the
  // fields and validators are here so the form is ready to wire up once
  // one exists, rather than being pure decoration.
  readonly creditCardForm = this.formBuilder.nonNullable.group({
    cardholderName: ['', Validators.required],
    cardNumber: ['', Validators.required],
    expiry: ['', Validators.required],
    cvc: ['', Validators.required],
  });

  constructor() {
    // Reformats as the shopper types (grouped digits, auto "/", digits-
    // only) — done via valueChanges rather than an (input) handler so it
    // can't race with ReactiveFormsModule's own value accessor, and
    // `emitEvent: false` keeps a corrected value from re-triggering itself.
    this.reformatOnChange('cardNumber', (value) => formatCardNumber(value));
    this.reformatOnChange('expiry', formatExpiry);
    this.reformatOnChange('cvc', (value) => formatDigits(value, 4));
  }

  private reformatOnChange(
    controlName: 'cardNumber' | 'expiry' | 'cvc',
    format: (value: string, isDeleting: boolean) => string,
  ): void {
    const control = this.creditCardForm.controls[controlName];
    let previousLength = 0;
    control.valueChanges.subscribe((value) => {
      const isDeleting = value.length < previousLength;
      const formatted = format(value, isDeleting);
      previousLength = formatted.length;
      if (formatted !== value) {
        control.setValue(formatted, { emitEvent: false });
      }
    });
  }

  @ViewChild('addressDialogEl') private readonly addressDialogEl?: ElementRef<HTMLDialogElement>;

  readonly cart = this.cartService.cart;
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

  readonly orderTotal = computed(() => this.subtotalDue() + this.shippingCost() + this.taxAmount());

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
}
