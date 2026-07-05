/**
 * Builds a JSON-Patch-style wrapper `{ value }` used by the NSwag PATCH endpoints.
 *
 * The payment-app-service PATCH contracts (e.g. `PaymentProfileUpdateRequest`,
 * `UpdateFraudPolicyRequest`, `UpdateCustomerRequest`) wrap every mutable field
 * in a `Patch<T>` envelope so omitted fields are ignored by the server. The
 * generated `Patch*` classes are structurally identical (`value` + `init` +
 * `toJSON`), so this helper returns a duck-typed object that satisfies all of
 * them and serializes to `{"value": <v>}` exactly like the generated classes.
 *
 * IMPORTANT — single-field PATCH: build a PLAIN object cast to the request
 * type, NOT `new XxxRequest(...)`. The proxy serializes with
 * `JSON.stringify(request)`, which invokes the request's `toJSON()`. The
 * NSwag-generated `toJSON()` force-emits EVERY field (omitted ones as `null`),
 * so `new PaymentProfileUpdateRequest({ paymentProfileName })` sends all 7
 * fields. A plain object has no `toJSON()`, so only the keys you set are sent.
 *
 * @example
 * // ✅ sends ONLY paymentProfileName
 * const req = { paymentProfileName: patchOf('Revolut GBP') } as PaymentProfileUpdateRequest;
 * // ❌ sends all fields (others as null) — do NOT do this for single-field edits
 * // new PaymentProfileUpdateRequest({ paymentProfileName: patchOf('Revolut GBP') })
 */
export function patchOf<T>(value: T): {
  value: T;
  init: () => void;
  toJSON: () => { value: T };
} {
  return {
    value,
    init: () => {},
    toJSON: () => ({ value }),
  };
}
