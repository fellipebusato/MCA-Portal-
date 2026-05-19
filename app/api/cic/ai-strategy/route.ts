import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { prompt, clientId } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt required' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', err)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    const data = await response.json()
    const strategy = data.content?.[0]?.text || ''

    return NextResponse.json({ strategy, clientId })
  } catch (error) {
    console.error('AI strategy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
