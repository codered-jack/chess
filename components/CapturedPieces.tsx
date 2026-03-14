'use client'

import { Chess } from 'chess.js'

const PIECE_MAP: Record<string, string> = {
  wk: 'wK', wq: 'wQ', wr: 'wR', wb: 'wB', wn: 'wN', wp: 'wP',
  bk: 'bK', bq: 'bQ', br: 'bR', bb: 'bB', bn: 'bN', bp: 'bP',
}

const PIECE_VALUES: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 }
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p']

function getCaptured(game: Chess) {
  const initial: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
  const white: Record<string, number> = {}
  const black: Record<string, number> = {}

  for (const row of game.board()) {
    for (const cell of row) {
      if (!cell) continue
      const map = cell.color === 'w' ? white : black
      map[cell.type] = (map[cell.type] ?? 0) + 1
    }
  }

  // capturedByWhite = black pieces white has taken
  // capturedByBlack = white pieces black has taken
  const capturedByWhite: string[] = []
  const capturedByBlack: string[] = []

  for (const type of PIECE_ORDER) {
    const missingBlack = (initial[type] ?? 0) - (black[type] ?? 0)
    const missingWhite = (initial[type] ?? 0) - (white[type] ?? 0)
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(`b${type}`)
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(`w${type}`)
  }

  const scoreWhite = capturedByWhite.reduce((s, p) => s + PIECE_VALUES[p[1]], 0)
  const scoreBlack = capturedByBlack.reduce((s, p) => s + PIECE_VALUES[p[1]], 0)
  // positive = white leading, negative = black leading
  const advantage = scoreWhite - scoreBlack

  return { capturedByWhite, capturedByBlack, advantage }
}

function PieceRow({
  pieces,
  showAdvantage,
  advantageValue,
}: {
  pieces: string[]
  showAdvantage: boolean
  advantageValue: number
}) {
  return (
    <div className="flex items-center gap-1 min-h-[22px] min-w-0 px-1">
      <div className="flex items-center flex-wrap gap-0">
        {pieces.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={`/pieces/${PIECE_MAP[p]}.svg`}
            alt={p}
            className="w-[18px] h-[18px] opacity-90"
            draggable={false}
          />
        ))}
      </div>
      {showAdvantage && advantageValue > 0 && (
        <span className="text-[11px] font-bold text-white ml-1">
          +{advantageValue}
        </span>
      )}
    </div>
  )
}

export function CapturedPiecesRow({
  game,
  flipped,
  position,
}: {
  game: Chess
  flipped: boolean
  position: 'top' | 'bottom'
}) {
  const { capturedByWhite, capturedByBlack, advantage } = getCaptured(game)

  // Not flipped: white at bottom, black at top
  // top row = black's pieces white captured (white's captures shown above board = opponent row)
  // bottom row = white's pieces black captured (black's captures shown below board = player row)
  const topPieces = flipped ? capturedByBlack : capturedByWhite
  const bottomPieces = flipped ? capturedByWhite : capturedByBlack

  const pieces = position === 'top' ? topPieces : bottomPieces

  // Show advantage on the row of the side that is WINNING (captured more)
  // advantage > 0 means white winning: show on bottom (white player row)
  // advantage < 0 means black winning: show on top (black player row)
  const showAdv =
    position === 'top'
      ? (flipped ? advantage > 0 : advantage < 0)
      : (flipped ? advantage < 0 : advantage > 0)

  return (
    <PieceRow
      pieces={pieces}
      showAdvantage={showAdv}
      advantageValue={Math.abs(advantage)}
    />
  )
}
