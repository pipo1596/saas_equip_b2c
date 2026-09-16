import { DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

// Always recreates the routed component on every navigation — including a
// "navigation" to the exact same URL (e.g. clicking the wordmark while
// already on /home, or re-clicking the category you're already viewing).
// Angular's default strategy reuses the existing component instance
// whenever the route config and params haven't changed, which is normally
// desirable but means nothing re-runs on a same-URL click even once
// `onSameUrlNavigation: 'reload'` makes that click complete as a real
// navigation.
export class NoRouteReuseStrategy implements RouteReuseStrategy {
  shouldDetach(): boolean {
    return false;
  }

  store(): void {
    // Never store a detached route for later reuse.
  }

  shouldAttach(): boolean {
    return false;
  }

  retrieve(): DetachedRouteHandle | null {
    return null;
  }

  shouldReuseRoute(): boolean {
    return false;
  }
}
