'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Chess, Square, Move } from 'chess.js'
import ChessBoard from '@/components/ChessBoard'
import EvalBar from '@/components/EvalBar'
import MoveHistory from '@/components/MoveHistory'
import EnginePanel from '@/components/EnginePanel'
import GameControls from '@/components/GameControls'
import { CapturedPiecesRow } from '@/components/CapturedPieces'
import PlayerClock from '@/components/PlayerClock'
import ToastContainer, { ToastItem } from '@/components/ToastContainer'
import { EngineInfo } from '@/lib/stockfish'
import { getOpeningName } from '@/lib/openings'

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
  const isNavigatingRef = useRef(false)
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
    latestScoreRef.current = score
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

  const [resigned, setResigned] = useState<'w' | 'b' | null>(null)
  const [showResignModal, setShowResignModal] = useState(false)
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [drawAccepted, setDrawAccepted] = useState(false)
  const [showDrawOfferModal, setShowDrawOfferModal] = useState(false)

  // Timer state
  const [timeControl, setTimeControl] = useState<number | null>(null) // seconds per player; null = no timer
  const [whiteTime, setWhiteTime] = useState(0)
  const [blackTime, setBlackTime] = useState(0)
  const [timedOut, setTimedOut] = useState<'w' | 'b' | null>(null)

  // Toast notifications
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const drawClaimToastId = useRef<string | null>(null)

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>, autoCloseMs?: number): string => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts((prev) => [...prev, { ...toast, id }])
    if (autoCloseMs) setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), autoCloseMs)
    return id
  }, [])

  // Move quality annotations: parallel to allMoves
  const [allAnnotations, setAllAnnotations] = useState<(string | null)[]>([])
  const evalBeforeRef = useRef<EngineInfo['score'] | null>(null)
  // Mirror latestScore in a ref so makeMove can read it without a stale closure
  const latestScoreRef = useRef<EngineInfo['score'] | null>(null)
  // Track engine's suggestion for the HUMAN's turn (never overwritten by AI bestmoves)
  const prevBestMoveRef = useRef<string | null>(null)
  // Snapshot of engine's suggestion at the moment the human moved
  const capturedEngineBestRef = useRef<string | null>(null)
  // LAN of the human's actual move for comparison
  const humanMoveLANRef = useRef<string | null>(null)
  // Which allMoves index the pending annotation belongs to (human's move, not AI's)
  const annotationTargetIdxRef = useRef<number>(-1)

  const currentFen = allPositions[currentMoveIndex + 1] ?? INITIAL_FEN
  const currentGame = new Chess(currentFen)
  const isGameOver = currentGame.isGameOver() || resigned !== null || timedOut !== null || drawAccepted
  const turn = currentGame.turn()
  const isAtLatest = currentMoveIndex === allMoves.length - 1

  // 50-move rule and repetition (must be before effects that reference them)
  const halfMoveClock = parseInt(currentFen.split(' ')[4] ?? '0', 10)
  const movesUntilFifty = 100 - halfMoveClock
  const showFiftyMoveWarning = halfMoveClock >= 80 && !isGameOver
  const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
  const currentKey = positionKey(currentFen)
  const repetitionCount = allPositions.slice(0, currentMoveIndex + 2).filter((f) => positionKey(f) === currentKey).length
  const isRepetition = !isGameOver && repetitionCount >= 3

  const getGameStatus = () => {
    if (timedOut) return `${timedOut === 'w' ? 'White' : 'Black'} ran out of time - ${timedOut === 'w' ? 'Black' : 'White'} wins`
    if (drawAccepted) return 'Draw by agreement'
    if (resigned) return `${resigned === 'w' ? 'White' : 'Black'} resigned - ${resigned === 'w' ? 'Black' : 'White'} wins`
    if (currentGame.isCheckmate()) return `Checkmate! ${turn === 'w' ? 'Black' : 'White'} wins`
    if (currentGame.isStalemate()) return 'Stalemate - Draw'
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
      setAllAnnotations((prev) => [...prev.slice(0, targetMoveIndex + 1), null])
      setCurrentMoveIndex(targetMoveIndex + 1)
      setLastMove({ from: moveData.from, to: moveData.to })
      setRedoStack([])
      setSelectedSquare(null)
      setLegalMoves([])
      setBestMoveArrow([])
      setPromotionPending(null)
      setResigned(null)
      setDrawAccepted(false)
      setShowGameOverModal(false)
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

  // keyboard shortcuts registered after handleUndo/handleRedo are declared below

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
      const cid = Math.random().toString(36).slice(2, 7)

      if (engineCallingRef.current) {
        console.log(`[SF:client][${cid}] previous call running — aborting it`)
        abortRef.current?.abort()
        await new Promise((r) => setTimeout(r, 80))
        console.log(`[SF:client][${cid}] 80ms wait done, previous call should be cleared`)
      }

      const g = new Chess(fen)
      if (g.isGameOver()) { setIsAnalyzing(false); return }

      const sideToMove = g.turn()
      const isAiTurn = mode === 'vs-ai' && sideToMove !== pColor

      console.log(`[SF:client][${cid}] start mode=${mode} isAiTurn=${isAiTurn} fen=${fen.slice(0, 40)}…`)

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

        console.log(`[SF:client][${cid}] fetching /api/stockfish movetime=${params.get('movetime')}`)
        const res = await fetch(`/api/stockfish?${params}`, { signal: controller.signal })
        if (!res.ok || !res.body) {
          console.error(`[SF:client][${cid}] bad response: status=${res.status}`)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        const lineBuffer: EngineInfo[] = []
        // Track the latest score from info events locally so badge computation
        // works even when bestmove arrives without preceding info (WASM edge case)
        let latestLocalScore: EngineInfo['score'] | null = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log(`[SF:client][${cid}] stream done`)
            break
          }

          const text = decoder.decode(value)
          const events = text.split('\n\n').filter(Boolean)

          for (const event of events) {
            if (!event.startsWith('data: ')) continue
            const data = JSON.parse(event.slice(6))

            if (data.type === 'error') {
              console.error(`[SF:client][${cid}] server error:`, data.message)
            }

            if (data.type === 'info') {
              const info = data.info as EngineInfo
              lineBuffer[info.multipv - 1] = info
              if (info.multipv === 1) latestLocalScore = info.score
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

            if (data.type === 'bestmove') {
              console.log(`[SF:client][${cid}] bestmove=${data.bestMove} isAiTurn=${isAiTurn} aborted=${controller.signal.aborted}`)

              if (!data.bestMove || data.bestMove === '(none)') {
                console.warn(`[SF:client][${cid}] bestmove was empty/none — skipping`)
                continue
              }

              const from = data.bestMove.slice(0, 2) as Square
              const to = data.bestMove.slice(2, 4) as Square
              const promo = data.bestMove[4] as string | undefined

              // Use lineBuffer[0] first, fall back to latestLocalScore
              const rawFinalScore = lineBuffer[0]?.score ?? latestLocalScore
              setBestMoveArrow([{ from, to, color: 'rgba(255, 170, 0, 0.85)' }])
              if (rawFinalScore) updateScore(toWhitePov(rawFinalScore), true)

              // Only update the suggestion ref when it's for the human's turn,
              // so the AI's own bestmove never overwrites what the human should play
              if (!isAiTurn) prevBestMoveRef.current = data.bestMove

              // Annotate the human move using the stored target index (not moveIndex,
              // which could be the AI's later move in vs-ai mode)
              if (!isAiTurn && evalBeforeRef.current && rawFinalScore &&
                  annotationTargetIdxRef.current >= 0) {
                const finalScore = toWhitePov(rawFinalScore)
                const sideWhoMoved: 'w' | 'b' = sideToMove === 'w' ? 'b' : 'w'
                const badge = computeBadge(
                  evalBeforeRef.current,
                  finalScore,
                  sideWhoMoved,
                  humanMoveLANRef.current,
                  capturedEngineBestRef.current,
                )
                const targetIdx = annotationTargetIdxRef.current
                setAllAnnotations((prev) => {
                  const next = [...prev]
                  next[targetIdx] = badge
                  return next
                })
                evalBeforeRef.current = null
                capturedEngineBestRef.current = null
                humanMoveLANRef.current = null
                annotationTargetIdxRef.current = -1
              }

              if (isAiTurn && !controller.signal.aborted) {
                console.log(`[SF:client][${cid}] applying AI move ${data.bestMove}`)
                const next = new Chess(fen)
                try {
                  const mv = next.move({ from, to, ...(promo ? { promotion: promo } : {}) })
                  if (mv) {
                    const soundType = getSoundType(next, mv)
                    applyMove(next.fen(), { from, to, san: mv.san, lan: mv.lan, promotion: promo }, moveIndex, soundType)
                  } else {
                    console.error(`[SF:client][${cid}] move ${data.bestMove} was illegal in position`)
                  }
                } catch (moveErr) {
                  console.error(`[SF:client][${cid}] move threw:`, moveErr)
                }
              } else if (isAiTurn && controller.signal.aborted) {
                console.warn(`[SF:client][${cid}] AI bestmove arrived but signal already aborted — discarding`)
              }
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
          console.log(`[SF:client][${cid}] fetch aborted (expected)`)
        } else {
          console.error(`[SF:client][${cid}] unexpected error:`, e)
        }
      } finally {
        console.log(`[SF:client][${cid}] finally — clearing engineCallingRef`)
        engineCallingRef.current = false
        setIsAnalyzing(false)
      }
    },
    [applyMove, getSoundType, updateScore]
  )

  useEffect(() => {
    // When navigating history (undo/redo), run analysis only — never trigger AI move
    const effectiveMode = isNavigatingRef.current ? 'analysis' : gameMode
    isNavigatingRef.current = false
    callEngine(currentFen, effectiveMode, engineSettings, playerColor, currentMoveIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen, gameMode, engineSettings, playerColor, showHints])

  const computeBadge = (
    before: EngineInfo['score'],
    after: EngineInfo['score'],
    sideWhoMoved: 'w' | 'b',
    humanLAN: string | null,
    engineLAN: string | null,
  ): string | null => {
    const cpVal = (s: EngineInfo['score']) =>
      s.type === 'mate' ? (s.value > 0 ? 10000 : -10000) : s.value
    const drop = sideWhoMoved === 'w'
      ? cpVal(before) - cpVal(after)
      : cpVal(after) - cpVal(before)

    // Compare from+to only (ignore promotion char for matching)
    const playedBest = !!engineLAN && !!humanLAN &&
      humanLAN.slice(0, 4) === engineLAN.slice(0, 4)

    // Negative (bad) moves
    if (drop >= 200) return '??'   // Blunder
    if (drop >= 80)  return '?'    // Mistake
    if (drop >= 30)  return '?!'   // Inaccuracy

    // Acceptable range (drop < 30) — positive annotations
    if (drop < -50 && !playedBest) return '!!'  // Brilliant: unexpected improvement
    if (playedBest)                return '!'   // Good: engine's top choice
    if (drop <= 10 && !playedBest) return '!?'  // Interesting: different but fine

    return null  // Normal move, no annotation
  }

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
      // Snapshot eval and engine suggestion before move for badge computation
      evalBeforeRef.current = latestScoreRef.current
      capturedEngineBestRef.current = prevBestMoveRef.current
      humanMoveLANRef.current = from + to + (promotion ?? '')
      // The human's move will land at currentMoveIndex + 1 in allMoves after applyMove
      annotationTargetIdxRef.current = currentMoveIndex + 1
      const soundType = getSoundType(g, mv)
      applyMove(g.fen(), { from, to, san: mv.san, lan: mv.lan, promotion }, currentMoveIndex, soundType)
    },
    [currentFen, currentMoveIndex, applyMove, getSoundType]
  )

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (isGameOver) return
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
      const isPlayerTurn = gameMode === 'two-player' || currentGame.turn() === playerColor
      if (!isPlayerTurn && gameMode === 'vs-ai') return
      makeMove(from, to)
    },
    [makeMove, currentGame, gameMode, playerColor, isAtLatest]
  )

  const handleUndo = useCallback(() => {
    if (currentMoveIndex < 0) return
    abortRef.current?.abort()
    isNavigatingRef.current = true
    const stepsBack = (gameMode === 'vs-ai' && currentMoveIndex >= 1) ? 2 : 1
    const newIndex = Math.max(-1, currentMoveIndex - stepsBack)
    const undone = allMoves.slice(newIndex + 1, currentMoveIndex + 1).reverse()
    setRedoStack((s) => [...undone, ...s])
    setCurrentMoveIndex(newIndex)
    setSelectedSquare(null); setLegalMoves([]); setBestMoveArrow([])
    setResigned(null); setTimedOut(null); setShowGameOverModal(false)
  }, [currentMoveIndex, allMoves, gameMode])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    abortRef.current?.abort()
    isNavigatingRef.current = true
    const stepsForward = (gameMode === 'vs-ai' && redoStack.length >= 2) ? 2 : 1
    setCurrentMoveIndex((i) => Math.min(allMoves.length - 1, i + stepsForward))
    setRedoStack((s) => s.slice(stepsForward))
    setBestMoveArrow([])
    setResigned(null); setTimedOut(null); setShowGameOverModal(false)
  }, [redoStack, gameMode, allMoves.length])

  // Countdown timer
  useEffect(() => {
    if (!timeControl || isGameOver || !isAtLatest || allMoves.length === 0) return
    const interval = setInterval(() => {
      if (turn === 'w') {
        setWhiteTime((t) => {
          if (t <= 1) { setTimedOut('w'); return 0 }
          return t - 1
        })
      } else {
        setBlackTime((t) => {
          if (t <= 1) { setTimedOut('b'); return 0 }
          return t - 1
        })
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [timeControl, isGameOver, isAtLatest, allMoves.length, turn])

  const handleTimeControlChange = (seconds: number | null) => {
    setTimeControl(seconds)
    setWhiteTime(seconds ?? 0)
    setBlackTime(seconds ?? 0)
    setTimedOut(null)
  }

  // Draw-claim toast: show when threefold repetition or 50-move rule triggers
  useEffect(() => {
    const active = (isRepetition || showFiftyMoveWarning) && !isGameOver
    if (active && !drawClaimToastId.current) {
      const msg = isRepetition
        ? 'Threefold repetition — draw can be claimed'
        : `50-move rule — draw can be claimed (${movesUntilFifty / 2} moves left)`
      const id = showToast({ message: msg, type: 'warn', action: { label: 'Claim Draw', onClick: acceptDraw } })
      drawClaimToastId.current = id
    } else if (!active && drawClaimToastId.current) {
      dismissToast(drawClaimToastId.current)
      drawClaimToastId.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepetition, showFiftyMoveWarning, isGameOver])

  useEffect(() => {
    if (isGameOver && isAtLatest) {
      const t = setTimeout(() => setShowGameOverModal(true), 600)
      return () => clearTimeout(t)
    }
  }, [isGameOver, isAtLatest])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable
      if (isTyping) return
      if (event.key === 'Escape') { setBoardFullscreen(false); setShowGameOverModal(false) }
      if (event.key === 'ArrowLeft') handleUndo()
      if (event.key === 'ArrowRight') handleRedo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  const handleMoveClick = (index: number) => {
    setCurrentMoveIndex(index)
    setSelectedSquare(null); setLegalMoves([]); setBestMoveArrow([])
  }

  const handleNewGame = () => {
    abortRef.current?.abort()
    setAllPositions([INITIAL_FEN]); setAllMoves([]); setCurrentMoveIndex(-1)
    setRedoStack([]); setSelectedSquare(null); setLegalMoves([])
    setLastMove(null); setBestMoveArrow([]); setEngineLines([])
    setLatestScore(null); setIsAnalyzing(false); setResigned(null); setShowGameOverModal(false)
    setDrawAccepted(false); setShowDrawOfferModal(false); setAllAnnotations([])
    setTimedOut(null); setWhiteTime(timeControl ?? 0); setBlackTime(timeControl ?? 0)
  }

  const handleResign = () => {
    if (isGameOver) return
    setShowResignModal(true)
  }

  const confirmResign = () => {
    setResigned(playerColor)
    abortRef.current?.abort()
    setShowResignModal(false)
  }

  const handleDrawOffer = () => {
    if (isGameOver) return
    setShowDrawOfferModal(true)
  }

  const acceptDraw = useCallback(() => {
    setDrawAccepted(true)
    abortRef.current?.abort()
    setShowDrawOfferModal(false)
    if (drawClaimToastId.current) {
      setToasts((prev) => prev.filter((t) => t.id !== drawClaimToastId.current))
      drawClaimToastId.current = null
    }
  }, [])

  const declineDraw = () => setShowDrawOfferModal(false)

  const handlePlayerColorChange = (color: 'w' | 'b') => {
    setPlayerColor(color)
    setFlipped(color === 'b')
  }

  const handleNewGameAs = (color: 'w' | 'b') => {
    handlePlayerColorChange(color)
    handleNewGame()
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

  const handleCopyFEN = () => {
    navigator.clipboard.writeText(currentFen)
    showToast({ message: 'FEN copied to clipboard', type: 'success' }, 2500)
  }

  const handlePasteFEN = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const g = new Chess(); g.load(text)
      setAllPositions([g.fen()]); setAllMoves([]); setCurrentMoveIndex(-1)
      setRedoStack([]); setLastMove(null); setBestMoveArrow([])
    } catch { alert('Invalid FEN string in clipboard') }
  }

  const displayedHistory = allMoves.slice(0, currentMoveIndex + 1).map((m) => m.san)
  const displayedAnnotations = allAnnotations.slice(0, currentMoveIndex + 1)
  const openingInfo = getOpeningName(displayedHistory)

  // ── Engine health indicator ──
  const [engineStatus, setEngineStatus] = useState<'unknown' | 'checking' | 'ready' | 'error'>('unknown')
  const [engineStatusMsg, setEngineStatusMsg] = useState('')

  const checkEngineHealth = useCallback(async () => {
    setEngineStatus('checking')
    try {
      const res = await fetch('/api/stockfish/health', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) {
        setEngineStatus('ready')
        setEngineStatusMsg(`${data.backend ?? data.mode ?? 'ok'} · ${data.arch ?? ''}`)
      } else {
        setEngineStatus('error')
        setEngineStatusMsg(data.error ?? `HTTP ${res.status}`)
      }
    } catch (e) {
      setEngineStatus('error')
      setEngineStatusMsg(e instanceof Error ? e.message : 'Network error')
    }
  }, [])

  useEffect(() => { checkEngineHealth() }, [checkEngineHealth])

  const showLeftPanel = !boardFullscreen && leftPanelOpen
  const showRightPanel = !boardFullscreen && rightPanelOpen
  // Board size is always fixed, panels overlay not push
  const boardWidthForLayout = boardFullscreen ? 'min(80vw, 80vh, 576px)' : 'min(calc(100vh - 116px), calc(100vw - 160px))'

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
          {/* Engine health pill */}
          <button
            onClick={checkEngineHealth}
            disabled={engineStatus === 'checking'}
            title={engineStatusMsg || 'Click to check engine'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border bg-white/5 border-white/8 text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
              engineStatus === 'ready'    ? 'bg-[#86b114]' :
              engineStatus === 'error'    ? 'bg-red-500' :
              engineStatus === 'checking' ? 'bg-yellow-400 animate-pulse' :
              'bg-white/30'
            }`} />
            <span className={
              engineStatus === 'ready' ? 'text-[#86b114]' :
              engineStatus === 'error' ? 'text-red-400' :
              'text-gray-400'
            }>
              {engineStatus === 'checking' ? 'Checking…' :
               engineStatus === 'ready'    ? 'Engine ready' :
               engineStatus === 'error'    ? 'Engine error' :
               'Engine'}
            </span>
          </button>
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
                  // turning hints OFF: clear any active selection so yellow square disappears too
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
      <div className="flex-1 relative min-h-0 overflow-hidden">

        {/* Center: Board (always full area, never pushed) */}
        <main className={`absolute inset-0 flex items-center justify-center ${boardFullscreen ? 'bg-[#151311] p-6 sm:p-8 md:p-10' : 'bg-[#262421]'}`}>
          {boardFullscreen && (
            <button
              onClick={() => setBoardFullscreen(false)}
              className="absolute top-3 right-3 z-40 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-black/45 border border-white/15 text-gray-200 hover:bg-black/65 hover:text-white transition-all"
            >
              Exit Fullscreen
            </button>
          )}
          <div className={`flex items-center justify-center h-full w-full box-border ${boardFullscreen ? '' : 'gap-8 px-16 py-6'}`}>
            {/* Eval bar */}
            {!boardFullscreen && (
              <div className="self-stretch py-8 flex flex-col">
                <EvalBar score={latestScore} flipped={flipped} turn={turn} />
              </div>
            )}
            {/* Board wrapper: fixed size, never shrinks */}
            <div
              className="relative shrink-0 flex flex-col gap-1"
              style={{ width: boardWidthForLayout, minWidth: '300px' }}
            >
              {/* Opponent row: captured pieces + clock */}
              {!boardFullscreen && (
                <div className="flex items-center justify-between gap-2">
                  <CapturedPiecesRow game={currentGame} flipped={flipped} position="top" />
                  <PlayerClock
                    seconds={flipped ? whiteTime : blackTime}
                    isActive={isAtLatest && !isGameOver && (flipped ? turn === 'w' : turn === 'b')}
                    hasTimer={timeControl !== null}
                  />
                </div>
              )}
              <div style={{ height: boardWidthForLayout, minHeight: '300px' }} className="relative">
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
                  disabled={isGameOver}
                  showHints={showHints}
                />
              </div>
              {/* Player row: captured pieces + clock */}
              {!boardFullscreen && (
                <div className="flex items-center justify-between gap-2">
                  <CapturedPiecesRow game={currentGame} flipped={flipped} position="bottom" />
                  <PlayerClock
                    seconds={flipped ? blackTime : whiteTime}
                    isActive={isAtLatest && !isGameOver && (flipped ? turn === 'b' : turn === 'w')}
                    hasTimer={timeControl !== null}
                  />
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Left panel: overlays board */}
        {!boardFullscreen && (
          <>
            {/* Backdrop when left panel open on narrow screens */}
            {showLeftPanel && (
              <div
                className="absolute inset-0 z-30 bg-black/30 lg:hidden"
                onClick={() => setLeftPanelOpen(false)}
              />
            )}
            <aside
              className={`absolute top-0 left-0 h-full z-40 flex flex-col bg-[#1a1714] border-r border-white/6 overflow-y-auto transition-transform duration-200 w-72 ${showLeftPanel ? 'translate-x-0' : '-translate-x-full'}`}
            >
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
            </aside>
            {/* Left toggle tab: pinned to panel edge */}
            <button
              onClick={() => setLeftPanelOpen((v) => !v)}
              aria-label={showLeftPanel ? 'Collapse engine panel' : 'Expand engine panel'}
              className="absolute top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-5 h-12 bg-[#1a1714] border border-white/10 rounded-r-lg hover:bg-[#2a2520] transition-all"
              style={{ left: showLeftPanel ? '288px' : '0px', transition: 'left 200ms' }}
            >
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="text-gray-400">
                {showLeftPanel
                  ? <path d="M7 1L2 7L7 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  : <path d="M3 1L8 7L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                }
              </svg>
            </button>
          </>
        )}

        {/* Right panel: overlays board */}
        {!boardFullscreen && (
          <>
            {showRightPanel && (
              <div
                className="absolute inset-0 z-30 bg-black/30 lg:hidden"
                onClick={() => setRightPanelOpen(false)}
              />
            )}
            <aside
              className={`absolute top-0 right-0 h-full z-40 flex flex-col bg-[#1a1714] border-l border-white/6 overflow-hidden transition-transform duration-200 w-72 ${showRightPanel ? 'translate-x-0' : 'translate-x-full'}`}
            >
              {/* Time control selector */}
              <div className="shrink-0 px-3 py-2 border-b border-white/6 flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500 font-semibold shrink-0">Timer</span>
                {([null, 5 * 60, 10 * 60, 15 * 60] as (number | null)[]).map((tc) => (
                  <button
                    key={tc ?? 'off'}
                    onClick={() => handleTimeControlChange(tc)}
                    className={`flex-1 py-1 rounded text-[11px] font-semibold transition-all border ${
                      timeControl === tc
                        ? 'bg-[#86b114]/20 border-[#86b114]/40 text-[#86b114]'
                        : 'bg-white/5 border-white/8 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    }`}
                  >
                    {tc === null ? 'Off' : `${tc / 60}m`}
                  </button>
                ))}
              </div>

              <div className="shrink-0 p-3 border-b border-white/6">
                <GameControls
                  flipped={flipped}
                  canUndo={currentMoveIndex >= 0}
                  canRedo={redoStack.length > 0}
                  canResign={!isGameOver && gameMode !== 'analysis'}
                  canOfferDraw={!isGameOver && gameMode !== 'analysis'}
                  onFlip={() => setFlipped((f) => !f)}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onNewGame={handleNewGame}
                  onResign={handleResign}
                  onDrawOffer={handleDrawOffer}
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
                  annotations={displayedAnnotations}
                  openingInfo={openingInfo}
                  currentMoveIndex={currentMoveIndex}
                  onMoveClick={handleMoveClick}
                />
              </div>
            </aside>
            {/* Right toggle tab: pinned to panel edge */}
            <button
              onClick={() => setRightPanelOpen((v) => !v)}
              aria-label={showRightPanel ? 'Collapse controls panel' : 'Expand controls panel'}
              className="absolute top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-5 h-12 bg-[#1a1714] border border-white/10 rounded-l-lg hover:bg-[#2a2520] transition-all"
              style={{ right: showRightPanel ? '288px' : '0px', transition: 'right 200ms' }}
            >
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="text-gray-400">
                {showRightPanel
                  ? <path d="M3 1L8 7L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  : <path d="M7 1L2 7L7 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                }
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Game over modal */}
      {showGameOverModal && isGameOver && (() => {
        const isCheckmate = currentGame.isCheckmate()
        const isDraw = !timedOut && !resigned && (drawAccepted || currentGame.isStalemate() || currentGame.isDraw())
        const winnerColor = timedOut
          ? (timedOut === 'w' ? 'b' : 'w')
          : resigned
            ? (resigned === 'w' ? 'b' : 'w')
            : isCheckmate
              ? (turn === 'w' ? 'b' : 'w')
              : null
        const emoji = isDraw ? '🤝' : winnerColor === 'w' ? '♔' : '♚'
        const headline = timedOut
          ? "Time's Up!"
          : drawAccepted
            ? 'Draw Agreed'
            : resigned
              ? `${resigned === 'w' ? 'White' : 'Black'} Resigned`
              : isCheckmate
                ? 'Checkmate!'
                : currentGame.isStalemate()
                  ? 'Stalemate'
                  : 'Draw'
        const subline = isDraw
          ? drawAccepted
            ? (isRepetition ? 'Draw by threefold repetition' : halfMoveClock >= 100 ? 'Draw by 50-move rule' : 'Both players agreed to a draw')
            : 'The game is a draw'
          : timedOut
            ? `${timedOut === 'w' ? 'White' : 'Black'} ran out of time - ${winnerColor === 'w' ? 'White' : 'Black'} wins`
            : `${winnerColor === 'w' ? 'White' : 'Black'} wins`

        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#1a1714] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-96">
              <div className="flex flex-col items-center gap-3">
                <span className="text-5xl">{emoji}</span>
                <h2 className="text-2xl font-bold text-white tracking-tight">{headline}</h2>
                <p className="text-sm text-gray-400">{subline}</p>
              </div>

              <div className="w-full border-t border-white/8 pt-5 flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Play again as</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleNewGameAs('w')}
                    className="flex flex-col items-center gap-2 py-3 px-4 rounded-xl bg-[#f0ead8] hover:bg-[#fffdf5] border border-[#d4c89a] transition-all"
                  >
                    <span className="text-2xl text-[#1a1a1a]">♔</span>
                    <span className="text-xs font-semibold text-[#2a2a2a]">White</span>
                  </button>
                  <button
                    onClick={() => handleNewGameAs('b')}
                    className="flex flex-col items-center gap-2 py-3 px-4 rounded-xl bg-[#2c2c2c] hover:bg-[#3a3a3a] border border-[#555] transition-all"
                  >
                    <span className="text-2xl text-[#f0f0f0]">♚</span>
                    <span className="text-xs font-semibold text-[#e0e0e0]">Black</span>
                  </button>
                </div>
                <button
                  onClick={() => setShowGameOverModal(false)}
                  className="w-full py-2 px-4 rounded-lg bg-transparent border border-white/8 text-gray-500 hover:text-gray-300 hover:border-white/15 text-xs font-semibold transition-all"
                >
                  Review Game
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Draw offer modal */}
      {showDrawOfferModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1714] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-80">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">🤝</span>
              <h2 className="text-base font-semibold text-gray-100 tracking-wide">
                {gameMode === 'two-player' ? 'Draw Offered' : 'Claim a Draw?'}
              </h2>
              <p className="text-sm text-gray-400 text-center">
                {gameMode === 'two-player'
                  ? <><span className="text-white font-semibold">{turn === 'w' ? 'Black' : 'White'}</span>, do you accept the draw?</>
                  : 'End the game as a draw?'}
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={declineDraw}
                className="flex-1 py-2 px-4 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white text-sm font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={acceptDraw}
                className="flex-1 py-2 px-4 rounded-lg bg-blue-800 hover:bg-blue-700 border border-blue-600/50 text-white text-sm font-semibold transition-all"
              >
                {gameMode === 'two-player' ? 'Accept' : 'Draw'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resign confirmation modal */}
      {showResignModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1714] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-80">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">🏳</span>
              <h2 className="text-base font-semibold text-gray-100 tracking-wide">Resign Game?</h2>
              <p className="text-sm text-gray-400 text-center">
                You are resigning as <span className="text-white font-semibold">{playerColor === 'w' ? 'White' : 'Black'}</span>.
                <br />This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowResignModal(false)}
                className="flex-1 py-2 px-4 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white text-sm font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmResign}
                className="flex-1 py-2 px-4 rounded-lg bg-red-800 hover:bg-red-700 border border-red-600/50 text-white text-sm font-semibold transition-all"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Promotion modal */}
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
