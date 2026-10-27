import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
  EmployeeDirectoryService,
  EmployeePage,
  EmployeeRole,
  EmployeeSummary,
} from '../../../core/employee/employee-directory';
import { AdminNav } from '../../../shared/admin-nav/admin-nav';
import { avatarColorForId } from '../../../shared/avatar-color';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-admin-employees',
  imports: [Header, Footer, RouterLink, ReactiveFormsModule, AdminNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employees.html',
  styleUrls: ['../../../shared/shared.css', './employees.css'],
})
export class AdminEmployees implements OnInit {
  private readonly employeeDirectoryService = inject(EmployeeDirectoryService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly roleId = signal(0);
  readonly hireFrom = signal('');
  readonly hireTo = signal('');
  readonly page = signal(1);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly employeePage = signal<EmployeePage | null>(null);
  readonly roles = signal<EmployeeRole[]>([]);

  readonly employees = computed(() => this.employeePage()?.data ?? []);
  readonly pagination = computed(() => this.employeePage()?.pagination ?? null);

  // Guards against a slow earlier search/filter change overwriting the
  // result of a newer one that resolves first — only the response matching
  // the most recently started request is ever applied.
  private requestId = 0;

  // Debounced so the list doesn't re-fetch on every keystroke — only once
  // typing pauses for a moment.
  private readonly debouncedSearch = this.searchControl.valueChanges
    .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
    .subscribe(() => {
      this.page.set(1);
      this.load();
    });

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.employeeDirectoryService.listRoles().subscribe((result) => {
      this.roles.set(Array.isArray(result) ? result : []);
    });
    this.load();
  }

  onRoleChange(value: string): void {
    this.roleId.set(Number(value));
    this.page.set(1);
    this.load();
  }

  onHireFromChange(value: string): void {
    this.hireFrom.set(value);
    this.page.set(1);
    this.load();
  }

  onHireToChange(value: string): void {
    this.hireTo.set(value);
    this.page.set(1);
    this.load();
  }

  // Not a `computed()` — it mixes a reactive signal (`roleId`/`hireFrom`/
  // `hireTo`) with the search box's own `FormControl.value`, which isn't a
  // signal and wouldn't reliably invalidate the cache on its own. A plain
  // method re-reads everything fresh on every change-detection pass, which
  // is exactly as cheap here and avoids that trap.
  hasFilters(): boolean {
    return !!this.searchControl.value || this.roleId() !== 0 || !!this.hireFrom() || !!this.hireTo();
  }

  clearFilters(): void {
    // `emitEvent: false` so this doesn't *also* queue a debounced reload on
    // top of the immediate one below.
    this.searchControl.setValue('', { emitEvent: false });
    this.roleId.set(0);
    this.hireFrom.set('');
    this.hireTo.set('');
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    const totalPages = this.pagination()?.totalPages ?? 1;
    if (page < 1 || page > totalPages || page === this.page()) {
      return;
    }
    this.page.set(page);
    this.load();
  }

  initials(employee: EmployeeSummary): string {
    return `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
  }

  avatarColor(employee: EmployeeSummary): string {
    return avatarColorForId(employee.empId);
  }

  private load(): void {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);

    this.employeeDirectoryService
      .list({
        search: this.searchControl.value.trim(),
        roleId: this.roleId() || undefined,
        hireFrom: this.hireFrom(),
        hireTo: this.hireTo(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .subscribe((result) => {
        if (requestId !== this.requestId) {
          return;
        }
        this.loading.set(false);
        if ('success' in result) {
          this.error.set(result.message);
          return;
        }
        this.employeePage.set(result);
      });
  }
}
