// `APCTPCNTC` — the storefront (read-only) half of home page notices.
// Notices are authored on the backend through `APITPCNTC` (a separate,
// admin-only API); tenant/customer/employee identity comes entirely from
// the session, never the request body. A failure here must never block the
// home page or the Announcements page, so both calls resolve to an empty
// result (`null`/`[]`) rather than erroring the subscription.

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';

export type NoticeStyle = 'INFO' | 'IMPORTANT' | 'URGENT';
export type NoticeLinkType = 'ANNOUNCE' | 'CATEGORY' | 'PRODUCT' | 'EXTERNAL' | 'NONE';

export interface NoticeLinkFields {
  noticeId: number;
  linkType: NoticeLinkType;
  linkText: string | null;
  linkProgCatId: number | null;
  linkProductPk: number | null;
  linkUrl: string | null;
}

export interface NoticeBanner extends NoticeLinkFields {
  message: string;
  style: NoticeStyle;
}

export interface Announcement extends NoticeLinkFields {
  date: string;
  category: string | null;
  title: string;
  excerpt: string;
  body: string | null;
  postedBy: string | null;
  isLive: 'Y' | 'N';
  isEnded: 'Y' | 'N';
}

interface BannerResponse {
  banner: NoticeBanner | null;
}

interface ArchiveResponse {
  data: Announcement[];
}

interface NoticeApiError {
  success: false;
  message: string;
}

export interface NoticeLink {
  kind: 'route' | 'external';
  label: string;
  routerLink?: readonly unknown[];
  queryParams?: Record<string, unknown>;
  href?: string;
}

/**
 * Where a notice's link/action button should go, or `null` to hide it.
 * `excludeAnnounce` suppresses an `ANNOUNCE` link on the Announcements page
 * itself, which would otherwise just point back at the page it's already on.
 */
export function noticeLink(
  notice: NoticeLinkFields,
  options?: { excludeAnnounce?: boolean },
): NoticeLink | null {
  if (notice.linkType === 'NONE' || !notice.linkText) {
    return null;
  }
  switch (notice.linkType) {
    case 'ANNOUNCE':
      return options?.excludeAnnounce
        ? null
        : {
            kind: 'route',
            label: notice.linkText,
            routerLink: ['/announcements'],
            queryParams: { noticeId: notice.noticeId },
          };
    case 'CATEGORY':
      return notice.linkProgCatId != null
        ? { kind: 'route', label: notice.linkText, routerLink: ['/products', notice.linkProgCatId] }
        : null;
    case 'PRODUCT':
      return notice.linkProductPk != null
        ? { kind: 'route', label: notice.linkText, routerLink: ['/product', notice.linkProductPk] }
        : null;
    case 'EXTERNAL':
      return notice.linkUrl ? { kind: 'external', label: notice.linkText, href: notice.linkUrl } : null;
    default:
      return null;
  }
}

/** Maps a notice's style to the blue/amber/red banner treatment; `''` for INFO (the default look). */
export function noticeStyleClass(style: NoticeStyle): string {
  if (style === 'IMPORTANT') {
    return 'notice--important';
  }
  if (style === 'URGENT') {
    return 'notice--urgent';
  }
  return '';
}

@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPCNTC`;

  /**
   * The one banner this employee should see right now, or `null` when
   * there's none — called once per home page visit; never cached, since
   * start/end times can move a notice in or out between visits.
   */
  banner(): Observable<NoticeBanner | null> {
    return this.http.post<BannerResponse | NoticeApiError>(this.dispatchUrl, { action: '*BANNER' }).pipe(
      map((res) => {
        if ('success' in res) {
          console.error('Failed to load the home page banner:', res.message);
          return null;
        }
        return res.banner;
      }),
      catchError(() => of(null)),
    );
  }

  /** Every announcement this employee can see, newest first. */
  archive(): Observable<Announcement[]> {
    return this.http.post<ArchiveResponse | NoticeApiError>(this.dispatchUrl, { action: '*ARCHIVE' }).pipe(
      map((res) => {
        if ('success' in res) {
          console.error('Failed to load announcements:', res.message);
          return [];
        }
        return res.data;
      }),
      catchError(() => of([])),
    );
  }
}
