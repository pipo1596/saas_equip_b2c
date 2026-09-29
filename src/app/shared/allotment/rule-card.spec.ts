import { TestBed } from '@angular/core/testing';

import { AllotmentRule } from '../../core/cart/allotment';
import { AllotmentRuleCard } from './rule-card';

const BASE_RULE: AllotmentRule = {
  ruleId: 11,
  ruleName: 'ANB Employee Allowance',
  allotType: 'DOLLAR',
  primaryUnit: 'DOLLARS',
  isBarRule: 'Y',
  dollars: { total: 600, used: 180, inCart: 95, available: 325 },
  units: null,
  points: null,
  cycle: {
    renewalBasis: 'FIXED',
    renewalPeriodMonths: 12,
    cycleStart: '2026-01-01',
    cycleEnd: '2026-12-31',
    renewsOn: '2027-01-01',
    expirationDate: null,
    onExpiration: 'SUSPEND',
  },
  covers: { allAssortments: 'Y', categories: [], unitGrants: [] },
  carryover: { type: 'FORFEIT', pct: null, capAmount: null, carriedIn: null },
  quotas: [],
  requireApproval: 'N',
  allowCcFallback: 'N',
  fallbackRuleIds: [],
};

function facts(fixture: { nativeElement: HTMLElement }): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.rule-card__facts li')).map(
    (li) => li.textContent?.trim() ?? '',
  );
}

describe('AllotmentRuleCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AllotmentRuleCard] });
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it("shows the rule's own name, not the bar's generic label", () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rule-card__name')?.textContent?.trim()).toBe(
      'ANB Employee Allowance',
    );
  });

  it('shows the renewal date in the header row, and hides it when unknown', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rule-card__renews')?.textContent).toContain(
      'Renews Jan 1, 2027',
    );

    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      cycle: { ...BASE_RULE.cycle, cycleStart: null, cycleEnd: null, renewsOn: null },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rule-card__renews')).toBeNull();
  });

  it('summarizes the primary balance, its cycle, and an all-assortments coverage in one line', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rule-card__summary')?.textContent?.trim()).toBe(
      '$600.00 every 12 months · Any item in the catalog',
    );
  });

  it('summarizes specific categories and unit grants in the coverage half of the summary', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      primaryUnit: 'UNITS',
      units: { total: 5, used: 2, inCart: 0, available: 3 },
      covers: {
        allAssortments: 'N',
        categories: [],
        unitGrants: [{ progCatId: 60, categoryName: 'Tactical', unitQty: 5 }],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rule-card__summary')?.textContent?.trim()).toBe(
      '5 units every 12 months · Tactical items only',
    );
  });

  it('renders one balance-box row per non-null balance, each in its own unit', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      allotType: 'DOLLAR_UNITS',
      units: { total: 4, used: 1, inCart: 1, available: 2 },
    });
    fixture.detectChanges();

    const boxes: HTMLElement[] = fixture.nativeElement.querySelectorAll('.rule-card__balance-box');
    expect(boxes.length).toBe(2);
    expect(boxes[0].textContent).toContain('$600.00');
    expect(boxes[1].textContent).toContain('2 units');
  });

  it('flags a negative available balance for warning styling, and a non-negative one as good', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      dollars: { total: 600, used: 580, inCart: 95, available: -75 },
    });
    fixture.detectChanges();

    const warnFigure = fixture.nativeElement.querySelector('.balance-box__value--warn');
    expect(warnFigure?.textContent?.trim()).toContain('-$75.00');
    expect(fixture.nativeElement.querySelector('.balance-box__value--good')).toBeNull();

    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.balance-box__value--good')?.textContent).toContain(
      '$325.00',
    );
  });

  it.each([
    [{ type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null }, 'Carryover: No carryover'],
    [
      { type: 'PARTIAL' as const, pct: 25, capAmount: 150, carriedIn: 0 },
      'Carryover: 25% carries over (up to $150)',
    ],
    [
      { type: 'FULL' as const, pct: null, capAmount: null, carriedIn: 40 },
      'Carryover: Full balance carries over · incl. $40 carried in',
    ],
  ])('summarizes carryover %#: %s', (carryover, expected) => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', { ...BASE_RULE, carryover });
    fixture.detectChanges();

    expect(facts(fixture)).toContain(expected);
  });

  it('lists quotas on one line, only when there are any', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();
    expect(facts(fixture).some((f) => f.startsWith('Quota limits:'))).toBe(false);

    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      quotas: [
        {
          quotaId: 4,
          programId: 3,
          programName: 'ANB Standard Program',
          progCatId: 45,
          categoryName: 'Shirts',
          limitType: 'UNITS' as const,
          limitValue: 6,
        },
      ],
    });
    fixture.detectChanges();
    expect(facts(fixture)).toContain('Quota limits: 6 units max · Shirts (ANB Standard Program)');
  });

  it('falls back to "All categories" for a quota with no category', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      quotas: [
        {
          quotaId: 5,
          programId: 3,
          programName: 'ANB Standard Program',
          progCatId: null,
          categoryName: null,
          limitType: 'DOLLARS' as const,
          limitValue: 100,
        },
      ],
    });
    fixture.detectChanges();

    expect(facts(fixture)).toContain('Quota limits: 100 dollars max · All categories (ANB Standard Program)');
  });

  it('consolidates approval and card-fallback into a single "Approval:" line', () => {
    const fixture = TestBed.createComponent(AllotmentRuleCard);
    fixture.componentRef.setInput('rule', BASE_RULE);
    fixture.detectChanges();
    expect(facts(fixture).some((f) => f.startsWith('Approval:'))).toBe(false);

    fixture.componentRef.setInput('rule', { ...BASE_RULE, requireApproval: 'Y' });
    fixture.detectChanges();
    expect(facts(fixture)).toContain('Approval: Orders need approval');

    fixture.componentRef.setInput('rule', { ...BASE_RULE, allowCcFallback: 'Y' });
    fixture.detectChanges();
    expect(facts(fixture)).toContain('Approval: Personal card can cover the rest');

    fixture.componentRef.setInput('rule', {
      ...BASE_RULE,
      requireApproval: 'Y',
      allowCcFallback: 'Y',
    });
    fixture.detectChanges();
    expect(facts(fixture)).toContain('Approval: Orders need approval; personal card can cover the rest');
  });
});
