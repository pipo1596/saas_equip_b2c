import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

// Just the display labels for this line's variant (Color/Size/etc.) — for
// building an actual selector UI for this sku, that's the product detail
// API (`APCPRDDTL`), not this one.
export interface CartItemOption {
  optName: string;
  valueDesc: string;
}

export interface CartItem {
  cartItemId: number;
  skuId: number;
  quantity: number;
  // What was captured when this line was added/last changed — compare
  // against `currentPrice`/`currentPoints` (read fresh on every `*GET`) via
  // `priceChanged`/`pointsChanged` rather than assuming they still match.
  priceAtAdd: number;
  pointsAtAdd: number | null;
  lineTotalPrice: number;
  lineTotalPoints: number | null;
  productPk: number;
  productTitle: string;
  handle: string;
  skuCode: string;
  currentPrice: number;
  currentPoints: number | null;
  priceChanged: string;
  pointsChanged: string;
  // "N" means the product's gone inactive/unpublished since this was added
  // — flag it in the UI rather than silently dropping the line.
  isAvailable: string;
  imageUrl: string;
  options: CartItemOption[];
}

export interface Cart {
  cartId: number | null;
  itemCount: number;
  subtotalPrice: number;
  // `null` (not `0`) whenever the cart is empty or has no points-eligible
  // items at all — treat that as "not applicable", not as zero.
  subtotalPoints: number | null;
  items: CartItem[];
}

// What an employee who's never added anything gets back from `*GET` — not
// an error, just an empty cart. Used as the signal's initial value too, so
// the header's badge/drawer have something sane to render before the first
// load resolves.
const EMPTY_CART: Cart = {
  cartId: null,
  itemCount: 0,
  subtotalPrice: 0,
  subtotalPoints: null,
  items: [],
};

interface RawCart {
  cartId: number | null;
  itemCount: number;
  subtotalPrice: number;
  subtotalPoints: number | null;
  items: CartItem[] | null;
}

interface ApiFailure {
  success: false;
  message: string | null;
}

function normalizeCart(raw: RawCart): Cart {
  return {
    ...raw,
    items: (raw.items ?? []).map((item) => ({ ...item, options: item.options ?? [] })),
  };
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCCART`;

  readonly cart = signal<Cart>(EMPTY_CART);
  // True only while a `*GET` is in flight — the header can use this to show
  // a loading state on first load without it firing on every add/remove.
  readonly loading = signal(false);
  // Owned here (not by the header) so any component with a "success" moment
  // — e.g. product detail after `addItem` resolves — can pop the header's
  // cart drawer open as confirmation, without reaching into the header.
  readonly drawerOpen = signal(false);

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  load(): Observable<Cart> {
    this.loading.set(true);
    return this.request({ action: '*GET' }, 'We could not load your cart.').pipe(
      finalize(() => this.loading.set(false)),
    );
  }

  // `qty` is how many to add *on top of* whatever's already there, not a
  // "set exact quantity" — adding a sku already in the cart just bumps it,
  // never creates a second row.
  addItem(skuId: number, qty = 1): Observable<Cart> {
    return this.request(
      { action: '*ADD_ITEM', skuId, qty },
      'We could not add that to your cart.',
    );
  }

  // Omit `qty` to remove the whole line regardless of its current quantity
  // — including a `qty` that's >= the line's current one has the same
  // effect, so callers never need to look up the current quantity first
  // just to zero a line out. Removing a sku that isn't in the cart at all
  // is safe too (returns the current, unchanged cart, not an error) — fine
  // to fire off without guarding against double-clicks or stale state.
  removeItem(skuId: number, qty?: number): Observable<Cart> {
    return this.request(
      { action: '*RMV_ITEM', skuId, ...(qty !== undefined ? { qty } : {}) },
      'We could not remove that from your cart.',
    );
  }

  // Unlike `*ADD_ITEM`/`*RMV_ITEM` (both relative), `qty` here is the
  // exact new quantity for the line — what an actual quantity stepper/input
  // should call. `qty <= 0` deletes the line (a stepper naturally reaches
  // 0); a skuId not currently in the cart is a no-op, not an implicit add.
  setQuantity(skuId: number, qty: number): Observable<Cart> {
    return this.request(
      { action: '*UPDATE_QT', skuId, qty },
      'We could not update that quantity.',
    );
  }

  // Removes every line. A no-op (not an error) on an already-empty cart.
  clear(): Observable<Cart> {
    return this.request({ action: '*CLEAR' }, 'We could not clear your cart.');
  }

  // All five actions return the exact same full-cart shape (including all
  // four mutations) — one request helper, reused for all of them, updates
  // the shared `cart` signal from whichever response comes back.
  private request(body: Record<string, unknown>, fallbackMessage: string): Observable<Cart> {
    return this.http.post<RawCart | ApiFailure>(this.dispatchUrl, body).pipe(
      map((response) => {
        // Key *absent* means failure; `items: null` is just the same
        // "sometimes sends null instead of []" quirk normalized below, not
        // an error condition.
        if (!('items' in response)) {
          throw new Error((response as ApiFailure).message ?? fallbackMessage);
        }
        return normalizeCart(response);
      }),
      tap((cart) => this.cart.set(cart)),
    );
  }
}

// Shared between the header's cart drawer and the full cart page, so a
// line's variant (e.g. "Black, M") always reads the same in both places.
export function formatCartItemOptions(item: CartItem): string {
  return item.options.map((option) => option.valueDesc).join(', ');
}
