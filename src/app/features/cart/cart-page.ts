import { CurrencyPipe, DatePipe, NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AllotmentRule,
  CartItem,
  CartService,
  LineAllocation,
  LineTag,
  PayTag,
  coverageLabel,
  fallbackChain,
  formatBalanceAmount,
  formatCartItemOptions,
  tileBalance,
} from '../../core/cart/cart';
import { LocationSelectionService } from '../../core/location/location-selection';
import { AllotmentBalanceBox } from '../../shared/allotment/balance-box';
import { PayTagBadge } from '../../shared/allotment/pay-tag';
import { ConfirmService } from '../../shared/confirm/confirm';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

// One allotment's own section of the cart — its balance, the lines it's
// the *home* allotment for (i.e. their first allocation), and any amount
// it lent to cover another group's overflow. A rule can show up here with
// no items of its own at all, purely as a lender.
interface AllotmentGroup {
  rule: AllotmentRule;
  items: CartItem[];
  lentNotes: string[];
  shortfallNote: string | null;
}

const DATE_PIPE = new DatePipe('en-US');

@Component({
  selector: 'app-cart-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe, PayTagBadge, AllotmentBalanceBox, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-page.html',
  styleUrls: ['../../shared/shared.css', './cart-page.css'],
})
export class CartPage implements OnInit, AfterViewInit {
  private readonly cartService = inject(CartService);
  private readonly confirmService = inject(ConfirmService);
  private readonly locationSelectionService = inject(LocationSelectionService);
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
  readonly formatAmount = formatBalanceAmount;
  readonly tileBalance = tileBalance;

  private readonly lineTagByItemId = computed(
    () => new Map((this.cart().allotment?.lineTags ?? []).map((tag) => [tag.cartItemId, tag])),
  );

  // The API's own `allocations` (split-funding detail) may not be
  // populated yet even though the simpler single-rule `ruleId`/`payUnit`
  // tag is — fall back to treating that single tag as this line's whole
  // allocation so grouping/checkout math still work against today's data,
  // not just once the richer per-line breakdown ships.
  private resolvedAllocations(item: CartItem, tag: LineTag | undefined): LineAllocation[] {
    if (!tag) {
      return [];
    }
    if (tag.allocations.length > 0) {
      return tag.allocations;
    }
    if (tag.ruleId === null || tag.payUnit === null) {
      return [];
    }
    return [
      {
        ruleId: tag.ruleId,
        payUnit: tag.payUnit,
        amount: tag.payUnit === 'DOLLARS' ? item.lineTotalPrice : item.quantity,
      },
    ];
  }

  // One group per rule that's either the *home* allotment for at least one
  // line, or lent an amount to cover another group's overflow — a rule
  // that touches nothing in this cart at all just doesn't appear. Order
  // follows the API's own `rules` order.
  readonly groups = computed<AllotmentGroup[]>(() => {
    const cart = this.cart();
    const allotment = cart.allotment;
    if (!allotment) {
      return [];
    }
    const rules = allotment.rules;
    const lineTagByItemId = this.lineTagByItemId();

    return rules
      .map((rule): AllotmentGroup | null => {
        const items = cart.items.filter(
          (item) => this.resolvedAllocations(item, lineTagByItemId.get(item.cartItemId))[0]?.ruleId === rule.ruleId,
        );
        const lentNotes = this.lentNotesFor(rule, cart.items, lineTagByItemId, rules);
        if (items.length === 0 && lentNotes.length === 0) {
          return null;
        }
        return { rule, items, lentNotes, shortfallNote: this.shortfallNoteFor(rule) };
      })
      .filter((group): group is AllotmentGroup => group !== null);
  });

  // Every line that didn't land in any group above — nothing covers it at
  // all, or it's tagged for a ruleId that isn't in `rules` (stale/missing
  // data) — rendered as a plain, uncolored tail section rather than
  // silently dropped. When the cart has no allotment data whatsoever, this
  // is just every line, giving back the exact same flat list this page
  // always used to show.
  readonly ungroupedItems = computed<CartItem[]>(() => {
    const groupedItemIds = new Set(this.groups().flatMap((group) => group.items.map((item) => item.cartItemId)));
    return this.cart().items.filter((item) => !groupedItemIds.has(item.cartItemId));
  });

