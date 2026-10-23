import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { Cart, CartService } from '../../core/cart/cart';
import { AccountNav } from './account-nav';

const CART: Cart = {
  cartId: null,
  itemCount: 0,
  subtotalPrice: 0,
  subtotalPoints: null,
  items: [],
  allotment: null,
  roleRequiresApproval: 'N',
};

describe('AccountNav', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountNav],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
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

  it('marks "My Allotment" as the current page when active is "allotment"', () => {
    const fixture = TestBed.createComponent(AccountNav);
    fixture.componentRef.setInput('active', 'allotment');
    fixture.detectChanges();

    const allotmentLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/allotment"]');
    const accountLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/account"]');
    expect(allotmentLink.textContent).toContain('My Allotment');
    expect(allotmentLink.getAttribute('aria-current')).toBe('page');
    expect(allotmentLink.classList).toContain('account-nav__link--active');
    expect(accountLink.getAttribute('aria-current')).toBeNull();
  });

  it('hides Approvals when the employee cannot approve orders', () => {
    const fixture = TestBed.createComponent(AccountNav);
    fixture.componentRef.setInput('active', 'account');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/approvals"]')).toBeNull();
  });

  it('shows Approvals, marked as the current page, when active is "approvals" and the employee can approve', () => {
    TestBed.inject(CartService).cart.set({
      ...CART,
      allotment: {
        programId: 3,
        allotmentBar: null,
        ruleCount: 0,
        allotExclTaxFreight: 'N',
        rules: [],
        approvals: { canApprove: 'Y', pendingApprovals: 0, awaitingApproval: null },
        openOrders: null,
        lineTags: [],
        productTag: null,
      },
    });
    const fixture = TestBed.createComponent(AccountNav);
    fixture.componentRef.setInput('active', 'approvals');
    fixture.detectChanges();

    const approvalsLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/approvals"]');
    expect(approvalsLink.textContent).toContain('Approvals');
    expect(approvalsLink.getAttribute('aria-current')).toBe('page');
    expect(approvalsLink.classList).toContain('account-nav__link--active');
    expect(approvalsLink.querySelector('.badge')).toBeNull();
  });

  it('shows a pending-count badge on Approvals when there are pending approvals', () => {
    TestBed.inject(CartService).cart.set({
      ...CART,
      allotment: {
        programId: 3,
        allotmentBar: null,
        ruleCount: 0,
        allotExclTaxFreight: 'N',
        rules: [],
        approvals: { canApprove: 'Y', pendingApprovals: 3, awaitingApproval: null },
        openOrders: null,
        lineTags: [],
        productTag: null,
      },
    });
    const fixture = TestBed.createComponent(AccountNav);
    fixture.componentRef.setInput('active', 'account');
    fixture.detectChanges();

    const approvalsLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/approvals"]');
    expect(approvalsLink.querySelector('.badge')?.textContent?.trim()).toBe('3');
  });
});
