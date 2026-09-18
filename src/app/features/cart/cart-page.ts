import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartItem, CartService, formatCartItemOptions } from '../../core/cart/cart';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

@Component({
  selector: 'app-cart-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-page.html',
  styleUrls: ['../../shared/shared.css', './cart-page.css'],
})
export class CartPage implements OnInit, AfterViewInit {
  private readonly cartService = inject(CartService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hostElementRef = inject(ElementRef<HTMLElement>);

  readonly cart = this.cartService.cart;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  // Which sku a quantity change or remove is currently in flight for — lets
  // just that one line show a busy state instead of locking the whole page.
  readonly updatingSkuId = signal<number | null>(null);
  readonly clearing = signal(false);

  readonly formatOptions = formatCartItemOptions;

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.cartService.load().subscribe({
      next: () => this.loading.set(false),
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(err instanceof Error ? err.message : 'We could not load your cart.');
      },
    });
  }

  ngAfterViewInit(): void {
    // Landing on this route (e.g. from "Checkout" further down a long
    // product list) can otherwise leave the browser at whatever scroll
    // position the previous page was at — jump to the top on first render.
    // Guarded since jsdom (used in tests) doesn't implement
    // `scrollIntoView` at all.
    const target = this.hostElementRef.nativeElement;
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  // `*UPDATE_QT` deletes the line outright once `qty` reaches 0 — a
  // stepper naturally lands there, so this doesn't special-case it.
  setQuantity(item: CartItem, qty: number): void {
    if (qty === item.quantity || qty < 0 || this.updatingSkuId() !== null || this.clearing()) {
      return;
    }
    this.updatingSkuId.set(item.skuId);
    this.error.set(null);
    this.cartService.setQuantity(item.skuId, qty).subscribe({
      next: () => this.updatingSkuId.set(null),
      error: (err: unknown) => {
        this.updatingSkuId.set(null);
        this.error.set(err instanceof Error ? err.message : 'We could not update that quantity.');
      },
    });
  }

  removeItem(item: CartItem): void {
    if (this.updatingSkuId() !== null || this.clearing()) {
      return;
    }
    this.updatingSkuId.set(item.skuId);
    this.error.set(null);
    this.cartService.removeItem(item.skuId).subscribe({
      next: () => this.updatingSkuId.set(null),
      error: (err: unknown) => {
        this.updatingSkuId.set(null);
        this.error.set(err instanceof Error ? err.message : 'We could not remove that item.');
      },
    });
  }

  clearCart(): void {
    if (this.clearing() || this.updatingSkuId() !== null || this.cart().items.length === 0) {
      return;
    }
    this.clearing.set(true);
    this.error.set(null);
    this.cartService.clear().subscribe({
      next: () => this.clearing.set(false),
      error: (err: unknown) => {
        this.clearing.set(false);
        this.error.set(err instanceof Error ? err.message : 'We could not clear your cart.');
      },
    });
  }
}
