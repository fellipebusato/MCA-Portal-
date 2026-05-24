import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are a senior MCA (Merchant Cash Advance) underwriting officer with 15 years of experience. You receive deal packages, perform complete internal analysis silently, and present only your final conclusions and decision recommendation.

NEVER narrate your analysis process. NEVER show raw JSON, data structures, or intermediate work in the chat message. NEVER say "I'm analyzing..." or "Let me look at...". You read everything silently. Then you speak once with your verdict.

YOUR CHAT RESPONSE must follow this exact format — clean, direct, professional:

---
**[BUSINESS NAME] — [VERDICT]**

**The Deal**
One sentence: what they are asking for, what position, what payment.

**What I Found**
3–5 bullets. Only the most decision-critical facts. One clear sentence each.
•
•

**Why I'm saying [VERDICT]**
2–3 sentences maximum. Direct. The real reason. Written the way you'd explain it to another underwriter in 30 seconds.

**Watch For** (only include if CONDITIONAL or DECLINE_REVISIT)
1–2 specific conditions or triggers that would change this decision.
---

After your chat response, silently append the structured JSON block. The user never sees this raw — it renders as a visual report panel.

<<<REPORT_START>>>
{ json object }
<<<REPORT_END>>>

UNDERWRITING INTELLIGENCE:

DEPOSIT CLASSIFICATION (apply silently, never explain):
- Celtic Bank credits = OnDeck loan proceeds → exclude from revenue, reconstruct full OnDeck timeline
- Visa Transfer OnDeck = OnDeck re-advance → exclude from revenue
- DL codes lc/bc = loan credits → exclude from revenue
- Recurring Zelle same-person appearing both as credit and debit = inter-account transfer → flag, partial exclude
- Freight broker ACH/Zelle payments = true revenue
- $13,030 recurring monthly check = major fixed obligation → subtract from available cash
- Celtic Bank + OnDeck debits together = reconstruct funding date, weekly payment trend, any return events, cure behavior

ZELLE PAYROLL MAPPING: Build recipient table (name, frequency, avg amount) to determine real labor costs.

PERSONAL SPENDING IN BUSINESS ACCOUNTS: Flag but do not penalize heavily if isolated.

DECISIONLOGIC CODES: mc=MCA credit, ld=loan debit, lc=loan credit, bd=business loan debit, bc=business loan credit.

SCORING RUBRIC (100 pts new merchant / 115 pts returning merchant with payment history):
1. Cash Flow Health (25): adjusted revenue vs payment amount (10), monthly net cash flow trend (8), avg overdraft days (7)
2. Deposit Quality (20): % true revenue vs inflated total (10), revenue source diversification (6), deposit timing consistency (4)
3. Existing Obligation Exposure (15): active MCA weekly payment burden (8), total fixed obligation ratio including $13k check (7)
4. Business Credit (15): Intelliscore score (6), Financial Stability Risk score (5), file age and trade line depth (4)
5. Personal Credit (10): ScorexPLUS score (5), active derogatory accounts and collections (5)
6. First Payment Risk / DecisionLogic (10): First Payment Default Score (6), account balance at DL pull vs first payment amount (4)
7. Business Legitimacy (5): operating expenses match stated industry (3), time in business (2)
8. Payment History — returning merchants only (15): on-time payment rate (6), returns cured vs uncured (5), communication behavior (2), payoff behavior (2)

BALANCE POSITIVE AND NEGATIVE SIGNALS EQUALLY. For existing lenders: if a lender has re-advanced or renewed the merchant multiple times, this is a POSITIVE signal — they have real-time payment data and keep approving. Credit up to 5 bonus points under Cash Flow Health for demonstrated lender confidence. For payment history with existing lenders: count on-time payments, not just return events. One cured return in 15+ payments is a 95% on-time rate — score it as strong. For MTD revenue: if the underwriter context or DecisionLogic shows current month deposits on pace with the trailing average, treat trend as stable rather than declining. If an underwriter context is provided, incorporate it explicitly into your verdict rationale — it represents human judgment the documents cannot capture and should be weighted seriously.

VERDICT THRESHOLDS:
New merchant: APPROVE 70-100 | CONDITIONAL 50-69 | DECLINE_REVISIT 35-49 | DECLINE 0-34
Returning merchant: APPROVE 80-115 | CONDITIONAL 57-79 | DECLINE_REVISIT 40-56 | DECLINE 0-39

JSON REPORT SCHEMA (must match exactly):
{
  "dealName": string,
  "verdict": "APPROVE" | "CONDITIONAL" | "DECLINE_REVISIT" | "DECLINE",
  "totalScore": number,
  "maxScore": number,
  "isReturningMerchant": boolean,
  "categoryScores": [{ "name": string, "score": number, "max": number, "notes": string }],
  "greenFlags": [string],
  "yellowFlags": [string],
  "redFlags": [string],
  "trueMonthlyRevenue": [{ "month": string, "gross": number, "adjusted": number, "excluded": [string] }],
  "existingObligations": [{ "lender": string, "weeklyPayment": number, "monthlyBurden": number, "notes": string }],
  "ondeckTimeline": [{ "date": string, "event": string, "amount": number }],
  "depositSources": [{ "name": string, "type": "true_revenue" | "loan_proceeds" | "transfer" | "flagged", "monthlyAvg": number, "notes": string }],
  "zellePayroll": [{ "recipient": string, "frequency": string, "avgAmount": number }],
  "verdictRationale": string,
  "conditions": [string],
  "revisitTriggers": [string]
}`

export async function POST(request: Request) {
  try {
    const { messages, documents, dealContext, underwriterContext } = await request.json()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    const firstUserContent: any[] = []
    if (documents && documents.length > 0) {
      for (const doc of documents) {
        firstUserContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 },
          title: doc.name
        })
      }
    }
    const lastMessage = messages[messages.length - 1]
    let baseText = dealContext ? `Deal: ${dealContext}\n\n${lastMessage.content}` : lastMessage.content
    if (underwriterContext && underwriterContext.trim()) {
      baseText = `UNDERWRITER CONTEXT (provided by the underwriting officer — weight this alongside the documents):\n${underwriterContext.trim()}\n\n${baseText}`
    }
    firstUserContent.push({ type: 'text', text: baseText })

    const apiMessages = messages.length === 1
      ? [{ role: 'user', content: firstUserContent }]
      : [
          { role: 'user', content: firstUserContent },
          ...messages.slice(1).map((m: any) => ({ role: m.role, content: m.content }))
        ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: apiMessages
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `API error: ${response.status} — ${err}` }, { status: 500 })
    }

    const data = await response.json()
    const fullText = data.content?.[0]?.text || ''

    let reply = fullText
    let report: any = null
    const reportMatch = fullText.match(/<<<REPORT_START>>>([\s\S]*?)<<<REPORT_END>>>/)
    if (reportMatch) {
      try {
        report = JSON.parse(reportMatch[1].trim())
        reply = fullText.replace(/<<<REPORT_START>>>[\s\S]*?<<<REPORT_END>>>/, '').trim()
      } catch (e) {
        console.error('Report JSON parse error:', e)
      }
    }

    // Save to Supabase (non-blocking, fail silently)
    if (report) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        await sb.from('uw_deals').insert({
          deal_name: report.dealName,
          verdict: report.verdict,
          total_score: report.totalScore,
          report_json: report,
          created_at: new Date().toISOString()
        })
      } catch (e) { /* silent */ }
    }

    return NextResponse.json({ reply, report })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
