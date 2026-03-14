import type * as Party from 'partykit/server'
import { Chess } from 'chess.js'
import type {
  ClientMessage,
  ServerMessage,
  PlayerColor,
  OnlineMove,
  ServerTimeControlSet,
} from '../lib/online'

type ConnState = { color: PlayerColor }
type RoomState = {
  fen: string
  moves: OnlineMove[]
  whiteId: string | null
  blackId: string | null
  drawOfferedBy: PlayerColor | null
  timeControl: number | null   // seconds per player; null = no timer
  whiteTime: number            // remaining ms
  blackTime: number            // remaining ms
  lastMoveAt: number | null    // Date.now() of last move
}

function send(conn: Party.Connection, msg: ServerMessage) {
  conn.send(JSON.stringify(msg))
}

function broadcast(room: Party.Room, msg: ServerMessage, without?: string[]) {
  room.broadcast(JSON.stringify(msg), without)
}

export default class ChessRoom implements Party.Server {
  private whiteId: string | null = null
  private blackId: string | null = null
  private game: Chess = new Chess()
  private moves: OnlineMove[] = []
  private drawOfferedBy: PlayerColor | null = null
  private timeControl: number | null = null
  private whiteTime = 0
  private blackTime = 0
  private lastMoveAt: number | null = null

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const state = await this.room.storage.get<RoomState>('state')
    if (state) {
      this.whiteId      = state.whiteId
      this.blackId      = state.blackId
      this.moves        = state.moves
      this.drawOfferedBy = state.drawOfferedBy
      this.timeControl  = state.timeControl
      this.whiteTime    = state.whiteTime
      this.blackTime    = state.blackTime
      this.lastMoveAt   = state.lastMoveAt
      this.game = new Chess(state.fen)
    }
  }

  private async persist() {
    const state: RoomState = {
      fen:           this.game.fen(),
      moves:         this.moves,
      whiteId:       this.whiteId,
      blackId:       this.blackId,
      drawOfferedBy: this.drawOfferedBy,
      timeControl:   this.timeControl,
      whiteTime:     this.whiteTime,
      blackTime:     this.blackTime,
      lastMoveAt:    this.lastMoveAt,
    }
    await this.room.storage.put('state', state)
  }

  private colorOf(connId: string): PlayerColor | null {
    if (connId === this.whiteId) return 'w'
    if (connId === this.blackId) return 'b'
    return null
  }

  // Deduct elapsed time from the player who just moved. Returns true if they timed out.
  private tickClock(color: PlayerColor): boolean {
    if (!this.timeControl || !this.lastMoveAt) return false
    const elapsed = Math.floor((Date.now() - this.lastMoveAt) / 1000)
    if (color === 'w') {
      this.whiteTime = Math.max(0, this.whiteTime - elapsed)
      return this.whiteTime === 0
    } else {
      this.blackTime = Math.max(0, this.blackTime - elapsed)
      return this.blackTime === 0
    }
  }

  async onConnect(conn: Party.Connection<ConnState>, _ctx: Party.ConnectionContext) {
    // Cancel any pending cleanup alarm — a player is here
    await this.room.storage.deleteAlarm()

    const gameOver = this.game.isGameOver()

    // Slot 1: white
    if (!this.whiteId) {
      this.whiteId = conn.id
      conn.setState({ color: 'w' })
      await this.persist()
      send(conn, {
        type: 'welcome', color: 'w',
        fen: this.game.fen(), moves: this.moves, waiting: true,
        timeControl: this.timeControl,
        whiteTime: this.whiteTime, blackTime: this.blackTime,
      })
      return
    }

    // Slot 2: black
    if (!this.blackId && conn.id !== this.whiteId) {
      this.blackId = conn.id
      conn.setState({ color: 'b' })
      await this.persist()
      send(conn, {
        type: 'welcome', color: 'b',
        fen: this.game.fen(), moves: this.moves, waiting: false,
        timeControl: this.timeControl,
        whiteTime: this.whiteTime, blackTime: this.blackTime,
      })
      const whiteConn = this.room.getConnection(this.whiteId)
      if (whiteConn) send(whiteConn, { type: 'opponent-joined' })
      return
    }

    // Reconnection by exact ID match
    const savedColor = this.colorOf(conn.id)
    if (savedColor) {
      conn.setState({ color: savedColor })
      send(conn, {
        type: 'welcome', color: savedColor,
        fen: this.game.fen(), moves: this.moves,
        waiting: gameOver ? false : (savedColor === 'w' ? !this.blackId : !this.whiteId),
        timeControl: this.timeControl,
        whiteTime: this.whiteTime, blackTime: this.blackTime,
      })
      return
    }

    // Room is full
    send(conn, { type: 'error', message: 'Room is full' })
    conn.close()
  }

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection<ConnState>) {
    const senderColor = this.colorOf(sender.id)
    if (!senderColor) return

    let msg: ClientMessage
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer)) as ClientMessage
    } catch { return }

    // ── Set time control (before game starts) ────────────────────────────────
    if (msg.type === 'set-time-control') {
      this.timeControl = msg.seconds
      this.whiteTime   = msg.seconds ?? 0
      this.blackTime   = msg.seconds ?? 0
      this.lastMoveAt  = null
      await this.persist()
      // Broadcast a dedicated message so both clients update timeControl + times
      const tcMsg: ServerTimeControlSet = {
        type: 'time-control-set',
        timeControl: this.timeControl,
        whiteTime: this.whiteTime,
        blackTime: this.blackTime,
      }
      broadcast(this.room, tcMsg)
      return
    }

    // ── Move ─────────────────────────────────────────────────────────────────
    if (msg.type === 'move') {
      if (this.game.turn() !== senderColor) {
        send(sender, { type: 'error', message: 'Not your turn' }); return
      }
      if (this.game.isGameOver()) {
        send(sender, { type: 'error', message: 'Game is already over' }); return
      }
      if (!this.whiteId || !this.blackId) {
        send(sender, { type: 'error', message: 'Waiting for opponent' }); return
      }

      // Deduct clock time
      const timedOut = this.tickClock(senderColor)
      if (timedOut) {
        const winner: PlayerColor = senderColor === 'w' ? 'b' : 'w'
        await this.persist()
        broadcast(this.room, { type: 'game-over', reason: 'timeout', winner })
        return
      }

      try {
        const result = this.game.move({
          from: msg.from, to: msg.to,
          ...(msg.promotion ? { promotion: msg.promotion } : {}),
        })
        if (!result) { send(sender, { type: 'error', message: 'Invalid move' }); return }

        const onlineMove: OnlineMove = {
          from: result.from, to: result.to, san: result.san, lan: result.lan,
          ...(result.promotion ? { promotion: result.promotion } : {}),
        }
        this.moves.push(onlineMove)
        this.drawOfferedBy = null
        this.lastMoveAt = Date.now()
        await this.persist()

        broadcast(this.room, {
          type: 'move', move: onlineMove, fen: this.game.fen(),
          whiteTime: this.whiteTime, blackTime: this.blackTime,
        })

        if (this.game.isCheckmate()) {
          broadcast(this.room, { type: 'game-over', reason: 'checkmate', winner: senderColor })
        } else if (this.game.isStalemate()) {
          broadcast(this.room, { type: 'game-over', reason: 'stalemate' })
        } else if (this.game.isDraw()) {
          broadcast(this.room, { type: 'game-over', reason: 'draw' })
        }
      } catch {
        send(sender, { type: 'error', message: 'Invalid move' })
      }
      return
    }

    // ── Resign ───────────────────────────────────────────────────────────────
    if (msg.type === 'resign') {
      const winner: PlayerColor = senderColor === 'w' ? 'b' : 'w'
      broadcast(this.room, { type: 'game-over', reason: 'resign', winner })
      await this.persist()
      return
    }

    // ── Draw offer ───────────────────────────────────────────────────────────
    if (msg.type === 'draw-offer') {
      this.drawOfferedBy = senderColor
      await this.persist()
      const opponentId = senderColor === 'w' ? this.blackId : this.whiteId
      if (opponentId) {
        const opponentConn = this.room.getConnection(opponentId)
        if (opponentConn) send(opponentConn, { type: 'draw-offer' })
      }
      return
    }

    // ── Draw accept ──────────────────────────────────────────────────────────
    if (msg.type === 'draw-accept') {
      if (this.drawOfferedBy && this.drawOfferedBy !== senderColor) {
        this.drawOfferedBy = null
        await this.persist()
        broadcast(this.room, { type: 'game-over', reason: 'draw' })
      }
      return
    }

    // ── Flag (client clock hit 0) ─────────────────────────────────────────────
    if (msg.type === 'flag') {
      if (!this.timeControl || !this.lastMoveAt || this.game.isGameOver()) return
      // The flagging player is claiming their opponent timed out.
      // Validate: opponent is the side to move, and their clock ran out.
      const opponentColor: PlayerColor = senderColor === 'w' ? 'b' : 'w'
      const timedOut = this.tickClock(opponentColor)
      if (timedOut) {
        await this.persist()
        broadcast(this.room, { type: 'game-over', reason: 'timeout', winner: senderColor })
      }
      return
    }
  }

  async onClose(conn: Party.Connection<ConnState>) {
    const color = this.colorOf(conn.id)
    if (!color) return

    // Free the slot so the player (or anyone) can rejoin
    if (color === 'w') this.whiteId = null
    else this.blackId = null
    await this.persist()

    broadcast(this.room, { type: 'opponent-disconnected' }, [conn.id])

    // If both slots are now empty, schedule storage cleanup in 30 minutes
    if (!this.whiteId && !this.blackId) {
      await this.room.storage.setAlarm(Date.now() + 30 * 60 * 1000)
    }
  }

  async onError(conn: Party.Connection<ConnState>) {
    await this.onClose(conn)
  }

  async onAlarm() {
    // No players have reconnected in 2 hours — wipe the room storage
    await this.room.storage.deleteAll()
  }
}

ChessRoom satisfies Party.Worker
