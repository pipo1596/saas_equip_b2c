import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { CatalogCategory, CatalogMenu } from '../../../core/catalog/catalog-view';
import { CategoryTree } from './category-tree';

const LEAF_A: CatalogCategory = {
  progCatId: 2,
  parentProgCatId: 1,
  categoryName: 'Long Sleeve',
  sortOrder: 0,
  status: 'ACTIVE',
  productCount: 14,
  children: [],
};
const LEAF_B: CatalogCategory = {
  progCatId: 3,
  parentProgCatId: 1,
  categoryName: 'Short Sleeve',
  sortOrder: 1,
  status: 'ACTIVE',
  productCount: 14,
  children: [],
};
const UNIFORM: CatalogCategory = {
  progCatId: 1,
  parentProgCatId: null,
  categoryName: 'Uniform',
  sortOrder: 0,
  status: 'ACTIVE',
  productCount: 0,
  children: [LEAF_A, LEAF_B],
};
const MENU: CatalogMenu = { clothing: [UNIFORM], footwear: [], gear: [] };

describe('CategoryTree', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryTree],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  function linkNames(fixture: { nativeElement: HTMLElement }): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.category-tree__link')).map(
      (link) => link.querySelector('span')!.textContent!.trim(),
    );
  }

  it("shows the three buckets (matching the header's own mega menu) collapsed by default, with Clothing's rollup count", () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual(['Clothing', 'Footwear', 'Gear']);
    const badge = fixture.nativeElement.querySelector('.category-tree__link .badge');
    expect(badge?.textContent?.trim()).toBe('28');
  });

  it("doesn't render a toggle for an empty bucket", () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.category-tree__toggle').length).toBe(1);
  });

  it('includes the bucket label as a `name` query param on the bucket link, same as every other category link', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.category-tree__link');
    expect(link.getAttribute('href')).toBe('/products/clothing?name=Clothing');
  });

  it("highlights the Clothing bucket link itself when that bucket is the whole scope", () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.componentRef.setInput('activeBucket', 'clothing');
    fixture.detectChanges();

    const active = fixture.nativeElement.querySelector('.category-tree__link--active');
    expect(active?.querySelector('span')?.textContent?.trim()).toBe('Clothing');
  });

  it('expands a bucket on click to reveal its categories', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.category-tree__toggle');
    toggle.click();
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Footwear', 'Gear']);
  });

  it('auto-expands and highlights the path to the active category on load', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.componentRef.setInput('activeCategoryId', 2);
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual([
      'Clothing',
      'Uniform',
      'Long Sleeve',
      'Short Sleeve',
      'Footwear',
      'Gear',
    ]);
    const active = fixture.nativeElement.querySelector('.category-tree__link--active');
    expect(active?.querySelector('span')?.textContent?.trim()).toBe('Long Sleeve');
  });

  it('expands and collapses every node via the "Expand all"/"Collapse all" toggle', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const toggleAll: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((btn): btn is HTMLButtonElement => (btn as HTMLButtonElement).textContent?.includes('Expand all') ?? false)!;
    toggleAll.click();
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual([
      'Clothing',
      'Uniform',
      'Long Sleeve',
      'Short Sleeve',
      'Footwear',
      'Gear',
    ]);
    expect(toggleAll.textContent?.trim()).toBe('Collapse all');

    toggleAll.click();
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual(['Clothing', 'Footwear', 'Gear']);
  });

  it('filters the tree by name, keeping the whole subtree below a direct match', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = 'uniform';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Long Sleeve', 'Short Sleeve']);
  });

  it('keeps a whole bucket unfiltered when the bucket label itself matches', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = 'cloth';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Long Sleeve', 'Short Sleeve']);
  });

  it('filters down to just the branch leading to a matching leaf', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = 'long';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Long Sleeve']);
  });

  it('shows a "no matching categories" message when nothing matches', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = 'nonexistent';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No matching categories.');
  });

  it('keeps a manually expanded node open after a search is cleared', () => {
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', MENU);
    fixture.detectChanges();

    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.category-tree__toggle');
    toggle.click();
    fixture.detectChanges();
    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Footwear', 'Gear']);

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = 'short';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Short Sleeve']);

    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Footwear', 'Gear']);
  });

  it('skips a bucket\'s own category when it duplicates the bucket\'s own name, showing its children directly', () => {
    const duplicateWrapper: CatalogCategory = {
      progCatId: 50,
      parentProgCatId: null,
      categoryName: 'Clothing',
      sortOrder: 0,
      status: 'ACTIVE',
      productCount: 0,
      children: [UNIFORM],
    };
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', { clothing: [duplicateWrapper], footwear: [], gear: [] });
    fixture.detectChanges();

    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.category-tree__toggle');
    toggle.click();
    fixture.detectChanges();

    // "Clothing" (the bucket) expands straight to "Uniform" — the
    // duplicate-named wrapper category in between never shows.
    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Footwear', 'Gear']);
    const badge = fixture.nativeElement.querySelector('.category-tree__link .badge');
    expect(badge?.textContent?.trim()).toBe('28');
  });

  it('also skips a bucket\'s own category named "Apparel", treating it as equivalent to "Clothing"', () => {
    const apparelWrapper: CatalogCategory = {
      progCatId: 50,
      parentProgCatId: null,
      categoryName: 'Apparel',
      sortOrder: 0,
      status: 'ACTIVE',
      productCount: 0,
      children: [UNIFORM],
    };
    const fixture = TestBed.createComponent(CategoryTree);
    fixture.componentRef.setInput('menu', { clothing: [apparelWrapper], footwear: [], gear: [] });
    fixture.detectChanges();

    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.category-tree__toggle');
    toggle.click();
    fixture.detectChanges();

    expect(linkNames(fixture)).toEqual(['Clothing', 'Uniform', 'Footwear', 'Gear']);
  });
});
