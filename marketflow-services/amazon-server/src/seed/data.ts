export type SeedProduct = {
  asin: string
  sku: string
  name: string
  category: 'serum' | 'moisturizer'
  price: number
  cogs: number | null
  isHero: boolean
  isOwn: boolean
  /** Competitor rows only: which own ASIN this rival is benchmarked against (Competitor Watchlist, Design Doc §9) */
  watchesAsin?: string
}

// Ayuvera Biosciences own catalog — Amazon India cosmetics brand (Design Doc's stated client)
export const ownProducts: SeedProduct[] = [
  { asin: 'B0A1VITC30', sku: 'SERUM-VITC-30', name: 'Ayuvera Vitamin C Serum 30ml', category: 'serum', price: 599, cogs: 180, isHero: true, isOwn: true },
  { asin: 'B0A1RETN50', sku: 'CREAM-RETINOL-50', name: 'Ayuvera Retinol Night Cream 50g', category: 'moisturizer', price: 799, cogs: 240, isHero: true, isOwn: true },
  { asin: 'B0A1HYAL30', sku: 'SERUM-HA-30', name: 'Ayuvera Hyaluronic Acid Serum 30ml', category: 'serum', price: 549, cogs: 165, isHero: false, isOwn: true },
  { asin: 'B0A1NIAC30', sku: 'SERUM-NIA-30', name: 'Ayuvera Niacinamide Serum 30ml', category: 'serum', price: 499, cogs: 150, isHero: false, isOwn: true },
  { asin: 'B0A1ALOE100', sku: 'GEL-ALOE-100', name: 'Ayuvera Aloe Vera Gel Moisturizer 100g', category: 'moisturizer', price: 349, cogs: 90, isHero: false, isOwn: true },
  { asin: 'B0A1EYEC20', sku: 'CREAM-EYE-20', name: 'Ayuvera Under Eye Cream 20g', category: 'moisturizer', price: 449, cogs: 140, isHero: false, isOwn: true },
]

