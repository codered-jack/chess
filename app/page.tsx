'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Chess, Square, Move } from 'chess.js'
import ChessBoard from '@/components/ChessBoard'
import EvalBar from '@/components/EvalBar'
import MoveHistory from '@/components/MoveHistory'
import EnginePanel from '@/components/EnginePanel'
import GameControls from '@/components/GameControls'
import { EngineInfo } from '@/lib/stockfish'

type GameMode = 'analysis' | 'vs-ai' | 'two-player'
type SoundType = 'move' | 'capture' | 'check' | 'checkmate'

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const LEFT_PANEL_COLLAPSE_BREAKPOINT = 1380

export default function ChessApp() {
  const [allPositions, setAllPositions] = useState<string[]>([INITIAL_FEN])
  const [allMoves, setAllMoves] = useState<Array<{ from: Square; to: Square; promotion?: string; san: string; lan: string }>>([])
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1)
  const [redoStack, setRedoStack] = useState<typeof allMoves>([])

  const [flipped, setFlipped] = useState(false)
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w')
  const [gameMode, setGameMode] = useState<GameMode>('vs-ai')
  const [showHints, setShowHints] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [boardFullscreen, setBoardFullscreen] = useState(false)
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [legalMoves, setLegalMoves] = useState<Square[]>([])
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)

  const [engineLines, setEngineLines] = useState<EngineInfo[]>([])
  const [bestMoveArrow, setBestMoveArrow] = useState<Array<{ from: Square; to: Square; color: string }>>([])
  const [latestScore, setLatestScore] = useState<EngineInfo['score'] | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const [engineSettings, setEngineSettings] = useState({
    movetime: 1500,
    depth: null as number | null,
    multiPV: 1,
    limitStrength: false,
    elo: 3500,
  })

  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const engineCallingRef = useRef(false)
  const soundPoolRef = useRef<Record<SoundType, HTMLAudioElement | null>>({
    move: null,
    capture: null,
    check: null,
    checkmate: null,
  })

  // Debounce eval bar: only update score when depth stabilizes or on bestmove
  const scoreDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingScoreRef = useRef<EngineInfo['score'] | null>(null)

  const updateScore = useCallback((score: EngineInfo['score'], immediate = false) => {
    pendingScoreRef.current = score
    if (scoreDebounceRef.current) clearTimeout(scoreDebounceRef.current)
    if (immediate) {
      setLatestScore(score)
    } else {
      scoreDebounceRef.current = setTimeout(() => {
        if (pendingScoreRef.current) setLatestScore(pendingScoreRef.current)
      }, 150)
    }
  }, [])

  const getSoundType = useCallback((postMoveGame: Chess, move: Move): SoundType => {
    if (postMoveGame.isCheckmate()) return 'checkmate'
    if (postMoveGame.inCheck()) return 'check'
    if (move.captured) return 'capture'
    return 'move'
  }, [])

  const playSound = useCallback((soundType: SoundType) => {
    if (!soundEnabled) return
    if (typeof window === 'undefined') return
    const sound = soundPoolRef.current[soundType]
    if (!sound) return
    sound.currentTime = 0
    void sound.play().catch(() => {})
  }, [soundEnabled])

  const currentFen = allPositions[currentMoveIndex + 1] ?? INITIAL_FEN
  const currentGame = new Chess(currentFen)
  const isGameOver = currentGame.isGameOver()
  const turn = currentGame.turn()
  const isAtLatest = currentMoveIndex === allMoves.length - 1

  const getGameStatus = () => {
    if (currentGame.isCheckmate()) return `Checkmate! ${turn === 'w' ? 'Black' : 'White'} wins`
    if (currentGame.isStalemate()) return 'Stalemate — Draw'
    if (currentGame.isDraw()) return 'Draw'
    if (currentGame.inCheck()) return `${turn === 'w' ? 'White' : 'Black'} is in Check!`
    return `${turn === 'w' ? 'White' : 'Black'} to move`
  }

  const applyMove = useCallback(
    (
      fen: string,
      moveData: { from: Square; to: Square; san: string; lan: string; promotion?: string },
      targetMoveIndex: number,
      soundType: SoundType = 'move'
    ) => {
      playSound(soundType)
      setAllPositions((prev) => [...prev.slice(0, targetMoveIndex + 2), fen])
      setAllMoves((prev) => [...prev.slice(0, targetMoveIndex + 1), moveData])
      setCurrentMoveIndex(targetMoveIndex + 1)
      setLastMove({ from: moveData.from, to: moveData.to })
      setRedoStack([])
      setSelectedSquare(null)
      setLegalMoves([])
      setBestMoveArrow([])
      setPromotionPending(null)
    },
    [playSound]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const pool: Record<SoundType, HTMLAudioElement> = {
      move: new Audio('/sounds/move.mp3'),
      capture: new Audio('/sounds/capture.mp3'),
      check: new Audio('/sounds/check.mp3'),
      checkmate: new Audio('/sounds/checkmate.mp3'),
    }

    for (const key of Object.keys(pool) as SoundType[]) {
      const audio = pool[key]
      audio.preload = 'auto'
      audio.volume = key === 'checkmate' ? 0.85 : key === 'check' ? 0.95 : 0.7
    }

    soundPoolRef.current = pool

    return () => {
      for (const key of Object.keys(soundPoolRef.current) as SoundType[]) {
        const audio = soundPoolRef.current[key]
        if (!audio) continue
        audio.pause()
        audio.src = ''
      }
    }
  }, [])

  useEffect(() => {
    if (!boardFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBoardFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [boardFullscreen])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onResize = () => {
      const shouldAutoCollapse = window.innerWidth < LEFT_PANEL_COLLAPSE_BREAKPOINT
      if (shouldAutoCollapse) {
        setLeftPanelOpen(false)
        setRightPanelOpen(false)
      }
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const callEngine = useCallback(
    async (fen: string, mode: GameMode, settings: typeof engineSettings, pColor: 'w' | 'b', moveIndex: number) => {
      if (engineCallingRef.current) {
        abortRef.current?.abort()
        await new Promise((r) => setTimeout(r, 80))
      }

      const g = new Chess(fen)
      if (g.isGameOver()) { setIsAnalyzing(false); return }

      const sideToMove = g.turn()
      const isAiTurn = mode === 'vs-ai' && sideToMove !== pColor

      // Stockfish always scores from the side-to-move's POV.
      // Normalize to always be from White's POV for the eval bar.
      const toWhitePov = (score: EngineInfo['score']): EngineInfo['score'] =>
        sideToMove === 'w' ? score : { type: score.type, value: -score.value }
      if (mode === 'two-player') return

      engineCallingRef.current = true
      setIsAnalyzing(true)
      setBestMoveArrow([])
      setEngineLines([])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const params = new URLSearchParams({
          fen,
          movetime: String(isAiTurn ? settings.movetime : Math.min(settings.movetime, 3000)),
          multiPV: String(mode === 'analysis' ? settings.multiPV : 1),
          limitStrength: String(settings.limitStrength && isAiTurn),
          ...(settings.limitStrength && isAiTurn ? { elo: String(settings.elo) } : {}),
        })

        const res = await fetch(`/api/stockfish?${params}`, { signal: controller.signal })
        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        const lineBuffer: EngineInfo[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const events = text.split('\n\n').filter(Boolean)

          for (const event of events) {
            if (!event.startsWith('data: ')) continue
            const data = JSON.parse(event.slice(6))

            if (data.type === 'info') {
              const info = data.info as EngineInfo
              lineBuffer[info.multipv - 1] = info
              setEngineLines([...lineBuffer.filter(Boolean)])
              // Only update score on deeper analysis to avoid flicker
              if (lineBuffer[0] && info.multipv === 1 && info.depth >= 8) {
                updateScore(toWhitePov(lineBuffer[0].score))
              }
              if (mode === 'analysis' && lineBuffer[0]?.pv.length >= 1) {
                const from = lineBuffer[0].pv[0].slice(0, 2) as Square
                const to = lineBuffer[0].pv[0].slice(2, 4) as Square
                setBestMoveArrow([{ from, to, color: 'rgba(255, 170, 0, 0.85)' }])
              }
            }

            if (data.type === 'bestmove' && data.bestMove && data.bestMove !== '(none)') {
              const from = data.bestMove.slice(0, 2) as Square
              const to = data.bestMove.slice(2, 4) as Square
              const promo = data.bestMove[4] as string | undefined

              setBestMoveArrow([{ from, to, color: 'rgba(255, 170, 0, 0.85)' }])
              // Update score immediately on final bestmove
              if (lineBuffer[0]) updateScore(toWhitePov(lineBuffer[0].score), true)

              if (isAiTurn && !controller.signal.aborted) {
                const next = new Chess(fen)
                try {
                  const mv = next.move({ from, to, promotion: promo ?? 'q' })
                  if (mv) {
                    const soundType = getSoundType(next, mv)
                    applyMove(next.fen(), { from, to, san: mv.san, lan: mv.lan, promotion: promo }, moveIndex, soundType)
                  }
                } catch { /* ignore */ }
              }
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== 'AbortError') console.error(e)
      } finally {
        engineCallingRef.current = false
        setIsAnalyzing(false)
      }
    },
    [applyMove, getSoundType, updateScore]
  )

  useEffect(() => {
    callEngine(currentFen, gameMode, engineSettings, playerColor, currentMoveIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen, gameMode, engineSettings, playerColor, showHints])

  const makeMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const g = new Chess(currentFen)
      const piece = g.get(from)
      const isPromotion =
        piece?.type === 'p' &&
        ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))

      if (isPromotion && !promotion) { setPromotionPending({ from, to }); return }

      let mv: Move | null = null
      try { mv = g.move({ from, to, promotion: promotion ?? 'q' }) } catch {
        setSelectedSquare(null); setLegalMoves([]); return
      }
      if (!mv) return
      const soundType = getSoundType(g, mv)
      applyMove(g.fen(), { from, to, san: mv.san, lan: mv.lan, promotion }, currentMoveIndex, soundType)
    },
    [currentFen, currentMoveIndex, applyMove, getSoundType]
  )

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (isGameOver || !isAtLatest) return
      const isPlayerTurn = gameMode === 'two-player' || currentGame.turn() === playerColor
      if (!isPlayerTurn && gameMode === 'vs-ai') return

      if (selectedSquare) {
        if (legalMoves.includes(square)) {
          makeMove(selectedSquare, square)
        } else {
          const piece = currentGame.get(square)
          if (piece && piece.color === currentGame.turn()) {
            setSelectedSquare(square)
            setLegalMoves(currentGame.moves({ square, verbose: true }).map((m) => m.to as Square))
          } else {
            setSelectedSquare(null)
            setLegalMoves([])
          }
        }
      } else {
        const piece = currentGame.get(square)
        if (piece && piece.color === currentGame.turn()) {
          setSelectedSquare(square)
          setLegalMoves(currentGame.moves({ square, verbose: true }).map((m) => m.to as Square))
        }
      }
    },
    [selectedSquare, legalMoves, currentGame, gameMode, playerColor, isGameOver, isAtLatest, makeMove]
  )

  const handleDrop = useCallback(
    (from: Square, to: Square) => {
      if (!isAtLatest) return
      const isPlayerTurn = gameMode === 'two-player' || currentGame.turn() === playerColor
      if (!isPlayerTurn && gameMode === 'vs-ai') return
      makeMove(from, to)
    },
    [makeMove, currentGame, gameMode, playerColor, isAtLatest]
  )

  const handleUndo = () => {
    if (currentMoveIndex < 0) return
    setCurrentMoveIndex((i) => i - 1)
    setRedoStack((s) => [allMoves[currentMoveIndex], ...s])
    setSelectedSquare(null); setLegalMoves([]); setBestMoveArrow([])
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return
    const [, ...rest] = redoStack
    setCurrentMoveIndex((i) => i + 1)
    setRedoStack(rest)
    setBestMoveArrow([])
  }

  const handleMoveClick = (index: number) => {
    setCurrentMoveIndex(index)
    setSelectedSquare(null); setLegalMoves([]); setBestMoveArrow([])
  }

  const handleNewGame = () => {
    abortRef.current?.abort()
    setAllPositions([INITIAL_FEN]); setAllMoves([]); setCurrentMoveIndex(-1)
    setRedoStack([]); setSelectedSquare(null); setLegalMoves([])
    setLastMove(null); setBestMoveArrow([]); setEngineLines([])
    setLatestScore(null); setIsAnalyzing(false)
  }

  const handlePlayerColorChange = (color: 'w' | 'b') => {
    setPlayerColor(color)
    setFlipped(color === 'b')
  }

  const handleExportPGN = () => {
    const g = new Chess()
    for (const mv of allMoves.slice(0, currentMoveIndex + 1)) {
      try { g.move({ from: mv.from, to: mv.to, promotion: mv.promotion }) } catch { break }
    }
    const blob = new Blob([g.pgn()], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'game.pgn'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportPGN = (pgn: string) => {
    try {
      const g = new Chess()
      g.loadPgn(pgn)
      const history = g.history({ verbose: true })
      const positions = [INITIAL_FEN]
      const tmp = new Chess()
      for (const mv of history) { tmp.move(mv.lan); positions.push(tmp.fen()) }
      setAllPositions(positions)
      setAllMoves(history.map((m) => ({ from: m.from as Square, to: m.to as Square, san: m.san, lan: m.lan, promotion: m.promotion })))
      setCurrentMoveIndex(history.length - 1)
      setRedoStack([])
      setLastMove(history.length > 0 ? { from: history.at(-1)!.from as Square, to: history.at(-1)!.to as Square } : null)
      setBestMoveArrow([])
    } catch { alert('Invalid PGN file') }
  }

  const handleCopyFEN = () => { navigator.clipboard.writeText(currentFen); alert('FEN copied!') }

  const handlePasteFEN = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const g = new Chess(); g.load(text)
      setAllPositions([g.fen()]); setAllMoves([]); setCurrentMoveIndex(-1)
      setRedoStack([]); setLastMove(null); setBestMoveArrow([])
    } catch { alert('Invalid FEN string in clipboard') }
  }

  const displayedHistory = allMoves.slice(0, currentMoveIndex + 1).map((m) => m.san)
  const showLeftPanel = !boardFullscreen && leftPanelOpen
  const showRightPanel = !boardFullscreen && rightPanelOpen
  const boardWidthForLayout = boardFullscreen
    ? 'min(80vw, 80vh, 576px)'
    : (showLeftPanel && showRightPanel
      ? 'min(calc(100vh - 108px), calc(100vw - 812px))'
      : (showLeftPanel || showRightPanel
        ? 'min(calc(100vh - 108px), calc(100vw - 524px))'
        : 'min(calc(100vh - 108px), calc(100vw - 236px))'))

  return (
    <div className="h-screen bg-[#262421] text-white flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header className={`${boardFullscreen ? 'hidden' : 'shrink-0 h-14 px-6 flex items-center gap-4 bg-[#1a1714] border-b border-white/6'}`}>
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">♟</span>
          <span className="text-base font-bold text-white tracking-tight">Chess</span>
          <span className="text-[11px] font-semibold text-[#86b114] bg-[#86b114]/15 px-2 py-0.5 rounded-full">SF18</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setBoardFullscreen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border bg-white/5 border-white/8 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            {boardFullscreen ? 'Exit Fullscreen' : 'Fullscreen Board'}
          </button>
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border ${
              soundEnabled
                ? 'bg-[#86b114]/20 border-[#86b114]/40 text-[#86b114]'
                : 'bg-white/5 border-white/8 text-gray-500 hover:bg-white/10 hover:text-gray-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full transition-colors ${soundEnabled ? 'bg-[#86b114]' : 'bg-gray-600'}`} />
            {soundEnabled ? 'Sound: On' : 'Sound: Off'}
          </button>
          <button
            onClick={() => {
              setShowHints((v) => {
                if (v) {
                  // turning hints OFF — clear any active selection so yellow square disappears too
                  setSelectedSquare(null)
                  setLegalMoves([])
                  setBestMoveArrow([])
                }
                return !v
              })
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all border ${
              showHints
                ? 'bg-[#86b114]/20 border-[#86b114]/40 text-[#86b114]'
                : 'bg-white/5 border-white/8 text-gray-500 hover:bg-white/10 hover:text-gray-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full transition-colors ${showHints ? 'bg-[#86b114]' : 'bg-gray-600'}`} />
            {showHints ? 'Hints: On' : 'Hints: Off'}
          </button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex-1 flex min-h-0 relative">
        {!boardFullscreen && (
          <>
            <button
              onClick={() => setLeftPanelOpen((v) => !v)}
              aria-label={showLeftPanel ? 'Collapse left panel' : 'Expand left panel'}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-md border border-white/15 bg-black/45 text-gray-200 hover:bg-black/65 hover:text-white text-sm font-bold"
            >
              {showLeftPanel ? '<' : '>'}
            </button>
            <button
              onClick={() => setRightPanelOpen((v) => !v)}
              aria-label={showRightPanel ? 'Collapse right panel' : 'Expand right panel'}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-md border border-white/15 bg-black/45 text-gray-200 hover:bg-black/65 hover:text-white text-sm font-bold"
            >
              {showRightPanel ? '>' : '<'}
            </button>
          </>
        )}

        {/* ── Left panel — Engine ── */}
        <aside className={`${showLeftPanel ? 'relative w-72 shrink-0 flex flex-col bg-[#1a1714] border-r border-white/6 overflow-y-auto' : 'hidden'}`}>
          {showLeftPanel ? (
            <div className="p-4">
              <EnginePanel
                engineLines={engineLines}
                isAnalyzing={isAnalyzing}
                settings={engineSettings}
                onSettingsChange={(partial) => setEngineSettings((s) => ({ ...s, ...partial }))}
                gameMode={gameMode}
                onGameModeChange={(mode) => { setGameMode(mode); setEngineLines([]); setBestMoveArrow([]) }}
              />
            </div>
          ) : (
            <div className="h-full flex items-start justify-center pt-3">
              <button
                onClick={() => setLeftPanelOpen(true)}
                aria-label="Expand left panel"
                className="h-7 w-7 rounded-md border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white text-sm font-bold"
              >
                {'>'}
              </button>
            </div>
          )}
        </aside>

        {/* ── Center — Board ── */}
        <main className={`relative flex-1 flex items-center justify-center min-h-0 min-w-0 ${boardFullscreen ? 'bg-[#151311] p-6 sm:p-8 md:p-10' : 'bg-[#262421]'}`}>
          {boardFullscreen && (
            <button
              onClick={() => setBoardFullscreen(false)}
              className="absolute top-3 right-3 z-40 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-black/45 border border-white/15 text-gray-200 hover:bg-black/65 hover:text-white transition-all"
            >
              Exit Fullscreen
            </button>
          )}
          <div className={`flex items-center justify-center h-full w-full box-border ${boardFullscreen ? '' : 'gap-6 px-6 py-6'}`}>

            {/* Eval bar */}
            {!boardFullscreen && (
              <div className="self-stretch py-8 flex flex-col">
                <EvalBar score={latestScore} flipped={flipped} turn={turn} />
              </div>
            )}

            {/* Board wrapper — always a perfect square */}
            <div
              className="relative"
              style={{
                width: boardWidthForLayout,
                height: boardWidthForLayout,
                minWidth:  '300px',
                minHeight: '300px',
              }}
            >
              <ChessBoard
                game={currentGame}
                flipped={flipped}
                selectedSquare={selectedSquare}
                legalMoves={legalMoves}
                lastMove={lastMove}
                arrows={showHints ? bestMoveArrow : []}
                onSquareClick={handleSquareClick}
                onDrop={handleDrop}
                playerColor={playerColor}
                disabled={!isAtLatest || isGameOver}
                showHints={showHints}
              />
            </div>
          </div>
        </main>

        {/* ── Right panel — Controls + History ── */}
        <aside className={`${showRightPanel ? 'w-72 shrink-0 flex flex-col bg-[#1a1714] border-l border-white/6 overflow-hidden' : 'hidden'}`}>
          {showRightPanel ? (
            <>
              <div className="shrink-0 p-3 border-b border-white/6">
                <GameControls
                  flipped={flipped}
                  canUndo={currentMoveIndex >= 0}
                  canRedo={redoStack.length > 0}
                  onFlip={() => setFlipped((f) => !f)}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onNewGame={handleNewGame}
                  onExportPGN={handleExportPGN}
                  onImportPGN={handleImportPGN}
                  onCopyFEN={handleCopyFEN}
                  onPasteFEN={handlePasteFEN}
                  playerColor={playerColor}
                  onPlayerColorChange={handlePlayerColorChange}
                  gameStatus={getGameStatus()}
                />
              </div>

              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <MoveHistory
                  history={displayedHistory}
                  currentMoveIndex={currentMoveIndex}
                  onMoveClick={handleMoveClick}
                />
              </div>
            </>
          ) : (
            <div className="h-full flex items-start justify-center pt-3">
              <button
                onClick={() => setRightPanelOpen(true)}
                aria-label="Expand right panel"
                className="h-7 w-7 rounded-md border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white text-sm font-bold"
              >
                {'<'}
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ── Promotion modal ── */}
      {promotionPending && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1714] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl">
            <h2 className="text-base font-semibold text-gray-200 tracking-wide">Promote Pawn</h2>
            <div className="flex gap-3">
              {(['q', 'r', 'b', 'n'] as const).map((piece) => {
                const color = currentGame.turn()
                const labels: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }
                return (
                  <button
                    key={piece}
                    onClick={() => makeMove(promotionPending.from, promotionPending.to, piece)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 hover:bg-[#86b114]/20 border border-white/10 hover:border-[#86b114]/40 transition-all group"
                  >
                    <img src={`/pieces/${color}${piece.toUpperCase()}.svg`} alt={labels[piece]} className="w-14 h-14 group-hover:scale-110 transition-transform" />
                    <span className="text-xs text-gray-500 group-hover:text-gray-300">{labels[piece]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
