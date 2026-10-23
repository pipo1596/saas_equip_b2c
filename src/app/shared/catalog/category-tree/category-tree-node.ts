import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogCategory, categoryProductCount } from '../../../core/catalog/catalog-view';

// One row of the sidebar category tree, recursing into its own children —
// `expandedIds`/`toggle` are threaded straight through from the root
// `CategoryTree` rather than owned here, so there's a single source of
// truth for which nodes are open no matter how deep this recurses.
@Component({
  selector: 'app-category-tree-node',
  imports: [RouterLink, CategoryTreeNode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-tree-node.html',
  styleUrl: './category-tree-node.css',
})
export class CategoryTreeNode {
  readonly category = input.required<CatalogCategory>();
  readonly activeCategoryId = input<number | null>(null);
  readonly expandedIds = input.required<ReadonlySet<number>>();
  readonly toggle = output<number>();

  // A parent's own `productCount` is never populated by the API — always
  // the rollup across every leaf underneath it.
  readonly productCount = computed(() => categoryProductCount(this.category()));
  readonly isExpanded = computed(() => this.expandedIds().has(this.category().progCatId));
  readonly isActive = computed(() => this.category().progCatId === this.activeCategoryId());
}
