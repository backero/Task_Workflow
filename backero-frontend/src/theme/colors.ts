export const PLATFORM_COLORS: Record<string, string> = {
  amazon_in: '#c97b52',
  flipkart: '#3f72ad',
  meesho: '#9c4b82',
  snapdeal: '#5c8a4a',
  myntra: '#ff3f6c',
  jiomart: '#0077B6',
}

export const STATUS_COLORS = {
  good: '#4ade80',
  warning: '#eab308',
  critical: '#ef4444',
  info: '#60a5fa',
}

export const CHART_COLORS = {
  gridline: '#e5e7eb',
  text: '#6b7280',
  background: '#f9fafb',
}

export const PLATFORM_LABELS: Record<string, string> = {
  amazon_in: 'Amazon',
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  snapdeal: 'Snapdeal',
  myntra: 'Myntra',
  jiomart: 'JioMart',
}

export function platformColor(marketplaceId: string): string {
  return PLATFORM_COLORS[marketplaceId as keyof typeof PLATFORM_COLORS] || '#c97b52'
}
