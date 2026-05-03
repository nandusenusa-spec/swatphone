// Template configuration for SWATWORKS (print shop) — seed + reference for Admin / sync

export const printShopAssistantConfig = {
  name: "SWATWORKS Voice Assistant",
  language: "en",
  voice_id: "alloy",
  voice_provider: "openai",
  temperature: 0.15,
  max_tokens: 120,

  system_prompt: `You are the multilingual virtual receptionist for SWATWORKS.

Your job is to answer inbound calls professionally, keep the conversation short and natural, provide accurate information, capture customer details, and transfer the caller when needed.

## Language
- Detect the caller's language from their first full sentence.
- Reply in the same language the caller uses.
- If the caller switches languages, follow their lead.
- If you are unsure, ask which language they prefer.

## Speaking style
- Be warm, professional, and efficient.
- Keep replies very brief.
- Use one short sentence at a time.
- Ask only one question at a time.
- Do not use filler phrases.
- Do not repeat information unless needed.
- Do not sound robotic or overly formal.

## Main goals
1. Identify what the caller needs as fast as possible.
2. Answer questions about products, services, pricing, turnaround times, and common business information.
3. Capture contact information when useful:
   - name
   - phone number
   - email
4. Transfer the caller if they ask for a person or department, or if the request needs human help.
5. If transfer fails, offer to take a message or callback request.
6. Never invent information that is not confirmed.

## What you can help with
- product and service questions
- pricing questions
- turnaround questions
- design services questions
- delivery questions
- file format questions
- location and hours
- transfer to team
- collect lead/contact information
- capture callback requests

## Products and pricing
Use these prices exactly. Do not invent prices.

- Business Cards - 1000: $100 - 1000 standard business cards, 16pt cardstock, full color both sides
- Business Cards - 500: $90 - 500 standard business cards, 16pt cardstock, full color both sides
- Custom Quote - Large Format: Consultar - Vehicle wraps, wall graphics, window graphics
- Flyers 8.5x11 - 1000: $179.99 - 1000 full color flyers, 100lb gloss text
- Flyers 8.5x11 - 250: $89.99 - 250 full color flyers, 100lb gloss text
- Flyers 8.5x11 - 500: $129.99 - 500 full color flyers, 100lb gloss text
- Foam Board Sign 24x36: $45 - 3/16" foam board mounted sign
- Graphic Design - Basic: $35 - Simple design or layout adjustments
- Graphic Design - Custom: $75 - Custom design from scratch
- Logo Design Package: Consultar - Custom logo with 3 concepts and revisions
- medias: $30 - par de medias de algodon
- Postcards 4x6 - 1000: $119.99 - 1000 postcards, 16pt cardstock, full color both sides
- Postcards 4x6 - 500: $79.99 - 500 postcards, 16pt cardstock, full color both sides
- Premium Business Cards - 500: $89.99 - 500 premium business cards, 32pt cardstock, soft touch laminate
- Retractable Banner Stand: $149.99 - 33x81 retractable banner with stand
- Tri-fold Brochures - 250: $149.99 - 250 tri-fold brochures, 100lb gloss text
- Tri-fold Brochures - 500: $199.99 - 500 tri-fold brochures, 100lb gloss text
- Vinyl Banner 3x6: $65 - 3ft x 6ft vinyl banner with grommets
- Vinyl Banner 4x8: $95 - 4ft x 8ft vinyl banner with grommets
- wrap parcial: Consultar - Wrap parcial consiste en cubrir el carro o van a la mitad o 3/4 partes. También podemos usar vinilos cortados en armonía con los requerimientos del cliente. Para dar un presupuesto real necesitamos ver el carro.
- Wrap total: Consultar - Wraps totales para su carro o van
- Yard Sign 18x24: $25 - Corrugated plastic yard sign with H-stake

## Team and transfers
If the caller asks for a person or department, use the transfer flow.

Team:
- Diseño - Ext: 90
- Administración - Ext: 91
- Ramon - Ext: 100

Transfer rules:
- If the caller asks for Ramon, Diseño, or Administración, collect minimal context first:
  - caller name
  - callback number if needed
  - short reason for the call
- Then use the transfer flow.
- Do not say you cannot transfer unless the transfer tool actually fails.
- If transfer fails, offer to take a message or request a callback.

## Frequently asked questions

Business hours:
- Monday through Friday: 9 AM to 6 PM
- Saturday: 10 AM to 2 PM
- Sunday: closed

Location:
- We are located in Tampa, Florida.
- Exact address: 5919 N. Armenia Ave., Tampa, FL 33603.
- If the caller asks for directions, you may share this address and offer to have the team send more detail if needed.

Turnaround:
- Standard turnaround is 3 to 5 business days for most jobs.
- Rush service is available, usually 24 to 48 hours for an additional fee.
- Large format and specialty items may take longer depending on the project.

Rush service:
- Rush fees are typically 25% to 50% extra depending on the job.

File formats:
- Accepted formats: PDF, AI, PSD, JPEG, PNG, and most common formats.
- Best results: high-resolution PDF, outlined fonts, 0.125 inch bleed.

Design services:
- Yes, in-house graphic design is available.
- Basic design starts at $35.
- Custom design starts at $75.
- Logo packages are custom quote.

Delivery:
- Local delivery in the Tampa Bay area is available for qualifying orders.
- Shipping is available nationwide.

Payments:
- Major credit cards, cash, checks, and invoicing for business accounts.
- Payment is usually required before production begins.

Proofs:
- Digital proofs are available before printing.
- Hard copy proofs may be available for an additional fee.

Spanish printing:
- Yes, we print in Spanish and other languages.

## Important behavior rules
- Never invent prices.
- Never invent turnaround promises.
- Never invent availability or approvals.
- If something needs confirmation, say it clearly.
- If you do not know, offer transfer or callback.
- Capture name, phone, and email whenever it helps move the request forward.
- If a caller sounds like a sales lead, collect contact details clearly.
- If the caller wants a quote for wraps or large custom work, explain that the team needs more details and offer transfer or callback.

## Good examples
- "Yes, that is available."
- "That price is $179.99."
- "For that, we would need to confirm a custom quote."
- "May I have your name and best callback number?"
- "I can connect you with Ramon."
- "If you prefer, I can take your message."

## Bad examples
- Long speeches
- Repeating the full catalog
- Guessing prices
- Guessing addresses
- Saying a transfer is impossible before trying the transfer flow`,

  first_message_en: "Hello, this is SWATWORKS. How can I help?",
  first_message_es: "Hola, habla SWATWORKS. ¿En qué puedo ayudarle?",
}

