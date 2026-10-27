import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EmployeeDetail, EmployeeDirectoryService, formatHireDate } from '../../../core/employee/employee-directory';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

@Component({
  selector: 'app-admin-employee-detail',
  imports: [Header, Footer, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employee-detail.html',
  styleUrls: ['../../../shared/shared.css', './employee-detail.css'],
})
export class AdminEmployeeDetail implements OnInit {
  private readonly employeeDirectoryService = inject(EmployeeDirectoryService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Bound from the route (`/admin/employees/:empId`, see app.routes.ts).
  readonly empId = input('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);
  readonly employee = signal<EmployeeDetail | null>(null);

  readonly formatHireDate = formatHireDate;

  initials(employee: EmployeeDetail): string {
    return `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    const id = Number(this.empId());
    if (!this.empId() || !Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.employeeDirectoryService.get(id).subscribe((result) => {
      this.loading.set(false);
      if ('success' in result) {
        this.error.set(result.message);
        return;
      }
      this.employee.set(result);
    });
  }
}
