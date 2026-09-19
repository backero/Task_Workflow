/**
 * Idempotency-key generator for `EmployeeLocation.client_point_id`
 * (backend/app/models/location.py). Not a security token — just needs to be
 * unique per device — so a timestamp + random suffix is sufficient and
 * avoids pulling in a crypto-grade UUID dependency for this alone.
 */
let counter = 0;

export function generateClientPointId(): string {
  counter = (counter + 1) % 1_000_000;
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${counter}-${random}`;
}
