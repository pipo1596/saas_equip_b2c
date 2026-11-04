import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth';
import { OrderService } from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

interface AdminScreenLink {
  routerLink: string;
  title: string;
  description: string;
}

// Add an entry here for each new admin screen as it comes online — this
// page is the one place that lists all of them. The Approvals screen isn't
// here: it's only ever shown to an administrator (see `showApprovals`
// below), unlike these two which are open to anyone signed in for now.
const ADMIN_SCREENS: AdminScreenLink[] = [
  {
    routerLink: '/admin/employees',
    title: 'Employees',
    description: 'Look up any employee by name, email, role, or hire date.',
  },
  {
    routerLink: '/admin/orders',
    title: 'Orders',
    description: 'Search every order placed by any employee under your customer.',
  },
];

@Component({
  selector: 'app-admin-home',
  imports: [Header, Footer, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-home.html',
  styleUrls: ['../../../shared/shared.css', './admin-home.css'],
})
export class AdminHome implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly orderService = inject(OrderService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly screens = ADMIN_SCREENS;

  // A shop-as admin (L1/L2 impersonating an employee) always gets the
  // Approvals entry. A customer administrator's Override role never shows
  // up in the session itself, so for anyone else this starts hidden and
  // only flips on once a `*ADMAPRQ` probe (see `ngOnInit`) confirms it —
  // the same check the server itself would make on the real call.
  readonly showApprovals = signal(this.authService.impersonation() !== null);

  ngOnInit(): void {
    if (!this.isBrowser || this.showApprovals()) {
      return;
    }
    this.orderService.listAdminApprovals({ page: 1, pageSize: 1 }).subscribe((result) => {
      if (!('success' in result)) {
        this.showApprovals.set(true);
      }
    });
  }
}
