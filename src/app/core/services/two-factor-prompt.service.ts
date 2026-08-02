import { Injectable, signal } from '@angular/core';

/**
 * Drives the global "enter your 2FA code" prompt used by {@link twoFactorInterceptor}.
 *
 * When any request comes back with a `Need2FaException` (the acting user has 2FA
 * on but sent no code) or `Invalid2FaException` (wrong code), the interceptor
 * opens this prompt, awaits a code, and retries the SAME request with `otpCode`.
 * (`NeedToActive2FaException` — the user hasn't enrolled — is surfaced as a plain
 * message by the error interceptor instead; the avatar alarm guides setup.)
 */
@Injectable({ providedIn: 'root' })
export class TwoFactorPromptService {
  /** Whether the prompt overlay is visible. */
  readonly isOpen = signal(false);
  /** True while a submitted code is being verified against a retried request. */
  readonly verifying = signal(false);
  /** Inline error under the code field (e.g. an incorrect-code retry). */
  readonly error = signal('');

  private resolver: ((code: string | null) => void) | null = null;

  /**
   * Opens (or refreshes) the code prompt and resolves with the code the user
   * submits, or `null` if they cancel. `error` seeds the inline message for a
   * retry after an incorrect code.
   */
  prompt(error = ''): Promise<string | null> {
    // A fresh code entry — resolve any prior pending request as a cancel first.
    this.resolvePending(null);
    this.error.set(error);
    this.verifying.set(false);
    this.isOpen.set(true);
    return new Promise<string | null>((resolve) => {
      this.resolver = resolve;
    });
  }

  /** UI → user submitted a code. Keeps the modal open (in a verifying state) until the retry resolves. */
  submit(code: string): void {
    this.verifying.set(true);
    this.error.set('');
    this.resolvePending(code);
  }

  /** UI → user dismissed the prompt without entering a code. */
  cancel(): void {
    this.resolvePending(null);
    this.reset();
  }

  /** Interceptor → the retried request completed (success or a non-2FA error): hide the prompt. */
  close(): void {
    this.reset();
  }

  private resolvePending(value: string | null): void {
    const r = this.resolver;
    this.resolver = null;
    r?.(value);
  }

  private reset(): void {
    this.isOpen.set(false);
    this.verifying.set(false);
    this.error.set('');
  }
}
