import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type AdminNavKey = 'employees';

// The left-hand nav shared by every Admin-only screen — mirrors
// `AccountNav`'s shape. Only one entry today; add further `AdminNavKey`
// values/links here as more admin screens come online.
@Component({
  selector: 'app-admin-nav',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-nav.html',
  styleUrls: ['./admin-nav.css'],
})
export class AdminNav {
  readonly active = input.required<AdminNavKey>();
}
