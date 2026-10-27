import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

interface AdminScreenLink {
  routerLink: string;
  title: string;
  description: string;
}

// Add an entry here for each new admin screen as it comes online — this
// page is the one place that lists all of them.
const ADMIN_SCREENS: AdminScreenLink[] = [
  {
    routerLink: '/admin/employees',
    title: 'Employees',
    description: 'Look up any employee by name, email, role, or hire date.',
  },
];

@Component({
  selector: 'app-admin-home',
  imports: [Header, Footer, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-home.html',
  styleUrls: ['../../../shared/shared.css', './admin-home.css'],
})
export class AdminHome {
  readonly screens = ADMIN_SCREENS;
}
