import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Allotment, AllotmentBar, formatBalanceAmount, meterPct } from '../../core/cart/allotment';
import {
  AllotmentPendingHold,
  AllotmentTransaction,
  AllotmentTransactionsPage,
  AllotmentTxnScope,
  EmployeeAllotmentService,
  allotmentTxnLabel,
  formatAllotmentTimestamp,
  formatSignedAllotmentAmount,
} from '../../core/allotment/employee-allotment';
import { orderStatusLabel } from '../../core/order/order';
import { AccountNav } from '../../shared/account-nav/account-nav';
import { AllotmentRuleCard } from '../../shared/allotment/rule-card';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

// Every row for one rule, grouped for display (see `AllotmentPage.groupedHistory`).
interface HistoryGroup {
  ruleId: number;
  ruleName: string;
  // "$500.00" alongside the group header for a dollar rule — matching how
  // each rule card above already headlines its own total — `null` for a
  // units/points rule (no single meaningful total to headline) or one that
  // no longer appears in `summary.rules` (e.g. removed from the role since
  // this row posted).
  headerAmount: string | null;
  rows: AllotmentTransaction[];
}

// Large enough that "This cycle"/"All history" shows everything without
// paging in the common case — the doc's own documented ceiling (1-200).
const HISTORY_PAGE_SIZE = 200;

@Component({
  selector: 'app-allotment-page',
  imports: [Header, Footer, RouterLink, DatePipe, AccountNav, AllotmentRuleCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './allotment-page.html',
  styleUrls: ['../../shared/shared.css', './allotment-page.css'],
})
export class AllotmentPage implements OnInit {
  private readonly employeeAllotmentService = inject(EmployeeAllotmentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly summary = signal<Allotment | null>(null);
  readonly transactions = signal<AllotmentTransactionsPage | null>(null);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // Set only while a `*TXNS` (paging/filter) call is in flight — unlike
  // `loading`, this never re-skeletons the summary/pending sections above,
  // since `*TXNS` never touches them.
  readonly txnLoading = signal(false);
  readonly txnError = signal<string | null>(null);

  readonly scope = signal<AllotmentTxnScope>('CURRENT');
  readonly page = signal(1);

  readonly rules = computed(() => this.summary()?.rules ?? []);
  readonly hasNoAllotment = computed(() => this.summary() !== null && this.rules().length === 0);
  readonly allotmentBar = computed<AllotmentBar | null>(() => this.summary()?.allotmentBar ?? null);
  readonly allotmentBarMeterPct = computed(() => {
    const bar = this.allotmentBar();
    return bar ? meterPct(bar) : 0;
  });
  // The bar itself carries no renewal date — that lives on whichever rule is
  // flagged as the bar rule, matched by `allotmentBar.ruleId`.
  readonly allotmentBarRenewsOn = computed(() => {
    const bar = this.allotmentBar();
    if (!bar) {
      return null;
    }
    return this.rules().find((rule) => rule.ruleId === bar.ruleId)?.cycle.renewsOn ?? null;
  });

  readonly pending = computed(() => this.transactions()?.pending ?? []);
  readonly history = computed(() => this.transactions()?.data ?? []);
  readonly pagination = computed(() => this.transactions()?.pagination ?? null);

  // One section per allotment, in the same order as the rule cards above —
  // a ruleId no longer in `summary.rules` (e.g. dropped from the role since
  // the row posted) still gets its own section, just sorted after every
  // current rule rather than disappearing.
  readonly groupedHistory = computed<HistoryGroup[]>(() => {
    const rules = this.rules();
    const groups = new Map<number, HistoryGroup>();
    for (const row of this.history()) {
      let group = groups.get(row.ruleId);
      if (!group) {
        const rule = rules.find((candidate) => candidate.ruleId === row.ruleId);
        group = {
          ruleId: row.ruleId,
          ruleName: row.ruleName,
          headerAmount:
            rule && rule.primaryUnit === 'DOLLARS' && rule.dollars
              ? formatBalanceAmount(rule.dollars.total, 'DOLLARS')
              : null,
          rows: [],
        };
        groups.set(row.ruleId, group);
      }
      group.rows.push(row);
    }
    const ruleOrder = rules.map((rule) => rule.ruleId);
    const orderOf = (ruleId: number) => {
      const index = ruleOrder.indexOf(ruleId);
      return index === -1 ? ruleOrder.length : index;
    };
    return Array.from(groups.values()).sort((a, b) => orderOf(a.ruleId) - orderOf(b.ruleId));
  });

  readonly allotmentTxnLabel = allotmentTxnLabel;
  readonly formatAllotmentTimestamp = formatAllotmentTimestamp;
  readonly formatSignedAllotmentAmount = formatSignedAllotmentAmount;
  readonly formatBalanceAmount = formatBalanceAmount;
  readonly orderStatusLabel = orderStatusLabel;

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.employeeAllotmentService.load(HISTORY_PAGE_SIZE).subscribe({
      next: (result) => {
        this.loading.set(false);
        if ('success' in result) {
          this.error.set(result.message);
          return;
        }
        this.summary.set(result.summary);
        this.transactions.set(result.transactions);
        this.scope.set(result.transactions.scope);
        this.page.set(result.transactions.pagination.page);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('We could not load your allotment right now.');
      },
    });
  }

  setScope(scope: AllotmentTxnScope): void {
    if (scope === this.scope()) {
      return;
    }
    this.scope.set(scope);
    this.page.set(1);
    this.loadTransactions();
  }

  goToPage(page: number): void {
    const totalPages = this.pagination()?.totalPages ?? 1;
    if (page < 1 || page > totalPages || page === this.page()) {
      return;
    }
    this.page.set(page);
    this.loadTransactions();
  }

  pendingKey(hold: AllotmentPendingHold): string {
    return `${hold.orderId}-${hold.ruleId}-${hold.progCatId ?? ''}`;
  }

  retryTransactions(): void {
    this.loadTransactions();
  }

  private loadTransactions(): void {
    this.txnLoading.set(true);
    this.txnError.set(null);
    this.employeeAllotmentService
      .loadTransactions({
        ruleId: 0,
        scope: this.scope(),
        page: this.page(),
        pageSize: HISTORY_PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.txnLoading.set(false);
          if ('success' in result) {
            this.txnError.set(result.message);
            return;
          }
          this.transactions.set(result);
        },
        error: () => {
          this.txnLoading.set(false);
          this.txnError.set('We could not load your transaction history.');
        },
      });
  }
}
