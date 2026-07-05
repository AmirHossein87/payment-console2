import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, EMPTY, from, of, switchMap } from 'rxjs';
import { AuthStore } from '../stores/auth.store';
import { NotificationService } from '../services/notification.service';
import { Logger } from '../services/logger.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const notificationService = inject(NotificationService);
  const router = inject(Router);
  const logger = Logger.create('HttpError');

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // The NSwag proxy clients request `responseType: 'blob'`, so the error body
      // arrives as a Blob and must be read asynchronously to recover the backend
      // error payload (e.g. { TypeName, Message, ... }). Object/string bodies are
      // handled synchronously.
      const body$ =
        error.error instanceof Blob ? from(error.error.text()) : of(error.error);

      return body$.pipe(
        switchMap((raw) => {
          let errorResponse: any = null;
          if (typeof raw === 'string') {
            try {
              errorResponse = JSON.parse(raw);
            } catch {
              errorResponse = { Message: raw };
            }
          } else if (raw && typeof raw === 'object') {
            errorResponse = raw;
          }

          if (errorResponse?.TypeName === 'AppInactiveException') {
            const url = req.url;
            const isLicenseUrl =
              /\/api\/apps\/[^/]+\/(renew-license|license-invoices)/.test(url) ||
              /\/api\/apps\/[^/]+$/.test(url);

            if (!isLicenseUrl) {
              notificationService.showError(
                'This application is inactive. Please renew your license.'
              );
              return EMPTY;
            }
          }

          if (error.status === 401) {
            logger.warn('401 Unauthorized — clearing session.');
            authStore.clearSession();
            router.navigate(['/auth/signin']);
            return EMPTY;
          }

          // Surface the backend's `Message` (capital M, .NET ResponseErrorDto)
          // first, then any lowercase `message`, then the HTTP failure text.
          const normalizedError = {
            message:
              errorResponse?.Message ||
              errorResponse?.message ||
              error.message ||
              'An unknown error occurred',
            type: error.statusText,
            typeName: errorResponse?.TypeName,
            status: error.status,
            response: errorResponse,
          };

          return throwError(() => normalizedError);
        })
      );
    })
  );
};
