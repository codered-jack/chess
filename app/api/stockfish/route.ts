import { NextRequest } from 'next/server'
import { getEngine, EngineInfo, StockfishOptions } from '@/lib/stockfish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const externalBase = process.env.ENGINE_API_URL?.replace(/\/+$/, '')

// Mutex: ensures only one GET request runs the engine at a time on this instance.
// Without this, two concurrent requests can both resolve from the same "readyok"
// and both register bestmove listeners, causing the second one to receive the
// first one's bestmove (wrong position) and the real analysis to go unheard.
let requestChain: Promise<void> = Promise.resolve()

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

  const reqId = Math.random().toString(36).slice(2, 7)

  // Acquire the per-instance mutex — wait for the previous request to fully finish
  // (either bestmove received or client disconnected) before starting this one.
  const myTurn = requestChain
  let releaseLock!: () => void
  requestChain = new Promise<void>((resolve) => { releaseLock = resolve })
  console.log(`[SF:route][${reqId}] waiting for lock`)
  await myTurn
  console.log(`[SF:route][${reqId}] lock acquired`)

  const fen = searchParams.get('fen') ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const moves = searchParams.get('moves')?.split(',').filter(Boolean) ?? []
  const movetime = parseInt(searchParams.get('movetime') ?? '2000')
  const depth = searchParams.get('depth') ? parseInt(searchParams.get('depth')!) : undefined
  const multiPV = parseInt(searchParams.get('multiPV') ?? '1')
  const limitStrength = searchParams.get('limitStrength') === 'true'
  const elo = searchParams.get('elo') ? parseInt(searchParams.get('elo')!) : undefined

  console.log(`[SF:route][${reqId}] GET fen=${fen.slice(0, 40)}… movetime=${movetime} multiPV=${multiPV} limitStrength=${limitStrength}${elo ? ` elo=${elo}` : ''}`)

  const engine = getEngine()

  try {
    if (!engine.isReady()) {
      console.log(`[SF:route][${reqId}] engine not ready yet — waiting`)
      await engine.waitReady()
      console.log(`[SF:route][${reqId}] engine became ready`)
    } else {
      console.log(`[SF:route][${reqId}] engine already ready`)
    }
  } catch (err) {
    console.error(`[SF:route][${reqId}] engine failed to become ready:`, err)
    return new Response('data: {"type":"error","message":"Engine not ready"}\n\n', {
      status: 503,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  console.log(`[SF:route][${reqId}] sending stop`)
  engine.stop()

  console.log(`[SF:route][${reqId}] configuring (multiPV=${multiPV} limitStrength=${limitStrength})`)
  engine.configure({
    multiPV,
    limitStrength,
    ...(elo ? { elo } : {}),
  })

  console.log(`[SF:route][${reqId}] waiting for configure readyok`)
  await engine.waitReady()
  console.log(`[SF:route][${reqId}] configure readyok received — setting position`)

  engine.setPosition(fen, moves)

  const encoder = new TextEncoder()

  // Hoisted so cancel() can remove listeners and release the mutex without
  // calling engine.stop() (which would race with the next request's listeners).
  let cleanup = () => {}
  let lockReleased = false
  const releaseOnce = () => {
    if (!lockReleased) {
      lockReleased = true
      console.log(`[SF:route][${reqId}] releasing lock`)
      releaseLock()
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      cleanup = () => {
        console.log(`[SF:route][${reqId}] cleanup: removing info + bestmove listeners`)
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
        console.log(`[SF:route][${reqId}] bestmove received: ${bestMove} (closed=${closed})`)
        safeEnqueue(`data: ${JSON.stringify({ type: 'bestmove', bestMove, ponderMove })}\n\n`)
        if (!closed) {
          closed = true
          cleanup()
          try { controller.close() } catch { /* already closed */ }
          console.log(`[SF:route][${reqId}] stream closed after bestmove`)
        }
        releaseOnce()
      }

      console.log(`[SF:route][${reqId}] registering listeners, calling go (${depth ? `depth ${depth}` : `movetime ${movetime}`})`)
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
      console.log(`[SF:route][${reqId}] cancel() — client disconnected, removing listeners only`)
      cleanup()
      releaseOnce()
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
