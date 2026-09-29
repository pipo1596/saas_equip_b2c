import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BreadcrumbCategory } from '../../core/catalog/breadcrumb';
import { BreadcrumbNav } from './breadcrumb-nav';

const CLOTHING: BreadcrumbCategory = { progCatId: 40, categoryName: 'Clothing' };
const SHIRTS: BreadcrumbCategory = { progCatId: 45, categoryName: 'Shirts' };
const POLOS: BreadcrumbCategory = { progCatId: 52, categoryName: 'Polos' };

function crumbTexts(fixture: { nativeElement: HTMLElement }): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.breadcrumb-item')).map((li) =>
    li.textContent?.trim(),
  ) as string[];
}

describe('BreadcrumbNav', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BreadcrumbNav],
      providers: [provideRouter([])],
    });
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(BreadcrumbNav);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('grid mode (no currentLabel)', () => {
    it('renders a single-entry trail as just the active crumb, no separate link', () => {
      const fixture = TestBed.createComponent(BreadcrumbNav);
      fixture.componentRef.setInput('items', [CLOTHING]);
      fixture.detectChanges();

      expect(crumbTexts(fixture)).toEqual(['Home', 'Clothing']);
      expect(fixture.nativeElement.querySelector('.breadcrumb-item.active')?.textContent?.trim()).toBe(
        'Clothing',
      );
      // A single entry is entirely the active crumb — nothing collapsible.
      expect(fixture.nativeElement.querySelector('[aria-hidden="true"]')).toBeNull();
    });

    it('renders a two-entry trail fully, with no ellipsis (nothing to collapse)', () => {
      const fixture = TestBed.createComponent(BreadcrumbNav);
      fixture.componentRef.setInput('items', [CLOTHING, SHIRTS]);
      fixture.detectChanges();

      expect(crumbTexts(fixture)).toEqual(['Home', 'Clothing', 'Shirts']);
      expect(fixture.nativeElement.querySelector('[aria-hidden="true"]')).toBeNull();
      const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll(
        '.breadcrumb-item a[href^="/products/"]',
      );
      expect(Array.from(links).map((a) => a.getAttribute('href'))).toEqual(['/products/40']);
    });

    it('collapses the middle entry behind an ellipsis for a three-entry trail', () => {
      const fixture = TestBed.createComponent(BreadcrumbNav);
      fixture.componentRef.setInput('items', [CLOTHING, SHIRTS, POLOS]);
      fixture.detectChanges();

      expect(crumbTexts(fixture)).toEqual(['Home', 'Clothing', '…', 'Shirts', 'Polos']);
      const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll(
        '.breadcrumb-item a[href^="/products/"]',
      );
      expect(Array.from(links).map((a) => a.getAttribute('href'))).toEqual([
        '/products/40',
        '/products/45',
      ]);
      // The collapsible middle entry is hidden on mobile, shown at md+ —
      // the ellipsis is the opposite.
      const shirtsLi = links[1]?.closest('li');
      expect(shirtsLi?.classList.contains('d-none')).toBe(true);
      expect(shirtsLi?.classList.contains('d-md-block')).toBe(true);
      const ellipsisLi = fixture.nativeElement.querySelector('[aria-hidden="true"]');
      expect(ellipsisLi?.classList.contains('d-md-none')).toBe(true);
      // The active (last) crumb is never hidden at any width.
      const activeLi = fixture.nativeElement.querySelector('.breadcrumb-item.active');
      expect(activeLi?.classList.contains('d-none')).toBe(false);
    });
  });

  describe('detail mode (with currentLabel)', () => {
    it('renders a single-entry trail as a link, with the title as the active crumb', () => {
      const fixture = TestBed.createComponent(BreadcrumbNav);
      fixture.componentRef.setInput('items', [POLOS]);
      fixture.componentRef.setInput('currentLabel', 'Station Polo');
      fixture.detectChanges();

      expect(crumbTexts(fixture)).toEqual(['Home', 'Polos', 'Station Polo']);
      const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
        '.breadcrumb-item a[href="/products/52"]',
      );
      expect(link).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.breadcrumb-item.active')?.textContent?.trim()).toBe(
        'Station Polo',
      );
    });

    it('turns every entry into a link and collapses all but the first behind an ellipsis', () => {
      const fixture = TestBed.createComponent(BreadcrumbNav);
      fixture.componentRef.setInput('items', [CLOTHING, SHIRTS, POLOS]);
      fixture.componentRef.setInput('currentLabel', 'Station Polo');
      fixture.detectChanges();

      expect(crumbTexts(fixture)).toEqual(['Home', 'Clothing', '…', 'Shirts', 'Polos', 'Station Polo']);
      const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll(
        '.breadcrumb-item a[href^="/products/"]',
      );
      // Every category is a link here, including the last one — only the
      // appended title itself is plain text.
      expect(Array.from(links).map((a) => a.getAttribute('href'))).toEqual([
        '/products/40',
        '/products/45',
        '/products/52',
      ]);
    });
  });
});
