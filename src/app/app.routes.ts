import { Routes } from '@angular/router';

import { authGuard, guestGuard, mfaPendingGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'mfa',
    canActivate: [mfaPendingGuard],
    loadComponent: () => import('./features/auth/mfa/mfa').then((m) => m.Mfa),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    // Public, no guard — the admin console's new tab may hold no session, or
    // an unrelated one; this must work unconditionally.
    path: 'shop-as',
    loadComponent: () => import('./features/auth/shop-as/shop-as').then((m) => m.ShopAs),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'products',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/catalog/product-list/product-list').then((m) => m.ProductList),
  },
  {
    path: 'products/:categoryId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/catalog/product-list/product-list').then((m) => m.ProductList),
  },
  {
    path: 'product/:productPk',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/catalog/product-detail/product-detail').then((m) => m.ProductDetail),
  },
  {
    path: 'cart',
    canActivate: [authGuard],
    loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage),
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () => import('./features/checkout/checkout-page').then((m) => m.CheckoutPage),
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/order-history/order-history').then((m) => m.OrderHistoryPage),
  },
  {
    path: 'orders/:orderId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/order-detail/order-detail').then((m) => m.OrderDetailPage),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'approvals',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/approvals/approval-queue/approval-queue').then((m) => m.ApprovalQueue),
  },
];
