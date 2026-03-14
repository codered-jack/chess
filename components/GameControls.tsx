'use client'

import { useRef } from 'react'

export type StatusType = 'playing' | 'check' | 'checkmate' | 'draw' | 'stalemate' | 'resign' | 'timeout'

interface GameControlsProps {
  flipped: boolean
  canUndo: boolean
  canRedo: boolean
  canResign: boolean
  canOfferDraw: boolean
  onFlip: () => void
  onUndo: () => void
  onRedo: () => void
  onNewGame: () => void
  onResign: () => void
  onDrawOffer: () => void
  onExportPGN: () => void
  onImportPGN: (pgn: string) => void
  onCopyFEN: () => void
  onPasteFEN: () => void
  playerColor: 'w' | 'b'
  onPlayerColorChange: (color: 'w' | 'b') => void
  gameStatus: string
  statusType: StatusType
  turn: 'w' | 'b'
  isOnline?: boolean
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">{children}</p>
}

const STATUS_CONFIG: Record<StatusType, {
  icon: string
  label: string
  bg: string
  border: string
  text: string
  dot: string
  pulse: boolean
}> = {
  playing:   { icon: '♟',  label: 'Playing',   bg: 'bg-[#262421]',        border: 'border-white/8',       text: 'text-gray-200',   dot: 'bg-[#86b114]', pulse: true  },
  check:     { icon: '⚠️', label: 'Check',      bg: 'bg-amber-950/60',     border: 'border-amber-500/40',  text: 'text-amber-300',  dot: 'bg-amber-400', pulse: true  },
  checkmate: { icon: '♛',  label: 'Checkmate',  bg: 'bg-red-950/70',       border: 'border-red-500/40',    text: 'text-red-300',    dot: 'bg-red-500',   pulse: false },
  stalemate: { icon: '🤝', label: 'Stalemate',  bg: 'bg-slate-800/60',     border: 'border-slate-500/30',  text: 'text-slate-300',  dot: 'bg-slate-400', pulse: false },
  draw:      { icon: '½',  label: 'Draw',       bg: 'bg-blue-950/60',      border: 'border-blue-500/30',   text: 'text-blue-300',   dot: 'bg-blue-400',  pulse: false },
  resign:    { icon: '🏳', label: 'Resigned',   bg: 'bg-red-950/60',       border: 'border-red-500/30',    text: 'text-red-300',    dot: 'bg-red-400',   pulse: false },
  timeout:   { icon: '⏱', label: 'Timeout',    bg: 'bg-orange-950/60',    border: 'border-orange-500/30', text: 'text-orange-300', dot: 'bg-orange-400',pulse: false },
}

export default function GameControls({
  canUndo, canRedo, canResign, canOfferDraw, onFlip, onUndo, onRedo, onNewGame, onResign, onDrawOffer,
  onExportPGN, onImportPGN, onCopyFEN, onPasteFEN,
  playerColor, onPlayerColorChange, gameStatus, statusType, turn, isOnline = false,
}: GameControlsProps) {
  const pgnInputRef = useRef<HTMLInputElement>(null)
  const compactButtonClass =
    'inline-flex items-center justify-center py-1.5 px-2 rounded-lg bg-white/4 border border-white/8 text-gray-200 text-[10px] font-semibold leading-none hover:bg-white/8 hover:text-white hover:border-white/15 transition-all'

  const cfg = STATUS_CONFIG[statusType]

  return (
    <div className="flex flex-col gap-3">

      {/* ── Game Status Card ── */}
      <div className={`rounded-xl border px-3 py-2.5 transition-colors ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-2.5">
          {/* Animated dot */}
          <div className="relative shrink-0 flex items-center justify-center w-6 h-6">
            {cfg.pulse && (
              <span className={`absolute inset-0 rounded-full opacity-30 animate-ping ${cfg.dot}`} />
            )}
            <span className={`relative w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-bold leading-tight ${cfg.text}`}>
              {statusType === 'playing'
                ? (turn === 'w' ? 'White to move' : 'Black to move')
                : cfg.label}
            </p>
            {statusType !== 'playing' && (
              <p className="text-[10px] text-gray-500 leading-snug mt-0.5 truncate">{gameStatus}</p>
            )}
          </div>

          {/* Big icon */}
          <span className="text-lg leading-none shrink-0 opacity-70" aria-hidden>
            {statusType === 'playing'
              ? (turn === 'w' ? '♔' : '♚')
              : cfg.icon}
          </span>
        </div>

        {/* Turn progress bar (playing only) */}
        {statusType === 'playing' && (
          <div className="mt-2 h-0.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${turn === 'w' ? 'w-1/2 bg-white/40' : 'w-full bg-[#86b114]/70'}`}
            />
          </div>
        )}
      </div>

      {/* Play as — hidden in online mode (color is chosen in lobby / swaps on rematch) */}
      {!isOnline && (
        <div>
          <SectionLabel>Play as</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {(['w', 'b'] as const).map((color) => (
              <button
                key={color}
                onClick={() => onPlayerColorChange(color)}
                className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all border ${
                  playerColor === color
                    ? 'bg-[#86b114] text-white border-[#a2d220] shadow-lg shadow-[#86b114]/30'
                    : color === 'w'
                      ? 'bg-white/5 text-gray-300 border-white/15 hover:bg-white/15 hover:text-white hover:border-white/30'
                      : 'bg-[#1a1a1a] text-gray-400 border-white/10 hover:bg-[#232323] hover:text-gray-200 hover:border-white/25'
                }`}
              >
                <span className="text-[10px] leading-none">{color === 'w' ? '♔' : '♚'}</span>
                {color === 'w' ? 'White' : 'Black'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Game controls */}
      <div>
        <SectionLabel>Controls</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`${compactButtonClass} disabled:opacity-25 disabled:cursor-not-allowed`}
          >
            ← Undo
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`${compactButtonClass} disabled:opacity-25 disabled:cursor-not-allowed`}
          >
            Redo →
          </button>
          <button
            onClick={onFlip}
            className={compactButtonClass}
          >
            ⇅ Flip Board
          </button>
          <button
            onClick={onNewGame}
            className="py-1.5 px-2 rounded-lg bg-[#86b114] hover:bg-[#97c815] text-white text-[10px] font-semibold transition-all shadow-lg shadow-[#86b114]/20"
          >
            New Game
          </button>
          <button
            onClick={onDrawOffer}
            disabled={!canOfferDraw}
            className="py-1.5 px-2 rounded-lg bg-blue-900/50 hover:bg-blue-800/70 text-blue-300 hover:text-blue-100 text-[10px] font-semibold border border-blue-700/40 hover:border-blue-600/60 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            ½ Draw
          </button>
          <button
            onClick={onResign}
            disabled={!canResign}
            className="py-1.5 px-2 rounded-lg bg-red-900/60 hover:bg-red-800/80 text-red-300 hover:text-red-100 text-[10px] font-semibold border border-red-700/40 hover:border-red-600/60 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            🏳 Resign
          </button>
        </div>
      </div>

      {/* Import / Export */}
      <div>
        <SectionLabel>Import / Export</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Copy FEN',   action: onCopyFEN },
            { label: 'Paste FEN',  action: onPasteFEN },
            { label: 'Export PGN', action: onExportPGN },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className={compactButtonClass}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => pgnInputRef.current?.click()}
            className={compactButtonClass}
          >
            Import PGN
          </button>
        </div>
        <input
          ref={pgnInputRef}
          type="file"
          accept=".pgn,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = (ev) => onImportPGN(ev.target?.result as string)
            reader.readAsText(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
