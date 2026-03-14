'use client'

import { useRef } from 'react'

interface EvalBarProps {
  score: { type: 'cp' | 'mate'; value: number } | null
  flipped: boolean
  turn: 'w' | 'b'
}

export default function EvalBar({ score, flipped }: EvalBarProps) {
  const lastValidPercent = useRef(50)

  let whitePercent = 50
  let displayLabel = '0.0'
  let whiteWinning = true

  if (score) {
    if (score.type === 'mate') {
      const m = score.value
      whitePercent = m > 0 ? 97 : 3
      whiteWinning = m > 0
      displayLabel = `M${Math.abs(m)}`
    } else {
      const cp = Math.max(-1500, Math.min(1500, score.value))
      whitePercent = 50 + (Math.tanh(cp / 600) * 45)
      whiteWinning = score.value >= 0
      displayLabel = (Math.abs(score.value) / 100).toFixed(1)
    }
    lastValidPercent.current = whitePercent
  } else {
    whitePercent = lastValidPercent.current
  }

  const darkPercent = flipped ? whitePercent : 100 - whitePercent
  const showLabelAtTop = flipped ? whiteWinning : !whiteWinning

  return (
    <div className="flex flex-col items-center h-full gap-1 w-7">
      {/* Top label */}
      <div className="h-10 flex flex-col items-center justify-center gap-0.5">
        {showLabelAtTop && (
          <>
            <span className="text-[10px] font-bold text-gray-500 uppercase leading-none">
              {whiteWinning ? 'W' : 'B'}
            </span>
            <span className="text-xs font-mono font-bold text-gray-200 leading-none">{displayLabel}</span>
          </>
        )}
      </div>

      {/* Bar */}
      <div className="flex-1 w-5 rounded-full overflow-hidden border border-white/10 flex flex-col">
        <div
          className="w-full bg-[#302e2b]"
          style={{
            height: `${darkPercent}%`,
            transition: 'height 700ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
        <div className="w-full flex-1 bg-[#f0d9b5]" />
      </div>

      {/* Bottom label */}
      <div className="h-10 flex flex-col items-center justify-center gap-0.5">
        {!showLabelAtTop && (
          <>
            <span className="text-xs font-mono font-bold text-gray-200 leading-none">{displayLabel}</span>
            <span className="text-[10px] font-bold text-gray-500 uppercase leading-none">
              {whiteWinning ? 'W' : 'B'}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
