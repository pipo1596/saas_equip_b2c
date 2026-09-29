import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BreadcrumbCategory } from '../../core/catalog/breadcrumb';

// Renders "Home > ... > current" for both the product grid and product
// detail pages — same trail shape from either API (see
// `core/catalog/breadcrumb`), just a different "current" crumb:
//
// - Grid: pass only `items` (root first, current category last). The last
//   entry renders as the active, plain-text crumb; every earlier entry
//   links to that category's grid.
// - Detail: also pass `currentLabel` (the product's own title). Every entry
//   in `items` becomes a link, and the label is appended as the final
//   plain-text crumb.
//
// On mobile, everything between the first entry and the active/current one
// collapses behind a single "…" — done with plain CSS visibility classes
// rather than JS truncation, so the full trail stays in the DOM (and
// available to assistive tech) at every width.
@Component({
  selector: 'app-breadcrumb',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="breadcrumb">
      <ol class="breadcrumb mb-0">
        <li class="breadcrumb-item"><a routerLink="/home">Home</a></li>
        @if (firstCrumb(); as first) {
          <li class="breadcrumb-item">
            <a [routerLink]="['/products', first.progCatId]">{{ first.categoryName }}</a>
          </li>
        }
        @if (middleCrumbs().length > 0) {
          <li class="breadcrumb-item d-md-none" aria-hidden="true">&hellip;</li>
          @for (crumb of middleCrumbs(); track crumb.progCatId) {
            <li class="breadcrumb-item d-none d-md-block">
              <a [routerLink]="['/products', crumb.progCatId]">{{ crumb.categoryName }}</a>
            </li>
          }
        }
        @if (lastCrumb(); as last) {
          <li class="breadcrumb-item active" aria-current="page">{{ last.categoryName }}</li>
        }
        @if (currentLabel(); as label) {
          <li class="breadcrumb-item active" aria-current="page">{{ label }}</li>
        }
      </ol>
    </nav>
  `,
})
export class BreadcrumbNav {
  readonly items = input<readonly BreadcrumbCategory[]>([]);
  // Absent for the grid (the trail's own last entry is the active crumb);
  // the product's title for detail (every entry in `items` is then a link).
  readonly currentLabel = input<string | null>(null);

  // A single-entry trail with no `currentLabel` (e.g. browsing a top-level
  // category) has nothing to link to before the active crumb — `items[0]`
  // *is* that active crumb, rendered via `lastCrumb` instead.
  readonly firstCrumb = computed(() => {
    const items = this.items();
    if (items.length === 0 || (this.currentLabel() === null && items.length === 1)) {
      return null;
    }
    return items[0];
  });

  readonly lastCrumb = computed(() => {
    if (this.currentLabel() !== null) {
      return null;
    }
    const items = this.items();
    return items.length > 0 ? items[items.length - 1] : null;
  });

  readonly middleCrumbs = computed(() => {
    const items = this.items();
    const end = this.lastCrumb() ? items.length - 1 : items.length;
    return items.slice(1, end);
  });
}
