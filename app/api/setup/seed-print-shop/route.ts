import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { 
  printShopAssistantConfig, 
  printShopProducts, 
  printShopFAQs, 
  printShopTeam 
} from "@/lib/templates/print-shop-config"

export async function POST() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_ENDPOINTS !== 'true') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }
  try {
    const supabase = await createClient()
    
    // Get current user and their organization
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()
    
    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }
    
    const orgId = profile.organization_id
    
    // Update assistant config
    const { error: assistantError } = await supabase
      .from("assistant_configs")
      .update({
        name: printShopAssistantConfig.name,
        system_prompt: printShopAssistantConfig.system_prompt,
        first_message: printShopAssistantConfig.first_message_en,
        language: printShopAssistantConfig.language,
        voice_id: printShopAssistantConfig.voice_id,
        voice_provider: printShopAssistantConfig.voice_provider,
        temperature: printShopAssistantConfig.temperature,
        max_tokens: printShopAssistantConfig.max_tokens,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId)
    
    if (assistantError) {
      console.error("Error updating assistant:", assistantError)
    }
    
    // Clear existing products and insert new ones
    await supabase.from("products").delete().eq("organization_id", orgId)
    
    const productsToInsert = printShopProducts.map(product => ({
      ...product,
      organization_id: orgId,
      is_active: true,
    }))
    
    const { error: productsError } = await supabase
      .from("products")
      .insert(productsToInsert)
    
    if (productsError) {
      console.error("Error inserting products:", productsError)
    }
    
    // Clear existing FAQs and insert new ones
    await supabase.from("faqs").delete().eq("organization_id", orgId)
    
    const faqsToInsert = printShopFAQs.map(faq => ({
      ...faq,
      organization_id: orgId,
      is_active: true,
    }))
    
    const { error: faqsError } = await supabase
      .from("faqs")
      .insert(faqsToInsert)
    
    if (faqsError) {
      console.error("Error inserting FAQs:", faqsError)
    }
    
    // Clear existing team members and insert new ones
    await supabase.from("team_members").delete().eq("organization_id", orgId)
    
    const teamToInsert = printShopTeam.map(member => ({
      ...member,
      organization_id: orgId,
    }))
    
    const { error: teamError } = await supabase
      .from("team_members")
      .insert(teamToInsert)
    
    if (teamError) {
      console.error("Error inserting team:", teamError)
    }
    
    return NextResponse.json({ 
      success: true,
      message: "Print shop configuration loaded successfully",
      data: {
        products: productsToInsert.length,
        faqs: faqsToInsert.length,
        team: teamToInsert.length,
      }
    })
    
  } catch (error) {
    console.error("Seed error:", error)
    return NextResponse.json(
      { error: "Failed to seed data" },
      { status: 500 }
    )
  }
}
