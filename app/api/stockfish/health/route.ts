import { getEngine } from '@/lib/stockfish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const engine = getEngine()
    if (!engine.isReady()) {
      await engine.waitReady()
    }

    return Response.json({
      ok: true,
      backend: engine.getBackend(),
      ready: engine.isReady(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown engine error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
