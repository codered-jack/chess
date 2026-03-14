'use client'

import { useEffect, useRef } from 'react'

interface MoveHistoryProps {
  history: string[]
  currentMoveIndex: number
  onMoveClick: (index: number) => void
}

export default function MoveHistory({ history, currentMoveIndex, onMoveClick }: MoveHistoryProps) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentMoveIndex])

  const pairs: Array<[string, string | null]> = []
  for (let i = 0; i < history.length; i += 2) {
    pairs.push([history[i], history[i + 1] ?? null])
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-2.5 py-2 border-b border-white/6 flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Moves</span>
        {history.length > 0 && (
          <span className="text-[9px] text-gray-600 font-mono">
            {Math.ceil(history.length / 2)} moves
          </span>
        )}
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-1.5">
        {pairs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-700">
            <span className="text-5xl opacity-20 select-none">♟</span>
            <p className="text-xs text-gray-600">Make a move to start</p>
          </div>
        )}

        {pairs.map(([white, black], idx) => {
          const wi = idx * 2
          const bi = idx * 2 + 1
          const wActive = currentMoveIndex === wi
          const bActive = currentMoveIndex === bi

          return (
            <div
              key={idx}
              className="flex items-stretch rounded-md mb-0.5 overflow-hidden bg-[#1f1c18] border border-transparent"
            >
              {/* Move number */}
              <span
                className={`w-9 shrink-0 flex items-center justify-center py-1.5 text-[11px] font-mono border-r ${
                  wActive || bActive
                    ? 'bg-[#86b114]/20 text-[#d6ec93] border-[#86b114]/50'
                    : 'bg-[#121212] text-white border-white/10'
                }`}
              >
                {idx + 1}.
              </span>

              {/* White */}
              <button
                ref={wActive ? activeRef : undefined}
                onClick={() => onMoveClick(wi)}
                className={`flex-1 text-left px-2 py-1.5 text-[11px] font-mono font-medium transition-all ${
                  wActive
                    ? 'bg-[#86b114]! text-white font-bold'
                    : 'bg-transparent text-gray-100 hover:bg-[#2b2722] hover:text-white'
                }`}
              >
                {white}
              </button>

              {/* Black */}
              {black !== null ? (
                <button
                  ref={bActive ? activeRef : undefined}
                  onClick={() => onMoveClick(bi)}
                  className={`flex-1 text-left px-2 py-1.5 text-[11px] font-mono font-medium transition-all ${
                    bActive
                      ? 'bg-[#86b114]! text-white font-bold'
                      : 'bg-transparent text-gray-100 hover:bg-[#2b2722] hover:text-white'
                  }`}
                >
                  {black}
                </button>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
