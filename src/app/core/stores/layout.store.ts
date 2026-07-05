import { signal, effect, Injectable } from '@angular/core';

const MOBILE_BREAKPOINT = 820;

@Injectable({ providedIn: 'root' })
export class LayoutStore {
  readonly isMobile = signal<boolean>(this.detectMobile());
  readonly sidebarOpen = signal<boolean>(false);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }

    effect(() => {
      if (!this.isMobile() && this.sidebarOpen()) {
        this.sidebarOpen.set(false);
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  private onResize = (): void => {
    this.isMobile.set(this.detectMobile());
  };

  private detectMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }
}
