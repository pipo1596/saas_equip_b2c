import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Category ids are tenant/location-specific and not known at build
    // time, so this route renders per-request instead of being prerendered.
    path: 'products/:categoryId',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
