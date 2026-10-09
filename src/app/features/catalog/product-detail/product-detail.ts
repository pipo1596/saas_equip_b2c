import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { Allotment, AllotmentRule, CartService, PayTag } from '../../../core/cart/cart';
import { Breadcrumb, hasCrumbs } from '../../../core/catalog/breadcrumb';
import {
  ProductAttribute,
  ProductDetailData,
  ProductDetailInfo,
  ProductDetailService,
  ProductImage,
  ProductOptionAxis,
  ProductOptionValue,
  ProductSkuDetail,
} from '../../../core/catalog/product-detail';
import { LocationSelectionService } from '../../../core/location/location-selection';
import { AllotmentCoverageCard } from '../../../shared/allotment/coverage-card';
import { PayTagBadge } from '../../../shared/allotment/pay-tag';
import { BreadcrumbNav } from '../../../shared/breadcrumb/breadcrumb-nav';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

@Component({
  selector: 'app-product-detail',
  imports: [Header, Footer, RouterLink, CurrencyPipe, BreadcrumbNav, PayTagBadge, AllotmentCoverageCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-detail.html',
  styleUrls: ['../../../shared/shared.css', './product-detail.css'],
  host: {
    // The set of thumbnails that fits changes with viewport width (this
    // panel is a fixed column on desktop but full-width on mobile), so the
    // carousel nav needs to be re-evaluated whenever the window resizes,
    // not just once when the images first load.
    '(window:resize)': 'updateThumbsOverflow()',
  },
})
export class ProductDetail implements OnInit {
  private readonly productDetailService = inject(ProductDetailService);
  private readonly cartService = inject(CartService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // An employee whose allotment is points-only never pays in dollars —
  // the SKU/price-range API has no points price to show instead (unlike
  // the cart, which does once this product is actually added), so the
  // price block is just omitted here.
  readonly pointsOnly = this.cartService.pointsOnly;

  @ViewChild('thumbTrack') private readonly thumbTrack?: ElementRef<HTMLElement>;

  // Bound from the route: `productPk` is the path param, `name` an optional
  // `?name=` query param passed along from the listing page so a title can
  // show immediately while the real product data is still loading.
  // `categoryId` is the listing's own category id, passed along the same
  // way, so the breadcrumb can match the exact path the shopper actually
  // took — absent for a deep link, search result, or bucket page.
  // `cartItemId`, passed when a shopper clicks an existing line in their
  // cart, puts the page in edit mode: the matching line's options/quantity
  // are pre-selected, and "Add to Cart" becomes "Update Cart" instead.
  readonly productPk = input('');
  readonly name = input('');
  readonly categoryId = input('');
  readonly cartItemId = input('');

  // Stable for the page's whole lifetime (the route input never changes
  // without the whole component being recreated) — unlike looking the line
  // up in the live cart signal, this doesn't flip back to `false` partway
  // through saving an edit, once the original line has already been
  // removed as part of that save.
  readonly isEditing = computed(() => {
    const id = Number(this.cartItemId());
    return !!this.cartItemId() && Number.isFinite(id);
  });
  // Captured once, the first time the cart line this page is editing is
  // found — needed for the rest of the edit's lifetime even after the
  // line itself stops existing (e.g. it's already been removed as the
  // first half of a sku-changing update).
  private readonly editedLineSkuId = signal<number | null>(null);
  private readonly editPrefillApplied = signal(false);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly product = signal<ProductDetailInfo | null>(null);
  readonly images = signal<ProductImage[]>([]);
  readonly axes = signal<ProductOptionAxis[]>([]);
  readonly attributes = signal<ProductAttribute[]>([]);
  readonly breadcrumb = signal<Breadcrumb | null>(null);
  readonly hasBreadcrumb = computed(() => hasCrumbs(this.breadcrumb()));
  // Keyed by `optName` (e.g. "Color", "Size") — one optId picked per axis.
  readonly selections = signal<Partial<Record<string, number>>>({});
  readonly activeImageUrl = signal<string | null>(null);
  // An explicit thumbnail click, pinned here so it always wins over the
  // computed resolvedSku/color-matched/fallback image below — cleared
  // whenever a color is picked some other way (the swatch buttons), so
  // that still drives the photo the normal way. See
  // `syncActiveImageWithSelection` for why this had to become an actual
  // signal rather than `selectImage` just writing `activeImageUrl` itself.
  private readonly manualImageUrl = signal<string | null>(null);
  // Whether the thumbnails actually overflow the available width — the
  // carousel nav only makes sense to show then, not just because there's
  // more than one photo.
  readonly thumbsOverflow = signal(false);

  // From `*AVAIL` — which optIds on each axis are still worth showing
  // enabled, keyed by `optName`. Stays empty until the first response
  // arrives; `isOptionAvailable` treats a missing axis as "everything
  // enabled", matching the API's own "start enabled" first-paint guidance.
  readonly availableOptionIds = signal<Record<string, ReadonlySet<number>>>({});
  readonly resolvedSkuId = signal<number | null>(null);
  readonly resolvedSku = signal<ProductSkuDetail | null>(null);
  readonly resolvingSku = signal(false);
  // Set only when a `*AVAIL`/`*GET_SKU` call fails — shown as a small inline
  // note rather than replacing the whole page, since by this point the
  // product itself already loaded fine.
  readonly availabilityError = signal<string | null>(null);
  readonly quantity = signal(1);
  readonly addedToCart = signal(false);
  readonly addingToCart = signal(false);
  readonly addToCartError = signal<string | null>(null);
  // From the cart's own `*GET` (called alongside the product load, with
  // `productPk`) — which allotment, if any, pays for this product. Kept in
  // its own signal rather than read off the shared cart signal directly,
  // since a later cart action (e.g. this same "Add to Cart") re-fetches the
  // cart *without* `productPk` and would otherwise null this back out.
  readonly productTag = signal<PayTag | null>(null);
  // The same call's full allotment payload, held onto for the same reason as
  // `productTag` above — used only to look up the rule that tag points to.
  private readonly allotmentForProductTag = signal<Allotment | null>(null);
  // The one rule that actually pays for this product, if any — matched by
  // id against the allotment snapshot from that same productPk-scoped load.
  readonly coveringRule = computed<AllotmentRule | null>(() => {
    const ruleId = this.productTag()?.ruleId;
    if (ruleId == null) {
      return null;
    }
    return this.allotmentForProductTag()?.rules.find((rule) => rule.ruleId === ruleId) ?? null;
  });
  // The exact `selections()` object (by reference) that the currently-
  // loaded `resolvedSku` was actually fetched for — `selections.update()`
  // always produces a new object on any change, so comparing by reference
  // is a cheap, exact "has anything changed since this was fetched" check.
  // Needed because `resolvedSkuId()` itself doesn't update until the
  // `*AVAIL` response for a new pick arrives, so it can't be used to tell
  // a still-loading resolution apart from a settled one in the meantime.
  private readonly resolvedSkuSelections = signal<Partial<Record<string, number>> | null>(null);

  // Editing a cart line already implies knowing that line's own product
  // title (it's sitting right there in the shared cart signal) — so an
  // edit link doesn't need to also carry `?name=` the way a listing page's
  // link does; this is what lets the title still show immediately even
  // when it's absent.
  private readonly editingCartItemTitle = computed(() => {
    if (!this.isEditing()) {
      return null;
    }
    const id = Number(this.cartItemId());
    return this.cartService.cart().items.find((line) => line.cartItemId === id)?.productTitle ?? null;
  });

  readonly pageTitle = computed(
    () => this.product()?.title || this.editingCartItemTitle() || this.name() || 'Product',
  );

  // Shown as a starting "$79.99–$94.99" (or just "$79.99" when every SKU
  // shares one price) before a selection resolves to an exact SKU — `null`
  // when the product has no SKUs at all yet, matching the API's own
  // null-both-or-neither contract for these two fields.
  readonly priceRange = computed(() => {
    const product = this.product();
    if (!product || product.minPrice === null || product.maxPrice === null) {
      return null;
    }
    return { min: product.minPrice, max: product.maxPrice };
  });

  // Same shape, in points — shown instead of `priceRange` for a points-only
  // employee (see `pointsOnly` below).
  readonly pointsRange = computed(() => {
    const product = this.product();
    if (!product || product.minPoints === null || product.maxPoints === null) {
      return null;
    }
    return { min: product.minPoints, max: product.maxPoints };
  });

  // Needs a real, fully-resolved SKU (not just a complete-looking
  // selection) plus a valid quantity — mirrors the same "nothing to act on
  // until *AVAIL/*GET_SKU actually resolve" rule the price display follows.
  readonly canAddToCart = computed(
    () =>
      this.resolvedSku() !== null &&
      Number.isInteger(this.quantity()) &&
      this.quantity() >= 1 &&
      !this.addingToCart(),
  );

  // Only meaningful when Color is the *first* axis — that's the one
  // "pick a color, see that color's photo" makes sense for; a first axis
  // of Size or anything else has no business driving which photo shows.
  private readonly firstAxisColor = computed(() => {
    const first = this.axes()[0];
    return first && first.optName.trim().toLowerCase() === 'color' ? first : null;
  });

  // The image whose own `optionIds` include the currently-selected Color
  // value, if any — `*GET`'s images now carry that link directly.
  private readonly colorMatchedImageUrl = computed(() => {
    const colorAxis = this.firstAxisColor();
    if (!colorAxis) {
      return null;
    }
    const selectedColorOptId = this.selections()[colorAxis.optName];
    if (selectedColorOptId === undefined) {
      return null;
    }
    return (
      this.images().find((image) => (image.optionIds ?? []).includes(selectedColorOptId))
        ?.imageUrl ?? null
    );
  });

  // Every image the product has (already deduped by URL in the service) —
  // in practice every image row carries *some* skuId (often the same photo
  // duplicated across every one of the product's SKUs, when there's no
  // per-variant photography), so filtering this list down by the resolved
  // skuId would leave the gallery empty for most products. Show them all;
  // priority for which one is active: an explicit thumbnail click first —
  // it always wins, since it's the shopper's own direct pick and there can
  // be more than one photo for the same color/SKU — then the resolved
  // SKU's own `variantImageUrl` once fully resolved, then the color-matched
  // photo as soon as just a color is picked, then just the first one.
  //
  // `resolvedSku()` deliberately stays populated with the *previous*
  // selection's SKU while a new one is resolving (see `loadSkuOnResolve`
  // — that's what stops the price/"Add to Cart" from flashing on every
  // pick). That old SKU's `variantImageUrl` must NOT win here in the
  // meantime, or picking a new color/photo gets silently overridden back
  // to the old variant's photo until the new `*GET_SKU` catches up — so
  // it only counts once it was actually fetched for the current selection.
  private readonly syncActiveImageWithSelection = effect(() => {
    const manualImageUrl = this.manualImageUrl();
    if (manualImageUrl) {
      this.activeImageUrl.set(manualImageUrl);
      return;
    }
    const resolvedSku = this.resolvedSku();
    const isCurrentSku = resolvedSku !== null && this.resolvedSkuSelections() === this.selections();
    const variantImageUrl = isCurrentSku ? resolvedSku.variantImageUrl : null;
    const colorImageUrl = this.colorMatchedImageUrl();
    const fallbackImageUrl = this.images()[0]?.imageUrl ?? null;
    this.activeImageUrl.set(variantImageUrl || colorImageUrl || fallbackImageUrl);
  });

  // Re-measures once the newly-loaded thumbnails have actually been
  // painted. A regular `effect()` is only guaranteed to run after change
  // detection, not after the browser has actually rendered/laid out the
  // new DOM nodes — reading `scrollWidth`/`clientWidth` there can race
  // ahead of layout. `afterRenderEffect` is Angular's own recommended tool
  // for DOM reads/writes like this.
  private readonly recalcThumbsOverflowOnImagesChange = afterRenderEffect(() => {
    this.images();
    this.updateThumbsOverflow();
  });

  // Calls `*AVAIL` on every selection change, including the very first with
  // nothing picked — there's no client-side matrix to walk anymore, the
  // server owns availability entirely. Still fires for a product with no
  // options at all (`axes` empty): a zero-axis "selection" is trivially
  // complete, so this is exactly how a single-SKU product resolves its one
  // SKU without a shopper ever having anything to pick.
  private readonly checkAvailabilityOnSelectionChange = effect(() => {
    const productPk = Number(this.productPk());
    const product = this.product();
    const selections = this.selections();
    if (!this.isBrowser || !product || !Number.isFinite(productPk)) {
      return;
    }

    const selectedOptIds = Object.values(selections).filter(
      (optId): optId is number => optId !== undefined,
    );
    const locationId = this.locationSelectionService.activeLocation()?.locationId ?? null;
    this.productDetailService.checkAvailability(productPk, selectedOptIds, locationId).subscribe({
      next: (result) => {
        const availableByAxis: Record<string, ReadonlySet<number>> = {};
        for (const axis of result.axes) {
          availableByAxis[axis.optName] = new Set(axis.availableOptIds);
        }
        this.availabilityError.set(null);
        this.availableOptionIds.set(availableByAxis);
        this.resolvedSkuId.set(result.resolvedSkuId);
      },
      error: (err: unknown) => {
        this.availabilityError.set(
          err instanceof Error ? err.message : 'We could not check option availability.',
        );
      },
    });
  });

  // Fetches that variant's own price/weight as soon as `*AVAIL` resolves to
  // a skuId. Deliberately does *not* clear `resolvedSku` the moment the
  // selection changes — switching straight from one fully-resolved
  // selection to another otherwise flashes the price/SKU block and
  // "Add to Cart" button through their unresolved state on every pick,
  // just for the length of this round trip. The previous SKU's data (and a
  // still-enabled "Add to Cart") stays displayed until the new one actually
  // arrives, then swaps over in one step. A `null` skuId is the one case
  // that's a real, immediate state (the selection genuinely isn't complete
  // yet) rather than a fetch in progress, so that still clears right away.
  private readonly loadSkuOnResolve = effect(() => {
    const skuId = this.resolvedSkuId();
    if (skuId === null) {
      this.resolvedSku.set(null);
      this.resolvedSkuSelections.set(null);
      return;
    }
    if (!this.isBrowser) {
      return;
    }
    if (untracked(() => this.resolvedSku()?.skuId) === skuId) {
      // Already showing this exact sku (e.g. toggling an axis that turns
      // out not to change the resolved combination) — nothing to refetch.
      return;
    }

    // Captured now, not when the response arrives — if the shopper changes
    // the selection again before this resolves, `selections()` will be a
    // different object by then, correctly marking this response stale.
    const selectionsAtRequestTime = untracked(() => this.selections());
    // Read untracked — a location change alone shouldn't retrigger this
    // effect (it isn't accounted for by the resolved-sku dedup check right
    // above), only ever picked up on a genuine new-sku fetch like this one.
    const locationId = untracked(
      () => this.locationSelectionService.activeLocation()?.locationId ?? null,
    );
    this.resolvingSku.set(true);
    this.productDetailService.getSku(skuId, locationId).subscribe({
      next: (sku) => {
        this.availabilityError.set(null);
        this.resolvedSku.set(sku);
        this.resolvedSkuSelections.set(selectionsAtRequestTime);
        this.resolvingSku.set(false);
      },
      error: (err: unknown) => {
        this.resolvingSku.set(false);
        this.resolvedSku.set(null);
        this.resolvedSkuSelections.set(null);
        this.availabilityError.set(
          err instanceof Error ? err.message : 'We could not load that option.',
        );
      },
    });
  });

  // Pre-selects the edited line's own options/quantity as soon as both the
  // product's axes (from its own load) and a matching cart line (from the
  // shared cart signal — already populated by the time a shopper gets here
  // by clicking a line on the cart page) are available. Runs once per page
  // load, guarded by `editPrefillApplied`, since the cart signal keeps
  // changing over the rest of this edit (the line disappearing partway
  // through a sku-changing save shouldn't wipe the shopper's own picks).
  private readonly prefillEditSelectionsOnLoad = effect(() => {
    const axes = this.axes();
    const cartItemId = Number(this.cartItemId());
    if (
      axes.length === 0 ||
      !this.isEditing() ||
      untracked(() => this.editPrefillApplied())
    ) {
      return;
    }
    const item = this.cartService.cart().items.find((line) => line.cartItemId === cartItemId);
    if (!item) {
      return;
    }

    const selections: Partial<Record<string, number>> = {};
    for (const axis of axes) {
      const match = item.options.find((option) => option.optName === axis.optName);
      const value = match && axis.values.find((v) => v.valueDesc === match.valueDesc);
      if (value) {
        selections[axis.optName] = value.optId;
      }
    }
    this.selections.set(selections);
    this.quantity.set(item.quantity);
    this.editedLineSkuId.set(item.skuId);
    this.editPrefillApplied.set(true);
  });

  ngOnInit(): void {
    const productPk = Number(this.productPk());
    if (!this.isBrowser || !this.productPk() || !Number.isFinite(productPk)) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const locationId = this.locationSelectionService.activeLocation()?.locationId ?? null;
    const parsedCategoryId = Number(this.categoryId());
    const categoryId =
      this.categoryId() && Number.isFinite(parsedCategoryId) ? parsedCategoryId : undefined;
    this.productDetailService.load(productPk, locationId, categoryId).subscribe({
      next: (data) => this.applyProductDetailData(data),
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(
          err instanceof Error
            ? err.message
            : 'We could not load this product right now. Please try again.',
        );
      },
    });
    // Piggybacks on the cart's own `*GET` (which already refreshes the
    // shared cart signal) purely to read `allotment.productTag` for this
    // specific product — fire-and-forget, same as the header's own cart
    // load, since there's nowhere on this page to surface a failure beyond
    // just not showing a tag.
    this.cartService.load(locationId, productPk).subscribe({
      next: (cart) => {
        this.productTag.set(cart.allotment?.productTag ?? null);
        this.allotmentForProductTag.set(cart.allotment);
      },
      error: () => {},
    });
  }

  // The card's "View rule" link expands the header's own Rules panel rather
  // than duplicating the full breakdown on this page.
  viewRule(): void {
    this.cartService.openRulesMenu();
  }

  selectOption(optName: string, optId: number): void {
    this.addedToCart.set(false);
    this.addToCartError.set(null);
    // Picking any option releases a previous explicit photo pin, so the
    // image goes back to being driven by the resolved SKU/color again —
    // `selectImage` re-pins it right after, when it calls this itself as
    // part of syncing a photo click to its own color.
    this.manualImageUrl.set(null);
    this.selections.update((current) => {
      if (current[optName] === optId) {
        // Clicking the already-selected value unpicks that axis entirely,
        // rather than leaving no way to back out of a choice.
        const { [optName]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [optName]: optId };
    });
  }

  setQuantity(value: number): void {
    this.addedToCart.set(false);
    this.addToCartError.set(null);
    this.quantity.set(Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1);
  }

  addToCart(): void {
    const sku = this.resolvedSku();
    if (!this.canAddToCart() || !sku) {
      return;
    }
    this.addingToCart.set(true);
    this.addToCartError.set(null);
    const locationId = this.locationSelectionService.activeLocation()?.locationId ?? null;

    if (this.isEditing()) {
      this.saveCartEdit(sku.skuId, locationId);
      return;
    }

    this.cartService.addItem(sku.skuId, locationId, this.quantity()).subscribe({
      next: () => {
        this.addingToCart.set(false);
        this.addedToCart.set(true);
        // Pop the header's cart drawer open as the actual confirmation — the
        // shopper sees the real line they just added (photo, qty, price)
        // sitting in their cart, not just a text blurb near the button.
        this.cartService.openDrawer();
      },
      error: (err: unknown) => {
        this.addingToCart.set(false);
        this.addToCartError.set(
          err instanceof Error ? err.message : 'We could not add that to your cart.',
        );
      },
    });
  }

  // The API has no "replace this exact line" action — `*UPDATE_QT`/
  // `*RMV_ITEM`/`*ADD_ITEM` all key off `skuId`, not `cartItemId`. Picking
  // the *same* sku (only the quantity changed) is a plain quantity update;
  // picking a *different* one (a new color/size) has to remove the old
  // line and add the new one as two calls. Either way, success returns to
  // the cart rather than staying on this page — there's nothing left here
  // to "add" once an edit is saved.
  private saveCartEdit(skuId: number, locationId: number | null): void {
    const originalSkuId = this.editedLineSkuId();
    const qty = this.quantity();
    const request$ =
      originalSkuId !== null && originalSkuId !== skuId
        ? this.cartService
            .removeItem(originalSkuId, locationId)
            .pipe(switchMap(() => this.cartService.addItem(skuId, locationId, qty)))
        : this.cartService.setQuantity(skuId, qty, locationId);

    request$.subscribe({
      next: () => {
        this.addingToCart.set(false);
        this.router.navigateByUrl('/cart');
      },
      error: (err: unknown) => {
        this.addingToCart.set(false);
        this.addToCartError.set(
          err instanceof Error ? err.message : 'We could not update your cart.',
        );
      },
    });
  }

  selectedValueLabel(axis: ProductOptionAxis): string | null {
    const optId = this.selections()[axis.optName];
    return axis.values.find((value) => value.optId === optId)?.valueDesc ?? null;
  }

  isOptionAvailable(axis: ProductOptionAxis, optId: number): boolean {
    const available = this.availableOptionIds()[axis.optName];
    return available ? available.has(optId) : true;
  }

  // Only a "Color" axis gets the plain square swatch treatment (no text,
  // just the filled-in color/image), and only when that particular value
  // actually has one to show — a color option with neither still falls
  // back to the normal text chip so it isn't just an empty square.
  isSwatchValue(axis: ProductOptionAxis, value: ProductOptionValue): boolean {
    return axis.optName.trim().toLowerCase() === 'color' && !!(value.swatchImg || value.swatchColor);
  }

  selectImage(image: ProductImage): void {
    // Clicking a photo that's tied to a specific Color value picks that
    // color too — the mirror image of picking a color swapping the photo.
    // Done *before* pinning the photo below: `selectOption` clears any
    // previous pin as its own first step, so pinning has to come after it
    // here, or this specific click's pin would be wiped right back out.
    const colorAxis = this.firstAxisColor();
    if (colorAxis) {
      const matchedValue = colorAxis.values.find((value) =>
        (image.optionIds ?? []).includes(value.optId),
      );
      if (matchedValue && this.selections()[colorAxis.optName] !== matchedValue.optId) {
        this.selectOption(colorAxis.optName, matchedValue.optId);
      }
    }
    this.manualImageUrl.set(image.imageUrl);
  }

  scrollThumbs(direction: -1 | 1): void {
    const track = this.thumbTrack?.nativeElement;
    if (!track) {
      return;
    }
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' });
  }

  updateThumbsOverflow(): void {
    const track = this.thumbTrack?.nativeElement;
    this.thumbsOverflow.set(!!track && track.scrollWidth > track.clientWidth + 1);
  }

  private applyProductDetailData(data: ProductDetailData): void {
    this.product.set(data.product);
    this.images.set(data.images);
    this.axes.set(data.axes);
    this.attributes.set(data.attributes);
    this.breadcrumb.set(data.breadcrumb);
    // Nothing pre-picked — the shopper chooses every axis themselves.
    this.selections.set({});
    this.availableOptionIds.set({});
    this.resolvedSkuId.set(null);
    this.manualImageUrl.set(null);
    this.quantity.set(1);
    this.addedToCart.set(false);
    this.addToCartError.set(null);
    this.loading.set(false);
  }
}
