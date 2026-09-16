import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  CatalogProductsService,
  CategoryFacet,
  ColorFacet,
  Product,
  SizeFacet,
} from '../../../core/catalog/catalog-products';
import { LocationSelectionService } from '../../../core/location/location-selection';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 9;
const BUCKET_SLUGS = new Set(['clothing', 'footwear', 'gear']);

type CatalogScope =
  | { kind: 'category'; categoryId: number }
  | { kind: 'bucket'; bucket: string }
  | { kind: 'search'; search: string }
  | { kind: 'all' };

@Component({
  selector: 'app-product-list',
  imports: [Header, Footer, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-list.html',
  styleUrls: ['../../../shared/shared.css', './product-list.css'],
})
export class ProductList {
  private readonly catalogProductsService = inject(CatalogProductsService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Bound from the route: `categoryId` is the path param (a real category
  // id, one of the bucket slugs like "footwear", or "full-catalog"), `name`
  // the `?name=` query param the nav links pass along, and `q` the `?q=`
  // query param the header search box passes along instead.
  readonly categoryId = input('');
  readonly name = input('');
  readonly q = input('');

  readonly pageTitle = computed(() =>
    this.q() ? `Search results for "${this.q()}"` : this.name() || 'Category',
  );

  private readonly scope = computed<CatalogScope>(() => {
    const categoryId = this.categoryId();
    if (categoryId) {
      if (categoryId === 'full-catalog') {
        return { kind: 'all' };
      }
      if (BUCKET_SLUGS.has(categoryId)) {
        return { kind: 'bucket', bucket: categoryId.toUpperCase() };
      }
      const parsed = Number(categoryId);
      return Number.isFinite(parsed) ? { kind: 'category', categoryId: parsed } : { kind: 'all' };
    }
    const search = this.q();
    return search ? { kind: 'search', search } : { kind: 'all' };
  });

  readonly page = signal(1);
  readonly selectedSizes = signal<string[]>([]);
  readonly selectedColors = signal<string[]>([]);

  readonly products = signal<Product[]>([]);
  readonly totalCount = signal(0);
  readonly categoryFacets = signal<CategoryFacet[]>([]);
  readonly sizeFacets = signal<SizeFacet[]>([]);
  readonly colorFacets = signal<ColorFacet[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pageSize = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));

  // A new category/search/bucket always starts back at page 1 — only
  // reacts to the route-bound inputs, not the filter signals below (those
  // reset the page themselves, right where they change it).
  private readonly resetPageOnRouteChange = effect(() => {
    this.categoryId();
    this.q();
    this.page.set(1);
  });

  private readonly loadProductsOnQueryChange = effect(() => {
    const scope = this.scope();
    const sizes = this.selectedSizes();
    const colors = this.selectedColors();
    const page = this.page();
    const location = this.locationSelectionService.activeLocation();

    if (!location || !this.isBrowser) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.catalogProductsService
      .search({
        locationId: location.locationId,
        ...(scope.kind === 'category' ? { categoryId: scope.categoryId } : {}),
        ...(scope.kind === 'bucket' ? { bucket: scope.bucket } : {}),
        ...(scope.kind === 'search' ? { search: scope.search } : {}),
        sizes,
        colors,
        page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (result) => {
          this.products.set(result.products);
          this.totalCount.set(result.totalCount);
          this.categoryFacets.set(result.categoryFacets);
          this.sizeFacets.set(result.sizeFacets);
          this.colorFacets.set(result.colorFacets);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('We could not load products right now. Please try again.');
        },
      });
  });

  toggleSize(size: string): void {
    this.selectedSizes.update((sizes) =>
      sizes.includes(size) ? sizes.filter((value) => value !== size) : [...sizes, size],
    );
    this.page.set(1);
  }

  toggleColor(color: string): void {
    this.selectedColors.update((colors) =>
      colors.includes(color) ? colors.filter((value) => value !== color) : [...colors, color],
    );
    this.page.set(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) {
      return;
    }
    this.page.set(page);
  }
}
