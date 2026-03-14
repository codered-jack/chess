'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Chess, Square } from 'chess.js'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

const PIECE_MAP: Record<string, string> = {
  wk: 'wK', wq: 'wQ', wr: 'wR', wb: 'wB', wn: 'wN', wp: 'wP',
  bk: 'bK', bq: 'bQ', br: 'bR', bb: 'bB', bn: 'bN', bp: 'bP',
}

interface Arrow {
  from: Square
  to: Square
  color?: string
}

interface ChessBoardProps {
  game: Chess
  flipped: boolean
  selectedSquare: Square | null
  legalMoves: Square[]
  lastMove: { from: Square; to: Square } | null
  arrows: Arrow[]
  onSquareClick: (square: Square) => void
  onDrop?: (from: Square, to: Square) => void
  playerColor: 'w' | 'b'
  disabled?: boolean
  showHints?: boolean
}

interface DragState {
  fromSquare: Square
  pieceSrc: string
  x: number
  y: number
  size: number
}

function squareToCoords(square: Square, flipped: boolean): { col: number; row: number } {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1]) - 1
  return {
    col: flipped ? 7 - file : file,
    row: flipped ? rank : 7 - rank,
  }
}

function getSquareFromPoint(
  boardEl: HTMLDivElement,
  clientX: number,
  clientY: number,
  flipped: boolean
): Square | null {
  const rect = boardEl.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const size = rect.width / 8
  const col = Math.floor(x / size)
  const row = Math.floor(y / size)
  if (col < 0 || col > 7 || row < 0 || row > 7) return null
  const fileIdx = flipped ? 7 - col : col
  const rankIdx = flipped ? row : 7 - row
  return (FILES[fileIdx] + (rankIdx + 1)) as Square
}

