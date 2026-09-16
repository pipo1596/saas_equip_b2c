import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { NoRouteReuseStrategy } from './core/routing/no-reuse-route-strategy';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Without this, clicking a link to the URL you're already on is a
      // silent no-op — the router skips navigation entirely, so nothing
      // re-runs even if the user clearly wants to (e.g. re-clicking the
      // wordmark while already on /home, or the category already showing).
      withRouterConfig({ onSameUrlNavigation: 'reload' }),
    ),
    // Paired with the above: the default strategy would still reuse the
    // existing component instance whenever the route config/params are
    // unchanged, so a same-URL "reload" would complete but nothing would
    // actually re-run. This makes every navigation — to any route, same
    // URL or not — recreate the page fresh.
    { provide: RouteReuseStrategy, useClass: NoRouteReuseStrategy },
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch()),
  ],
};