  // What actually pays for this order, one line per rule with anything
  // `inCart` right now — including a rule with no home items of its own,
  // since its own balance already folds in whatever it lent elsewhere.
  readonly paidFromLines = computed(() => {
    const rules = this.cart().allotment?.rules ?? [];
    return rules
      .map((rule) => ({ rule, balance: tileBalance(rule) }))
      .filter((entry) => !!entry.balance && entry.balance.inCart > 0)
      .map((entry) => ({
        ruleName: entry.rule.ruleName,
        unit: entry.rule.primaryUnit,
        amount: entry.balance!.inCart,
      }));
  });

  // Subtotal minus whatever every line's own allocations cover, corrected
  // back down for any rule that's actually over-drawn (a negative
  // `available` — its lines were tagged as covered, but the rule can't
  // really pay for all of them). A dollar rule's own shortfall is exact;
  // a units/points rule's shortfall is only a *count*, so it's prorated
  // across that rule's own lines by their share of the requested units,
  // for lack of a per-unit dollar rate to convert it exactly.
  readonly amountDueAtCheckout = computed(() => {
    const cart = this.cart();
    const rules = cart.allotment?.rules ?? [];
    const lineTagByItemId = this.lineTagByItemId();
    const requestedByRuleId = new Map<number, { units: number; dollarValue: number }>();

    const covered = cart.items.reduce((sum, item) => {
      const allocations = this.resolvedAllocations(item, lineTagByItemId.get(item.cartItemId));
      if (allocations.length === 0) {
        return sum;
      }
      const dollarsCovered = allocations
        .filter((allocation) => allocation.payUnit === 'DOLLARS')
        .reduce((total, allocation) => total + allocation.amount, 0);
      const nonDollarAllocations = allocations.filter((allocation) => allocation.payUnit !== 'DOLLARS');
      for (const allocation of nonDollarAllocations) {
        const requested = requestedByRuleId.get(allocation.ruleId) ?? { units: 0, dollarValue: 0 };
        requested.units += allocation.amount;
        requested.dollarValue += item.lineTotalPrice;
        requestedByRuleId.set(allocation.ruleId, requested);
      }
      return sum + dollarsCovered + (nonDollarAllocations.length > 0 ? item.lineTotalPrice : 0);
    }, 0);

    const shortfall = rules.reduce((sum, rule) => {
      const balance = tileBalance(rule);
      if (!balance || balance.available >= 0) {
        return sum;
      }
      if (rule.primaryUnit === 'DOLLARS') {
        return sum - balance.available;
      }
      const requested = requestedByRuleId.get(rule.ruleId);
      if (!requested || requested.units <= 0) {
        return sum;
      }
      const shortfallUnits = Math.min(-balance.available, requested.units);
      return sum + requested.dollarValue * (shortfallUnits / requested.units);
    }, 0);

    return Math.max(0, cart.subtotalPrice - covered + shortfall);
  });

  lineTag(cartItemId: number): PayTag | null {
    return this.lineTagByItemId().get(cartItemId) ?? null;
  }

  // The allotment that's actually this line's own (the first one applied)
  // — `null` when nothing covers it, same as `lineTag` returning nothing.
  primaryAllocation(item: CartItem): LineAllocation | null {
    return this.resolvedAllocations(item, this.lineTagByItemId().get(item.cartItemId))[0] ?? null;
  }

  // Only populated (and only worth showing under the price) once a line's
  // own allotment ran out partway through and a fallback picked up the
  // rest — a single-allocation line has nothing to break down.
  splitAllocations(item: CartItem): LineAllocation[] {
    const allocations = this.resolvedAllocations(item, this.lineTagByItemId().get(item.cartItemId));
    return allocations.length > 1 ? allocations : [];
  }

  ruleNameFor(ruleId: number): string {
    const rule = (this.cart().allotment?.rules ?? []).find((candidate) => candidate.ruleId === ruleId);
    return rule ? this.shortRuleName(rule.ruleName) : '';
  }

  // "$40.00 of these items is covered by your Footwear allotment, after
  // your Uniform allotment ran out." — one note per fallback hop, in case
  // a line ever chains through more than two allotments.
  fallbackNotesFor(item: CartItem): string[] {
    const allocations = this.resolvedAllocations(item, this.lineTagByItemId().get(item.cartItemId));
    if (allocations.length < 2) {
      return [];
    }
    const rules = this.cart().allotment?.rules ?? [];
    const notes: string[] = [];
    for (let i = 1; i < allocations.length; i++) {
      const previousRule = rules.find((rule) => rule.ruleId === allocations[i - 1].ruleId);
      const nextRule = rules.find((rule) => rule.ruleId === allocations[i].ruleId);
      if (!previousRule || !nextRule) {
        continue;
      }
      const amount = formatBalanceAmount(allocations[i].amount, allocations[i].payUnit);
      notes.push(
        `${amount} of these items is covered by your ${nextRule.ruleName}, after your ${previousRule.ruleName} ran out.`,
      );
    }
    return notes;
  }

