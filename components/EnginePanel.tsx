'use client'

import { useState } from 'react'
import { EngineInfo } from '@/lib/stockfish'

interface EnginePanelProps {
  engineLines: EngineInfo[]
  isAnalyzing: boolean
  settings: {
    movetime: number
    depth: number | null
    multiPV: number
    limitStrength: boolean
    elo: number
  }
  onSettingsChange: (settings: Partial<EnginePanelProps['settings']>) => void
  gameMode: 'analysis' | 'vs-ai' | 'two-player'
  onGameModeChange: (mode: EnginePanelProps['gameMode']) => void
}

const MODES = [
  { id: 'vs-ai' as const,      label: 'Play vs AI',   desc: 'Play against Stockfish 18' },
  { id: 'two-player' as const, label: 'Two Players',  desc: 'Pass and play on one device' },
  { id: 'analysis' as const,   label: 'Analysis',     desc: 'Explore any position' },
]

function eloLabel(elo: number): string {
  if (elo < 700)  return 'Beginner'
  if (elo < 1000) return 'Casual'
  if (elo < 1300) return 'Club Player'
  if (elo < 1600) return 'Intermediate'
  if (elo < 1900) return 'Advanced'
  if (elo < 2200) return 'Expert'
  if (elo < 2500) return 'Master'
  if (elo < 3000) return 'Grandmaster'
  return 'Near Perfect'
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      {children}
    </div>
  )
}

type HealthState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; backend: string; timestamp: string }
  | { status: 'error'; message: string; timestamp: string }

