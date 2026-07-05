import { Injectable, signal } from '@angular/core';

export interface Crumb {
  label: string;
  /** Optional router link (commands array) — non-last crumbs become links. */
  link?: any[];
}

/**
 * Lets a page override the topbar breadcrumb with a custom trail (e.g. the
 * payment detail page: Payments → Detail 41811 - Marshall Carroll (b20b…)).
 * Pages set() on load and clear() on destroy; when empty, the topbar derives a
 * single crumb from the route.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbStore {
  readonly trail = signal<Crumb[]>([]);

  set(trail: Crumb[]): void {
    this.trail.set(trail);
  }

  clear(): void {
    this.trail.set([]);
  }
}
