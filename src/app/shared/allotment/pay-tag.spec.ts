import { TestBed } from '@angular/core/testing';

import { PayTagBadge } from './pay-tag';

describe('PayTagBadge', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PayTagBadge] });
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(PayTagBadge);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders nothing when there is no tag', () => {
    const fixture = TestBed.createComponent(PayTagBadge);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.pay-tag')).toBeNull();
  });

  it('renders nothing when the tag has a null label (nothing covers this item)', () => {
    const fixture = TestBed.createComponent(PayTagBadge);
    fixture.componentRef.setInput('tag', { ruleId: null, payUnit: null, tagLabel: null });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.pay-tag')).toBeNull();
  });

  it('renders a dollar tag with no special modifier class', () => {
    const fixture = TestBed.createComponent(PayTagBadge);
    fixture.componentRef.setInput('tag', { ruleId: 11, payUnit: 'DOLLARS', tagLabel: '$ allotment' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement.querySelector('.pay-tag');
    expect(el.textContent?.trim()).toBe('$ allotment');
    expect(el.classList.contains('pay-tag--units')).toBe(false);
    expect(el.classList.contains('pay-tag--points')).toBe(false);
  });

  it('renders a units tag with the units modifier class', () => {
    const fixture = TestBed.createComponent(PayTagBadge);
    fixture.componentRef.setInput('tag', { ruleId: 12, payUnit: 'UNITS', tagLabel: 'uses units' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement.querySelector('.pay-tag');
    expect(el.textContent?.trim()).toBe('uses units');
    expect(el.classList.contains('pay-tag--units')).toBe(true);
  });

  it('renders a points tag with the points modifier class', () => {
    const fixture = TestBed.createComponent(PayTagBadge);
    fixture.componentRef.setInput('tag', { ruleId: 13, payUnit: 'POINTS', tagLabel: 'uses points' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement.querySelector('.pay-tag');
    expect(el.textContent?.trim()).toBe('uses points');
    expect(el.classList.contains('pay-tag--points')).toBe(true);
  });
});
