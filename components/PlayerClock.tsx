'use client'

interface PlayerClockProps {
  seconds: number
  isActive: boolean
  hasTimer: boolean
}

export default function PlayerClock({ seconds, isActive, hasTimer }: PlayerClockProps) {
  if (!hasTimer) return null

  const isLow = seconds > 0 && seconds <= 30
  const isOut = seconds === 0
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  const display = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return (
    <div
      className={`
        px-3 py-1 rounded-lg font-mono text-base font-bold tabular-nums select-none
        min-w-[72px] text-center transition-all duration-300
        ${isOut
          ? 'bg-red-950/80 text-red-400 border border-red-700/60'
          : isLow && isActive
            ? 'bg-red-950/70 text-red-300 border border-red-700/50 animate-pulse'
            : isActive
              ? 'bg-[#f0f0f0] text-[#111]'
              : 'bg-[#111] text-gray-500 border border-white/8'
        }
      `}
    >
      {display}
    </div>
  )
}
