import path from 'path'
import fs from 'fs'
import { getEngine } from '@/lib/stockfish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const externalBase = process.env.ENGINE_API_URL?.replace(/\/+$/, '')

  if (externalBase) {
    try {
      const upstream = await fetch(`${externalBase}/api/stockfish/health`, {
        cache: 'no-store',
      })
      const parsed = await upstream.json().catch(() => ({}))
      return Response.json(
        {
          ok: upstream.ok,
          mode: 'proxy',
          upstream: externalBase,
          upstreamStatus: upstream.status,
          upstreamBody: parsed,
          timestamp: new Date().toISOString(),
        },
        { status: upstream.ok ? 200 : 502 }
      )
    } catch (error) {
      return Response.json(
        {
          ok: false,
          mode: 'proxy',
          upstream: externalBase,
          error: error instanceof Error ? error.message : 'Failed to reach external engine',
          timestamp: new Date().toISOString(),
        },
        { status: 502 }
      )
    }
  }

  const nativePath = path.join(process.cwd(), 'engines', 'stockfish')
  const nativeExists = fs.existsSync(nativePath)
  const platform = process.platform
  const arch = process.arch
  const nodeVersion = process.version
  const isVercel = process.env.VERCEL === '1'

  try {
    const engine = getEngine()
    if (!engine.isReady()) {
      await engine.waitReady()
    }
    return Response.json({
      ok: true,
      mode: 'local',
      backend: engine.getBackend(),
      ready: engine.isReady(),
      nativeExists,
      platform,
      arch,
      nodeVersion,
      isVercel,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        mode: 'local',
        error: error instanceof Error ? error.message : 'Unknown engine error',
        nativeExists,
        platform,
        arch,
        nodeVersion,
        isVercel,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
