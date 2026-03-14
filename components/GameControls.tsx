'use client'

import { useRef } from 'react'

interface GameControlsProps {
  flipped: boolean
  canUndo: boolean
  canRedo: boolean
  onFlip: () => void
  onUndo: () => void
  onRedo: () => void
  onNewGame: () => void
  onExportPGN: () => void
  onImportPGN: (pgn: string) => void
  onCopyFEN: () => void
  onPasteFEN: () => void
  playerColor: 'w' | 'b'
  onPlayerColorChange: (color: 'w' | 'b') => void
  gameStatus: string
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">{children}</p>
}

export default function GameControls({
  canUndo, canRedo, onFlip, onUndo, onRedo, onNewGame,
  onExportPGN, onImportPGN, onCopyFEN, onPasteFEN,
  playerColor, onPlayerColorChange, gameStatus,
}: GameControlsProps) {
  const pgnInputRef = useRef<HTMLInputElement>(null)
  const compactButtonClass =
    'inline-flex items-center justify-center py-1.5 px-2 rounded-lg bg-white/4 border border-white/8 text-gray-200 text-[10px] font-semibold leading-none hover:bg-white/8 hover:text-white hover:border-white/15 transition-all'

  return (
    <div className="flex flex-col gap-3">

      {/* Status */}
      <div className="rounded-lg bg-[#262421] px-3 py-2 text-center border border-white/8">
        <p className="text-[11px] font-semibold text-gray-100 leading-snug">{gameStatus}</p>
      </div>

      {/* Play as */}
      <div>
        <SectionLabel>Play as</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {(['w', 'b'] as const).map((color) => (
            // Keep explicit visual themes for white/black, both on hover and selected.
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
