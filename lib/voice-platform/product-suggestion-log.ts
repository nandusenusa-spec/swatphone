export type ProductSuggestionLogInput = {
  inputName: string
  normalizedName: string
  detectedProductFamily: 'business_cards' | null
  detectedQuantity: number | null
  suggestedProducts: Array<{
    id: string | null
    name: string
    unit_price: unknown
    currency: string | null
  }>
}

export function logProductSuggestion(input: ProductSuggestionLogInput) {
  console.info('[vapi/product-suggestion]', {
    inputName: input.inputName,
    normalizedName: input.normalizedName,
    detectedProductFamily: input.detectedProductFamily,
    detectedQuantity: input.detectedQuantity,
    suggestedProducts: input.suggestedProducts,
  })
}
