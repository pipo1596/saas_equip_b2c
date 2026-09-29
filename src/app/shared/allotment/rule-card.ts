import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  AllotmentRule,
  Balance,
  PayUnit,
  coverageLabel,
  formatBalanceAmount,
  tileBalance,
} from '../../core/cart/allotment';
import { AllotmentBalanceBox } from './balance-box';

interface BalanceLine {
  label: string;
  balance: Balance;
  unit: PayUnit;
}

// One rule's full breakdown — name, a one-line summary (its own amount,
// cycle, and coverage), every non-null balance as a figure grid, then
// carryover/quota/approval facts. Every value comes straight off the rule;
// nothing here is hard-coded, so a new rule type/cycle basis/carryover
// shows up correctly without a code change.
@Component({
  selector: 'app-allotment-rule-card',
  imports: [DatePipe, AllotmentBalanceBox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rule(); as rule) {
      <article class="rule-card">
        <div class="rule-card__head">
          <h4 class="rule-card__name">{{ rule.ruleName }}</h4>
          @if (rule.cycle.renewsOn) {
            <span class="rule-card__renews">Renews {{ rule.cycle.renewsOn | date: 'MMM d, y' }}</span>
          }
        </div>
        <p class="rule-card__summary">{{ summaryLine() }}</p>

        @for (line of balanceLines(); track line.label) {
          <app-allotment-balance-box class="rule-card__balance-box" [balance]="line.balance" [unit]="line.unit" />
        }

        <ul class="rule-card__facts">
          <li>Carryover: {{ carryoverSummary() }}</li>
          @if (rule.quotas.length > 0) {
            <li>Quota limits: {{ quotasSummary() }}</li>
          }
          @if (approvalSummary(); as approval) {
            <li>Approval: {{ approval }}</li>
          }
        </ul>
      </article>
    }
  `,
  styles: `
    .rule-card + .rule-card {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--slate-200);
    }
    .rule-card__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }
    .rule-card__name {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 14px;
      margin: 0;
      color: var(--slate-900);
    }
    .rule-card__renews {
      flex: none;
      font-size: 12px;
      color: var(--slate-500);
      white-space: nowrap;
    }
    .rule-card__summary {
      font-size: 12.5px;
      color: var(--slate-600);
      margin: 2px 0 10px;
    }
    .rule-card__balance-box {
      display: block;
      margin-bottom: 10px;
    }
    .rule-card__facts {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
    }
    .rule-card__facts li {
      font-size: 12px;
      color: var(--slate-600);
      line-height: 1.4;
      padding-left: 13px;
      position: relative;
    }
    .rule-card__facts li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 5px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--action);
    }
  `,
})
export class AllotmentRuleCard {
  readonly rule = input.required<AllotmentRule>();

  readonly balanceLines = computed<BalanceLine[]>(() => {
    const rule = this.rule();
    const lines: BalanceLine[] = [];
    if (rule.dollars) {
      lines.push({ label: 'Dollars', balance: rule.dollars, unit: 'DOLLARS' });
    }
    if (rule.units) {
      lines.push({ label: 'Units', balance: rule.units, unit: 'UNITS' });
    }
    if (rule.points) {
      lines.push({ label: 'Points', balance: rule.points, unit: 'POINTS' });
    }
    return lines;
  });

  // "$500.00 every 12 months · Any item in the catalog" — the rule's own
  // headline, using whichever balance matches its `primaryUnit`.
  readonly summaryLine = computed(() => {
    const rule = this.rule();
    const balance = tileBalance(rule);
    const parts = [
      balance
        ? `${formatBalanceAmount(balance.total, rule.primaryUnit)} every ${rule.cycle.renewalPeriodMonths} months`
        : null,
      coverageLabel(rule),
    ].filter((part): part is string => !!part);
    return parts.join(' · ');
  });

  readonly carryoverSummary = computed(() => {
    const { carryover } = this.rule();
    let summary: string;
    if (carryover.type === 'FORFEIT') {
      summary = 'No carryover';
    } else if (carryover.type === 'FULL') {
      summary = 'Full balance carries over';
    } else {
      summary = `${carryover.pct ?? 0}% carries over (up to $${carryover.capAmount ?? 0})`;
    }
    if (carryover.carriedIn && carryover.carriedIn > 0) {
      summary += ` · incl. $${carryover.carriedIn} carried in`;
    }
    return summary;
  });

  readonly quotasSummary = computed(() =>
    this.rule()
      .quotas.map(
        (quota) =>
          `${quota.limitValue} ${quota.limitType.toLowerCase()} max · ${quota.categoryName ?? 'All categories'} (${quota.programName})`,
      )
      .join('; '),
  );

  // Consolidated into one "Approval:" line rather than two separate
  // bullets — `null` (and the whole line hidden) when neither applies.
  readonly approvalSummary = computed(() => {
    const rule = this.rule();
    const needsApproval = rule.requireApproval === 'Y';
    const ccFallback = rule.allowCcFallback === 'Y';
    if (needsApproval && ccFallback) {
      return 'Orders need approval; personal card can cover the rest';
    }
    if (needsApproval) {
      return 'Orders need approval';
    }
    if (ccFallback) {
      return 'Personal card can cover the rest';
    }
    return null;
  });
}
