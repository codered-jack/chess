'use client'

import { useEffect, useRef, useState } from 'react'
import { OpeningInfo } from '@/lib/openings'

interface MoveHistoryProps {
  history: string[]
  annotations: (string | null)[]
  openingInfo: OpeningInfo | null
  currentMoveIndex: number
  onMoveClick: (index: number) => void
  isVisible?: boolean
}

const BADGE_STYLES: Record<string, string> = {
  '!!': 'text-cyan-400',
  '!':  'text-[#86b114]',
  '!?': 'text-teal-400',
  '?!': 'text-yellow-400',
  '?':  'text-orange-400',
  '??': 'text-red-400',
}

const BADGE_LEGEND = [
  { symbol: '!!', color: 'text-cyan-400',       label: 'Brilliant',  desc: 'Unexpected move that improves the position significantly' },
  { symbol: '!',  color: 'text-[#86b114]',      label: 'Good',       desc: "Engine's top choice for this position" },
  { symbol: '!?', color: 'text-teal-400',        label: 'Interesting', desc: 'Not the engine\'s first pick, but still a sound move' },
  { symbol: '?!', color: 'text-yellow-400',      label: 'Inaccuracy', desc: 'Small mistake, loses 30–80 centipawns' },
  { symbol: '?',  color: 'text-orange-400',      label: 'Mistake',    desc: 'Significant error, loses 80–200 centipawns' },
  { symbol: '??', color: 'text-red-400',         label: 'Blunder',    desc: 'Serious mistake, loses more than 200 centipawns' },
]

export default function MoveHistory({
  history,
  annotations,
  openingInfo,
  currentMoveIndex,
  onMoveClick,
  isVisible = true,
}: MoveHistoryProps) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const legendBtnRef = useRef<HTMLButtonElement>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [legendPos, setLegendPos] = useState({ bottom: 0, right: 0 })

  useEffect(() => {
    // Only scroll when the panel is visible — scrollIntoView ignores CSS transforms
    // and will scroll the viewport when the panel is hidden off-screen (translate-x-full)
    if (!isVisible) return
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentMoveIndex, isVisible])

  const toggleLegend = () => {
    if (!legendOpen && legendBtnRef.current) {
      const rect = legendBtnRef.current.getBoundingClientRect()
      setLegendPos({ bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right })
    }
    setLegendOpen((v) => !v)
  }

  // Close legend when clicking outside
  useEffect(() => {
    if (!legendOpen) return
    const handler = (e: MouseEvent) => {
      if (legendBtnRef.current && !legendBtnRef.current.contains(e.target as Node)) {
        setLegendOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [legendOpen])

  const pairs: Array<[string, string | null]> = []
  for (let i = 0; i < history.length; i += 2) {
    pairs.push([history[i], history[i + 1] ?? null])
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-2.5 py-2 border-b border-white/6">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Moves</span>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <span className="text-[9px] text-gray-600 font-mono">
                {Math.ceil(history.length / 2)} moves
              </span>
            )}
            {/* Badge legend toggle */}
            <button
              ref={legendBtnRef}
              onClick={toggleLegend}
              className="w-4 h-4 rounded-full bg-white/8 border border-white/12 text-gray-500 hover:text-gray-300 hover:bg-white/15 text-[9px] font-bold flex items-center justify-center transition-all"
              title="Move annotation legend"
            >
              ?
            </button>
          </div>
        </div>
        {/* Opening name */}
        {openingInfo && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[9px] font-bold text-[#86b114] shrink-0">{openingInfo.eco}</span>
            <span className="text-[9px] text-gray-400 truncate">{openingInfo.name}</span>
          </div>
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
          const wBadge = annotations[wi] ?? null
          const bBadge = annotations[bi] ?? null

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

              {/* White move */}
              <button
                ref={wActive ? activeRef : undefined}
                onClick={() => onMoveClick(wi)}
                className={`flex-1 text-left px-2 py-1.5 text-[11px] font-mono font-medium transition-all flex items-center gap-1 ${
                  wActive
                    ? 'bg-[#86b114]! text-white font-bold'
                    : 'bg-transparent text-gray-100 hover:bg-[#2b2722] hover:text-white'
                }`}
              >
                <span>{white}</span>
                {wBadge && (
                  <span className={`text-[10px] font-bold ${BADGE_STYLES[wBadge] ?? 'text-gray-400'}`}>
                    {wBadge}
                  </span>
                )}
              </button>

              {/* Black move */}
              {black !== null ? (
                <button
                  ref={bActive ? activeRef : undefined}
                  onClick={() => onMoveClick(bi)}
                  className={`flex-1 text-left px-2 py-1.5 text-[11px] font-mono font-medium transition-all flex items-center gap-1 ${
                    bActive
                      ? 'bg-[#86b114]! text-white font-bold'
                      : 'bg-transparent text-gray-100 hover:bg-[#2b2722] hover:text-white'
                  }`}
                >
                  <span>{black}</span>
                  {bBadge && (
                    <span className={`text-[10px] font-bold ${BADGE_STYLES[bBadge] ?? 'text-gray-400'}`}>
                      {bBadge}
                    </span>
                  )}
                </button>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          )
        })}
      </div>

      {/* Legend panel — fixed so it escapes the overflow-hidden aside */}
      {legendOpen && (
        <div
          className="fixed z-[200] w-64 bg-[#1a1714] border border-white/12 rounded-xl shadow-2xl p-3 flex flex-col gap-2"
          style={{ bottom: legendPos.bottom, right: legendPos.right }}
        >
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Move Annotations</p>
          {BADGE_LEGEND.map(({ symbol, color, label, desc }) => (
            <div key={symbol}>
              <div className="flex items-center gap-3">
                <span className={`${color} font-bold font-mono text-[13px] w-5 shrink-0`}>{symbol}</span>
                <span className="text-[10px] font-semibold text-gray-200">{label}</span>
              </div>
              <p className="text-[9px] text-gray-500 leading-snug pl-8">{desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