export default function EnginePanel({
  isAnalyzing, settings, onSettingsChange, gameMode, onGameModeChange,
}: EnginePanelProps) {
  const [health, setHealth] = useState<HealthState>({ status: 'idle' })

  const checkHealth = async () => {
    setHealth({ status: 'checking' })
    try {
      const res = await fetch('/api/stockfish/health', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) {
        setHealth({ status: 'ok', backend: data.backend ?? data.mode ?? 'unknown', timestamp: data.timestamp })
      } else {
        setHealth({ status: 'error', message: data.error ?? `HTTP ${res.status}`, timestamp: data.timestamp ?? new Date().toISOString() })
      }
    } catch (e) {
      setHealth({ status: 'error', message: e instanceof Error ? e.message : 'Network error', timestamp: new Date().toISOString() })
    }
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── Game Mode ── */}
      <Section label="Game Mode">
        <div className="flex flex-col gap-1.5">
          {MODES.map(({ id, label, desc }) => (
            <button
              key={id}
              onClick={() => onGameModeChange(id)}
              className={`flex flex-col items-start gap-1 py-1.5 px-2.5 rounded-lg text-left transition-all border ${
                gameMode === id
                  ? 'bg-[#86b114]/15 border-[#86b114]/40 text-white'
                  : 'bg-white/4 border-white/8 text-gray-400 hover:bg-white/7 hover:text-gray-200 hover:border-white/15'
              }`}
            >
              <span className={`text-[11px] font-semibold leading-tight ${gameMode === id ? 'text-[#86b114]' : ''}`}>
                {label}
              </span>
              <span className="text-[10px] text-gray-500 leading-tight">{desc}</span>
            </button>
          ))}
        </div>
      </Section>

      <div className="border-t border-white/6" />

      {/* ── AI Strength ── */}
      {gameMode === 'vs-ai' && (
        <>
          <Section label="AI Strength">
            {/* Full / Custom toggle */}
            <div className="mb-2.5">
              <div className="grid grid-cols-2 rounded-lg bg-black/20 border border-white/8 p-0.5">
                <button
                  onClick={() => onSettingsChange({ limitStrength: false })}
                  className={`rounded-md py-1.5 text-[10px] font-semibold transition-colors ${
                    !settings.limitStrength
                      ? 'bg-[#86b114] text-white'
                      : 'bg-transparent text-gray-400 hover:text-gray-100 hover:bg-white/10'
                  }`}
                >
                  Full Power
                </button>
                <button
                  onClick={() => onSettingsChange({ limitStrength: true })}
                  className={`rounded-md py-1.5 text-[10px] font-semibold transition-colors ${
                    settings.limitStrength
                      ? 'bg-[#86b114] text-white'
                      : 'bg-transparent text-gray-400 hover:text-white hover:bg-[#86b114]/20'
                  }`}
                >
                  Custom ELO
                </button>
              </div>
            </div>

            {settings.limitStrength ? (
              <div className="bg-[#262421] rounded-lg p-3 border border-white/8">
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Rating</p>
                    <p className="text-2xl font-bold text-white font-mono leading-none">{settings.elo}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#86b114] pb-0.5">{eloLabel(settings.elo)}</span>
                </div>
                <input
                  type="range" min={500} max={3500} step={50} value={settings.elo}
                  onChange={(e) => onSettingsChange({ elo: parseInt(e.target.value) })}
                  className="w-full accent-[#86b114] h-2 cursor-pointer"
                />
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-gray-600">500 Beginner</span>
                  <span className="text-xs text-gray-600">3500 SF18</span>
                </div>
              </div>
            ) : (
              <div className="bg-[#262421] rounded-lg p-3 border border-white/8 flex items-center gap-2">
                <span className="text-base">⚡</span>
                <div>
                  <p className="text-[12px] font-semibold text-white">Full Stockfish 18</p>
                  <p className="text-[10px] text-gray-500">~3500 ELO · World's strongest engine</p>
                </div>
              </div>
            )}
          </Section>
          <div className="border-t border-white/6" />
        </>
      )}

      {/* ── Think Time ── */}
      <Section label="Think Time">
        <div className="bg-[#262421] rounded-lg p-3 border border-white/8">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Per move</p>
              <p className="text-2xl font-bold text-white font-mono leading-none">
                {(settings.movetime / 1000).toFixed(1)}
                <span className="text-sm text-gray-400 font-normal ml-1">s</span>
              </p>
            </div>
            <span className="text-[10px] text-gray-500 pb-0.5">
              {settings.movetime <= 500 ? 'Fast' : settings.movetime <= 2000 ? 'Balanced' : settings.movetime <= 5000 ? 'Deep' : 'Very Deep'}
            </span>
          </div>
          <input
            type="range" min={200} max={10000} step={200} value={settings.movetime}
            onChange={(e) => onSettingsChange({ movetime: parseInt(e.target.value) })}
            className="w-full accent-[#86b114] h-2 cursor-pointer"
          />
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-gray-600">0.2s Fast</span>
            <span className="text-[10px] text-gray-600">10s Deep</span>
          </div>
        </div>
      </Section>

      <div className="border-t border-white/6" />

      {/* ── Engine Status ── */}
      <div className="rounded-lg bg-[#262421] border border-white/8 overflow-hidden">
        {/* Live status row */}
        <div className="flex items-center gap-2 py-2.5 px-3">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${
            isAnalyzing ? 'bg-[#86b114] animate-pulse' : 'bg-white/20'
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-gray-200">
              {isAnalyzing ? 'Engine thinking…' : 'Engine ready'}
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">Stockfish 18 · WASM / Native</p>
          </div>
          <button
            onClick={checkHealth}
            disabled={health.status === 'checking'}
            className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors
              border-white/10 text-gray-400 hover:text-gray-100 hover:border-white/25 hover:bg-white/6
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {health.status === 'checking' ? '…' : 'Ping'}
          </button>
        </div>

        {/* Health result row — only shown after a ping */}
        {health.status !== 'idle' && health.status !== 'checking' && (
          <div className={`px-3 pb-2.5 pt-0 border-t border-white/6 ${
            health.status === 'ok' ? 'text-[#86b114]' : 'text-red-400'
          }`}>
            {health.status === 'ok' ? (
              <p className="text-[10px] font-medium">
                Ready · <span className="font-mono">{health.backend}</span>
                <span className="text-gray-600 ml-1">
                  {new Date(health.timestamp).toLocaleTimeString()}
                </span>
              </p>
            ) : (
              <p className="text-[10px] font-medium break-all">
                {health.message}
              </p>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
