import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

// There's no dedicated allotment page yet — "My Allotment" always links to
// home (where the allotment tiles live) and never shows as the active item.
export type AccountNavKey = 'account' | 'orders';

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
