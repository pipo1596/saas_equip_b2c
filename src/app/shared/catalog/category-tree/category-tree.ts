import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  CatalogCategory,
  CatalogMenu,
  categoryProductCount,
  collectCategoryIds,
  filterCategoryTree,
  findCategoryPath,
} from '../../../core/catalog/catalog-view';
import { CategoryTreeNode } from './category-tree-node';

// The three top-level sections, matching the header's own mega-menu tabs —
// `slug` is exactly what the route's `categoryId` param uses for a bucket
// scope (see `BUCKET_SLUGS` in `product-list.ts`).
const BUCKET_DEFS = [
  { slug: 'clothing', label: 'Clothing', id: -1 },
  { slug: 'footwear', label: 'Footwear', id: -2 },
  { slug: 'gear', label: 'Gear', id: -3 },
] as const;

interface BucketNode {
  slug: string;
  label: string;
  // Negative and fixed, never colliding with a real `progCatId` — lets a
  // bucket live in the same expanded-ids `Set<number>` as every other node.
  id: number;
  categories: CatalogCategory[];
  count: number;
}

// The product grid's left-sidebar "Shop by category" panel — a search box,
// an expand/collapse-all toggle, and the full category tree, top level
// first: the same three buckets (Clothing/Footwear/Gear) the header's own
// mega menu uses, each expanding into that bucket's own categories.
@Component({
  selector: 'app-category-tree',
  imports: [RouterLink, CategoryTreeNode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-tree.html',
  styleUrl: './category-tree.css',
})
export class CategoryTree {
  readonly menu = input<CatalogMenu | null>(null);
  readonly activeCategoryId = input<number | null>(null);
  // The route's own bucket slug (e.g. 'footwear') when that bucket itself
  // is the whole scope — `null` for a specific category, search, or the
  // full catalog.
  readonly activeBucket = input<string | null>(null);

  readonly query = signal('');

  // Manually toggled nodes — persists across a search, so clearing the
  // query goes back to exactly this rather than an empty tree.
  private readonly manuallyExpandedIds = signal<ReadonlySet<number>>(new Set());

  readonly buckets = computed<BucketNode[]>(() => {
    const menu = this.menu();
    if (!menu) {
      return [];
    }
    return BUCKET_DEFS.map((def) => {
      const categories = menu[def.slug];
      return {
        ...def,
        categories,
        count: categories.reduce((sum, category) => sum + categoryProductCount(category), 0),
      };
    });
  });

  // A bucket whose own label matches keeps its whole subtree unfiltered,
  // same "a direct match keeps everything below it" rule `filterCategoryTree`
  // applies one level down.
  readonly filteredBuckets = computed<BucketNode[]>(() => {
    const needle = this.query().trim().toLowerCase();
    return this.buckets().flatMap((bucket) => {
      if (!needle || bucket.label.toLowerCase().includes(needle)) {
        return [bucket];
      }
      const categories = filterCategoryTree(bucket.categories, needle);
      return categories.length > 0 ? [{ ...bucket, categories }] : [];
    });
  });

  // While searching, every node still showing needs to be open so a match
  // several levels deep is actually visible — on top of whatever's already
  // manually expanded.
  private readonly searchExpandedIds = computed(() => {
    if (!this.query().trim()) {
      return new Set<number>();
    }
    const ids = new Set<number>();
    for (const bucket of this.filteredBuckets()) {
      ids.add(bucket.id);
      for (const id of collectCategoryIds(bucket.categories)) {
        ids.add(id);
      }
    }
    return ids;
  });

  readonly expandedIds = computed(() => {
    const manual = this.manuallyExpandedIds();
    const search = this.searchExpandedIds();
    return search.size === 0 ? manual : new Set([...manual, ...search]);
  });

  private readonly allIds = computed(() =>
    this.buckets().flatMap((bucket) => [bucket.id, ...collectCategoryIds(bucket.categories)]),
  );
  readonly isAllExpanded = computed(() => {
    const all = this.allIds();
    return all.length > 0 && all.every((id) => this.manuallyExpandedIds().has(id));
  });

  // Expands the bucket (and every ancestor within it) that either is the
  // active scope itself, or contains the active category — so landing
  // directly on a bucket or category page shows it already in place instead
  // of collapsed under an unopened "Clothing"/"Footwear"/"Gear".
  private readonly autoExpandActivePath = effect(() => {
    const activeId = this.activeCategoryId();
    const activeBucketSlug = this.activeBucket();
    const buckets = this.buckets();
    if (buckets.length === 0) {
      return;
    }

    const idsToExpand: number[] = [];

    const activeBucketNode = activeBucketSlug
      ? buckets.find((bucket) => bucket.slug === activeBucketSlug)
      : undefined;
    if (activeBucketNode) {
      idsToExpand.push(activeBucketNode.id);
    }

    if (activeId !== null) {
      for (const bucket of buckets) {
        const path = findCategoryPath(bucket.categories, activeId);
        if (path) {
          idsToExpand.push(bucket.id, ...path.slice(0, -1).map((category) => category.progCatId));
          break;
        }
      }
    }

    if (idsToExpand.length > 0) {
      this.manuallyExpandedIds.update((current) => new Set([...current, ...idsToExpand]));
    }
  });

  onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  toggleNode(id: number): void {
    this.manuallyExpandedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  toggleExpandAll(): void {
    this.manuallyExpandedIds.set(this.isAllExpanded() ? new Set() : new Set(this.allIds()));
  }
}
