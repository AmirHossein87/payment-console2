export function extractBaseDomain(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const urlString = url.startsWith('http') ? url : `https://${url}`;
    const hostname = new URL(urlString).hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) return parts.slice(-2).join('.');
    return hostname;
  } catch {
    return undefined;
  }
}

/**
 * Validate a `returnUrl` before it is used for navigation. Returns the normalised
 * absolute URL when it is safe to redirect to, or `null` when it must be rejected.
 *
 * This is a client-side SCHEME guard: it accepts only `http:`/`https:` and rejects
 * `javascript:`, `data:`, `vbscript:` and anything that doesn't parse as an
 * absolute URL — the classic reflected-XSS / open-redirect payloads.
 *
 * It deliberately does NOT gate the destination DOMAIN. `returnUrl` points at the
 * merchant's own external site (their WHMCS callback), which differs per merchant
 * and can't be enumerated here without breaking first-time onboarding. Restricting
 * the domain to registered callbacks is the BACKEND's job: it must bind the license
 * authorization code to a returnUrl it has registered for that license, so a
 * redirect to an attacker's domain carries no usable code. See the security handoff
 * (finding #3) — this guard is defence in depth, not the whole fix.
 */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const normalised = raw.startsWith('http') ? raw : `https://${raw}`;
    const url = new URL(normalised);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function appendTokenParams(
  urlStr: string,
  licenseId: string,
  authorizationCode: string
): string {
  const fullUrl = urlStr.startsWith('http') ? urlStr : `https://${urlStr}`;
  const url = new URL(fullUrl);
  url.searchParams.set('licenseId', licenseId);
  url.searchParams.set('authorizationCode', authorizationCode);
  return url.toString();
}
