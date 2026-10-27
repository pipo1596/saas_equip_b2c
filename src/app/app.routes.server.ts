import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // The login route itself — easy to miss, but this one matters more than
  // any of the ones below: Angular's prerendering convention makes `/`'s
  // own prerendered output *become* `index.html`, which every
  // `RenderMode.Client` route below serves as its shell. Left on the
  // catch-all `**: RenderMode.Prerender` rule, the build bakes the real,
  // fully-rendered login form into that shared `index.html` in place of the
  // neutral loader markup actually written there (see index.html) — so an
  // already-signed-in visitor hard-refreshing any client-rendered route
  // (home, cart, ...) would see the login form flash before the client
  // bundle loads and the router corrects it to their real page.
  {
    path: '',
    renderMode: RenderMode.Client,
  },
  // These three require a signed-in session, which only ever lives in the
  // browser's own localStorage — the server has no way to know whether a
  // given visitor is actually logged in, so it can't safely pick what to
  // render for them. Prerendering (or SSR-ing) the real page would just
  // show that page's content to EVERY visitor, logged in or not, for the
  // moment it takes the client-side auth guard to redirect an
  // unauthenticated one back to the login page. Rendering them fully
  // client-side instead means nothing but the loader in index.html is ever
  // shown until the guard has actually decided what belongs there.
  {
    path: 'home',
    renderMode: RenderMode.Client,
  },
  {
    path: 'products',
    renderMode: RenderMode.Client,
  },
  {
    path: 'products/:categoryId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'product/:productPk',
    renderMode: RenderMode.Client,
  },
  {
    path: 'cart',
    renderMode: RenderMode.Client,
  },
  {
    path: 'orders',
    renderMode: RenderMode.Client,
  },
  {
    path: 'orders/:orderId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'checkout',
    renderMode: RenderMode.Client,
  },
  {
    path: 'account',
    renderMode: RenderMode.Client,
  },
  {
    path: 'allotment',
    renderMode: RenderMode.Client,
  },
  {
    path: 'approvals',
    renderMode: RenderMode.Client,
  },
  {
    path: 'announcements',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/employees',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/employees/:empId',
    renderMode: RenderMode.Client,
  },
  // Reads its one-time token from `location.hash` (browser-only) and
  // redirects based on the session it just established — `ngOnInit` itself
  // no-ops during SSR (see `ShopAs.isBrowser`). Left on the prerender
  // catch-all, this page (and the whole app shell around it, including
  // `<app-impersonation-banner>`/`sessionEnded`) gets baked from an
  // anonymous, no-session snapshot at build time; a real visitor's actual
  // client-side auth state then mismatches that snapshot at hydration,
  // which can leave part of the page (reportedly the header) never
  // properly mounted after the redirect to `/home`.
  {
    path: 'shop-as',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
