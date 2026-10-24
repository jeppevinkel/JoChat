export interface SseEvent {
  event: string
  data: string
}

// Minimal SSE reader over a fetch Response body. EventSource can't POST or send an
// Authorization header, which is why the chat endpoint is consumed this way.
export async function* readSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) return
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let event = 'message'
  let data: string[] = []

  const flush = (): SseEvent | null => {
    if (data.length === 0) return null
    const out = { event, data: data.join('\n') }
    event = 'message'
    data = []
    return out
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      if (line === '') {
        const evt = flush()
        if (evt) yield evt
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).replace(/^ /, ''))
      }
      // comments (":") and id/retry fields are ignored
    }
  }
  const evt = flush()
  if (evt) yield evt
}
