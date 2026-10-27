import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AdminNav } from './admin-nav';

describe('AdminNav', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminNav],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('marks "Employees" as the current page when active is "employees"', () => {
    const fixture = TestBed.createComponent(AdminNav);
    fixture.componentRef.setInput('active', 'employees');
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/admin/employees"]');
    expect(link.textContent).toContain('Employees');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.classList).toContain('admin-nav__link--active');
  });
});
