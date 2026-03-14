import { NextRequest } from 'next/server'
import { getEngine, EngineInfo, StockfishOptions } from '@/lib/stockfish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const externalBase = process.env.ENGINE_API_URL?.replace(/\/+$/, '')

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, options } = body

  if (externalBase) {
    const upstream = await fetch(`${externalBase}/api/stockfish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  }

  const engine = getEngine()

  if (!engine.isReady()) {
    await engine.waitReady()
  }

  if (action === 'configure') {
    engine.configure(options as StockfishOptions)
    return Response.json({ ok: true })
  }

  if (action === 'stop') {
    engine.stop()
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  if (externalBase) {
    const upstream = await fetch(`${externalBase}/api/stockfish?${searchParams.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  const fen = searchParams.get('fen') ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const moves = searchParams.get('moves')?.split(',').filter(Boolean) ?? []
  const movetime = parseInt(searchParams.get('movetime') ?? '2000')
  const depth = searchParams.get('depth') ? parseInt(searchParams.get('depth')!) : undefined
  const multiPV = parseInt(searchParams.get('multiPV') ?? '1')
  const limitStrength = searchParams.get('limitStrength') === 'true'
  const elo = searchParams.get('elo') ? parseInt(searchParams.get('elo')!) : undefined

  const engine = getEngine()

  try {
    if (!engine.isReady()) {
      await engine.waitReady()
    }
  } catch (err) {
    console.error('[SF] engine failed to become ready:', err)
    return new Response('data: {"type":"error","message":"Engine not ready"}\n\n', {
      status: 503,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  engine.stop()

  engine.configure({
    multiPV,
    limitStrength,
    ...(elo ? { elo } : {}),
  })

  await engine.waitReady()

  engine.setPosition(fen, moves)

  const encoder = new TextEncoder()

  // Hoisted so cancel() can remove listeners without calling engine.stop().
  // Calling engine.stop() from cancel() is dangerous: it fires asynchronously
  // (after the client disconnects) and can emit a premature bestmove that
  // consumes the *next* request's once-listener before real analysis finishes.
  let cleanup = () => {}

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      cleanup = () => {
        engine.removeListener('info', onInfo)
        engine.removeListener('bestmove', onBestMove)
      }

      const safeEnqueue = (data: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(data))
        } catch { /* stream already closed */ }
      }

      const onInfo = (info: EngineInfo) => {
        safeEnqueue(`data: ${JSON.stringify({ type: 'info', info })}\n\n`)
      }

      const onBestMove = ({ bestMove, ponderMove }: { bestMove: string; ponderMove: string | null }) => {
        safeEnqueue(`data: ${JSON.stringify({ type: 'bestmove', bestMove, ponderMove })}\n\n`)
        if (!closed) {
          closed = true
          cleanup()
          try { controller.close() } catch { /* already closed */ }
        }
      }

      engine.on('info', onInfo)
      engine.once('bestmove', onBestMove)

      engine.go(depth ? { depth } : { movetime })
    },
    cancel() {
      // Remove our listeners but do NOT call engine.stop() here.
      // This cancel() fires asynchronously (when the client disconnects) and
      // can race with a new request that has already registered its own listeners.
      // The next request's engine.stop() call at the top of the handler is the
      // correct place to stop the engine.
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
