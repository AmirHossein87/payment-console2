import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthStore } from '../stores/auth.store';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);

  const token = authStore.token();

  const skipAuthExtensions = ['.svg', '.png', '.ico', '.jpg', '.jpeg', '.gif', '.css', '.js'];
  const shouldSkipAuth = skipAuthExtensions.some((ext) => req.url.includes(ext));

  let headers = req.headers;

  if (token && !shouldSkipAuth) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(req.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers = headers.set('Content-Type', 'application/json');
    }
  }

  headers = headers.set('Accept', 'application/json');

  const clonedReq = req.clone({ headers });
  return next(clonedReq);
};
