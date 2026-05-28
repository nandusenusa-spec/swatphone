export type DailyCallBucket = 'follow_up' | 'normal' | 'spam' | 'missed'

export type DailyCallEntry = {
  id: string
  at: string
  phone: string
  contactName: string
  contactHint: string | null
  reason: string
  intent: string | null
  nextAction: string | null
  bucket: DailyCallBucket
  followUp: boolean
  isNewLead: boolean
  durationSeconds: number
}

export type DailyLeadEntry = {
  id: string
  name: string | null
  phone: string
  status: string | null
  notesPreview: string | null
  createdAt: string
}

export type DailyCallSummary = {
  dateLabel: string
  dateKey: string
  timezone: string
  stats: {
    totalCalls: number
    completed: number
    missed: number
    spamOrBot: number
    newLeads: number
    needFollowUp: number
    noFollowUp: number
  }
  followUpCalls: DailyCallEntry[]
  normalCalls: DailyCallEntry[]
  spamCalls: DailyCallEntry[]
  missedCalls: DailyCallEntry[]
  newLeads: DailyLeadEntry[]
}
