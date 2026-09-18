import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
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
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
