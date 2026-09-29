import { TestBed } from '@angular/core/testing';

import { ConfirmService } from './confirm';

describe('ConfirmService', () => {
  let service: ConfirmService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfirmService);
  });

  it('starts with no pending request', () => {
    expect(service.request()).toBeNull();
  });

  it('applies defaults for an omitted title/labels/danger', () => {
    service.ask({ message: 'Are you sure?' }).subscribe();

    expect(service.request()).toEqual({
      title: 'Please confirm',
      message: 'Are you sure?',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
    });
  });

  it('passes through explicit options', () => {
    service
      .ask({
        title: 'Clear cart',
        message: 'Remove everything?',
        confirmLabel: 'Clear',
        cancelLabel: 'Keep it',
        danger: true,
      })
      .subscribe();

    expect(service.request()).toEqual({
      title: 'Clear cart',
      message: 'Remove everything?',
      confirmLabel: 'Clear',
      cancelLabel: 'Keep it',
      danger: true,
    });
  });

  it('resolves true and clears the request on respond(true)', () => {
    let result: boolean | undefined;
    service.ask({ message: 'Sure?' }).subscribe((confirmed) => (result = confirmed));

    service.respond(true);

    expect(result).toBe(true);
    expect(service.request()).toBeNull();
  });

  it('resolves false on respond(false)', () => {
    let result: boolean | undefined;
    service.ask({ message: 'Sure?' }).subscribe((confirmed) => (result = confirmed));

    service.respond(false);

    expect(result).toBe(false);
  });

  it('does nothing when responding with no pending request', () => {
    expect(() => service.respond(true)).not.toThrow();
  });
});
