// MCA Underwriting Agent Route
import { NextResponse } from 'next/server'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are a senior MCA underwriting officer with 15 years of experience. Analyze deal packages silently and present only your final verdict.

NEVER narrate your process. NEVER show raw JSON in chat. Speak once with your verdict in this exact plain text format:

---
BUSINESS NAME — VERDICT

The Deal
One sentence: amount, position, payment.

What I Found
- bullet
- bullet

Why I'm saying [VERDICT]
2-3 sentences max.

Watch For (CONDITIONAL or DECLINE_REVISIT only)
1-2 conditions that would change the decision.
---

Then append silently:
<<<REPORT_START>>>
{ json }
<<<REPORT_END>>>

DEPOSIT RULES: Celtic Bank = OnDeck proceeds (exclude). Visa Transfer OnDeck = re-advance (exclude). DL lc/bc codes = loan credits (exclude). Recurring Zelle same person both directions = inter-account (flag). Freight broker payments = true revenue. Recurring monthly check = fixed obligation. Map all Zelle recipients for labor costs.

POSITIVE SIGNALS: Multiple lender re-advances = +5 bonus pts Cash Flow Health. One cured return in 15+ payments = strong history. MTD on pace = stable trend. Underwriter context = weight seriously.

SCORING (100 new / 115 returning):
1. Cash Flow Health 25pts (+5 bonus lender confidence)
2. Deposit Quality 20pts
3. Existing Obligation Exposure 15pts
4. Business Credit 15pts
5. Personal Credit 10pts
6. First Payment Risk/DL 10pts
7. Business Legitimacy 5pts
8. Payment History returning only 15pts

VERDICTS new: APPROVE 70-100 | CONDITIONAL 50-69 | DECLINE_REVISIT 35-49 | DECLINE 0-34
VERDICTS returning: APPROVE 80-115 | CONDITIONAL 57-79 | DECLINE_REVISIT 40-56 | DECLINE 0-39

JSON: {"dealName":"","verdict":"","totalScore":0,"maxScore":100,"isReturningMerchant":false,"categoryScores":[{"name":"","score":0,"max":0,"notes":""}],"greenFlags":[],"yellowFlags":[],"redFlags":[],"trueMonthlyRevenue":[{"month":"","gross":0,"adjusted":0,"excluded":[]}],"existingObligations":[{"lender":"","weeklyPayment":0,"monthlyBurden":0,"notes":""}],"ondeckTimeline":[{"date":"","event":"","amount":0}],"depositSources":[{"name":"","type":"true_revenue","monthlyAvg":0,"notes":""}],"zellePayroll":[{"recipient":"","frequency":"","avgAmount":0}],"verdictRationale":"","conditions":[],"revisitTriggers":[]}`

export async function POST(request: Request) {
  try {
    const { messages, documents, dealContext, underwriterContext } = await request.json()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    const firstUserContent: any[] = []
    if (documents?.length > 0) {
      for (const doc of documents) {
        const isStatement = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|statement|bank/i.test(doc.name)
        const maxChars = isStatement ? 1400000 : 800000
        firstUserContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: doc.base64.slice(0, maxChars) },
          title: doc.name
        })
      }
    }

    const lastMessage = messages[messages.length - 1]
    let textContent = lastMessage.content
    if (underwriterContext?.trim()) textContent = `UNDERWRITER CONTEXT:\n${underwriterContext}\n\n${textContent}`
    if (dealContext?.trim()) textContent = `Deal: ${dealContext}\n\n${textContent}`
    firstUserContent.push({ type: 'text', text: textContent })

    const apiMessages = messages.length === 1
      ? [{ role: 'user', content: firstUserContent }]
      : [{ role: 'user', content: firstUserContent }, ...messages.slice(1).map((m: any) => ({ role: m.role, content: m.content }))]

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: apiMessages,
        stream: true
      })
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      return NextResponse.json({ error: `Anthropic error: ${err}` }, { status: 500 })
    }

    const reader = anthropicRes.body!.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value).split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) fullText += parsed.delta.text
          } catch {}
        }
      }
    }

    let reply = fullText
    let report: any = null
    const match = fullText.match(/<<<REPORT_START>>>([\s\S]*?)<<<REPORT_END>>>/)
    if (match) {
      try {
        report = JSON.parse(match[1].trim())
        reply = fullText.replace(/<<<REPORT_START>>>[\s\S]*?<<<REPORT_END>>>/, '').trim()
      } catch (e) { console.error('Parse error:', e) }
    }

    if (report) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
        await sb.from('uw_deals').insert({ deal_name: report.dealName, verdict: report.verdict, total_score: report.totalScore, report_json: report, created_at: new Date().toISOString() })
      } catch {}
    }

    return NextResponse.json({ reply, report })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
