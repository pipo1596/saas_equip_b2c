import { TestBed } from '@angular/core/testing';

import { Balance } from '../../core/cart/allotment';
import { AllotmentBalanceBox } from './balance-box';

describe('AllotmentBalanceBox', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AllotmentBalanceBox] });
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AllotmentBalanceBox);
    fixture.componentRef.setInput('balance', { total: 600, used: 180, inCart: 95, available: 325 });
    fixture.componentRef.setInput('unit', 'DOLLARS');
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders each figure formatted in the given unit', () => {
    const fixture = TestBed.createComponent(AllotmentBalanceBox);
    fixture.componentRef.setInput('balance', { total: 5, used: 2, inCart: 0, available: 3 });
    fixture.componentRef.setInput('unit', 'UNITS');
    fixture.detectChanges();

    const values: HTMLElement[] = fixture.nativeElement.querySelectorAll('.balance-box__value');
    expect(Array.from(values).map((el) => el.textContent?.trim())).toEqual([
      '5 units',
      '2 units',
      '0 units',
      '3 units',
    ]);
  });

  it('flags a negative available balance as warning and a non-negative one as good', () => {
    const fixture = TestBed.createComponent(AllotmentBalanceBox);
    const balance: Balance = { total: 600, used: 580, inCart: 95, available: -75 };
    fixture.componentRef.setInput('balance', balance);
    fixture.componentRef.setInput('unit', 'DOLLARS');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.balance-box__value--warn')?.textContent).toContain(
      '-$75.00',
    );
    expect(fixture.nativeElement.querySelector('.balance-box__value--good')).toBeNull();

    fixture.componentRef.setInput('balance', { ...balance, available: 25 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.balance-box__value--good')?.textContent).toContain(
      '$25.00',
    );
  });
});
