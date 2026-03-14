// Shared types for the real-time online chess protocol.
// Used by both party/index.ts (server) and app/page.tsx (client).

export type PlayerColor = 'w' | 'b'

// ── Messages sent from Client → Server ──────────────────────────────────────

export type ClientMove = {
  type: 'move'
  from: string
  to: string
  promotion?: string
}

export type ClientResign = { type: 'resign' }
export type ClientDrawOffer = { type: 'draw-offer' }
export type ClientDrawAccept = { type: 'draw-accept' }
export type ClientSetTimeControl = { type: 'set-time-control'; seconds: number | null }
export type ClientFlag = { type: 'flag' }  // sent when client clock hits 0
export type ClientNewGame = { type: 'new-game' }
export type ClientSetColor = { type: 'set-color'; color: PlayerColor }

export type ClientMessage =
  | ClientMove
  | ClientResign
  | ClientDrawOffer
  | ClientDrawAccept
  | ClientSetTimeControl
  | ClientFlag
  | ClientNewGame
  | ClientSetColor

// ── Messages sent from Server → Client ──────────────────────────────────────

export type ServerWelcome = {
  type: 'welcome'
  color: PlayerColor
  fen: string
  moves: OnlineMove[]
  waiting: boolean
  timeControl: number | null
  whiteTime: number
  blackTime: number
}

export type ServerOpponentJoined = { type: 'opponent-joined' }

export type OnlineMove = {
  from: string
  to: string
  san: string
  lan: string
  promotion?: string
}

export type ServerMove = {
  type: 'move'
  move: OnlineMove
  fen: string
  whiteTime: number
  blackTime: number
}

export type ServerGameOver = {
  type: 'game-over'
  reason: 'checkmate' | 'resign' | 'draw' | 'stalemate' | 'timeout'
  winner?: PlayerColor
}

export type ServerDrawOffer = { type: 'draw-offer' }

export type ServerOpponentDisconnected = { type: 'opponent-disconnected' }

export type ServerError = { type: 'error'; message: string }

export type ServerTimeControlSet = {
  type: 'time-control-set'
  timeControl: number | null
  whiteTime: number
  blackTime: number
}

export type ServerNewGame = {
  type: 'new-game'
  timeControl: number | null
  whiteTime: number
  blackTime: number
}

export type ServerColorUpdate = {
  type: 'color-update'
  yourColor: PlayerColor
}

export type ServerMessage =
  | ServerWelcome
  | ServerOpponentJoined
  | ServerMove
  | ServerGameOver
  | ServerDrawOffer
  | ServerOpponentDisconnected
  | ServerError
  | ServerTimeControlSet
  | ServerNewGame
  | ServerColorUpdate
