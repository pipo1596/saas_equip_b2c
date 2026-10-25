import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  Announcement,
  AnnouncementsService,
  NoticeLink,
  noticeLink,
} from '../../core/announcements/announcements';
import { AccountNav } from '../../shared/account-nav/account-nav';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

@Component({
  selector: 'app-announcements-page',
  imports: [Header, Footer, RouterLink, AccountNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcements-page.html',
  styleUrls: ['../../shared/shared.css', './announcements-page.css'],
})
export class AnnouncementsPage implements OnInit {
  private readonly announcementsService = inject(AnnouncementsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Set when the page is opened from the home banner's "ANNOUNCE" link, to
  // pre-select that item instead of defaulting to nothing open.
  readonly noticeId = input('');

  readonly loading = signal(false);
  readonly notices = signal<Announcement[]>([]);
  // `null` = nothing expanded. Selection is a single index into the full
  // (current + previous) list — matching the design's "N of M" counter and
  // older/newer steppers, which walk the whole list, not just "previous".
  readonly selectedIndex = signal<number | null>(null);

  readonly current = computed(() => this.notices()[0] ?? null);
  readonly previous = computed(() => this.notices().slice(1));
  readonly count = computed(() => this.notices().length);

  private readonly idx = computed(() => this.selectedIndex() ?? -1);
  readonly position = computed(() => (this.idx() >= 0 ? this.idx() + 1 : null));
  readonly atStart = computed(() => this.idx() <= 0);
  readonly atEnd = computed(() => this.idx() < 0 || this.idx() >= this.notices().length - 1);

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.loading.set(true);
    this.announcementsService.archive().subscribe((notices) => {
      this.loading.set(false);
      this.notices.set(notices);

      const wanted = Number(this.noticeId());
      const index = wanted ? notices.findIndex((n) => n.noticeId === wanted) : -1;
      this.selectedIndex.set(index >= 0 ? index : null);
    });
  }

  isOpen(index: number): boolean {
    return this.selectedIndex() === index;
  }

  toggle(index: number): void {
    this.selectedIndex.set(this.isOpen(index) ? null : index);
  }

  goNewer(): void {
    const index = this.selectedIndex();
    const next = index === null ? 0 : index - 1;
    if (next >= 0 && this.notices()[next]) {
      this.selectedIndex.set(next);
    }
  }

  goOlder(): void {
    const index = this.selectedIndex();
    const next = index === null ? 0 : index + 1;
    if (this.notices()[next]) {
      this.selectedIndex.set(next);
    }
  }

  // The ANNOUNCE link type isn't shown here — it would just point back at
  // the page the shopper is already on.
  actionLink(notice: Announcement): NoticeLink | null {
    return noticeLink(notice, { excludeAnnounce: true });
  }
}
