import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type AccountNavKey = 'account' | 'orders' | 'allotment';

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
  readonly active = input.required<AccountNavKey>();
}
