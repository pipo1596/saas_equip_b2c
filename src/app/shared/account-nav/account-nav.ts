import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartService } from '../../core/cart/cart';

export type AccountNavKey = 'account' | 'orders' | 'allotment' | 'approvals';

// The left-hand "Account" nav shared by every account-related page (My
// account, My orders, …) — `active` picks which entry renders as the
// current page.
@Component({
  selector: 'app-account-nav',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-nav.html',
  styleUrls: ['./account-nav.css'],
})
export class AccountNav {
  private readonly cartService = inject(CartService);

  readonly active = input.required<AccountNavKey>();

  // Same source/condition as the header's own Approvals menu item — only
  // someone who can actually approve orders gets a link to the queue.
  private readonly approvals = computed(() => this.cartService.cart().allotment?.approvals ?? null);
  readonly canApprove = computed(() => this.approvals()?.canApprove === 'Y');
  readonly pendingApprovalsCount = computed(() => this.approvals()?.pendingApprovals ?? 0);
}
