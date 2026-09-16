import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  RouteReuseStrategy,
  RouterOutlet,
  provideRouter,
  withRouterConfig,
} from '@angular/router';

import { NoRouteReuseStrategy } from './no-reuse-route-strategy';

describe('NoRouteReuseStrategy', () => {
  const strategy = new NoRouteReuseStrategy();

  it('never allows a route to be reused, detached, or attached', () => {
    // Args are irrelevant — every decision is unconditionally "start fresh".
    expect(strategy.shouldReuseRoute()).toBe(false);
    expect(strategy.shouldDetach()).toBe(false);
    expect(strategy.shouldAttach()).toBe(false);
    expect(strategy.retrieve()).toBeNull();
  });

  it('does nothing when asked to store a detached route', () => {
    expect(() => strategy.store()).not.toThrow();
  });
});

@Component({ selector: 'test-marker', template: '' })
class Marker {
  static instances = 0;

  constructor() {
    Marker.instances++;
  }
}

@Component({ selector: 'test-host', imports: [RouterOutlet], template: '<router-outlet />' })
class TestHost {}

describe('NoRouteReuseStrategy (wired into the router)', () => {
  it('recreates the routed component even when navigating to the exact same URL', async () => {
    Marker.instances = 0;
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        provideRouter(
          [{ path: 'x', component: Marker }],
          withRouterConfig({ onSameUrlNavigation: 'reload' }),
        ),
        { provide: RouteReuseStrategy, useClass: NoRouteReuseStrategy },
      ],
    });
    const fixture = TestBed.createComponent(TestHost);
    const router = TestBed.inject(Router);
    fixture.detectChanges();

    await router.navigateByUrl('/x');
    fixture.detectChanges();
    expect(Marker.instances).toBe(1);

    // Same URL, navigated to again — without onSameUrlNavigation:'reload'
    // this would be a no-op; without NoRouteReuseStrategy it would reuse
    // the existing Marker instance instead of constructing a new one.
    await router.navigateByUrl('/x');
    fixture.detectChanges();
    expect(Marker.instances).toBe(2);
  });
});
