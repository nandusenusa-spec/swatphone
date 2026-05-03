export type PriceLookupSearchMeta = {
  tableQueried: 'products' | 'organization_catalog' | 'price_catalog' | 'none'
  queryFilters: Record<string, unknown>
  resultCount: number
  matchMode?: string
}

export type PriceLookupLogInput = {
  toolCallId?: string | null
  toolName?: string | null
  inputName: string
  normalizedName: string
  organization_id: string
  tableQueried: PriceLookupSearchMeta['tableQueried']
  queryFilters: Record<string, unknown>
  resultCount: number
  matchedName?: string | null
  matchedId?: string | null
  mustConfirmPriceWithTeam: boolean
  termsTried: string[]
  winningTerm?: string
}

export function logPriceLookup(input: PriceLookupLogInput) {
  console.info('[vapi/price-lookup]', {
    toolCallId: input.toolCallId ?? null,
    toolName: input.toolName ?? null,
    inputName: input.inputName,
    normalizedName: input.normalizedName,
    organization_id: input.organization_id,
    tableQueried: input.tableQueried,
    queryFilters: input.queryFilters,
    resultCount: input.resultCount,
    matchedName: input.matchedName ?? null,
    matchedId: input.matchedId ?? null,
    mustConfirmPriceWithTeam: input.mustConfirmPriceWithTeam,
    termsTried: input.termsTried,
    winningTerm: input.winningTerm ?? null,
  })
}