export default function ChessBoard({
  game,
  flipped,
  selectedSquare,
  legalMoves,
  lastMove,
  arrows,
  onSquareClick,
  onDrop,
  playerColor,
  disabled = false,
  showHints = true,
}: ChessBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const isDraggingRef = useRef(false)

  const ranks = flipped ? [...RANKS].reverse() : RANKS
  const files = flipped ? [...FILES].reverse() : FILES

  // Global mouse move and up for drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragRef.current) return
      const board = boardRef.current
      const sq = board ? getSquareFromPoint(board, e.clientX, e.clientY, flipped) : null
      setHoverSquare(sq)
      setDrag((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
    }

    const onMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragRef.current) return
      const board = boardRef.current
      const toSquare = board ? getSquareFromPoint(board, e.clientX, e.clientY, flipped) : null
      const fromSquare = dragRef.current.fromSquare

      // Clear drag state before calling onDrop so the click handler sees isDraggingRef = false
      isDraggingRef.current = false
      dragRef.current = null
      setDrag(null)
      setHoverSquare(null)

      if (toSquare && toSquare !== fromSquare && onDrop) {
        onDrop(fromSquare, toSquare)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [flipped, onDrop])

  // Draw arrows on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const board = boardRef.current
    if (!canvas || !board) return

    const rect = board.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const squareSize = canvas.width / 8

    for (const arrow of arrows) {
      const from = squareToCoords(arrow.from, flipped)
      const to = squareToCoords(arrow.to, flipped)

      const x1 = from.col * squareSize + squareSize / 2
      const y1 = from.row * squareSize + squareSize / 2
      const x2 = to.col * squareSize + squareSize / 2
      const y2 = to.row * squareSize + squareSize / 2

      const angle = Math.atan2(y2 - y1, x2 - x1)
      const arrowLen = squareSize * 0.35
      const lineEndX = x2 - Math.cos(angle) * arrowLen * 0.5
      const lineEndY = y2 - Math.sin(angle) * arrowLen * 0.5

      ctx.strokeStyle = arrow.color ?? 'rgba(255, 170, 0, 0.85)'
      ctx.fillStyle = arrow.color ?? 'rgba(255, 170, 0, 0.85)'
      ctx.lineWidth = squareSize * 0.12
      ctx.lineCap = 'round'

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(lineEndX, lineEndY)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - arrowLen * Math.cos(angle - Math.PI / 6), y2 - arrowLen * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(x2 - arrowLen * Math.cos(angle + Math.PI / 6), y2 - arrowLen * Math.sin(angle + Math.PI / 6))
      ctx.closePath()
      ctx.fill()
    }
  }, [arrows, flipped])

  const handlePieceMouseDown = useCallback(
    (e: React.MouseEvent, square: Square, pieceSrc: string) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()

      const board = boardRef.current
      const size = board ? board.getBoundingClientRect().width / 8 : 64

      const state: DragState = {
        fromSquare: square,
        pieceSrc,
        x: e.clientX,
        y: e.clientY,
        size,
      }
      dragRef.current = state
      isDraggingRef.current = true
      setDrag(state)

      // Select the piece immediately on press
      onSquareClick(square)
    },
    [disabled, onSquareClick]
  )

  const boardData = game.board()
  const flatBoard = flipped
    ? [...boardData].reverse().map((row) => [...row].reverse())
    : boardData

  return (
    <div className="relative select-none" style={{ aspectRatio: '1' }}>
      {/* Rank labels */}
      <div className="absolute -left-4 top-0 h-full flex flex-col pointer-events-none">
        {ranks.map((rank) => (
          <div key={rank} className="flex-1 flex items-center justify-center text-[11px] font-semibold text-gray-400">
            {rank}
          </div>
        ))}
      </div>

      {/* File labels */}
      <div className="absolute -bottom-5 left-0 w-full flex flex-row pointer-events-none">
        {files.map((file) => (
          <div key={file} className="flex-1 flex items-center justify-center text-[11px] font-semibold text-gray-400">
            {file}
          </div>
        ))}
      </div>

      {/* Board grid */}
      <div
        ref={boardRef}
        className="grid w-full h-full rounded-sm overflow-hidden shadow-2xl border border-gray-700"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}
      >
        {flatBoard.map((row, rowIdx) =>
          row.map((piece, colIdx) => {
            const fileIdx = flipped ? 7 - colIdx : colIdx
            const rankIdx = flipped ? rowIdx : 7 - rowIdx
            const square = (FILES[fileIdx] + (rankIdx + 1)) as Square

            const isLight = (rowIdx + colIdx) % 2 === 0
            const isSelected = selectedSquare === square
            const isLegal = legalMoves.includes(square)
            const isLastMoveFrom = lastMove?.from === square
            const isLastMoveTo = lastMove?.to === square
            const isDragTarget = hoverSquare === square && isDraggingRef.current
            const isDragSource = drag?.fromSquare === square

            let squareBg = isLight ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'
            if (isSelected || isDragSource) squareBg = isLight ? 'bg-[#f6f669]' : 'bg-[#baca2b]'
            else if (isDragTarget && isLegal) squareBg = isLight ? 'bg-[#cdd26a]' : 'bg-[#aaa23a]'
            else if (isLastMoveFrom || isLastMoveTo) squareBg = isLight ? 'bg-[#cdd26a]' : 'bg-[#aaa23a]'

            const pieceKey = piece ? `${piece.color}${piece.type}` : null
            const pieceSrc = pieceKey ? `/pieces/${PIECE_MAP[pieceKey]}.svg` : null
            const isBeingDragged = drag?.fromSquare === square && isDraggingRef.current

            return (
              <div
                key={square}
                className={`relative flex items-center justify-center ${squareBg} ${!disabled ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  // Only handle click if we are NOT in the middle of a drag
                  if (!isDraggingRef.current && !disabled) {
                    onSquareClick(square)
                  }
                }}
              >
                {/* Legal move indicator — only shown when hints enabled */}
                {showHints && isLegal && !piece && (
                  <div className="absolute w-[32%] h-[32%] rounded-full pointer-events-none z-20"
                    style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.45) 55%, transparent 55%)' }}
                  />
                )}
                {showHints && isLegal && piece && (
                  <div className="absolute inset-0 pointer-events-none z-20 rounded-sm"
                    style={{ boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.5)' }}
                  />
                )}

                {/* Piece image — hidden when being dragged */}
                {pieceSrc && !isBeingDragged && (
                  <div
                    className="relative w-[90%] h-[90%] z-10 drop-shadow-md"
                    style={{ cursor: disabled ? 'default' : 'grab' }}
                    onMouseDown={(e) => {
                      if (!disabled && piece) {
                        handlePieceMouseDown(e, square, pieceSrc)
                      }
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pieceSrc}
                      alt={pieceKey ?? ''}
                      className="w-full h-full object-contain pointer-events-none"
                      draggable={false}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Arrow canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-30"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Floating drag piece */}
      {drag && isDraggingRef.current && (
        <img
          src={drag.pieceSrc}
          alt="dragging"
          className="fixed pointer-events-none z-9999 object-contain drop-shadow-2xl"
          style={{
            width: drag.size,
            height: drag.size,
            left: drag.x - drag.size / 2,
            top: drag.y - drag.size / 2,
            transform: 'scale(1.15)',
          }}
          draggable={false}
        />
      )}
    </div>
  )
}
