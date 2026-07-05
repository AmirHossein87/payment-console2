import {
  Component,
  computed,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { SettingsStore } from '@core/stores/settings.store';
import { PaymentIconService } from '@core/services/payment-icon.service';

/**
 * Shape of the logo box.
 * - `square`   : sharp 4px corners
 * - `rounded`  : soft corners (~22% of the size) — default
 * - `circle`   : fully round
 * - `pill`     : fully round (alias, kept for semantic clarity)
 */
export type ProviderLogoShape = 'square' | 'rounded' | 'circle' | 'pill';

/**
 * Where the provider name sits relative to the logo.
 * - `right`   : inline to the right (default)
 * - `bottom`  : stacked under the logo
 * - `overlay` : rendered over the bottom of the logo box with a gradient
 */
export type ProviderLogoNamePosition = 'right' | 'bottom' | 'overlay';

/**
 * Fallback strategy when no icon is available (or it fails to load).
 * - `initial` : the first letter of the provider name (default)
 * - `icon`    : a Material Symbols glyph (see `fallbackIcon`)
 * - `none`    : render nothing inside the box
 */
export type ProviderLogoFallback = 'initial' | 'icon' | 'none';

export type ProviderLogoBadgeTone =
  | 'ok'
  | 'info'
  | 'warn'
  | 'bad'
  | 'muted'
  | 'violet'
  | 'brand';

export type ProviderLogoBadgePosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface ProviderLogoBadge {
  text?: string;
  tone?: ProviderLogoBadgeTone;
  position?: ProviderLogoBadgePosition;
  /** Render a small status dot instead of text. */
  dot?: boolean;
}

/**
 * Expected shape of the bound `provider` source. Accepted as `any` at the
 * input boundary so any NSwag-generated provider type can be passed straight
 * through without adapter boilerplate.
 */
export interface ProviderLogoSource {
  provider?: string;
  name?: string;
  /** Light-theme icon URI. */
  iconUri1?: string | null;
  /** Dark-theme icon URI. */
  iconUri2?: string | null;
}

/**
 * ProviderLogoComponent — the single, flexible base component for rendering a
 * provider / brand logo or icon anywhere in the console.
 *
 * It is theme-aware (iconUri1 = light, iconUri2 = dark), supports any image
 * format (SVG is inlined as a base64 data URI by `PaymentIconService` so blob
 * storage's non-image content-type never breaks <img>), and degrades gracefully
 * to a letter / glyph fallback.
 *
 * Variants (all optional, backward compatible):
 *  - `size`          : pixel size of the logo box (default 44)
 *  - `shape`         : square | rounded | circle | pill
 *  - `wide`          : borderless wordmark mode (logo fills width, no box)
 *  - `showName`      : render the provider name next to / under the logo
 *  - `namePosition`  : right | bottom | overlay
 *  - `fallback`      : initial | icon | none  (when no icon resolves)
 *  - `fallbackIcon`  : Material Symbols glyph for the `icon` fallback
 *  - `badge`         : corner status badge ({ text, tone, position, dot } or string)
 *  - `ring`          : emphasise the box with a brand ring
 *  - `shadow`        : drop a soft shadow under the box
 *  - `bg`            : fill the box with the surface colour (default true)
 *  - `bordered`      : draw a border around the box (default false; opt-in)
 *  - `loading`       : skeleton shimmer placeholder
 *  - `interactive`   : hover lift + pointer cursor
 *  - `alt` / `titleText` : accessibility overrides
 *
 * Performance:
 *  - `OnPush` change detection driven entirely by signals.
 *  - The icon HTTP request is cached + shared per URI in `PaymentIconService`
 *    and cancelled automatically on theme/provider change via `switchMap`.
 *  - All presentation values are derived through `computed`, so a re-render
 *    only happens when an input actually changes.
 */
@Component({
  selector: 'app-provider-logo',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (provider()) {
      <span
        class="pl"
        [ngClass]="rootClasses()"
        [style]="logoVars()"
        [attr.title]="titleText() || name() || null"
        [attr.role]="a11yRole()"
        [attr.aria-label]="a11yLabel()"
      >
        <span class="pl-logo" [ngClass]="logoClasses()">
          @if (loading() || resolving()) {
            <span class="pl-skeleton"></span>
          } @else if (icon() && !failed()) {
            <img
              class="pl-img"
              [src]="icon()"
              [alt]="alt() || name()"
              loading="lazy"
              (error)="failed.set(true)"
            />
          } @else {
            @switch (fallback()) {
              @case ('icon') {
                <span class="material-symbols-outlined pl-fallback-ico">
                  {{ fallbackIcon() }}
                </span>
              }
              @case ('none') {
                <!-- empty fallback -->
              }
              @default {
                <span class="pl-init">
                  {{ wide() ? (name() || '?') : initial() }}
                </span>
              }
            }
          }

          @if (badgeData(); as b) {
            <span
              class="pl-badge"
              [ngClass]="badgeClasses(b)"
              [class.pl-badge--dot]="!!b.dot"
            >
              @if (!b.dot && b.text) {
                {{ b.text }}
              }
            </span>
          }

          @if (showName() && !wide() && namePosition() === 'overlay' && name()) {
            <span class="pl-name pl-name--overlay">{{ name() }}</span>
          }
        </span>

        @if (showName() && !wide() && namePosition() !== 'overlay' && name()) {
          <span
            class="pl-name"
            [class.pl-name--bottom]="namePosition() === 'bottom'"
          >
            {{ name() }}
          </span>
        }
      </span>
    }
  `,
  styleUrls: ['./provider-logo.component.scss'],
})
export class ProviderLogoComponent {
  // ── Source ────────────────────────────────────────────────────────────
  /** Any object exposing `iconUri1` / `iconUri2` and a `provider` / `name`. */
  readonly provider = input<ProviderLogoSource | any>(null);

  // ── Sizing ────────────────────────────────────────────────────────────
  /** Pixel size of the logo box (height in `wide` wordmark mode). */
  readonly size = input<number>(44);

  // ── Shape ─────────────────────────────────────────────────────────────
  readonly shape = input<ProviderLogoShape>('rounded');

  // ── Layout / variant ──────────────────────────────────────────────────
  /** Borderless wordmark mode (logo fills width, no surrounding box). */
  readonly wide = input<boolean>(false);

  // ── Name ──────────────────────────────────────────────────────────────
  readonly showName = input<boolean>(true);
  readonly namePosition = input<ProviderLogoNamePosition>('right');

  // ── Fallback ──────────────────────────────────────────────────────────
  readonly fallback = input<ProviderLogoFallback>('initial');
  /** Material Symbols glyph used when `fallback === 'icon'`. */
  readonly fallbackIcon = input<string>('image');

  // ── Visual chrome ─────────────────────────────────────────────────────
  readonly ring = input<boolean>(false);
  readonly shadow = input<boolean>(false);
  readonly bg = input<boolean>(true);
  readonly bordered = input<boolean>(false);

  // ── Badge overlay ─────────────────────────────────────────────────────
  /** Corner status badge. Pass a string for a plain text badge. */
  readonly badge = input<ProviderLogoBadge | string | null>(null);

  // ── State ─────────────────────────────────────────────────────────────
  /** Show a skeleton shimmer instead of the icon. */
  readonly loading = input<boolean>(false);
  /** Hover lift + pointer cursor. */
  readonly interactive = input<boolean>(false);

  // ── A11y ──────────────────────────────────────────────────────────────
  /** Override the <img alt> (defaults to the provider name). */
  readonly alt = input<string>('');
  /** Override the tooltip (defaults to the provider name). */
  readonly titleText = input<string>('');

  private readonly settings = inject(SettingsStore);
  private readonly iconService = inject(PaymentIconService);

  /**
   * Theme-aware icon URI. Uses `||` (not `??`) so empty strings fall through
   * to the other URI, exactly like payment-admin.
   */
  private readonly rawIcon = computed<string | null>(() => {
    const p = this.provider();
    if (!p) return null;
    const light = p.iconUri1 || null;
    const dark = p.iconUri2 || null;
    return this.settings.isDark() ? dark || light : light || dark;
  });

  /** True once the current <img> fires an error event. */
  readonly failed = signal(false);

  /**
   * True while the icon URI is being fetched/resolved — drives the skeleton so a
   * slow-loading logo shows a shimmer instead of the letter fallback. Flips to
   * true when a URI arrives and back to false once resolved (cached hits resolve
   * synchronously, so no shimmer flash).
   */
  readonly resolving = signal(false);

  /**
   * Resolved, renderable icon source. `toObservable` + `switchMap` cancels the
   * previous HTTP request automatically whenever `rawIcon` changes (theme
   * switch, provider change) and resets the stale error flag.
   */
  readonly icon = toSignal(
    toObservable(this.rawIcon).pipe(
      tap((uri) => {
        this.failed.set(false);
        this.resolving.set(!!uri);
      }),
      switchMap((uri) =>
        uri
          ? this.iconService.resolve(uri).pipe(map((s) => s || null))
          : of(null),
      ),
      tap(() => this.resolving.set(false)),
    ),
    { initialValue: null },
  );

  readonly name = computed<string>(() => {
    const p = this.provider();
    return p?.provider ?? p?.name ?? '';
  });

  readonly initial = computed<string>(() => {
    const n = this.name();
    return n ? n.charAt(0).toUpperCase() : '?';
  });

  // ── Derived presentation ──────────────────────────────────────────────

  /** CSS custom properties driving all sizing, scoped to the root element. */
  readonly logoVars = computed(() => {
    const sz = this.size();
    if (this.wide()) return `--sz:${sz}px;`;
    return `--sz:${sz}px;--sz-r:${this.radiusFor(sz)}px;--sz-f:${this.fontFor(
      sz,
    )}px;--sz-p:${Math.round(sz * 0.14)}px`;
  });

  private radiusFor(sz: number): number {
    switch (this.shape()) {
      case 'square':
        return 4;
      case 'circle':
      case 'pill':
        return Math.round(sz / 2);
      case 'rounded':
      default:
        return Math.round(sz * 0.22);
    }
  }

  private fontFor(sz: number): number {
    // Initial glyph scales with the box but stays readable.
    return Math.max(11, Math.round(sz * 0.34));
  }

  readonly rootClasses = computed<string[]>(() => {
    const c: string[] = [];
    if (this.wide()) {
      c.push('pl--wide');
    } else {
      c.push(`pl--name-${this.namePosition()}`);
    }
    if (this.interactive()) c.push('pl--interactive');
    if (this.loading() || this.resolving()) c.push('pl--loading');
    return c;
  });

  readonly logoClasses = computed<string[]>(() => {
    const c: string[] = ['pl-logo', `pl-logo--${this.shape()}`];
    if (this.wide()) c.push('pl-logo--wide');
    if (!this.bg()) c.push('pl-logo--no-bg');
    if (!this.bordered()) c.push('pl-logo--no-border');
    if (this.ring()) c.push('pl-logo--ring');
    if (this.shadow()) c.push('pl-logo--shadow');
    return c;
  });

  readonly badgeData = computed<ProviderLogoBadge | null>(() => {
    const b = this.badge();
    if (!b) return null;
    if (typeof b === 'string') return { text: b, position: 'bottom-right' };
    return b;
  });

  badgeClasses(b: ProviderLogoBadge): string[] {
    const c: string[] = ['pl-badge'];
    if (b.tone) c.push(`pl-badge--${b.tone}`);
    c.push(`pl-badge--${b.position ?? 'bottom-right'}`);
    return c;
  }

  // role="img" + aria-label only when an image actually renders, so screen
  // readers announce the provider name once (not twice via the visible text).
  readonly a11yRole = computed(() =>
    this.icon() && !this.failed() && !this.loading() && !this.resolving()
      ? 'img'
      : null,
  );

  readonly a11yLabel = computed(() =>
    this.a11yRole() ? this.alt() || this.name() || null : null,
  );
}
