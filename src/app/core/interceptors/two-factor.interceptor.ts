import { HttpInterceptorFn, HttpErrorResponse, HttpEventType, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, of, map, switchMap, tap, throwError } from 'rxjs';
import { TwoFactorPromptService } from '../services/two-factor-prompt.service';

/** GrayMint serialises the thrown exception's class name into the error body as `TypeName`. */
const NEED_CODE = 'Need2FaException';         // enrolled, but no code supplied
const INVALID_CODE = 'Invalid2FaException';   // wrong / expired code
const NEEDS_ENROLL = 'NeedToActive2FaException'; // app forces 2FA, user not enrolled

/** Marker so the error interceptor can stay silent when the user dismisses the 2FA prompt. */
export const TWO_FA_CANCELLED = 'twoFaCancelled';

/**
 * Global two-factor gate. Any request whose response is a 2FA exception is paused,
 * the user is prompted for their authenticator code, and the SAME request is
 * retried with `otpCode` appended (the gated endpoints read it from the query
 * string). Callers (refund, mark-as-refund, mark-as-dispute, …) need no changes.
 *
 * The `…/twofactor/*` enrollment endpoints are excluded — they collect their
 * own code in the setup modal.
 */
export const twoFactorInterceptor: HttpInterceptorFn = (req, next) => {
  const prompt = inject(TwoFactorPromptService);

  if (req.url.includes('/twofactor/')) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) =>
      readTypeName(error).pipe(
        switchMap((typeName) => {
          if (typeName === NEEDS_ENROLL) {
            // User must set up 2FA first — no code to enter here. Let the error
            // through so the error interceptor surfaces the friendly message; the
            // persistent avatar alarm + My Profile "Setup required" card guide setup.
            return throwError(() => error);
          }
          if (typeName === NEED_CODE) {
            return runWithCode(req, next, prompt);
          }
          if (typeName === INVALID_CODE) {
            // A code was already supplied but rejected — prompt for a fresh one.
            return runWithCode(req, next, prompt, 'That code was incorrect or expired. Enter a new one.');
          }
          // Not a 2FA gate — pass through to the error interceptor.
          return throwError(() => error);
        })
      )
    )
  );
};

/**
 * Prompts for a code, retries the request, and loops on an incorrect code until
 * the user succeeds or cancels.
 */
function runWithCode(
  req: Parameters<HttpInterceptorFn>[0],
  next: Parameters<HttpInterceptorFn>[1],
  prompt: TwoFactorPromptService,
  errorMsg = ''
): Observable<HttpEvent<unknown>> {
  return from(prompt.prompt(errorMsg)).pipe(
    switchMap((code) => {
      if (!code) {
        prompt.close();
        return throwError(() => ({ [TWO_FA_CANCELLED]: true, message: 'Two-factor verification cancelled.' }));
      }

      const retried = req.clone({ setParams: { otpCode: code } });
      return next(retried).pipe(
        tap((evt) => {
          if (evt.type === HttpEventType.Response) prompt.close();
        }),
        catchError((err: HttpErrorResponse) =>
          readTypeName(err).pipe(
            switchMap((tn) => {
              if (tn === INVALID_CODE || tn === NEED_CODE) {
                // Wrong/expired code — reopen the prompt with a message and try again.
                return runWithCode(req, next, prompt, 'That code was incorrect or expired. Enter a new one.');
              }
              // A different failure (incl. "must set up 2FA first") — close the
              // prompt and let the error interceptor surface the message.
              prompt.close();
              return throwError(() => err);
            })
          )
        )
      );
    })
  );
}

/** Reads GrayMint's `TypeName` out of the (blob or object) error body. */
function readTypeName(error: HttpErrorResponse): Observable<string | undefined> {
  const raw$ = error?.error instanceof Blob ? from(error.error.text()) : of(error?.error);
  return raw$.pipe(
    map((raw) => {
      let parsed: any = null;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      } else if (raw && typeof raw === 'object') {
        parsed = raw;
      }
      return parsed?.TypeName as string | undefined;
    })
  );
}
