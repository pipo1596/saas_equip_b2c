// Shared by both the product grid (`APCTPCVEW *PRODUCTS`) and product detail
// (`APCPRDDTL *GET`) APIs — same shape from either endpoint, so one set of
// types (and one rendering component, see `shared/breadcrumb`) covers both.

// One node in the category trail, root first. Neither endpoint includes the
// current page's own label here (a category name for the grid, a product
// title for detail) — that's added on separately by whichever page renders
// it.
export interface BreadcrumbCategory {
  progCatId: number;
  categoryName: string;
}

export interface Breadcrumb {
  programId: number;
  programName: string;
  // The category currently being browsed/the product's own category — the
  // same as the last entry in `breadcrumb`, or `null` when the trail itself
  // is empty (e.g. the category/product isn't visible in this location's
  // view, an old or shared link).
  progCatId: number | null;
  breadcrumb: BreadcrumbCategory[];
}

export interface RawBreadcrumb {
  programId: number;
  programName: string;
  progCatId: number | null;
  breadcrumb: BreadcrumbCategory[] | null;
}

// The live API sometimes sends `null` for the inner trail instead of `[]` —
// normalize once here so nothing downstream has to defensively null-check
// it. The outer object itself staying `null` is left alone: that's a real,
// meaningful "nothing to show" state (see `hasCrumbs`), not something to
// paper over.
export function normalizeBreadcrumb(raw: RawBreadcrumb | null | undefined): Breadcrumb | null {
  return raw ? { ...raw, breadcrumb: raw.breadcrumb ?? [] } : null;
}

// True only when there's an actual trail worth rendering — a `null`
// breadcrumb (unscoped, bucket-scoped, or the lookup failed) and an empty
// trail (the category/product isn't in this location's view) both mean the
// same thing to the UI: nothing to show.
export function hasCrumbs(breadcrumb: Breadcrumb | null): breadcrumb is Breadcrumb {
  return breadcrumb !== null && breadcrumb.breadcrumb.length > 0;
}
