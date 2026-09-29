/**
 * PaymentHood password policy — the single source of truth for the console UI.
 *
 * Keep this in step with the Firebase (Identity Platform) password policy set in
 * the Firebase console → Authentication → Settings → Password policy:
 *   • Enforcement mode : Require
 *   • Minimum length   : 8
 *   • Require lowercase : yes
 *   • Require numeric   : yes
 *
 * Firebase is the authoritative gate — it enforces the same rules server-side and
 * on its hosted password-reset page. These client-side checks exist so the sign-up
 * form gives instant, specific feedback (a live checklist) instead of letting the
 * user submit and get bounced by Firebase after the fact. If the Firebase policy
 * ever changes, change it HERE too so the two never drift apart.
 *
 * Length 8 is the floor NIST SP 800-63B §5.1.1.2 sets for user-chosen secrets.
 * If PCI DSS v4.0 §8.3.6 (min 12) ever becomes binding, raise `minLength` here
 * and the Firebase policy in the same change.
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  requireLowercase: true,
  requireNumeric: true,
  requireUppercase: false,
  requireSpecial: false,
} as const;

export interface PasswordRule {
  readonly id: string;
  readonly label: string;
  readonly test: (password: string) => boolean;
}

/**
 * The active rules, in display order. One list drives BOTH the live checklist and
 * the submit-time validation, so the visible hints and the blocking rule can never
 * disagree. Only the enabled requirements are included.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_POLICY.minLength} characters`,
    test: (p) => p.length >= PASSWORD_POLICY.minLength,
  },
  ...(PASSWORD_POLICY.requireLowercase
    ? [{ id: 'lowercase', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) }]
    : []),
  ...(PASSWORD_POLICY.requireNumeric
    ? [{ id: 'numeric', label: 'One number', test: (p: string) => /[0-9]/.test(p) }]
    : []),
  ...(PASSWORD_POLICY.requireUppercase
    ? [{ id: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) }]
    : []),
  ...(PASSWORD_POLICY.requireSpecial
    ? [{ id: 'special', label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) }]
    : []),
];

/**
 * First unmet policy rule → a specific message; `null` when the password complies.
 * Covers only the standalone strength rules — identifier checks like "must differ
 * from the email" live with the form that knows the email.
 */
export function passwordPolicyError(password: string): string | null {
  const failed = PASSWORD_RULES.find((r) => !r.test(password));
  if (!failed) return null;
  switch (failed.id) {
    case 'length':
      return `Password must be at least ${PASSWORD_POLICY.minLength} characters long.`;
    case 'lowercase':
      return 'Password must include at least one lowercase letter.';
    case 'numeric':
      return 'Password must include at least one number.';
    case 'uppercase':
      return 'Password must include at least one uppercase letter.';
    case 'special':
      return 'Password must include at least one special character.';
    default:
      return 'Password does not meet the requirements.';
  }
}

/**
 * One-line human summary of the policy — e.g. "at least 8 characters, a lowercase
 * letter and a number". Used for hints on pages that have no password field of
 * their own (the reset link points at Firebase's hosted page).
 */
export function passwordPolicySummary(): string {
  const parts: string[] = [`at least ${PASSWORD_POLICY.minLength} characters`];
  if (PASSWORD_POLICY.requireLowercase) parts.push('a lowercase letter');
  if (PASSWORD_POLICY.requireUppercase) parts.push('an uppercase letter');
  if (PASSWORD_POLICY.requireNumeric) parts.push('a number');
  if (PASSWORD_POLICY.requireSpecial) parts.push('a special character');
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}