// Competitor watchlist — each rival is explicitly benchmarked against one of your own
// ASINs (Design Doc §9 Competitor Watchlist). Matching by broad category alone would
// compare, say, your Vitamin C serum against a rival's Niacinamide serum — not useful.
export const competitorProducts: SeedProduct[] = [
  { asin: 'B0C1GLOWLAB1', sku: 'C-GLOWLAB-VITC', name: 'GlowLab Vitamin C Serum 30ml', category: 'serum', price: 549, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1VITC30' },
  { asin: 'B0C1DERMAPURE1', sku: 'C-DERMAPURE-VITC', name: 'DermaPure Brightening Vitamin C Serum', category: 'serum', price: 649, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1VITC30' },
  { asin: 'B0C1PUREGLOW1', sku: 'C-PUREGLOW-RETN', name: 'PureGlow Retinol Night Cream 50g', category: 'moisturizer', price: 749, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1RETN50' },
  { asin: 'B0C1SKINRITUAL1', sku: 'C-SKINRITUAL-RETN', name: 'SkinRitual Advanced Retinol Cream', category: 'moisturizer', price: 849, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1RETN50' },
  { asin: 'B0C1CETACARE1', sku: 'C-CETACARE-HA', name: 'CetaCare Hyaluronic Acid Serum', category: 'serum', price: 599, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1HYAL30' },
  { asin: 'B0C1DERMAPURE2', sku: 'C-DERMAPURE-HA', name: 'DermaPure Hydra Boost HA Serum', category: 'serum', price: 519, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1HYAL30' },
  { asin: 'B0C1GLOWLAB2', sku: 'C-GLOWLAB-NIA', name: 'GlowLab Niacinamide 10% Serum', category: 'serum', price: 469, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1NIAC30' },
  { asin: 'B0C1MINIMALCO1', sku: 'C-MINIMALCO-NIA', name: 'MinimalCo Niacinamide Zinc Serum', category: 'serum', price: 449, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1NIAC30' },
  { asin: 'B0C1PUREGLOW2', sku: 'C-PUREGLOW-ALOE', name: 'PureGlow Aloe Vera Gel 100g', category: 'moisturizer', price: 299, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1ALOE100' },
  { asin: 'B0C1NATESSENCE1', sku: 'C-NATESSENCE-ALOE', name: 'NatEssence Pure Aloe Gel 150g', category: 'moisturizer', price: 379, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1ALOE100' },
  { asin: 'B0C1SKINRITUAL2', sku: 'C-SKINRITUAL-EYE', name: 'SkinRitual Caffeine Eye Cream 20g', category: 'moisturizer', price: 429, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1EYEC20' },
  { asin: 'B0C1CETACARE2', sku: 'C-CETACARE-EYE', name: 'CetaCare Under Eye Cream 15g', category: 'moisturizer', price: 399, cogs: null, isHero: false, isOwn: false, watchesAsin: 'B0A1EYEC20' },
]

export const keywords: { keyword: string; isHeroTarget: boolean }[] = [
  { keyword: 'vitamin c serum', isHeroTarget: true },
  { keyword: 'vitamin c serum for face', isHeroTarget: true },
  { keyword: 'vitamin c serum india', isHeroTarget: false },
  { keyword: 'best vitamin c serum for glowing skin', isHeroTarget: true },
  { keyword: 'retinol night cream', isHeroTarget: true },
  { keyword: 'retinol cream for wrinkles', isHeroTarget: true },
  { keyword: 'anti aging night cream', isHeroTarget: false },
  { keyword: 'hyaluronic acid serum', isHeroTarget: false },
  { keyword: 'hyaluronic acid serum for dry skin', isHeroTarget: false },
  { keyword: 'niacinamide serum', isHeroTarget: false },
  { keyword: 'niacinamide serum for oily skin', isHeroTarget: false },
  { keyword: 'niacinamide zinc serum', isHeroTarget: false },
  { keyword: 'aloe vera gel for face', isHeroTarget: false },
  { keyword: 'aloe vera moisturizer', isHeroTarget: false },
  { keyword: 'under eye cream for dark circles', isHeroTarget: false },
  { keyword: 'eye cream for puffiness', isHeroTarget: false },
  { keyword: 'face serum for glowing skin', isHeroTarget: false },
  { keyword: 'best face serum india', isHeroTarget: false },
  { keyword: 'cosmetic serum for pigmentation', isHeroTarget: false },
  { keyword: 'brightening serum for face', isHeroTarget: false },
  { keyword: 'ayuvera skincare', isHeroTarget: false },
  { keyword: 'natural skincare serum india', isHeroTarget: false },
]

// keyword -> own ASINs it should be tracked against (for keyword_rank generation)
export const keywordAsinMap: Record<string, string[]> = {
  'vitamin c serum': ['B0A1VITC30'],
  'vitamin c serum for face': ['B0A1VITC30'],
  'vitamin c serum india': ['B0A1VITC30'],
  'best vitamin c serum for glowing skin': ['B0A1VITC30'],
  'retinol night cream': ['B0A1RETN50'],
  'retinol cream for wrinkles': ['B0A1RETN50'],
  'anti aging night cream': ['B0A1RETN50'],
  'hyaluronic acid serum': ['B0A1HYAL30'],
  'hyaluronic acid serum for dry skin': ['B0A1HYAL30'],
  'niacinamide serum': ['B0A1NIAC30'],
  'niacinamide serum for oily skin': ['B0A1NIAC30'],
  'niacinamide zinc serum': ['B0A1NIAC30'],
  'aloe vera gel for face': ['B0A1ALOE100'],
  'aloe vera moisturizer': ['B0A1ALOE100'],
  'under eye cream for dark circles': ['B0A1EYEC20'],
  'eye cream for puffiness': ['B0A1EYEC20'],
  'face serum for glowing skin': ['B0A1VITC30', 'B0A1HYAL30'],
  'best face serum india': ['B0A1VITC30', 'B0A1NIAC30'],
  'cosmetic serum for pigmentation': ['B0A1VITC30'],
  'brightening serum for face': ['B0A1VITC30'],
  'ayuvera skincare': ['B0A1VITC30', 'B0A1RETN50'],
  'natural skincare serum india': ['B0A1HYAL30'],
}
