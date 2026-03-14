import { NextRequest } from 'next/server'
import { getEngine, EngineInfo, StockfishOptions } from '@/lib/stockfish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, fen, moves, options } = body

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
  const fen = searchParams.get('fen') ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const moves = searchParams.get('moves')?.split(',').filter(Boolean) ?? []
  const movetime = parseInt(searchParams.get('movetime') ?? '2000')
  const depth = searchParams.get('depth') ? parseInt(searchParams.get('depth')!) : undefined
  const multiPV = parseInt(searchParams.get('multiPV') ?? '1')
  const limitStrength = searchParams.get('limitStrength') === 'true'
  const elo = searchParams.get('elo') ? parseInt(searchParams.get('elo')!) : undefined

  const engine = getEngine()

  if (!engine.isReady()) {
    await engine.waitReady()
  }

  engine.stop()

  // Configure options
  engine.configure({
    multiPV,
    limitStrength,
    ...(elo ? { elo } : {}),
  })

  await engine.waitReady()

  engine.setPosition(fen, moves)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      const cleanup = () => {
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
      engine.stop()
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
