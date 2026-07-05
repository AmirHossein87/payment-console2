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
