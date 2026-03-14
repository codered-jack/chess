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
  let whiteLabel = '0.0'
  let blackLabel = '0.0'

  if (score) {
    if (score.type === 'mate') {
      const m = score.value
      whitePercent = m > 0 ? 97 : 3
      whiteLabel = `${m > 0 ? '+' : '-'}M${Math.abs(m)}`
      blackLabel = `${m > 0 ? '-' : '+'}M${Math.abs(m)}`
    } else {
      const cp = Math.max(-1500, Math.min(1500, score.value))
      whitePercent = 50 + (Math.tanh(cp / 600) * 45)
      const whiteScore = score.value / 100
      const blackScore = -whiteScore
      whiteLabel = `${whiteScore >= 0 ? '+' : ''}${whiteScore.toFixed(1)}`
      blackLabel = `${blackScore >= 0 ? '+' : ''}${blackScore.toFixed(1)}`
    }
    lastValidPercent.current = whitePercent
  } else {
    whitePercent = lastValidPercent.current
  }

  const topPercent = flipped ? whitePercent : 100 - whitePercent
  const topSide: 'w' | 'b' = flipped ? 'w' : 'b'
  const bottomSide: 'w' | 'b' = flipped ? 'b' : 'w'
  const topLabel = topSide === 'w' ? whiteLabel : blackLabel
  const bottomLabel = bottomSide === 'w' ? whiteLabel : blackLabel
  const topColor = flipped ? '#f5f5f5' : '#1f1f1f'
  const bottomColor = flipped ? '#1f1f1f' : '#f5f5f5'

  return (
    <div className="flex flex-col items-center h-full gap-1 w-7">
      {/* Top label */}
      <div className="h-10 flex flex-col items-center justify-center gap-0.5">
        <span className="text-[10px] font-bold text-gray-500 uppercase leading-none">
          {topSide === 'w' ? 'W' : 'B'}
        </span>
        <span className="text-xs font-mono font-bold text-gray-200 leading-none">{topLabel}</span>
      </div>

      {/* Bar */}
      <div className="flex-1 w-5 rounded-full overflow-hidden border border-white/10 flex flex-col">
        <div
          className="w-full"
          style={{
            height: `${topPercent}%`,
            backgroundColor: topColor,
            transition: 'height 700ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
        <div className="w-full flex-1" style={{ backgroundColor: bottomColor }} />
      </div>

      {/* Bottom label */}
      <div className="h-10 flex flex-col items-center justify-center gap-0.5">
        <span className="text-xs font-mono font-bold text-gray-200 leading-none">{bottomLabel}</span>
        <span className="text-[10px] font-bold text-gray-500 uppercase leading-none">
          {bottomSide === 'w' ? 'W' : 'B'}
        </span>
      </div>
    </div>
  )
}
