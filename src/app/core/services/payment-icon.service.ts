import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, of } from "rxjs";
import { catchError, map, shareReplay } from "rxjs/operators";

/**
 * Resolves provider icon URIs into renderable image sources.
 *
 * This mirrors payment-admin's `preloadIcons` strategy exactly:
 *  - `.svg` URIs are fetched as text via HttpClient and inlined as
 *    `data:image/svg+xml;base64,…`. Blob storage serves SVGs with a non-image
 *    content-type, and browsers never content-sniff SVG in <img>, so a bare
 *    `<img src>` to the raw URL fails — inlining forces the correct MIME type.
 *  - every other type (PNG/JPG/…) uses the raw URL directly; browsers render
 *    those fine from the source URL.
 *
 * Results are cached + shared per URI (the equivalent of payment-admin building
 * one `icons` map per page load) so each icon is fetched at most once.
 */
@Injectable({ providedIn: "root" })
export class PaymentIconService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<string>>();

  resolve(uri: string | null | undefined): Observable<string> {
    if (!uri) return of("");

    const cached = this.cache.get(uri);
    if (cached) return cached;

    let resolved$: Observable<string>;
    if (uri.toLowerCase().includes(".svg")) {
      resolved$ = this.http.get(uri, { responseType: "text" }).pipe(
        map((svg) => "data:image/svg+xml;base64," + this.toBase64(svg)),
        catchError(() => of(uri)), // fall back to the raw URL on failure
        shareReplay(1),
      );
    } else {
      resolved$ = of(uri); // PNG/JPG/etc. load fine from the source URL
    }

    this.cache.set(uri, resolved$);
    return resolved$;
  }

  // UTF-8 safe base64 (btoa alone throws on non-Latin1 characters).
  private toBase64(input: string): string {
    return btoa(unescape(encodeURIComponent(input)));
  }
}
