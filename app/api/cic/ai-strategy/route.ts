import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are an expert MCA (Merchant Cash Advance) underwriting agent with 15 years of experience. You analyze deal packages and produce structured underwriting decisions.

You have deep knowledge of:
- Bank statement analysis: distinguishing true operating revenue from loan proceeds, inter-account transfers, and owner injections
- MCA stack detection: Celtic Bank credits = OnDeck capital injection (exclude from revenue, reconstruct full OnDeck timeline), Visa Transfer OnDeck = re-advance event
- Deposit classification: freight broker ACH = true revenue; Celtic Bank/OnDeck credits = loan proceeds excluded; recurring Zelle same-person credits+debits = inter-account transfers flagged; DL codes lc/bc = loan credits excluded
- The $13,030 recurring monthly check pattern = major fixed obligation, flag and subtract from available cash
- Zelle payroll mapping: build a table of recurring recipients, frequency, amounts — this shows real labor costs
- Personal spending mixed in business accounts: flag but don't penalize heavily if isolated
- DecisionLogic: FPDS interpretation, DL transaction codes (mc=MCA credit, ld=loan debit, lc=loan credit, bd=business loan debit, bc=business loan credit), real-time balance signal
- Payment history with funding source is the single strongest approval signal for returning merchants

SCORING RUBRIC (100 pts new / 115 pts returning merchant):
1. Cash Flow Health (25): adjusted revenue vs payment (10), trend (8), avg OD days (7)
2. Deposit Quality (20): % true revenue (10), source diversification (6), timing consistency (4)
3. Existing Obligation Exposure (15): MCA weekly burden (8), total fixed obligation ratio (7)
4. Business Credit (15): Intelliscore (6), FSR score (5), file age/depth (4)
5. Personal Credit (10): ScorexPLUS (5), active derogatory/collections (5)
6. First Payment Risk/DL (10): FPDS (6), balance at pull vs payment (4)
7. Business Legitimacy (5): expenses match industry (3), time in business (2)
8. Payment History — returning only (15): on-time rate (6), returns cured/uncured (5), communication (2), payoff (2)

VERDICTS — New merchant: APPROVE 70-100 | CONDITIONAL 50-69 | DECLINE_REVISIT 35-49 | DECLINE 0-34
Returning merchant: APPROVE 80-115 | CONDITIONAL 57-79 | DECLINE_REVISIT 40-56 | DECLINE 0-39

When you have enough documents for full analysis, respond conversationally with key findings THEN output:
<<<REPORT_START>>>
{ exact JSON matching the schema }
<<<REPORT_END>>>

JSON schema:
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
}

For casual questions respond conversationally only — no JSON needed.`

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
