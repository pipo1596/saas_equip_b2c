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
];