  groupSubtitle(rule: AllotmentRule): string {
    const parts = [coverageLabel(rule)];
    if (rule.cycle.renewsOn) {
      parts.push(`Renews ${DATE_PIPE.transform(rule.cycle.renewsOn, 'MMM d, y')}`);
    }
    const chain = fallbackChain(rule, this.cart().allotment?.rules ?? []);
    if (chain.length > 0) {
      parts.push(`Then uses: ${chain.map((next) => this.shortRuleName(next.ruleName)).join(', ')}`);
    }
    return parts.join(' · ');
  }

  private shortRuleName(ruleName: string): string {
    return ruleName.replace(/\s+allotment$/i, '');
  }

  // "In cart includes $40.00 for Uniform items" — one sentence per other
  // group that borrowed from this rule, so this rule's own Total/Used/
  // In cart/Available still reads consistently on its own.
  private lentNotesFor(
    rule: AllotmentRule,
    items: CartItem[],
    lineTagByItemId: Map<number, LineTag>,
    rules: AllotmentRule[],
  ): string[] {
    const lentByHomeRuleId = new Map<number, LineAllocation>();
    for (const item of items) {
      const allocations = this.resolvedAllocations(item, lineTagByItemId.get(item.cartItemId));
      if (allocations.length < 2) {
        continue;
      }
      const homeRuleId = allocations[0].ruleId;
      if (homeRuleId === rule.ruleId) {
        continue;
      }
      for (const allocation of allocations.slice(1)) {
        if (allocation.ruleId !== rule.ruleId) {
          continue;
        }
        const existing = lentByHomeRuleId.get(homeRuleId);
        lentByHomeRuleId.set(homeRuleId, {
          ruleId: homeRuleId,
          payUnit: allocation.payUnit,
          amount: (existing?.amount ?? 0) + allocation.amount,
        });
      }
    }
    return Array.from(lentByHomeRuleId.entries()).map(([homeRuleId, lent]) => {
      const homeRule = rules.find((candidate) => candidate.ruleId === homeRuleId);
      const label = homeRule ? coverageLabel(homeRule) : 'other items';
      return `In cart includes ${formatBalanceAmount(lent.amount, lent.payUnit)} for ${label}`;
    });
  }

  // Only meaningful for a dollar rule at the end of its own fallback chain
  // — a negative units/points balance isn't something a shopper pays off
  // by card, so that case stays silent (the balance box still flags it in
  // its own warning color either way).
  private shortfallNoteFor(rule: AllotmentRule): string | null {
    if (rule.primaryUnit !== 'DOLLARS' || rule.fallbackRuleIds.length > 0) {
      return null;
    }
    const balance = tileBalance(rule);
    if (!balance || balance.available >= 0) {
      return null;
    }
    return `You'll pay the remaining ${formatBalanceAmount(-balance.available, 'DOLLARS')} of these items by card at checkout.`;
  }

  private currentLocationId(): number | null {
    return this.locationSelectionService.activeLocation()?.locationId ?? null;
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.cartService.load(this.currentLocationId()).subscribe({
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
    this.cartService.setQuantity(item.skuId, qty, this.currentLocationId()).subscribe({
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
    this.confirmService
      .ask({
        title: 'Remove item',
        message: `Remove ${item.productTitle} from your cart?`,
        confirmLabel: 'Remove',
        danger: true,
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.updatingSkuId.set(item.skuId);
        this.error.set(null);
        this.cartService.removeItem(item.skuId, this.currentLocationId()).subscribe({
          next: () => this.updatingSkuId.set(null),
          error: (err: unknown) => {
            this.updatingSkuId.set(null);
            this.error.set(err instanceof Error ? err.message : 'We could not remove that item.');
          },
        });
      });
  }

  clearCart(): void {
    if (this.clearing() || this.updatingSkuId() !== null || this.cart().items.length === 0) {
      return;
    }
    this.confirmService
      .ask({
        title: 'Clear cart',
        message: 'Remove all items from your cart?',
        confirmLabel: 'Clear cart',
        danger: true,
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.clearing.set(true);
        this.error.set(null);
        this.cartService.clear(this.currentLocationId()).subscribe({
          next: () => this.clearing.set(false),
          error: (err: unknown) => {
            this.clearing.set(false);
            this.error.set(err instanceof Error ? err.message : 'We could not clear your cart.');
          },
        });
      });
  }
}
