export type PriceLookupLogInput = {
  toolCallId?: string | null
  toolName?: string | null
  inputName: string
  normalizedName: string
  lookupType: 'products' | 'organization_catalog' | 'price_catalog' | 'none'
  query: string
  found: boolean
  matchedProductId?: string | null
  matchedName?: string | null
  mustConfirmPriceWithTeam: boolean
  termsTried: string[]
}

export function logPriceLookup(input: PriceLookupLogInput) {
  console.info('[vapi/price-lookup]', {
    toolCallId: input.toolCallId ?? null,
    toolName: input.toolName ?? null,
    inputName: input.inputName,
    normalizedName: input.normalizedName,
    lookupType: input.lookupType,
    query: input.query,
    found: input.found,
    matchedProductId: input.matchedProductId ?? null,
    matchedName: input.matchedName ?? null,
    mustConfirmPriceWithTeam: input.mustConfirmPriceWithTeam,
    termsTried: input.termsTried,
  })
}
