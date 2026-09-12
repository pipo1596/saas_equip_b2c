import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth';
import { Header } from './header';

describe('Header', () => {
  beforeEach(async () => {
    // AuthService restores its session from localStorage, which (unlike
    // TestBed's DI container) isn't reset between spec files — clear it so
    // a prior test's persisted login doesn't leak in here.
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('should create', () => {
    const fixture = TestBed.createComponent(Header);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should default to the first department and toggle the menu', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.activeDepartment().name).toBe('Metro EMS');
    expect(header.deptMenuOpen()).toBe(false);

    header.toggleDeptMenu();
    expect(header.deptMenuOpen()).toBe(true);

    header.selectDepartment(header.departments[1]);
    expect(header.activeDepartment().name).toBe('Seaview Fire Dept.');
    expect(header.deptMenuOpen()).toBe(false);
  });

  it('should close the department menu when the rules menu opens, and vice versa', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    header.toggleDeptMenu();
    expect(header.deptMenuOpen()).toBe(true);

    header.toggleRulesMenu();
    expect(header.rulesMenuOpen()).toBe(true);
    expect(header.deptMenuOpen()).toBe(false);
  });

  it('should open and close the cart drawer', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.cartOpen()).toBe(false);
    header.openCart();
    expect(header.cartOpen()).toBe(true);
    header.closeCart();
    expect(header.cartOpen()).toBe(false);
  });

  it('should start with an empty cart', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.cartLines()).toEqual([]);
    expect(header.cartCount()).toBe(0);
    expect(header.cartSubtotal()).toBe(0);
  });

  it('should show no name/initials when logged out', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;

    expect(header.firstName()).toBeNull();
    expect(header.fullName()).toBeNull();
    expect(header.initials()).toBeNull();
  });

  it('should derive a capitalized name and initials from the session', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;
    const auth = TestBed.inject(AuthService);

    auth.session.set({
      empId: '19023',
      sessionId: 'sess-1',
      firstName: 'pierre',
      lastName: 'achkar',
    });

    expect(header.firstName()).toBe('Pierre');
    expect(header.fullName()).toBe('Pierre Achkar');
    expect(header.initials()).toBe('PA');
  });

  it('should close the user menu, clear the session and navigate to / on log off', () => {
    const fixture = TestBed.createComponent(Header);
    const header = fixture.componentInstance;
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    auth.session.set({ empId: '1', sessionId: 's', firstName: 'pierre', lastName: 'achkar' });
    header.toggleUserMenu();
    expect(header.userMenuOpen()).toBe(true);

    header.logOut();

    expect(header.userMenuOpen()).toBe(false);
    expect(auth.session()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });
});
