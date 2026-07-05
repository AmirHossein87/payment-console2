export interface DecodedToken {
  at_hash?: string;
  aud?: string;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  exp: number;
  iat?: number;
  iss?: string;
  sub?: string;
  [key: string]: any;
}

export function parseJwt(token: string): DecodedToken {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    window
      .atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

export function isTokenExpired(token: string): boolean {
  try {
    const decoded = parseJwt(token);
    const nowTime = Date.now() / 1000;
    return decoded.exp <= nowTime;
  } catch {
    return true;
  }
}
