export const INDUSTRY_TEMPLATE_VERSION = 'v1'

export const INDUSTRY_KEYS = [
  'printing',
  'electrician',
  'hvac',
  'plumbing',
  'cleaning',
  'roofing_contractor',
  'psychology_therapy',
  'medical_dental',
  'real_estate',
  'general_services',
] as const

export type IndustryKey = (typeof INDUSTRY_KEYS)[number]

export type IndustryTemplate = {
  key: IndustryKey
  displayName: string
  assistantTone: string
  leadQualificationQuestions: string[]
  commonServiceCategories: string[]
  spamFilteringHints: string[]
  importantCallSignals: string[]
  defaultFollowUpIntent: string
  notificationSummaryStyle: string
  editableScriptGuidelines: string[]
  preview: {
    asks: string[]
    prioritizes: string[]
    captures: string[]
  }
}

export const industryTemplates: Record<IndustryKey, IndustryTemplate> = {
  printing: {
    key: 'printing',
    displayName: 'Printing / Imprenta',
    assistantTone: 'Helpful, detail-oriented, and clear about production needs and timing.',
    leadQualificationQuestions: [
      'What type of print job do you need?',
      'What quantity do you need?',
      'What material or format do you prefer?',
      'When do you need it ready?',
      'Do you need pickup or delivery?',
      'Do you already have the design file?',
    ],
    commonServiceCategories: ['Business cards', 'Flyers', 'Banners', 'Signs', 'Labels', 'Custom print jobs'],
    spamFilteringHints: ['Generic sales pitches', 'Wrong-number calls', 'Unrelated vendor offers'],
    importantCallSignals: ['Deadline-sensitive jobs', 'Large quantity requests', 'Repeat customers', 'Pickup or delivery questions'],
    defaultFollowUpIntent: 'Confirm print specifications, deadline, artwork status, and next production step.',
    notificationSummaryStyle: 'Summarize job type, quantity, material, deadline, delivery/pickup, and design-file status.',
    editableScriptGuidelines: [
      'Ask for production details before pricing.',
      'Confirm timing expectations clearly.',
      'Keep artwork/design-file questions simple.',
    ],
    preview: {
      asks: ['Job type', 'Quantity', 'Material', 'Deadline', 'Pickup/delivery', 'Design file status'],
      prioritizes: ['Urgent deadlines', 'High-volume jobs', 'Existing customers'],
      captures: ['Print specs', 'Timeline', 'Contact details', 'Next step'],
    },
  },
  electrician: {
    key: 'electrician',
    displayName: 'Electrician',
    assistantTone: 'Calm, practical, and safety-aware without giving technical repair instructions.',
    leadQualificationQuestions: [
      'What electrical service do you need?',
      'Is this urgent or an emergency?',
      'What is the service address?',
      'Is there any immediate safety concern?',
      'What time works best for a callback or visit?',
    ],
    commonServiceCategories: ['Repairs', 'Panel work', 'Outlets and switches', 'Lighting', 'Inspections', 'Emergency service'],
    spamFilteringHints: ['Telemarketing', 'Unrelated home-service pitches', 'No service location provided'],
    importantCallSignals: ['Power outage', 'Burning smell', 'Sparks', 'Breaker issues', 'Same-day service requests'],
    defaultFollowUpIntent: 'Confirm service type, urgency, address, safety concern, and preferred appointment time.',
    notificationSummaryStyle: 'Highlight urgency, safety signal, address, service requested, and callback window.',
    editableScriptGuidelines: [
      'Avoid troubleshooting instructions that could create safety risk.',
      'Escalate urgent safety language in the summary.',
      'Keep address and preferred time easy to confirm.',
    ],
    preview: {
      asks: ['Service type', 'Urgency', 'Address', 'Safety issue', 'Preferred time'],
      prioritizes: ['Safety concerns', 'Emergency work', 'Same-day requests'],
      captures: ['Issue summary', 'Location', 'Urgency', 'Callback window'],
    },
  },
  hvac: {
    key: 'hvac',
    displayName: 'HVAC',
    assistantTone: 'Professional, reassuring, and focused on comfort, system details, and scheduling.',
    leadQualificationQuestions: [
      'Is the issue with heating, cooling, or both?',
      'What type of system do you have?',
      'How urgent is the issue?',
      'What is the service address?',
      'What time works best for service or a callback?',
    ],
    commonServiceCategories: ['AC repair', 'Heating repair', 'Maintenance', 'Installation', 'Air quality', 'Emergency service'],
    spamFilteringHints: ['Warranty spam', 'Unrelated vendor offers', 'Out-of-area calls'],
    importantCallSignals: ['No heat', 'No cooling', 'Extreme weather', 'Commercial system down', 'Elderly or vulnerable occupant mentioned'],
    defaultFollowUpIntent: 'Confirm HVAC issue, system type, urgency, address, and service window.',
    notificationSummaryStyle: 'Summarize system issue, urgency, property address, and preferred scheduling window.',
    editableScriptGuidelines: [
      'Ask enough to route the call without diagnosing.',
      'Flag comfort emergencies clearly.',
      'Keep seasonal wording editable for the business.',
    ],
    preview: {
      asks: ['Heating/cooling issue', 'System type', 'Urgency', 'Address', 'Preferred time'],
      prioritizes: ['No heat/cooling', 'Extreme weather', 'Commercial downtime'],
      captures: ['System issue', 'Urgency', 'Location', 'Scheduling preference'],
    },
  },
  plumbing: {
    key: 'plumbing',
    displayName: 'Plumbing',
    assistantTone: 'Direct, calm, and urgency-aware around leaks, clogs, and water damage.',
    leadQualificationQuestions: [
      'Is this a leak, clog, installation, or another plumbing issue?',
      'How urgent is the issue?',
      'Is the water shut off or still running?',
      'What is the service address?',
      'What time works best for a callback or visit?',
    ],
    commonServiceCategories: ['Leaks', 'Clogs', 'Drain cleaning', 'Water heaters', 'Installations', 'Emergency service'],
    spamFilteringHints: ['Generic sales calls', 'Wrong service area', 'Unrelated maintenance offers'],
    importantCallSignals: ['Active leak', 'Water damage', 'No water', 'Sewer backup', 'Emergency service request'],
    defaultFollowUpIntent: 'Confirm plumbing issue, urgency, water shutoff status, address, and callback window.',
    notificationSummaryStyle: 'Lead with emergency status, issue type, water status, address, and requested timing.',
    editableScriptGuidelines: [
      'Ask whether water is still running.',
      'Avoid detailed repair instructions.',
      'Surface emergency language in alerts.',
    ],
    preview: {
      asks: ['Leak/clog/installation', 'Urgency', 'Water shutoff status', 'Address'],
      prioritizes: ['Active leaks', 'Sewer backups', 'Water damage risk'],
      captures: ['Issue type', 'Emergency status', 'Location', 'Callback preference'],
    },
  },
  cleaning: {
    key: 'cleaning',
    displayName: 'Cleaning',
    assistantTone: 'Friendly, organized, and specific about property details and scheduling.',
    leadQualificationQuestions: [
      'What type of property needs cleaning?',
      'What is the approximate size?',
      'Is this one-time or recurring service?',
      'What date or time do you prefer?',
      'Are there any special requirements?',
    ],
    commonServiceCategories: ['Residential cleaning', 'Commercial cleaning', 'Move-in/move-out', 'Deep cleaning', 'Recurring service'],
    spamFilteringHints: ['Vendor solicitations', 'No property details', 'Unrelated service requests'],
    importantCallSignals: ['Recurring service interest', 'Large property', 'Move-out deadline', 'Commercial account'],
    defaultFollowUpIntent: 'Confirm property type, size, frequency, preferred time, and special requirements.',
    notificationSummaryStyle: 'Summarize property type, size, frequency, requested date/time, and special notes.',
    editableScriptGuidelines: [
      'Keep property-size questions flexible.',
      'Separate one-time and recurring interest.',
      'Capture special requirements without overcomplicating the call.',
    ],
    preview: {
      asks: ['Property type', 'Size', 'Frequency', 'Preferred date/time', 'Special requirements'],
      prioritizes: ['Recurring accounts', 'Commercial jobs', 'Deadline-driven cleanings'],
      captures: ['Scope', 'Frequency', 'Timing', 'Special notes'],
    },
  },
  roofing_contractor: {
    key: 'roofing_contractor',
    displayName: 'Roofing / Contractor',
    assistantTone: 'Professional, practical, and focused on project scope, urgency, and inspection needs.',
    leadQualificationQuestions: [
      'What type of project do you need help with?',
      'Is this residential or commercial?',
      'How urgent is the project?',
      'What is the property address?',
      'Do you need an inspection or estimate?',
    ],
    commonServiceCategories: ['Roof repair', 'Roof replacement', 'Storm damage', 'General contracting', 'Inspections', 'Estimates'],
    spamFilteringHints: ['Material vendor calls', 'Unrelated financing pitches', 'No property location'],
    importantCallSignals: ['Storm damage', 'Active leak', 'Insurance timeline', 'Large project', 'Inspection request'],
    defaultFollowUpIntent: 'Confirm project type, property type, urgency, address, and inspection or estimate need.',
    notificationSummaryStyle: 'Summarize project scope, urgency, property type, address, and inspection need.',
    editableScriptGuidelines: [
      'Prioritize active damage and storm-related language.',
      'Avoid promising estimates before review.',
      'Capture whether an inspection is needed.',
    ],
    preview: {
      asks: ['Project type', 'Property type', 'Urgency', 'Address', 'Inspection needs'],
      prioritizes: ['Storm damage', 'Active leaks', 'Inspection requests'],
      captures: ['Project scope', 'Property info', 'Urgency', 'Next step'],
    },
  },
  psychology_therapy: {
    key: 'psychology_therapy',
    displayName: 'Psychology / Therapy',
    assistantTone: 'Warm, discreet, and focused on scheduling and callback coordination.',
    leadQualificationQuestions: [
      'What is your name and phone number?',
      'What is the best time for a callback?',
      'Are you a new or existing patient?',
      'What is the general reason for your contact?',
    ],
    commonServiceCategories: ['New patient inquiry', 'Existing patient callback', 'Appointment request', 'General office question'],
    spamFilteringHints: ['Marketing calls', 'Unrelated solicitations', 'Incomplete callback information'],
    importantCallSignals: ['New patient request', 'Appointment change', 'Urgent callback request', 'Existing patient needing office follow-up'],
    defaultFollowUpIntent: 'Arrange a discreet callback with name, phone, general reason, and preferred callback time.',
    notificationSummaryStyle: 'Keep the summary brief and scheduling-focused; avoid sensitive clinical details.',
    editableScriptGuidelines: [
      'Do not ask for sensitive clinical details.',
      'Keep the conversation focused on callback and scheduling.',
      'Use general reason for contact only.',
    ],
    preview: {
      asks: ['Name', 'Phone', 'Preferred callback time', 'General reason', 'New/existing patient'],
      prioritizes: ['Callback requests', 'Appointment needs', 'New patient inquiries'],
      captures: ['Contact details', 'Callback preference', 'General office reason'],
    },
  },
  medical_dental: {
    key: 'medical_dental',
    displayName: 'Medical / Dental',
    assistantTone: 'Clear, courteous, and scheduling-focused while avoiding unnecessary medical details.',
    leadQualificationQuestions: [
      'What is your name and phone number?',
      'Are you a new or existing patient?',
      'What is the general appointment reason?',
      'How urgent is the request?',
      'What time works best for a callback?',
    ],
    commonServiceCategories: ['New patient appointment', 'Existing patient callback', 'Dental appointment', 'General office question'],
    spamFilteringHints: ['Vendor calls', 'Insurance sales pitches', 'Unrelated solicitations'],
    importantCallSignals: ['Urgent appointment request', 'New patient inquiry', 'Existing patient callback', 'Schedule change'],
    defaultFollowUpIntent: 'Confirm patient status, general appointment reason, urgency, and callback preference.',
    notificationSummaryStyle: 'Summarize scheduling need, patient status, urgency, and callback details without unnecessary medical detail.',
    editableScriptGuidelines: [
      'Avoid collecting unnecessary medical details.',
      'Keep reason-for-contact general.',
      'Route urgent language to the team summary without making clinical claims.',
    ],
    preview: {
      asks: ['Name', 'Phone', 'New/existing patient', 'General appointment reason', 'Urgency'],
      prioritizes: ['Urgent scheduling', 'New patient calls', 'Existing patient callbacks'],
      captures: ['Contact info', 'Patient status', 'General scheduling reason'],
    },
  },
  real_estate: {
    key: 'real_estate',
    displayName: 'Real Estate',
    assistantTone: 'Polished, responsive, and focused on intent, market area, and timing.',
    leadQualificationQuestions: [
      'Are you buying, selling, or renting?',
      'What area are you interested in?',
      'What budget range should the team know about?',
      'What is your timeline?',
      'What time works best for a callback?',
    ],
    commonServiceCategories: ['Buyer lead', 'Seller lead', 'Rental inquiry', 'Property valuation', 'Showing request'],
    spamFilteringHints: ['Investor spam with no details', 'Vendor solicitations', 'Out-of-market calls'],
    importantCallSignals: ['Ready-to-act buyer or seller', 'Showing request', 'Specific property inquiry', 'Short timeline'],
    defaultFollowUpIntent: 'Confirm real estate intent, area, budget range, timeline, and preferred callback.',
    notificationSummaryStyle: 'Summarize intent, area, budget, timeline, property details if provided, and callback preference.',
    editableScriptGuidelines: [
      'Keep budget wording comfortable and optional.',
      'Capture whether the caller is buying, selling, or renting.',
      'Flag short timelines and property-specific requests.',
    ],
    preview: {
      asks: ['Buying/selling/renting', 'Area', 'Budget range', 'Timeline', 'Preferred callback'],
      prioritizes: ['Specific property inquiries', 'Short timelines', 'Ready buyers/sellers'],
      captures: ['Intent', 'Market area', 'Budget range', 'Timeline'],
    },
  },
  general_services: {
    key: 'general_services',
    displayName: 'General Service Business',
    assistantTone: 'Professional, concise, and adaptable to the caller need.',
    leadQualificationQuestions: [
      'What service do you need?',
      'How urgent is it?',
      'What address or location is this for?',
      'What time works best for a callback?',
    ],
    commonServiceCategories: ['Service request', 'Estimate request', 'Scheduling', 'Callback', 'General question'],
    spamFilteringHints: ['Generic sales pitches', 'Wrong-number calls', 'Unrelated vendor solicitations'],
    importantCallSignals: ['Urgent service need', 'Estimate request', 'Ready-to-schedule caller', 'Repeat customer'],
    defaultFollowUpIntent: 'Confirm service needed, urgency, location, and callback preference.',
    notificationSummaryStyle: 'Summarize caller need, urgency, location, and requested next step.',
    editableScriptGuidelines: [
      'Keep questions broad enough for multiple service lines.',
      'Capture urgency and location early.',
      'Make the script easy to customize later.',
    ],
    preview: {
      asks: ['Service needed', 'Urgency', 'Address/location', 'Preferred callback time'],
      prioritizes: ['Urgent requests', 'Ready-to-book leads', 'Repeat customers'],
      captures: ['Service need', 'Location', 'Urgency', 'Callback preference'],
    },
  },
}

export const industryTemplateOptions = INDUSTRY_KEYS.map((key) => industryTemplates[key])

export function isIndustryKey(value: unknown): value is IndustryKey {
  return typeof value === 'string' && INDUSTRY_KEYS.includes(value as IndustryKey)
}

export function getIndustryTemplate(value: unknown): IndustryTemplate {
  return isIndustryKey(value) ? industryTemplates[value] : industryTemplates.general_services
}
