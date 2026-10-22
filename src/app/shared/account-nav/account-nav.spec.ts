import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AccountNav } from './account-nav';

describe('AccountNav', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountNav],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('marks "My account" as the current page when active is "account"', () => {
    const fixture = TestBed.createComponent(AccountNav);
    fixture.componentRef.setInput('active', 'account');
    fixture.detectChanges();

    const accountLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/account"]');
    const ordersLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/orders"]');
    expect(accountLink.getAttribute('aria-current')).toBe('page');
    expect(accountLink.classList).toContain('account-nav__link--active');
    expect(ordersLink.getAttribute('aria-current')).toBeNull();
    expect(ordersLink.classList).not.toContain('account-nav__link--active');
  });

  it('marks "My orders" as the current page when active is "orders"', () => {
    const fixture = TestBed.createComponent(AccountNav);
    fixture.componentRef.setInput('active', 'orders');
    fixture.detectChanges();

    const accountLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/account"]');
    const ordersLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/orders"]');
    expect(ordersLink.getAttribute('aria-current')).toBe('page');
    expect(ordersLink.classList).toContain('account-nav__link--active');
    expect(accountLink.getAttribute('aria-current')).toBeNull();
    expect(accountLink.classList).not.toContain('account-nav__link--active');
  });

  it('links "My Allotment" to home, and never marks it active', () => {
    const fixture = TestBed.createComponent(AccountNav);
    fixture.componentRef.setInput('active', 'account');
    fixture.detectChanges();

    const allotmentLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/home"]');
    expect(allotmentLink.textContent).toContain('My Allotment');
    expect(allotmentLink.getAttribute('aria-current')).toBeNull();
    expect(allotmentLink.classList).not.toContain('account-nav__link--active');
  });
});
