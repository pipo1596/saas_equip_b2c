import { TestBed } from '@angular/core/testing';

import { AllotmentRule } from '../../core/cart/allotment';
import { AllotmentCoverageCard } from './coverage-card';

const BASE_RULE: AllotmentRule = {
  ruleId: 11,
  ruleName: 'Unit Allotment',
  allotType: 'UNITS',
  primaryUnit: 'UNITS',
  isBarRule: 'N',
  dollars: null,
  units: { total: 5, used: 2, inCart: 0, available: 3 },
  points: null,
  cycle: {
    renewalBasis: 'FIXED',
    renewalPeriodMonths: 12,
    cycleStart: '2026-09-09',
    cycleEnd: '2027-09-08',
    renewsOn: '2027-09-09',
    expirationDate: null,
    onExpiration: 'SUSPEND',
  },
  covers: {
    allAssortments: 'N',
    categories: [],
    unitGrants: [{ progCatId: 60, categoryName: 'Tactical', unitQty: 5 }],
  },
  carryover: { type: 'FORFEIT', pct: null, capAmount: null, carriedIn: null },
  quotas: [],
  requireApproval: 'N',
  allowCcFallback: 'N',
  fallbackRuleIds: [],
};

describe('AllotmentCoverageCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AllotmentCoverageCard] });
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AllotmentCoverageCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the rule name in the heading, and coverage + renewal in the subtitle', () => {
    const fixture = TestBed.createComponent(AllotmentCoverageCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.coverage-card__title')?.textContent?.trim()).toBe(
      'Covered by your Unit Allotment',
    );
    expect(fixture.nativeElement.querySelector('.coverage-card__subtitle')?.textContent?.trim()).toBe(
      'Tactical items only · Renews Sep 9, 2027',
    );
  });

  it('hides the renewal date when unknown', () => {
    const fixture = TestBed.createComponent(AllotmentCoverageCard);
    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      cycle: { ...BASE_RULE.cycle, cycleStart: null, cycleEnd: null, renewsOn: null },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.coverage-card__subtitle')?.textContent?.trim()).toBe(
      'Tactical items only',
    );
  });

  it("renders the rule's primary-unit balance", () => {
    const fixture = TestBed.createComponent(AllotmentCoverageCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();

    const values: HTMLElement[] = fixture.nativeElement.querySelectorAll('.balance-box__value');
    expect(Array.from(values).map((el) => el.textContent?.trim())).toEqual([
      '5 units',
      '2 units',
      '0 units',
      '3 units',
    ]);
  });

  it("scopes the subtitle and balance to the matching grant, not the rule's pooled total, once one is provided", () => {
    const fixture = TestBed.createComponent(AllotmentCoverageCard);
    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      covers: {
        allAssortments: 'N',
        categories: [],
        unitGrants: [
          { progCatId: 60, categoryName: 'Tactical', unitQty: 5 },
          { progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 1, reserved: 1, availableBeforeCart: 0 },
        ],
      },
    });
    fixture.componentRef.setInput('unitGrant', { progCatId: 310, categoryName: 'Cap', unitQty: 2, remaining: 1, reserved: 1, availableBeforeCart: 0 });
    fixture.componentRef.setInput('unitGrantBalance', { total: 2, used: 1, reserved: 1, inCart: 0, available: 0 });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.coverage-card__subtitle')?.textContent?.trim()).toBe(
      'Cap items only · Renews Sep 9, 2027',
    );
    const values: HTMLElement[] = fixture.nativeElement.querySelectorAll('.balance-box__value');
    expect(Array.from(values).map((el) => el.textContent?.trim())).toEqual([
      '2 units',
      '1 units',
      '0 units',
      '0 units',
    ]);
  });

  it("keeps the rule's pooled total for a non-units rule even if a grant is somehow passed in", () => {
    const fixture = TestBed.createComponent(AllotmentCoverageCard);
    const dollarRule: AllotmentRule = {
      ...BASE_RULE,
      allotType: 'DOLLAR',
      primaryUnit: 'DOLLARS',
      dollars: { total: 500, used: 0, inCart: 0, available: 500 },
      units: null,
    };
    fixture.componentRef.setInput('rule', dollarRule);
    fixture.componentRef.setInput('unitGrant', { progCatId: 310, categoryName: 'Cap', unitQty: 2 });
    fixture.componentRef.setInput('unitGrantBalance', { total: 2, used: 0, reserved: 0, inCart: 0, available: 2 });
    fixture.detectChanges();

    const values: HTMLElement[] = fixture.nativeElement.querySelectorAll('.balance-box__value');
    expect(Array.from(values).map((el) => el.textContent?.trim())).toEqual([
      '$500.00',
      '$0.00',
      '$0.00',
      '$500.00',
    ]);
  });

  it('emits viewRule when the "View rule" control is clicked', () => {
    const fixture = TestBed.createComponent(AllotmentCoverageCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();

    let emitted = false;
    fixture.componentInstance.viewRule.subscribe(() => (emitted = true));

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.coverage-card__view-rule');
    button.click();

    expect(emitted).toBe(true);
  });
});
