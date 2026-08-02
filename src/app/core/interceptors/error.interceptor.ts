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

          // Two-factor exceptions carry no server message (bare .NET exceptions
          // serialise to "Exception of type '…' was thrown"), so map them to a
          // clear message here — this covers 2FA enrollment and any caller that
          // surfaces the error text.
          const twoFaMessages: Record<string, string> = {
            Invalid2FaException: 'The two-factor code is incorrect or has expired. Please try again.',
            Need2FaException: 'Two-factor authentication is required for this action.',
            NeedToActive2FaException:
              'You need to set up two-factor authentication before you can do this.',
          };
          const friendlyTwoFa = twoFaMessages[errorResponse?.TypeName];

          // Surface the friendly 2FA message first, then the backend's `Message`
          // (capital M, .NET ResponseErrorDto), then any lowercase `message`, then
          // the HTTP failure text.
          const normalizedError = {
            message:
              friendlyTwoFa ||
              errorResponse?.Message ||
              errorResponse?.message ||
              error.message ||
              'An unknown error occurred',
            type: error.statusText,
            typeName: errorResponse?.TypeName,
            status: error.status,
            // A bare 2FA exception serialises to "Exception of type '…' was thrown".
            // Callers' extractError() reads response.Message/response.message BEFORE
            // .message, so overwrite those with the friendly text too — otherwise the
            // ugly .NET string would win.
            response: friendlyTwoFa
              ? { ...errorResponse, Message: friendlyTwoFa, message: friendlyTwoFa }
              : errorResponse,
          };

          return throwError(() => normalizedError);
        })
      );
    })
  );
};
