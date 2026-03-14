import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import path from 'path'
import fs from 'fs'
import { EventEmitter } from 'events'

export interface EngineInfo {
  depth: number
  seldepth?: number
  score: { type: 'cp' | 'mate'; value: number }
  pv: string[]
  multipv: number
  nodes?: number
  nps?: number
  time?: number
}

export interface StockfishOptions {
  threads?: number
  hash?: number
  multiPV?: number
  limitStrength?: boolean
  elo?: number
}

class StockfishEngine extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private ready = false
  private failed = false
  private startError: Error | null = null
  private readyResolvers: Array<() => void> = []
  private readyRejectors: Array<(error: Error) => void> = []
  private backend: 'native' | 'wasm-node' | null = null

  start() {
    const nativeBinaryPath = path.join(process.cwd(), 'engines', 'stockfish')
    const forceWasm = process.env.STOCKFISH_FORCE_WASM === '1'
    const canUseNative = fs.existsSync(nativeBinaryPath) && !forceWasm

    if (canUseNative) {
      this.backend = 'native'
      this.process = spawn(nativeBinaryPath, [], { stdio: 'pipe' })
      console.log('[SF] using native backend:', nativeBinaryPath)
    } else {
      const wasmRepoEntry = path.join(process.cwd(), 'engines', 'wasm', 'stockfish.js')
      const wasmNodeBin = path.join(process.cwd(), 'node_modules', 'stockfish', 'bin', 'stockfish.js')
      const wasmEntry = fs.existsSync(wasmRepoEntry) ? wasmRepoEntry : wasmNodeBin
      if (!fs.existsSync(wasmEntry)) {
        throw new Error('Stockfish WASM fallback not found. Install "stockfish" package.')
      }
      this.backend = 'wasm-node'
      this.process = spawn(process.execPath, [wasmEntry], {
        stdio: 'pipe',
        cwd: path.dirname(wasmEntry),
      })
      console.log('[SF] native binary missing; using WASM backend:', wasmEntry)
    }

    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) {
        this.handleLine(line.trim())
      }
    })

    this.process.stderr.on('data', (data: Buffer) => {
      console.error('[SF stderr]', data.toString())
    })

    this.process.on('error', (err) => {
      this.failed = true
      this.startError = err
      this.readyRejectors.forEach((reject) => reject(err))
      this.readyRejectors = []
      this.readyResolvers = []
      console.error('[SF] process failed to start:', err.message)
    })

    this.process.on('exit', (code) => {
      console.log('[SF] process exited with code', code, 'backend:', this.backend)
      this.ready = false
      if (!this.failed && !this.ready) {
        this.failed = true
        this.startError = new Error(`Stockfish process exited before ready (code ${code ?? 'unknown'})`)
        this.readyRejectors.forEach((reject) => reject(this.startError as Error))
        this.readyRejectors = []
        this.readyResolvers = []
      }
    })

    this.send('uci')
  }

  private handleLine(line: string) {
    if (!line) return

    if (line === 'uciok') {
      this.send('isready')
      return
    }

    if (line === 'readyok') {
      this.ready = true
      this.readyResolvers.forEach((resolve) => resolve())
      this.readyResolvers = []
      this.emit('ready')
      return
    }

    if (line.startsWith('info') && line.includes('depth')) {
      const info = this.parseInfo(line)
      if (info) this.emit('info', info)
      return
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ')
      const bestMove = parts[1]
      const ponderMove = parts[3] ?? null
      this.emit('bestmove', { bestMove, ponderMove })
      return
    }
  }

  private parseInfo(line: string): EngineInfo | null {
    const get = (key: string) => {
      const match = line.match(new RegExp(`${key}\\s+(\\S+)`))
      return match ? match[1] : null
    }

    const depth = parseInt(get('depth') ?? '0')
    if (!depth) return null

    const seldepth = parseInt(get('seldepth') ?? '0') || undefined
    const multipv = parseInt(get('multipv') ?? '1')
    const nodes = parseInt(get('nodes') ?? '0') || undefined
    const nps = parseInt(get('nps') ?? '0') || undefined
    const time = parseInt(get('time') ?? '0') || undefined

    let score: EngineInfo['score'] = { type: 'cp', value: 0 }
    const cpMatch = line.match(/score cp (-?\d+)/)
    const mateMatch = line.match(/score mate (-?\d+)/)
    if (mateMatch) {
      score = { type: 'mate', value: parseInt(mateMatch[1]) }
    } else if (cpMatch) {
      score = { type: 'cp', value: parseInt(cpMatch[1]) }
    }

    const pvMatch = line.match(/ pv (.+)$/)
    const pv = pvMatch ? pvMatch[1].split(' ') : []

    return { depth, seldepth, score, pv, multipv, nodes, nps, time }
  }

  send(cmd: string) {
    if (this.process?.stdin.writable) {
      this.process.stdin.write(cmd + '\n')
    }
  }

  waitReady(): Promise<void> {
    if (this.ready) return Promise.resolve()
    if (this.failed && this.startError) return Promise.reject(this.startError)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const err = new Error('Stockfish engine startup timed out')
        this.failed = true
        this.startError = err
        reject(err)
      }, 15000)

      this.readyResolvers.push(resolve)
      this.readyRejectors.push(reject)

      const wrappedResolve = () => {
        clearTimeout(timeout)
        resolve()
      }

      const wrappedReject = (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      }

      this.readyResolvers[this.readyResolvers.length - 1] = wrappedResolve
      this.readyRejectors[this.readyRejectors.length - 1] = wrappedReject
    })
  }

  configure(options: StockfishOptions) {
    if (options.threads) this.send(`setoption name Threads value ${options.threads}`)
    if (options.hash) this.send(`setoption name Hash value ${options.hash}`)
    if (options.multiPV) this.send(`setoption name MultiPV value ${options.multiPV}`)
    if (options.limitStrength !== undefined) {
      this.send(`setoption name UCI_LimitStrength value ${options.limitStrength}`)
    }
    if (options.elo) this.send(`setoption name UCI_Elo value ${options.elo}`)
    this.send('isready')
  }

  setPosition(fen: string, moves: string[] = []) {
    const movePart = moves.length > 0 ? ` moves ${moves.join(' ')}` : ''
    this.send(`position fen ${fen}${movePart}`)
  }

  go(options: { depth?: number; movetime?: number; infinite?: boolean } = {}) {
    if (options.infinite) {
      this.send('go infinite')
    } else if (options.depth) {
      this.send(`go depth ${options.depth}`)
    } else {
      this.send(`go movetime ${options.movetime ?? 2000}`)
    }
  }

  stop() {
    this.send('stop')
  }

  quit() {
    this.send('quit')
    this.process?.kill()
    this.process = null
    this.ready = false
  }

  isReady() {
    return this.ready
  }

  getBackend() {
    return this.backend
  }
}

// Singleton engine instance per Node.js process
let engineInstance: StockfishEngine | null = null

export function getEngine(): StockfishEngine {
  if (!engineInstance) {
    engineInstance = new StockfishEngine()
    engineInstance.start()
  }
  return engineInstance
}

export { StockfishEngine }