export const printShopProducts = [
  {
    name: "Business Cards - 500",
    description: "500 standard business cards, 16pt cardstock, full color both sides",
    price: 90,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Business Cards - 1000",
    description: "1000 standard business cards, 16pt cardstock, full color both sides",
    price: 100,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Premium Business Cards - 500",
    description: "500 premium business cards, 32pt cardstock, soft touch laminate",
    price: 89.99,
    price_type: "fixed",
    currency: "USD",
  },

  {
    name: "Flyers 8.5x11 - 250",
    description: "250 full color flyers, 100lb gloss text",
    price: 89.99,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Flyers 8.5x11 - 500",
    description: "500 full color flyers, 100lb gloss text",
    price: 129.99,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Flyers 8.5x11 - 1000",
    description: "1000 full color flyers, 100lb gloss text",
    price: 179.99,
    price_type: "fixed",
    currency: "USD",
  },

  {
    name: "Vinyl Banner 3x6",
    description: "3ft x 6ft vinyl banner with grommets",
    price: 65.0,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Vinyl Banner 4x8",
    description: "4ft x 8ft vinyl banner with grommets",
    price: 95.0,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Retractable Banner Stand",
    description: "33x81 retractable banner with stand",
    price: 149.99,
    price_type: "fixed",
    currency: "USD",
  },

  {
    name: "Postcards 4x6 - 500",
    description: "500 postcards, 16pt cardstock, full color both sides",
    price: 79.99,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Postcards 4x6 - 1000",
    description: "1000 postcards, 16pt cardstock, full color both sides",
    price: 119.99,
    price_type: "fixed",
    currency: "USD",
  },

  {
    name: "Tri-fold Brochures - 250",
    description: "250 tri-fold brochures, 100lb gloss text",
    price: 149.99,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Tri-fold Brochures - 500",
    description: "500 tri-fold brochures, 100lb gloss text",
    price: 199.99,
    price_type: "fixed",
    currency: "USD",
  },

  {
    name: "Yard Sign 18x24",
    description: "Corrugated plastic yard sign with H-stake",
    price: 25.0,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Foam Board Sign 24x36",
    description: '3/16" foam board mounted sign',
    price: 45.0,
    price_type: "fixed",
    currency: "USD",
  },

  {
    name: "Graphic Design - Basic",
    description: "Simple design or layout adjustments",
    price: 35.0,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Graphic Design - Custom",
    description: "Custom design from scratch",
    price: 75.0,
    price_type: "fixed",
    currency: "USD",
  },
  {
    name: "Logo Design Package",
    description: "Custom logo with 3 concepts and revisions",
    price_type: "quote",
    currency: "USD",
  },

  {
    name: "Custom Quote - Large Format",
    description: "Vehicle wraps, wall graphics, window graphics",
    price_type: "quote",
    currency: "USD",
  },
  {
    name: "wrap parcial",
    description:
      "Wrap parcial consiste en cubrir el carro o van a la mitad o 3/4 partes. También podemos usar vinilos cortados en armonía con los requerimientos del cliente. Para dar un presupuesto real necesitamos ver el carro.",
    price_type: "quote",
    currency: "USD",
  },
  {
    name: "Wrap total",
    description: "Wraps totales para su carro o van",
    price_type: "quote",
    currency: "USD",
  },

  {
    name: "medias",
    description: "par de medias de algodon",
    price: 30.0,
    price_type: "fixed",
    currency: "USD",
  },
]

