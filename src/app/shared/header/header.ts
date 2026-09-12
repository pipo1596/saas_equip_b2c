import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth';

interface Department {
  readonly name: string;
  readonly role: string;
  readonly color: string;
}

interface CartLine {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly price: number;
  readonly qty: number;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

@Component({
  selector: 'app-header',
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrls: ['../shared.css', './header.css'],
})
export class Header {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly session = this.authService.session;

  private readonly name = computed(() => {
    const session = this.session();
    return {
      first: capitalize(session?.firstName ?? ''),
      last: capitalize(session?.lastName ?? ''),
    };
  });
  readonly firstName = computed(() => this.name().first || null);
  readonly fullName = computed(() => `${this.name().first} ${this.name().last}`.trim() || null);
  readonly initials = computed(() => {
    const { first, last } = this.name();
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || null;
  });

  readonly departments: readonly Department[] = [
    { name: 'Metro EMS', role: 'Field paramedic', color: '#0F6E56' },
    { name: 'Seaview Fire Dept.', role: 'Firefighter', color: '#0C1C2E' },
    { name: 'Austin Police Dept.', role: 'Sworn officer', color: '#12314C' },
  ];
  readonly activeDepartment = signal<Department>(this.departments[0]);

  readonly deptMenuOpen = signal(false);
  readonly rulesMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly cartOpen = signal(false);

  // No cart/product service exists yet, so this starts empty rather than
  // faking line items — the drawer just shows its empty state for now.
  readonly cartLines = signal<CartLine[]>([]);
  readonly cartCount = computed(() =>
    this.cartLines().reduce((total, line) => total + line.qty, 0),
  );
  readonly cartSubtotal = computed(() =>
    this.cartLines().reduce((total, line) => total + line.price * line.qty, 0),
  );

  toggleDeptMenu(): void {
    this.rulesMenuOpen.set(false);
    this.userMenuOpen.set(false);
    this.deptMenuOpen.update((open) => !open);
  }

  selectDepartment(department: Department): void {
    this.activeDepartment.set(department);
    this.deptMenuOpen.set(false);
  }

  toggleRulesMenu(): void {
    this.deptMenuOpen.set(false);
    this.userMenuOpen.set(false);
    this.rulesMenuOpen.update((open) => !open);
  }

  toggleUserMenu(): void {
    this.deptMenuOpen.set(false);
    this.rulesMenuOpen.set(false);
    this.userMenuOpen.update((open) => !open);
  }

  openCart(): void {
    this.cartOpen.set(true);
  }

  closeCart(): void {
    this.cartOpen.set(false);
  }

  logOut(): void {
    this.userMenuOpen.set(false);
    this.authService.logout();
    this.router.navigateByUrl('/');
  }
}
