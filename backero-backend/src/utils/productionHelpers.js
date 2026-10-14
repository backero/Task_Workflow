// Scales a CatalogProduct's formulation rows (defined per formulation.refWeight,
// assumed grams) to a target batch size in kg, producing a ProductionOrder ingredients array.
function buildIngredientsFromCatalogProduct(catalogDoc, batchSizeKg) {
  if (!catalogDoc?.formulation?.rows?.length) return [];
  const refWeight = catalogDoc.formulation.refWeight || 100;
  const targetGrams = (Number(batchSizeKg) || 0) * 1000;
  const scaleFactor = refWeight > 0 ? targetGrams / refWeight : 0;
  return catalogDoc.formulation.rows.map((r) => ({
    rawMaterialId: r.rawMaterialId || '',
    name: r.name,
    unit: r.unit || 'g',
    targetQty: Math.round((r.quantity || 0) * scaleFactor * 100) / 100,
  }));
}

// Total raw-material cost for a formula recipe, given rows of { quantity, costPerUnit } where
// costPerUnit is the real Raw Material's cost for one unit of its own `unit` (Product.costPrice
// — e.g. cost per gram, not per kg), copied in at the moment each row was added.
function computeFormulaCost(rows) {
  if (!rows?.length) return 0;
  const total = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.costPerUnit) || 0), 0);
  return Math.round(total * 100) / 100;
}

module.exports = { buildIngredientsFromCatalogProduct, computeFormulaCost };
