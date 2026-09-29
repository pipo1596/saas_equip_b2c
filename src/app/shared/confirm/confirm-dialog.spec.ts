import { TestBed } from '@angular/core/testing';

import { ConfirmService } from './confirm';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let confirmService: ConfirmService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConfirmDialog] });
    confirmService = TestBed.inject(ConfirmService);
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders nothing when there is no pending confirmation', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.modal-content')).toBeNull();
  });

  it('renders the pending confirmation with its labels', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    confirmService
      .ask({ title: 'Remove item', message: 'Remove this?', confirmLabel: 'Remove', danger: true })
      .subscribe();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Remove item');
    expect(fixture.nativeElement.textContent).toContain('Remove this?');
    const confirmBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-footer .btn:last-child');
    expect(confirmBtn.textContent?.trim()).toBe('Remove');
    expect(confirmBtn.classList.contains('btn-danger')).toBe(true);
  });

  it('defaults to a non-danger, primary-styled confirm button', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    confirmService.ask({ message: 'Sure?' }).subscribe();
    fixture.detectChanges();

    const confirmBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-footer .btn:last-child');
    expect(confirmBtn.classList.contains('btn-primary')).toBe(true);
    expect(confirmBtn.classList.contains('btn-danger')).toBe(false);
  });

  it('resolves true and clears the dialog when the confirm button is clicked', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    let result: boolean | undefined;
    confirmService.ask({ message: 'Sure?' }).subscribe((confirmed) => (result = confirmed));
    fixture.detectChanges();

    const confirmBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-footer .btn:last-child');
    confirmBtn.click();
    fixture.detectChanges();

    expect(result).toBe(true);
    expect(fixture.nativeElement.querySelector('.modal-content')).toBeNull();
  });

  it('resolves false when the cancel button is clicked', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    let result: boolean | undefined;
    confirmService.ask({ message: 'Sure?' }).subscribe((confirmed) => (result = confirmed));
    fixture.detectChanges();

    const cancelBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-footer .btn-outline-secondary');
    cancelBtn.click();
    fixture.detectChanges();

    expect(result).toBe(false);
  });

  it('resolves false when the close (x) button is clicked', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    let result: boolean | undefined;
    confirmService.ask({ message: 'Sure?' }).subscribe((confirmed) => (result = confirmed));
    fixture.detectChanges();

    const closeBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-close');
    closeBtn.click();
    fixture.detectChanges();

    expect(result).toBe(false);
  });

  it('resolves false when the dialog itself (backdrop) is clicked', () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();

    let result: boolean | undefined;
    confirmService.ask({ message: 'Sure?' }).subscribe((confirmed) => (result = confirmed));
    fixture.detectChanges();

    const dialogEl: HTMLElement = fixture.nativeElement.querySelector('.confirm-dialog');
    dialogEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(result).toBe(false);
  });
});
