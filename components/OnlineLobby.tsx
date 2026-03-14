'use client'

import { useState } from 'react'

interface OnlineLobbyProps {
  roomUrl: string
  playerColor: 'w' | 'b'
  timeControl: number | null
  onTimeControlChange: (seconds: number | null) => void
  onCancel: () => void
}

const TIME_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'No timer', value: null },
  { label: '5 min', value: 5 * 60 },
  { label: '10 min', value: 10 * 60 },
  { label: '15 min', value: 15 * 60 },
]

export default function OnlineLobby({ roomUrl, playerColor, timeControl, onTimeControlChange, onCancel }: OnlineLobbyProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement('textarea')
      el.value = roomUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#151311]/90 backdrop-blur-sm">
      <div className="bg-[#1a1714] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-96 max-w-[90vw]">

        {/* Animated waiting indicator */}
        <div className="relative flex items-center justify-center w-16 h-16">
          <span className="absolute inset-0 rounded-full border-2 border-[#86b114]/30 animate-ping" />
          <span className="relative flex items-center justify-center w-12 h-12 rounded-full bg-[#86b114]/15 border border-[#86b114]/40 text-2xl">
            {playerColor === 'w' ? '♔' : '♚'}
          </span>
        </div>

        {/* Status */}
        <div className="text-center">
          <p className="text-white font-bold text-lg">Waiting for opponent…</p>
          <p className="text-gray-400 text-sm mt-1">
            You are playing as <span className="text-[#86b114] font-semibold">{playerColor === 'w' ? 'White' : 'Black'}</span>
          </p>
        </div>

        {/* Timer selector */}
        <div className="w-full">
          <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wide mb-2">Time control</p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIME_OPTIONS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => onTimeControlChange(value)}
                className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                  timeControl === value
                    ? 'bg-[#86b114]/20 border-[#86b114]/50 text-[#86b114]'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Share link */}
        <div className="w-full">
          <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wide mb-2">Share this link with your opponent</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono truncate select-all">
              {roomUrl}
            </div>
            <button
              onClick={handleCopy}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                copied
                  ? 'bg-[#86b114]/20 border-[#86b114]/50 text-[#86b114]'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
        >
          Cancel and go back
        </button>
      </div>
    </div>
  )
}
