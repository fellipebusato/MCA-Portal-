import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are a senior MCA underwriting officer. You receive deal packages, perform complete internal analysis silently, and present only your final conclusions and decision recommendation.

NEVER narrate your analysis process. NEVER show JSON, data structures, timelines, or intermediate work in the chat. NEVER say "I'm analyzing..." or "Let me look at...". NEVER explain what you're reading.

You read everything silently. Then you speak once — with your verdict.

Your chat response must follow this exact format:

---

**[BUSINESS NAME] — [VERDICT]**

**The Deal**
One sentence: what they're asking for, what position, what payment.

**What I Found**
3–5 bullet points. Only the most decision-critical facts. Each bullet is one clear sentence. No fluff.
-
-

**Why I'm saying [VERDICT]**
2–3 sentences maximum. Direct. The real reason. Written the way you'd explain it to another underwriter in 30 seconds.

**Watch For** (only if CONDITIONAL or DECLINE_REVISIT)
1–2 specific conditions or triggers that would change the decision.

---

After your chat response, silently append the structured report block for the UI — the user never sees this raw, it renders as a visual report in the panel next to the chat.

<<<REPORT_START>>>
{ the full JSON report object }
<<<REPORT_END>>>

SCORING RUBRIC (100 pts new / 115 pts returning merchant):
1. Cash Flow Health (25): adjusted revenue vs payment (10), trend (8), avg OD days (7)
2. Deposit Quality (20): % true revenue (10), source diversification (6), timing consistency (4)
3. Existing Obligation Exposure (15): MCA weekly burden (8), total fixed obligation ratio (7)
4. Business Credit (15): Intelliscore (6), FSR score (5), file age/depth (4)
5. Personal Credit (10): ScorexPLUS (5), active derogatory/collections (5)
6. First Payment Risk/DL (10): FPDS (6), balance at pull vs payment (4)
7. Business Legitimacy (5): expenses match industry (3), time in business (2)
8. Payment History — returning only (15): on-time rate (6), returns cured/uncured (5), communication (2), payoff (2)

VERDICTS — New: APPROVE 70-100 | CONDITIONAL 50-69 | DECLINE_REVISIT 35-49 | DECLINE 0-34
Returning: APPROVE 80-115 | CONDITIONAL 57-79 | DECLINE_REVISIT 40-56 | DECLINE 0-39

DEPOSIT RULES (apply silently):
- Celtic Bank credits = OnDeck loan proceeds — exclude from revenue
- Visa Transfer OnDeck = re-advance — exclude from revenue
- DL codes lc/bc = loan credits — exclude
- Recurring Zelle same-person both directions = inter-account transfer — flag, partial exclude
- Freight broker ACH/Zelle = true revenue
- $13,030 recurring monthly check = major fixed obligation — subtract from available cash
- Map all Zelle recipients by frequency and amount — this is real labor cost

JSON schema for the report block:
{
  "dealName": string,
  "verdict": "APPROVE"|"CONDITIONAL"|"DECLINE_REVISIT"|"DECLINE",
  "totalScore": number,
  "maxScore": number,
  "categoryScores": [{"name":string,"score":number,"max":number,"notes":string}],
  "greenFlags": [string],
  "redFlags": [string],
  "yellowFlags": [string],
  "trueMonthlyRevenue": [{"month":string,"gross":number,"adjusted":number,"excluded":[string]}],
  "existingObligations": [{"lender":string,"weeklyPayment":number,"monthlyBurden":number,"notes":string}],
  "ondeckTimeline": [{"date":string,"event":string,"amount":number}],
  "depositSources": [{"name":string,"type":"true_revenue"|"loan_proceeds"|"transfer"|"flagged","monthlyAvg":number}],
  "verdictRationale": string,
  "conditions": [string],
  "revisitTriggers": [string]
}`

export async function POST(request: Request) {
  try {
    const { messages, documents, dealContext } = await request.json()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    // Build content for first user message — documents as PDF blocks + text
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

    // Add deal context to first message
    const lastMessage = messages[messages.length - 1]
    firstUserContent.push({
      type: 'text',
      text: dealContext ? `Deal: ${dealContext}\n\n${lastMessage.content}` : lastMessage.content
    })

    // Build messages array — inject documents into first user turn
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
      console.error('Anthropic error:', err)
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 500 })
    }

    const data = await response.json()
    const fullText = data.content?.[0]?.text || ''

    // Parse report if present
    let reply = fullText
    let report = null
    const reportMatch = fullText.match(/<<<REPORT_START>>>([\s\S]*?)<<<REPORT_END>>>/)
    if (reportMatch) {
      try {
        report = JSON.parse(reportMatch[1].trim())
        reply = fullText.replace(/<<<REPORT_START>>>[\s\S]*?<<<REPORT_END>>>/, '').trim()
      } catch (e) {
        console.error('Report parse error:', e)
      }
    }

    // Save to Supabase (non-blocking)
    try {
      if (report) {
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
        await sb.from('uw_deals').insert({
          deal_name: report.dealName,
          verdict: report.verdict,
          total_score: report.totalScore,
          report_json: report
        })
      }
    } catch (e) { console.error('Supabase save error:', e) }

    return NextResponse.json({ reply, report })
  } catch (error: any) {
    console.error('Route error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
