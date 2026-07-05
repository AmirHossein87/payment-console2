import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthStore } from '../stores/auth.store';
import { StorageService } from '../services/storage.service';
import { isTokenExpired } from '../utils/jwt.util';

export const authGuard: CanActivateFn = (route, state) => {
  const authStore = inject(AuthStore);
  const storage = inject(StorageService);
  const router = inject(Router);

  const token = authStore.token();

  if (!validToken(token)) {
    storage.clear();
    router.navigate(['/auth/signin'], {
      queryParams: route.queryParams,
    });
    return false;
  }

  return true;
};

function validToken(token: string | null | undefined): boolean {
  if (!token) return false;
  if (isTokenExpired(token)) return false;

  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    window.atob(base64);
    return true;
  } catch {
    return false;
  }
}
