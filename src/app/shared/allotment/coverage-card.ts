import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AllotmentRule, AllotmentUnitGrant, Balance, coverageLabel, tileBalance } from '../../core/cart/allotment';
import { AllotmentBalanceBox } from './balance-box';

// Product detail's "Covered by your {rule}" card — a compact preview of the
// one rule that pays for this item, with a link out to the full breakdown
// in the header's Rules panel rather than duplicating it here.
@Component({
  selector: 'app-allotment-coverage-card',
  imports: [AllotmentBalanceBox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="coverage-card">
      <div class="coverage-card__head">
        <h3 class="coverage-card__title">Covered by your {{ rule().ruleName }}</h3>
        <button type="button" class="coverage-card__view-rule" (click)="viewRule.emit()">View rule</button>
      </div>
      <p class="coverage-card__subtitle">{{ subtitle() }}</p>
      @if (primaryBalance(); as balance) {
        <app-allotment-balance-box [balance]="balance" [unit]="rule().primaryUnit" />
      }
    </section>
  `,
  styles: `
    .coverage-card {
      border: 1px solid var(--good);
      background: color-mix(in srgb, var(--good) 8%, white);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 16px;
    }
    .coverage-card__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .coverage-card__title {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 15px;
      margin: 0;
      color: var(--good);
    }
    .coverage-card__view-rule {
      flex: none;
      background: none;
      border: none;
      padding: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--action);
      cursor: pointer;
      text-decoration: underline;
    }
    .coverage-card__view-rule:hover,
    .coverage-card__view-rule:focus-visible {
      text-decoration: none;
    }
    .coverage-card__subtitle {
      font-size: 12.5px;
      color: var(--slate-600);
      margin: 2px 0 10px;
    }
  `,
})
export class AllotmentCoverageCard {
  private static readonly datePipe = new DatePipe('en-US');

  readonly rule = input.required<AllotmentRule>();
  // The specific assortment grant this product draws from, and that
  // grant's own balance — present only for a units rule tracked per
  // assortment, where the product being viewed matches one of its grants.
  // Units are no longer one pooled total across every assortment a rule
  // covers (e.g. Cap 2, Polo 1, Shirt 3), so this product's own card needs
  // to show just its own grant's room, not the rule's aggregate.
  readonly unitGrant = input<AllotmentUnitGrant | null>(null);
  readonly unitGrantBalance = input<Balance | null>(null);
  readonly viewRule = output<void>();

  readonly primaryBalance = computed(() => {
    const grant = this.unitGrant();
    const grantBalance = this.unitGrantBalance();
    if (this.rule().primaryUnit === 'UNITS' && grant && grantBalance) {
      return grantBalance;
    }
    return tileBalance(this.rule());
  });

  readonly subtitle = computed(() => {
    const rule = this.rule();
    const renewsOn = rule.cycle.renewsOn;
    const grant = this.unitGrant();
    const coverage = rule.primaryUnit === 'UNITS' && grant ? `${grant.categoryName} items only` : coverageLabel(rule);
    return renewsOn
      ? `${coverage} · Renews ${AllotmentCoverageCard.datePipe.transform(renewsOn, 'MMM d, y')}`
      : coverage;
  });
}
