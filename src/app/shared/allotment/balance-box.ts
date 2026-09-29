import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Balance, PayUnit, formatBalanceAmount } from '../../core/cart/allotment';

// The Total/Used/In cart/Available figure grid — identical wherever a
// single balance shows up (the Rules panel's per-rule breakdown, and the
// product detail page's own "Covered by your {rule}" card), so it's one
// component rather than the same markup twice.
@Component({
  selector: 'app-allotment-balance-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="balance-box">
      <div class="balance-box__figure">
        <span class="balance-box__label">Total</span>
        <span class="balance-box__value">{{ formatAmount(balance().total, unit()) }}</span>
      </div>
      <div class="balance-box__figure">
        <span class="balance-box__label">Used</span>
        <span class="balance-box__value">{{ formatAmount(balance().used, unit()) }}</span>
      </div>
      <div class="balance-box__figure">
        <span class="balance-box__label">In cart</span>
        <span class="balance-box__value">{{ formatAmount(balance().inCart, unit()) }}</span>
      </div>
      <div class="balance-box__figure">
        <span class="balance-box__label">Available</span>
        <span
          class="balance-box__value"
          [class.balance-box__value--good]="balance().available >= 0"
          [class.balance-box__value--warn]="balance().available < 0"
        >
          {{ formatAmount(balance().available, unit()) }}
        </span>
      </div>
    </div>
  `,
  styles: `
    .balance-box {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      background: var(--slate-100);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .balance-box__figure {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .balance-box__label {
      font-size: 11px;
      color: var(--slate-500);
    }
    .balance-box__value {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--slate-900);
    }
    .balance-box__value--good {
      color: var(--good);
    }
    .balance-box__value--warn {
      color: var(--accent);
    }
    @media (max-width: 480px) {
      .balance-box {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `,
})
export class AllotmentBalanceBox {
  readonly balance = input.required<Balance>();
  readonly unit = input.required<PayUnit>();

  readonly formatAmount = formatBalanceAmount;
}
