/**
 * Product Costing & COGS Engine for Product Formulations
 * Calculates exact bill of materials (BOM), batch overheads, R&D allocation,
 * standard 14% allowances, and end-product GST across different SKU sizes.
 */

// Calculate BOM total for a given batch multiplier
function calculateBomTotal(billOfMaterials, batchMultiplier = 100) {
  return billOfMaterials.reduce((acc, item) => {
    const effectiveQty = item.quantity * batchMultiplier;
    const costExGst = effectiveQty * item.costPerUnit;
    const gstAmount = costExGst * (item.gstRate || 0.18);
    const totalCostInclGst = costExGst + gstAmount;

    return {
      totalExGst: acc.totalExGst + costExGst,
      totalGst: acc.totalGst + gstAmount,
      totalInclGst: acc.totalInclGst + totalCostInclGst
    };
  }, { totalExGst: 0, totalGst: 0, totalInclGst: 0 });
}

// Calculate COGS for a specific SKU size
function calculateSkuCogs(
  skuWeightGms,
  billOfMaterials,
  rdExpenses = { testing: 3000, consumables: 2000, samplingWastage: 1000 },
  batchOverheads = { electricity: 200, labor: 160, qcTesting: 2000, other: 1 },
  expectedLifetimeUnits = 5000,
  batchSizeUnits = 100,
  standardAllowanceRate = 0.14,
  endProductGstRate = 0.05
) {
  const baseBom = calculateBomTotal(billOfMaterials, 100);
  const baseMaterialCost100g = baseBom.totalExGst / 100;

  // Proportional material cost according to SKU size
  const materialCost = (skuWeightGms / 100) * baseMaterialCost100g;

  // R&D amortized over total lifecycle units
  const rdTotal = rdExpenses.testing + rdExpenses.consumables + rdExpenses.samplingWastage;
  const rdCostPerUnit = rdTotal / expectedLifetimeUnits;

  // Batch overhead divided by units per batch
  const batchTotal = batchOverheads.electricity + batchOverheads.labor + batchOverheads.qcTesting + batchOverheads.other;
  const overheadPerUnit = batchTotal / batchSizeUnits;

  // Direct base cost
  const directBaseCost = materialCost + rdCostPerUnit + overheadPerUnit;

  // 14% Standard Operational Allowances
  const standardAllowance = directBaseCost * standardAllowanceRate;

  // Total unit cost Ex-GST
  const totalCostExGst = directBaseCost + standardAllowance;

  // Total cost Incl-GST (on end product)
  const gstValue = totalCostExGst * endProductGstRate;
  const totalCostInclGst = totalCostExGst + gstValue;

  return {
    skuWeight: `${skuWeightGms}g`,
    materialCostExGst: Number(materialCost.toFixed(4)),
    rdCostPerUnit: Number(rdCostPerUnit.toFixed(4)),
    overheadPerUnit: Number(overheadPerUnit.toFixed(4)),
    directBaseCost: Number(directBaseCost.toFixed(4)),
    allowances14Pct: Number(standardAllowance.toFixed(4)),
    totalCostExGst: Number(totalCostExGst.toFixed(4)),
    totalCostInclGst: Number(totalCostInclGst.toFixed(4))
  };
}

// Calculate COGS for multiple SKU sizes
function calculateAllSkusCogs(
  billOfMaterials,
  skuConfigurations = [
    { weight: 100, lifetimeUnits: 5000, batchSize: 100 },
    { weight: 75,  lifetimeUnits: 6666.67, batchSize: 150 },
    { weight: 50,  lifetimeUnits: 10000, batchSize: 200 },
    { weight: 25,  lifetimeUnits: 20000, batchSize: 400 },
    { weight: 10,  lifetimeUnits: 50000, batchSize: 1000 }
  ],
  rdExpenses,
  batchOverheads,
  standardAllowanceRate = 0.14,
  endProductGstRate = 0.05
) {
  return skuConfigurations.map(cfg =>
    calculateSkuCogs(
      cfg.weight,
      billOfMaterials,
      rdExpenses,
      batchOverheads,
      cfg.lifetimeUnits,
      cfg.batchSize,
      standardAllowanceRate,
      endProductGstRate
    )
  );
}

module.exports = {
  calculateBomTotal,
  calculateSkuCogs,
  calculateAllSkusCogs
};
