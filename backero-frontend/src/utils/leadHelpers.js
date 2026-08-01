// A short, human-readable reference for a lead/customer — the "golden thread" the
// sample production.html reference mirrors as "Customer ID". Derived purely from the
// lead's own Mongo _id (same last-4-of-id scheme already used server-side to build
// FORM-/SMPL-/PROD- ids), so it needs no schema field, no migration, and works
// retroactively for every lead that already exists.
export function customerId(lead) {
  const id = lead?._id;
  return id ? `CUST-${String(id).slice(-4).toUpperCase()}` : '';
}

// Same derivation as customerId(), scoped to a ProductionQuery — the "QRY-XXXX" id the
// reference design's Q&A Inbox shows as a clickable code-cell next to the Customer ID.
export function queryId(query) {
  const id = query?._id;
  return id ? `QRY-${String(id).slice(-4).toUpperCase()}` : '';
}
