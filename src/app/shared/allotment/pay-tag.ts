import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { PayTag } from '../../core/cart/allotment';

// A small "$ allotment" / "uses units" pill — same on a cart line and the
// product detail page. Renders nothing at all when there's no tag to show
// (`payUnit`/`tagLabel` both `null` — nothing covers this item), rather
// than a "Not covered" label on every single line.
@Component({
  selector: 'app-pay-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tag()?.tagLabel; as label) {
      <span class="pay-tag" [class.pay-tag--units]="tag()?.payUnit === 'UNITS'" [class.pay-tag--points]="tag()?.payUnit === 'POINTS'">
        <span class="pay-tag__dot" aria-hidden="true"></span>
        {{ label }}
      </span>
    }
  `,
  styles: `
    .pay-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-ui);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.4;
      padding: 3px 12px;
      border-radius: 999px;
      border: 1.5px solid var(--action);
      background: #fff;
      color: var(--action);
      white-space: nowrap;
    }
    .pay-tag__dot {
      flex: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .pay-tag--units {
      border-color: var(--good);
      color: var(--good);
    }
    .pay-tag--points {
      border-color: var(--slate-600);
      color: var(--slate-600);
    }
  `,
})
export class PayTagBadge {
  readonly tag = input<PayTag | null>(null);
}
