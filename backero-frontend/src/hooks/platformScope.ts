export type PlatformId = 'amazon' | 'meesho' | 'snapdeal' | 'flipkart'

export function platformFromPath(pathname: string): PlatformId | null {
  const seg = pathname.split('/')[1]
  return seg === 'amazon' || seg === 'meesho' || seg === 'snapdeal' || seg === 'flipkart' ? seg : null
}

export function marketplaceId(scope: PlatformId): string {
  return scope === 'amazon' ? 'amazon_in' : scope
}