export const printShopFAQs = [
  {
    question: "What are your business hours?",
    answer:
      "We're open Monday through Friday from 9 AM to 6 PM, Saturday from 10 AM to 2 PM, and closed on Sundays.",
    category: "General",
    keywords: ["hours", "open", "close", "schedule", "horario"],
  },
  {
    question: "Where are you located?",
    answer:
      "We're at 5919 N. Armenia Ave., Tampa, FL 33603. If you need more detailed directions, I can have the team follow up.",
    category: "General",
    keywords: ["location", "address", "directions", "where", "ubicacion", "direccion"],
  },
  {
    question: "How long does printing take?",
    answer:
      "Standard turnaround is 3-5 business days for most jobs. Rush service is often 24-48 hours for an extra fee. Large format and specialty work may take longer.",
    category: "Turnaround",
    keywords: ["time", "turnaround", "how long", "rush", "cuando", "tiempo"],
  },
  {
    question: "Do you offer rush services?",
    answer:
      "Yes. Rush fees are typically 25% to 50% extra depending on the job. Tell me your deadline and I can help route you.",
    category: "Turnaround",
    keywords: ["rush", "urgent", "fast", "emergency", "rapido", "urgente"],
  },
  {
    question: "What file formats do you accept?",
    answer:
      "We accept PDF, AI, PSD, JPEG, PNG, and most common formats. Best results: high-resolution PDF, fonts outlined, 0.125 inch bleed.",
    category: "Files",
    keywords: ["file", "format", "pdf", "upload", "design", "archivo", "formato"],
  },
  {
    question: "Do you offer design services?",
    answer:
      "Yes — in-house design. Basic starts at $35, custom from $75; logo packages are quoted per project.",
    category: "Services",
    keywords: ["design", "designer", "create", "logo", "diseno", "diseñador"],
  },
  {
    question: "Do you offer delivery?",
    answer:
      "Local delivery is available in the Tampa Bay area for qualifying orders, and we can ship nationwide.",
    category: "Delivery",
    keywords: ["delivery", "ship", "shipping", "pick up", "entrega", "envio"],
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "Major credit cards, cash, checks, and invoicing for business accounts. Payment is usually required before production starts.",
    category: "Payment",
    keywords: ["pay", "payment", "credit card", "invoice", "pago", "tarjeta"],
  },
  {
    question: "Can I see a proof before printing?",
    answer:
      "Yes — digital proofs before printing. Hard-copy proofs may be available for an additional fee.",
    category: "Process",
    keywords: ["proof", "preview", "approve", "sample", "prueba", "muestra"],
  },
  {
    question: "Do you print in Spanish?",
    answer: "Yes — we print in Spanish and other languages.",
    category: "Services",
    keywords: ["spanish", "espanol", "language", "idioma", "bilingue"],
  },
]

export const printShopTeam = [
  {
    name: "Diseño",
    role: "Graphic Design",
    extension: "90",
    is_available: true,
  },
  {
    name: "Administración",
    role: "Administration",
    extension: "91",
    is_available: true,
  },
  {
    name: "Ramon",
    role: "Owner / primary contact",
    extension: "100",
    is_available: true,
  },
]
