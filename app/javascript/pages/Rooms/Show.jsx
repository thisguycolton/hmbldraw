import { Head } from "@inertiajs/react"
import { useEffect, useRef, useState } from "react"
import { getCableConsumer } from "../../cable"
import {
  PawPrint,
  Utensils,
  Box,
  MapPin,
  Trophy,
  Sparkles,
  Leaf,
  Music,
  Gamepad2,
  HeartHandshake,
  CircleHelp,
} from "lucide-react"
import GameCanvas from "../../components/GameCanvas"
import RoundCarousel from "../../components/RoundCarousel"

import {
  getPlayerToken,
  setPlayerToken,
} from "../../player_identity"

const CATEGORY_ICONS = {
  animals: PawPrint,
  "food-drink": Utensils,
  food: Utensils,
  objects: Box,
  places: MapPin,
  sports: Trophy,
  nature: Leaf,
  music: Music,
  games: Gamepad2,
  sobriety: HeartHandshake,
  random: Sparkles,
}

function CategoryIcon({ slug, className = "h-5 w-5" }) {
  const Icon = CATEGORY_ICONS[slug] || CircleHelp

  return (
    <Icon
      className={className}
      strokeWidth={1.8}
    />
  )
}

function GameWorkspace({
  children,
  aside = null,
  asideClassName = "",
}) {
  return (
    <section className="mt-6 sm:mt-8">
      <div
        className={[
          "grid items-start gap-4",
          aside
            ? "lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6"
            : "",
        ].join(" ")}
      >
        <main className="min-w-0">
          {children}
        </main>

        {aside && (
          <aside
            className={[
              "min-w-0",
              "lg:sticky lg:top-6",
              asideClassName,
            ].join(" ")}
          >
            {aside}
          </aside>
        )}
      </div>
    </section>
  )
}

function PreviousRoundResults({ round }) {
  if (!round) {
    return null
  }

  const guesses = round.guesses || []
  const winner = round.winner
  const drawer = round.drawer

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 overflow-hidden">
      <div className="px-5 py-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
          Round {round.number} Results
        </div>
      </div>

      <div className="border-t border-zinc-800">
        {/* Drawing */}
        <div className="p-4">
          <div className="aspect-square w-full overflow-hidden rounded-2xl bg-white">
            <GameCanvas
              roundId={round.id}
              strokes={round.strokes || []}
              canDraw={false}
              onStroke={() => {}}
              onLiveStroke={() => {}}
              onUndo={() => {}}
              onClear={() => {}}
            />
          </div>
        </div>

        {/* Word */}
        <div className="px-5 pb-5">
          <div className="rounded-xl bg-zinc-900 px-4 py-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">
              The word was
            </div>

            <div className="mt-1 text-lg font-semibold text-white capitalize">
              {round.word || "—"}
            </div>
          </div>
        </div>

        {/* Drawer / Winner */}
        <div className="border-t border-zinc-800 px-5 py-5 space-y-5">
          <div>
            <div className="text-xs text-zinc-500">
              Drawer
            </div>

            <div className="mt-1 text-base font-semibold text-white">
              {drawer?.name || "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">
              Winner
            </div>

            {winner ? (
              <>
                <div className="mt-1 text-base font-semibold text-emerald-400">
                  {winner.name}
                </div>

                <div className="mt-0.5 text-xs text-zinc-500">
                  Guessed it correctly!
                </div>
              </>
            ) : (
              <div className="mt-1 text-base font-semibold text-zinc-400">
                Nobody
              </div>
            )}
          </div>
        </div>

        {/* Guesses */}
        <div className="border-t border-zinc-800">
          <div className="px-5 py-4">
            <div className="text-sm font-medium text-zinc-300">
              All Guesses ({guesses.length})
            </div>
          </div>

          {guesses.length > 0 ? (
            <div className="border-t border-zinc-800">
              {guesses.map((guess, index) => {
                const correct =
                  guess.correct === true ||
                  guess.correct === "true"

                return (
                  <div
                    key={guess.id || `${guess.player?.id}-${index}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 border-b border-zinc-900 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-200">
                        {guess.player?.name || guess.player_name || "Player"}
                      </div>

                      <div className="mt-0.5 truncate text-xs text-zinc-500">
                        {guess.text}
                      </div>
                    </div>

                    <div
                      className={[
                        "shrink-0 text-xs font-medium",
                        correct
                          ? "text-emerald-400"
                          : "text-zinc-500",
                      ].join(" ")}
                    >
                      {correct ? "Correct" : "Wrong"}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="border-t border-zinc-800 px-5 py-5 text-sm text-zinc-500">
              No guesses.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Show({
  game_room,
  players: initialPlayers,
  current_player,
  current_round: initialCurrentRound,
  player_token,
}) {
  const [players, setPlayers] = useState(initialPlayers)
  const [connected, setConnected] = useState(false)
  const [gameState, setGameState] = useState(game_room.status)
  const [currentRound, setCurrentRound] = useState(initialCurrentRound)
  const [wordOptions, setWordOptions] = useState([])
  const [gameError, setGameError] = useState(null)
  const [strokes, setStrokes] = useState([])
  const [guesses, setGuesses] = useState([])

  const strokesRef = useRef([])
  const guessesRef = useRef([])

  const roundStrokesRef = useRef({})
  const roundGuessesRef = useRef({})
  const [timeLeft, setTimeLeft] = useState(null)
  const [guessText, setGuessText] = useState("")
  const [correctGuesser, setCorrectGuesser] = useState(null)
  const [roundResult, setRoundResult] = useState(null)
  const [finalScores, setFinalScores] = useState([])
  const [readyPlayerIds, setReadyPlayerIds] = useState([])
  const [isReady, setIsReady] = useState(false)
  const [selectedWord, setSelectedWord] = useState(null)
  const [liveStrokes, setLiveStrokes] = useState({})
  const [completedRounds, setCompletedRounds] = useState([])

  const subscriptionRef = useRef(null)
  const currentRoundRef = useRef(initialCurrentRound)


  useEffect(() => {
      currentRoundRef.current = currentRound
    }, [currentRound])

    function leaveRoom() {
    if (!subscriptionRef.current) {
      return
    }

    setGameError(null)

    subscriptionRef.current.perform("leave_room")
  }

  function isStaleRound(roundId) {
    const currentId = currentRoundRef.current?.id

    // If either side doesn't have an ID, don't reject the event.
    if (currentId == null || roundId == null) {
      return false
    }

    return roundId < currentId
  }

  // --------------------------------------------------------------------------
// Mobile drawing viewport lock
// --------------------------------------------------------------------------

useEffect(() => {
  if (typeof document === "undefined") {
    return
  }

  /*
   * The fixed, full-screen drawing experience is mobile-only.
   *
   * The previous version locked html/body overflow for every drawing round.
   * On desktop that prevented the normal GameWorkspace page from scrolling,
   * so a square canvas could extend below the viewport and become impossible
   * to reach. Keep the viewport lock only for touch/coarse-pointer devices.
   */
  const isTouchDevice =
    window.matchMedia(
      "(hover: none) and (pointer: coarse)"
    ).matches

  if (gameState !== "drawing" || !isTouchDevice) {
    document.documentElement.style.overflow = ""
    document.body.style.overflow = ""
    document.body.style.overscrollBehavior = ""

    return
  }

  const htmlOverflow =
    document.documentElement.style.overflow
  const bodyOverflow =
    document.body.style.overflow
  const bodyOverscroll =
    document.body.style.overscrollBehavior

  document.documentElement.style.overflow = "hidden"
  document.body.style.overflow = "hidden"
  document.body.style.overscrollBehavior = "none"

  return () => {
    document.documentElement.style.overflow =
      htmlOverflow
    document.body.style.overflow =
      bodyOverflow
    document.body.style.overscrollBehavior =
      bodyOverscroll
  }
}, [gameState])

  // --------------------------------------------------------------------------
  // Persist player token
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!player_token) return

    console.log("[Player Identity] Saving player token")

    setPlayerToken(player_token)

    window.history.replaceState(
      {},
      "",
      `/rooms/${game_room.code}?player_token=${encodeURIComponent(player_token)}`
    )
  }, [player_token, game_room.code])


  function replaceStrokes(nextStrokes) {
    strokesRef.current = nextStrokes
    setStrokes(nextStrokes)
  }

  function replaceGuesses(nextGuesses) {
    guessesRef.current = nextGuesses
    setGuesses(nextGuesses)
  }

  function recordRoundStrokes(roundId, nextStrokes) {
  if (roundId == null) return

  roundStrokesRef.current[roundId] = [
    ...nextStrokes,
  ]
}

function recordRoundGuesses(roundId, nextGuesses) {
  if (roundId == null) return

  roundGuessesRef.current[roundId] = [
    ...nextGuesses,
  ]
}
  // --------------------------------------------------------------------------
  // Action Cable
  // --------------------------------------------------------------------------
useEffect(() => {
  // ------------------------------------------------------------------------
  // ActionCable is browser-only.
  //
  // This component is rendered by Inertia SSR on the server, where
  // window/document/WebSocket do not exist.
  // ------------------------------------------------------------------------

  if (typeof window === "undefined") {
    return
  }

  const cable = getCableConsumer()

  if (!cable) {
    console.warn(
      `[ActionCable] No Cable consumer available for room ${game_room.code}`
    )

    return
  }

  const token = getPlayerToken()

  console.log(
    `[ActionCable] Token ${
      token ? "found" : "NOT FOUND"
    } for room ${game_room.code}`
  )

  if (!token) {
    console.warn(
      `[ActionCable] No player token found for room ${game_room.code}`
    )

    return
  }

  const subscription = cable.subscriptions.create(
    {
      channel: "GameRoomChannel",
      code: game_room.code,
      player_token: token,
    },
    {
      connected() {
        console.log(
          `[ActionCable] Connected to room ${game_room.code}`
        )

        setConnected(true)
      },

      disconnected() {
        console.log(
          `[ActionCable] Disconnected from room ${game_room.code}`
        )

        setConnected(false)
      },

      rejected() {
        console.error(
          `[ActionCable] Subscription rejected for room ${game_room.code}`
        )

        setConnected(false)
      },

      received(data) {

        // --------------------------------------------------------------
        // Lobby
        // --------------------------------------------------------------

        if (data.type === "lobby_updated") {
          console.log("[Lobby] Updated:", data)

          setPlayers(data.players || [])

          const incomingStatus = data.game_room?.status

          setGameState((currentState) => {
            // A lobby_updated broadcast can be triggered by another
            // player's connection/disconnection. Those broadcasts can
            // arrive after the game has already started.
            //
            // Never let a waiting broadcast regress an active game.
            if (
              incomingStatus === "waiting" &&
              [
                "starting_round",
                "drawing",
                "round_end",
              ].includes(currentState)
            ) {
              console.log(
                "[Lobby] Ignoring waiting update while game is active"
              )

              return currentState
            }

            if (incomingStatus) {
              return incomingStatus
            }

            return currentState
          })

          return
        }

        if (data.type === "room_left") {
          console.log("[Lobby] Left room")

          window.location.href = "/"

          return
        }

        // --------------------------------------------------------------
        // Game started
        // --------------------------------------------------------------

        if (data.type === "game_started") {
          console.log("[Game] Started:", data)

          if (isStaleRound(data.round?.id)) {
            return
          }

          roundStrokesRef.current = {}
          roundGuessesRef.current = {}
          setCompletedRounds([])

          setCurrentRound(data.round)

          // game_started is authoritative.
          setGameState("starting_round")

          setGameError(null)

          return
        }

        // --------------------------------------------------------------
        // Round starting / ready phase
        // --------------------------------------------------------------

        if (data.type === "round_starting") {
          console.log("[Game] Round starting:", data)

          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale round_starting:",
              data.round?.id
            )

            return
          }

          setCurrentRound({
            id: data.round.id,
            number: data.round.number,
            drawer: data.round.drawer,
          })

          setGameState((currentState) => {
            if (currentState === "finished") {
              return currentState
            }

            return "starting_round"
          })

          setReadyPlayerIds(data.ready_player_ids || [])

          setIsReady(
            (data.ready_player_ids || []).includes(
              current_player?.id
            )
          )

          setSelectedWord(null)
          setGameError(null)
          setLiveStrokes({})
          replaceStrokes([])
          replaceGuesses([])
          setCorrectGuesser(null)

          return
        }

        // --------------------------------------------------------------
        // Drawing begins
        // --------------------------------------------------------------

        if (data.type === "round_started") {
          console.log("[Game] Round started:", data)

          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale round_started:",
              data.round?.id
            )

            return
          }

          setGameState("drawing")
          setCurrentRound(data.round)

          setReadyPlayerIds([])
          setIsReady(false)
          setWordOptions([])
          setLiveStrokes({})

          replaceStrokes(
            Array.isArray(data.round?.strokes)
              ? data.round.strokes
              : []
          )

          replaceGuesses([])

          setCorrectGuesser(null)
          setRoundResult(null)

          return
        }

        // --------------------------------------------------------------
        // Completed rounds
        // --------------------------------------------------------------

        if (data.type === "completed_rounds") {
          console.log(
            "[Gallery] Received completed rounds:",
            data.rounds
          )

          const rounds = Array.isArray(data.rounds)
            ? data.rounds
            : []

          setCompletedRounds(
            rounds
              .map((round) => ({
                ...round,
                strokes: Array.isArray(round.strokes)
                  ? round.strokes
                  : [],
                guesses: Array.isArray(round.guesses)
                  ? round.guesses
                  : [],
              }))
              .sort((a, b) => a.number - b.number)
          )

          return
        }

        // --------------------------------------------------------------
        // Drawer receives word choices
        // --------------------------------------------------------------

        if (data.type === "word_options") {
          console.log("[Game] Word options received:", data)

          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale word_options:",
              data.round?.id
            )

            return
          }

          const words = data.words || []

          setWordOptions(words)
          setGameError(null)

          return
        }

        // --------------------------------------------------------------
        // Player ready
        // --------------------------------------------------------------

        if (data.type === "player_ready") {
          console.log("[Game] Player ready:", data)

          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale player_ready:",
              data.round?.id
            )

            return
          }

          setReadyPlayerIds(data.ready_player_ids || [])

          if (data.player?.id === current_player?.id) {
            setIsReady(true)
          }

          return
        }

        // --------------------------------------------------------------
        // Live stroke started
        // --------------------------------------------------------------

        if (data.type === "stroke_started") {
          if (isStaleRound(data.round?.id)) {
            return
          }

          const stroke = data.stroke

          if (!stroke?.id) {
            return
          }

          setLiveStrokes((current) => ({
            ...current,
            [stroke.id]: stroke,
          }))

          return
        }

        // --------------------------------------------------------------
        // Live stroke points
        // --------------------------------------------------------------

        if (data.type === "stroke_points") {
          if (isStaleRound(data.round?.id)) {
            return
          }

          const incoming = data.stroke

          if (!incoming?.id) {
            return
          }

          setLiveStrokes((current) => {
            const existing = current[incoming.id]

            if (!existing) {
              return {
                ...current,
                [incoming.id]: incoming,
              }
            }

            // Shapes are snapshots, not point deltas. Replacing the small
            // bounds payload avoids accumulating bogus points and keeps
            // remote shape previews cheap.
            if (incoming.type === "shape") {
              return {
                ...current,
                [incoming.id]: {
                  ...existing,
                  ...incoming,
                },
              }
            }

            return {
              ...current,
              [incoming.id]: {
                ...existing,
                points: [
                  ...(existing.points || []),
                  ...(incoming.points || []),
                ],
                pen:
                  incoming.pen ??
                  existing.pen,
                closed:
                  incoming.closed ??
                  existing.closed,
                fill:
                  incoming.fill ??
                  existing.fill,
              },
            }
          })

          return
        }

        // --------------------------------------------------------------
        // Completed drawing stroke
        // --------------------------------------------------------------

        if (data.type === "stroke_drawn") {
          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale stroke:",
              data.round?.id
            )

            return
          }

          const stroke = data.stroke
          const roundId = data.round?.id

          if (!stroke?.id) {
            return
          }

          setLiveStrokes((current) => {
            if (!current[stroke.id]) {
              return current
            }

            const next = {
              ...current,
            }

            delete next[stroke.id]

            return next
          })

          const current = strokesRef.current

          if (Array.isArray(data.strokes)) {
            replaceStrokes(data.strokes)
            recordRoundStrokes(roundId, data.strokes)
            return
          }

          // The drawer optimistically inserts the operation before Rails
          // broadcasts the canonical persisted version. Replace that
          // optimistic copy when the server echo arrives so fields such as
          // Pen fill/closed state cannot diverge between clients.
          const existingIndex =
            current.findIndex(
              (existing) =>
                existing?.id === stroke.id
            )

          const next =
            existingIndex >= 0
              ? current.map(
                  (existing, index) =>
                    index === existingIndex
                      ? stroke
                      : existing
                )
              : [
                  ...current,
                  stroke,
                ]

          strokesRef.current = next
          setStrokes(next)

          recordRoundStrokes(roundId, next)

          return
        }

        // --------------------------------------------------------------
        // Vector object updated
        // --------------------------------------------------------------

        if (data.type === "object_updated") {
          if (isStaleRound(data.round?.id)) {
            return
          }

          const operation = data.operation
          if (!operation?.id || !operation?.objectId) {
            return
          }

          const current = strokesRef.current

          if (Array.isArray(data.strokes)) {
            replaceStrokes(data.strokes)
            recordRoundStrokes(data.round?.id, data.strokes)
            return
          }

          if (current.some((existing) => existing?.id === operation.id)) {
            return
          }

          const next = [...current, operation]
          strokesRef.current = next
          setStrokes(next)
          recordRoundStrokes(data.round?.id, next)
          return
        }

        // --------------------------------------------------------------
        // Vector object deleted
        // --------------------------------------------------------------

        if (data.type === "object_deleted") {
          if (isStaleRound(data.round?.id)) {
            return
          }

          const operation = data.operation
          if (!operation?.id || !operation?.objectId) {
            return
          }

          const current = strokesRef.current

          if (Array.isArray(data.strokes)) {
            replaceStrokes(data.strokes)
            recordRoundStrokes(data.round?.id, data.strokes)
            return
          }

          if (current.some((existing) => existing?.id === operation.id)) {
            return
          }

          const next = [...current, operation]
          strokesRef.current = next
          setStrokes(next)
          recordRoundStrokes(data.round?.id, next)
          return
        }

        // --------------------------------------------------------------
        // Stroke undone
        // --------------------------------------------------------------

        if (data.type === "stroke_undone") {
          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale stroke_undone:",
              data.round?.id
            )

            return
          }

          if (!data.stroke_id) {
            console.warn(
              "[Drawing] stroke_undone missing stroke_id:",
              data
            )

            return
          }

          const current = strokesRef.current

          if (Array.isArray(data.strokes)) {
            replaceStrokes(data.strokes)
            recordRoundStrokes(data.round?.id, data.strokes)
            return
          }

          const next = current.filter(
            (stroke) =>
              stroke.id !== data.stroke_id
          )

          strokesRef.current = next
          setStrokes(next)

          recordRoundStrokes(
            data.round?.id,
            next
          )

          setLiveStrokes((current) => {
            if (!current[data.stroke_id]) {
              return current
            }

            const next = {
              ...current,
            }

            delete next[data.stroke_id]

            return next
          })

          return
        }

        // --------------------------------------------------------------
        // Layer order changed
        // --------------------------------------------------------------

        if (data.type === "layer_reordered") {
          if (isStaleRound(data.round?.id)) {
            return
          }

          const operation = data.operation
          if (!operation?.id || operation.type !== "layer_reorder") {
            return
          }

          const current = strokesRef.current

          if (Array.isArray(data.strokes)) {
            replaceStrokes(data.strokes)
            recordRoundStrokes(data.round?.id, data.strokes)
            return
          }

          if (
            current.some(
              (existing) => existing?.id === operation.id
            )
          ) {
            return
          }

          const next = [
            ...current,
            operation,
          ]

          strokesRef.current = next
          setStrokes(next)
          recordRoundStrokes(
            data.round?.id,
            next
          )

          return
        }

        // --------------------------------------------------------------
        // Canvas cleared
        // --------------------------------------------------------------

        if (data.type === "canvas_cleared") {
          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale canvas_cleared:",
              data.round?.id
            )

            return
          }

          const next = Array.isArray(data.strokes)
            ? data.strokes
            : data.operation?.id
              ? [...strokesRef.current, data.operation]
              : []

          replaceStrokes(next)

          recordRoundStrokes(
            data.round?.id,
            next
          )

          return
        }

        // --------------------------------------------------------------
        // Game error
        // --------------------------------------------------------------

        if (data.type === "game_error") {
          console.error(
            "[Game] Error:",
            data.message
          )

          setGameError(data.message)

          return
        }

        // --------------------------------------------------------------
        // Round ended
        // --------------------------------------------------------------

        if (data.type === "round_ended") {
          setLiveStrokes({})
          console.log("[Game] Round ended:", data)

          const round = data.round

          if (!round?.id) {
            console.warn(
              "[Gallery] round_ended missing round:",
              data
            )

            return
          }

          if (isStaleRound(round.id)) {
            console.warn(
              "[Game] Ignoring stale round_ended:",
              round.id,
              "current:",
              currentRoundRef.current?.id
            )

            return
          }

          const completedRound = {
            ...round,
            strokes: Array.isArray(round.strokes)
              ? round.strokes
              : [],
            guesses: Array.isArray(round.guesses)
              ? round.guesses
              : [],
          }


          console.log(
            "[Gallery] Completed round:",
            completedRound.number,
            "id:",
            completedRound.id,
            "strokes:",
            completedRound.strokes.length,
            "guesses:",
            completedRound.guesses.length
          )

          setCompletedRounds((current) => {
            const existingIndex = current.findIndex(
              (item) => item.id === completedRound.id
            )

            if (existingIndex !== -1) {
              const next = [...current]
              next[existingIndex] = completedRound

              return next.sort(
                (a, b) => a.number - b.number
              )
            }

            return [...current, completedRound].sort(
              (a, b) => a.number - b.number
            )
          })


          setRoundResult((current) => ({
            ...(current || {}),
            ...round,
            winner:
              round.winner ||
              current?.winner ||
              correctGuesser ||
              null,
          }))

          setTimeLeft(0)

          setWordOptions([])
          setReadyPlayerIds([])
          setIsReady(false)
          setSelectedWord(null)

          if (
            data.final ||
            data.game_room?.status === "finished"
          ) {
            setGameState("finished")
            setFinalScores(data.scores || [])
          } else if (
            data.game_room?.status === "starting_round"
          ) {
            setGameState("starting_round")
            setFinalScores([])
          } else {
            setGameState("round_end")
            setFinalScores([])
          }

          return
        }

        // --------------------------------------------------------------
        // Guess submitted
        // --------------------------------------------------------------

        if (data.type === "guess_submitted") {
          console.log("[Game] Guess submitted:", data)

          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale guess_submitted:",
              data.round?.id
            )

            return
          }

          const next = [
            ...guessesRef.current,
            data.guess,
          ]

          guessesRef.current = next
          setGuesses(next)

          recordRoundGuesses(
            data.round?.id,
            next
          )

          return
        }

        // --------------------------------------------------------------
        // Correct guess
        // --------------------------------------------------------------

        if (data.type === "correct_guess") {
          console.log("[Game] Correct guess:", data)

          if (isStaleRound(data.round?.id)) {
            console.warn(
              "[Game] Ignoring stale correct_guess:",
              data.round?.id
            )

            return
          }

          setCorrectGuesser(data.player)

          setRoundResult((current) => ({
            ...(current || {}),
            winner: data.player,
          }))

          return
        }

        // --------------------------------------------------------------
        // Score updated
        // --------------------------------------------------------------

        if (data.type === "score_updated") {
          console.log(
            "[Game] Scores updated:",
            data.scores
          )

          setPlayers((currentPlayers) =>
            currentPlayers.map((player) => {
              const score = data.scores.find(
                (item) => item.id === player.id
              )

              return score
                ? {
                    ...player,
                    score: score.score,
                  }
                : player
            })
          )

          return
        }

        // --------------------------------------------------------------
        // Game finished
        // --------------------------------------------------------------

        if (data.type === "game_finished") {
          console.log("[Game] Finished:", data)

          setGameState("finished")
          setFinalScores(data.scores || [])
          setWordOptions([])
          setTimeLeft(0)

          return
        }
      },
    }
  )

  subscriptionRef.current = subscription

  return () => {
    console.log(
      `[ActionCable] Unsubscribing from room ${game_room.code}`
    )

    subscription.unsubscribe()
    subscriptionRef.current = null
  }
}, [game_room.code])


  // --------------------------------------------------------------------------
// Round countdown
// --------------------------------------------------------------------------

useEffect(() => {
  if (
    gameState !== "drawing" ||
    !currentRound?.started_at
  ) {
    if (gameState !== "round_end") {
      setTimeLeft(null)
    }

    return
  }

  const startedAt =
    new Date(
      currentRound.started_at
    ).getTime()

  const duration =
    Number(game_room.round_duration)

  const deadline =
    startedAt +
    duration * 1000

  function updateTimer() {
    const remaining =
      Math.max(
        0,
        deadline - Date.now()
      )

    setTimeLeft(
      Math.ceil(
        remaining / 1000
      )
    )
  }

  updateTimer()

  const interval =
    window.setInterval(
      updateTimer,
      250
    )

  return () => {
    window.clearInterval(interval)
  }
}, [
  gameState,
  currentRound?.started_at,
  game_room.round_duration,
])

  // --------------------------------------------------------------------------
  // Game actions
  // --------------------------------------------------------------------------

  function startGame() {
    setGameError(null)

    if (!subscriptionRef.current) {
      setGameError(
        "Not connected to the game."
      )

      return
    }

    subscriptionRef.current.perform(
      "start_game"
    )
  }

  function playAgain() {
    if (!subscriptionRef.current) return

    setGameError(null)

    subscriptionRef.current.perform("play_again")
  }

  const setReady = () => {
    if (!subscriptionRef.current) return

    setGameError(null)

    subscriptionRef.current.perform("set_ready")
  }


  function submitGuess(event) {
  event.preventDefault()

  const text = guessText.trim()

  if (!text) {
    return
  }

  if (!subscriptionRef.current) {
    setGameError("Not connected to the game.")
    return
  }

  setGameError(null)

  subscriptionRef.current.perform(
    "submit_guess",
    { text }
  )

  setGuessText("")
}

function drawStroke(stroke) {
  if (
    !subscriptionRef.current ||
    !stroke ||
    !currentRoundRef.current?.id
  ) {
    return
  }

  const roundId = currentRoundRef.current.id
  const current = strokesRef.current

  // GameCanvas optimistically records operations locally before handing them
  // to Show. Do NOT return just because the operation is already present:
  // the ActionCable command still has to be sent to Rails. Previously this
  // duplicate guard prevented shapes, layer_reorder, and object edits from
  // ever reaching the server.
  const alreadyPresent = current.some(
    (existing) =>
      existing?.id === stroke.id
  )

  if (!alreadyPresent) {
    const next = [
      ...current,
      stroke,
    ]

    strokesRef.current = next
    setStrokes(next)
    recordRoundStrokes(roundId, next)
  }

  const command =
    stroke.type === "object_update"
      ? "update_object"
      : stroke.type === "object_delete"
        ? "delete_object"
        : stroke.type === "layer_reorder"
          ? "reorder_layers"
          : "draw_stroke"

  subscriptionRef.current.perform(
    command,
    {
      ...stroke,
      round_id: roundId,
    }
  )
}

function undoStroke(strokeId) {
  if (
    !subscriptionRef.current ||
    !strokeId ||
    !currentRoundRef.current?.id
  ) {
    return
  }

  subscriptionRef.current.perform(
    "undo_stroke",
    {
      stroke_id: strokeId,
      round_id: currentRoundRef.current.id,
    }
  )
}

function sendLiveStroke(data) {
  if (
    !subscriptionRef.current ||
    !currentRoundRef.current?.id
  ) {
    return
  }

  subscriptionRef.current.perform(
    "draw_live",
    {
      ...data,
      round_id: currentRoundRef.current.id,
    }
  )
}

  function clearCanvas(operation) {
    if (
      !subscriptionRef.current ||
      !currentRoundRef.current?.id
    ) {
      return
    }

    if (!operation?.id || operation.type !== "canvas_clear") {
      return
    }

    const current = strokesRef.current

    if (!current.some((existing) => existing?.id === operation.id)) {
      const next = [...current, operation]
      replaceStrokes(next)
      recordRoundStrokes(currentRoundRef.current?.id, next)
    }

    subscriptionRef.current.perform(
      "clear_canvas",
      {
        ...operation,
        round_id: currentRoundRef.current.id,
      }
    )
  }

  function chooseWord(word) {
    if (!subscriptionRef.current) {
      return
    }

    setGameError(null)

    subscriptionRef.current.perform(
      "choose_word",
      { word }
    )

    setSelectedWord(word)
    setWordOptions([])
  }

  // --------------------------------------------------------------------------
  // Derived state
  // --------------------------------------------------------------------------

  const isDrawer =
    current_player &&
    currentRound &&
    current_player.id === currentRound.drawer.id

  const isHost = current_player?.position === 0

  const previousRound =
    completedRounds.length > 0
      ? completedRounds[completedRounds.length - 1]
      : null

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

return (
  <>
    <Head title={`Room ${game_room.code}`} />

    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">

        {/* ---------------------------------------------------------------- */}
        {/* Header */}
        {/* ---------------------------------------------------------------- */}

        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
              HMBLDRAW
            </p>

            <h1 className="text-4xl font-bold tracking-tight">
              {gameState === "waiting"
                ? "Game Lobby"
                : "Game"}
            </h1>

            <p className="mt-2 text-zinc-500">
              {gameState === "waiting"
                ? players.length < 2
                  ? "Waiting for another player to join..."
                  : isHost
                    ? "Ready to start the game."
                    : "Waiting for the host to start the game."
                : gameState === "starting_round"
                  ? "Getting ready..."
                  : gameState === "drawing"
                    ? isDrawer
                      ? "Your turn to draw"
                      : `${currentRound?.drawer?.name} is drawing`
                    : gameState === "round_end"
                      ? "Round complete"
                      : gameState === "finished"
                        ? "Game complete"
                        : "Game in progress"}
            </p>
            {game_room.category && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400">
                    <CategoryIcon
                      slug={game_room.category.slug}
                      className="h-3.5 w-3.5"
                    />

                    {game_room.category.name}
                  </span>

                  <span className="text-zinc-700">·</span>

                  <span className="text-xs text-zinc-500">
                    {game_room.total_rounds} rounds
                  </span>

                  <span className="text-zinc-700">·</span>

                  <span className="text-xs text-zinc-500">
                    {game_room.round_duration}s drawing time
                  </span>
                </div>
              )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-4 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Room Code
            </p>

            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em]">
              {game_room.code}
            </p>
          </div>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Connection status */}
        {/* ---------------------------------------------------------------- */}

        <div className="mt-8 flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              connected
                ? "bg-emerald-400"
                : "bg-yellow-400"
            }`}
          />

          <span className="text-zinc-500">
            {connected
              ? "Live connection"
              : "Connecting..."}
          </span>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Errors */}
        {/* ---------------------------------------------------------------- */}

        {gameError && (
          <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            {gameError}
          </div>
        )}

        {/* ================================================================= */}
        {/* LOBBY                                                              */}
        {/* ================================================================= */}

        {gameState === "waiting" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

            {/* Players */}

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Players
                  </h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    {players.length} / 8 players
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold">
                      {player.name
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">
                          {player.name}
                        </p>

                        {current_player?.id === player.id && (
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-950">
                            You
                          </span>
                        )}

                        {player.position === 0 && (
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Host
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            player.connected
                              ? "bg-emerald-400"
                              : "bg-zinc-700"
                          }`}
                        />

                        {player.connected
                          ? "Connected"
                          : "Disconnected"}
                      </div>
                    </div>
                  </div>
                ))}

                {Array.from({
                  length: Math.max(
                    0,
                    8 - players.length
                  ),
                }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    className="flex items-center gap-4 rounded-xl border border-dashed border-zinc-800 p-4"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-zinc-800 text-zinc-700">
                      +
                    </div>

                    <p className="text-sm text-zinc-600">
                      Waiting for player...
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Settings */}


            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold">
                Game Settings
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Rules for this game.
              </p>

              <div className="mt-6 space-y-3">

                {/* Category */}

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-300">
                      <CategoryIcon
                        slug={game_room.category?.slug}
                        className="h-5 w-5"
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-600">
                        Category
                      </p>

                      <p className="mt-1 truncate font-semibold">
                        {game_room.category?.name || "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rounds */}

                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <span className="text-sm text-zinc-500">
                    Rounds
                  </span>

                  <span className="font-medium">
                    {game_room.total_rounds}
                  </span>
                </div>

                {/* Drawing Time */}

                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <span className="text-sm text-zinc-500">
                    Drawing time
                  </span>

                  <span className="font-medium">
                    {game_room.round_duration}s
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={
                  players.length < 2 ||
                  gameState !== "waiting" ||
                  !connected ||
                  !isHost
                }
                onClick={startGame}
                className="mt-8 w-full rounded-xl bg-white px-5 py-3 font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {gameState !== "waiting"
                  ? "Game Starting…"
                  : players.length < 2
                    ? "Waiting for Players"
                    : !isHost
                      ? "Waiting for Host"
                      : "Start Game"}
              </button>

              <button
                type="button"
                onClick={leaveRoom}
                disabled={!connected}
                className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-5 py-3 font-semibold text-zinc-400 transition hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                Leave Room
              </button>

              {players.length < 2 && (
                <p className="mt-3 text-center text-xs text-zinc-600">
                  Need at least 2 players to start.
                </p>
              )}

              {players.length >= 2 && !isHost && (
                <p className="mt-3 text-center text-xs text-zinc-600">
                  Waiting for the host to start.
                </p>
              )}
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* STARTING ROUND                                                     */}
        {/* ================================================================= */}

        {gameState === "starting_round" &&
          currentRound && (

              <GameWorkspace

                aside={

                  previousRound ? (

                    <PreviousRoundResults round={previousRound} />

                  ) : null

                }

              >

              <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl">

                {/* Header */}

                <div className="border-b border-zinc-800 px-6 py-8 text-center sm:px-10">
                  <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
                    Round {currentRound.number}
                  </p>

                  <h2 className="mt-3 text-3xl font-bold tracking-tight">
                    {isDrawer
                      ? selectedWord
                        ? "You're ready to draw"
                        : "Choose your word"
                      : `${currentRound.drawer.name} is drawing`}
                  </h2>

                  <p className="mt-3 text-sm text-zinc-500">
                    {isDrawer
                      ? selectedWord
                        ? "Press Ready when you're ready to begin."
                        : "Choose a word, then press Ready."
                      : "Get ready. The round will begin when everyone is ready."}
                  </p>
                </div>

                {/* Word choices */}

                {isDrawer &&
                  wordOptions.length > 0 && (
                    <div className="border-b border-zinc-800 px-6 py-6 sm:px-10">
                      <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-zinc-600">
                        Choose a word
                      </p>

                      <div className="grid gap-3 sm:grid-cols-3">
                        {wordOptions.map((word) => (
                          <button
                            key={word}
                            type="button"
                            onClick={() => chooseWord(word)}
                            disabled={isReady}
                            className="rounded-xl border border-zinc-700 bg-zinc-950 px-5 py-5 text-lg font-semibold capitalize transition hover:border-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {word}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Selected word */}

                {isDrawer && selectedWord && (
                  <div className="border-b border-zinc-800 px-6 py-8 text-center sm:px-10">
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-600">
                      Your Word
                    </p>

                    <div className="mt-4 inline-flex rounded-2xl border border-zinc-700 bg-zinc-950 px-8 py-4">
                      <span className="text-3xl font-bold capitalize">
                        {selectedWord}
                      </span>
                    </div>
                  </div>
                )}

                {/* Players */}

                <div className="px-6 py-6 sm:px-10">
                  <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-zinc-600">
                    Players
                  </p>

                  <div className="space-y-2">
                    {players.map((player) => {
                      const ready =
                        readyPlayerIds.includes(
                          player.id
                        )

                      return (
                        <div
                          key={player.id}
                          className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold">
                              {player.name
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {player.name}
                              </p>

                              {player.id ===
                                current_player?.id && (
                                <p className="text-xs text-zinc-600">
                                  You
                                </p>
                              )}
                            </div>
                          </div>

                          <div
                            className={`shrink-0 text-sm font-semibold ${
                              ready
                                ? "text-emerald-400"
                                : "text-zinc-600"
                            }`}
                          >
                            {ready
                              ? "✓ Ready"
                              : "Not ready"}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Ready button */}

                <div className="border-t border-zinc-800 px-6 py-6 sm:px-10">
                  <button
                    type="button"
                    onClick={setReady}
                    disabled={
                      isReady ||
                      !connected ||
                      (isDrawer && !selectedWord)
                    }
                    className="w-full rounded-xl bg-white px-5 py-4 font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {isReady
                      ? "✓ You're Ready"
                      : isDrawer && !selectedWord
                        ? "Choose a Word First"
                        : "Ready"}
                  </button>

                  {isReady && (
                    <p className="mt-3 text-center text-sm text-zinc-600">
                      Waiting for the other players...
                    </p>
                  )}

                  {isDrawer && !selectedWord && (
                    <p className="mt-3 text-center text-xs text-zinc-600">
                      You must choose a word before you can ready up.
                    </p>
                  )}
                </div>
              </section>

            </GameWorkspace>
          )}

        {/* ================================================================= */}
        {/* DRAWING                                                           */}
        {/* ================================================================= */}


        {gameState === "drawing" &&
          currentRound && (
            <>


              {/* ============================================================= */}
        {/* MOBILE DRAWING SCREEN                                         */}
        {/* ============================================================= */}

        <section className="fixed inset-0 z-50 overflow-hidden bg-zinc-950 md:hidden">
          <div
            className="relative h-[100dvh] w-full overflow-hidden overscroll-none"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* ========================================================= */}
            {/* CANVAS + TOOLBAR                                           */}
            {/* ========================================================= */}

            <div
              className="absolute inset-x-0 bottom-0 overflow-hidden bg-white"
              style={{
                /*
                * Reserve the top of the screen for the game HUD.
                *
                * GameCanvas contains its own drawing toolbar, so the
                * entire GameCanvas needs to begin BELOW the HUD rather
                * than underneath it.
                */
                top: "calc(env(safe-area-inset-top) + 108px)",
              }}
            >
              <div className="drawing-canvas-shell absolute inset-0 overflow-hidden">
                <GameCanvas
                  roundId={currentRound.id}
                  strokes={strokes}
                  liveStrokes={liveStrokes}
                  canDraw={
                    isDrawer &&
                    timeLeft !== null &&
                    timeLeft > 0
                  }
                  onStroke={drawStroke}
                  onLiveStroke={sendLiveStroke}
                  onUndo={undoStroke}
                  onClear={clearCanvas}
                />
              </div>
            </div>

            {/* ========================================================= */}
            {/* TOP HUD                                                     */}
            {/* ========================================================= */}

            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-50"
              style={{
                paddingTop: "calc(env(safe-area-inset-top) + 10px)",
              }}
            >
              <div className="flex items-start justify-between px-3">
                {/* Round / drawer */}

                <div className="rounded-2xl border border-white/10 bg-zinc-950/90 px-4 py-2.5 shadow-xl backdrop-blur-md">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Round {currentRound.number}
                  </div>

                  <div className="mt-0.5 max-w-[190px] truncate text-sm font-semibold text-white">
                    {isDrawer
                      ? "Your turn"
                      : `${currentRound.drawer.name} is drawing`}
                  </div>
                </div>

                {/* Timer */}

                {timeLeft !== null && (
                  <div
                    className={[
                      "flex h-16 min-w-16 items-center justify-center rounded-2xl border px-4 font-mono text-2xl font-bold shadow-xl backdrop-blur-md",
                      timeLeft <= 10
                        ? "border-red-500/50 bg-red-950/90 text-red-400"
                        : "border-white/10 bg-zinc-950/90 text-white",
                    ].join(" ")}
                  >
                    {timeLeft}
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================= */}
            {/* DRAWER WORD                                                 */}
            {/* ========================================================= */}

            {isDrawer && selectedWord && (
              <div
                className="pointer-events-none absolute inset-x-0 z-50 flex justify-center px-3"
                style={{
                  /*
                  * This is now below the HUD but above the drawing surface.
                  * It does NOT overlap the toolbar because the GameCanvas
                  * itself starts at 108px.
                  */
                  top: "calc(env(safe-area-inset-top) + 18px)",
                }}
              >
                <div className="rounded-2xl border border-white/10 bg-zinc-950/90 px-5 py-2.5 text-center shadow-xl backdrop-blur-md">
                  <div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Your word
                  </div>

                  <div className="mt-0.5 text-lg font-bold uppercase tracking-tight text-white">
                    {selectedWord}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* FLOATING GUESSES                                            */}
            {/* ========================================================= */}

            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-50"
              style={{
                paddingBottom:
                  "calc(env(safe-area-inset-bottom) + 92px)",
              }}
            >
              <div className="px-3">
                <div className="ml-auto w-[min(82vw,340px)]">
                  {guesses.filter(
                    (guess) => !guess.correct
                  ).length > 0 && (
                    <div className="max-h-[24dvh] overflow-hidden">
                      <div className="flex flex-col items-end gap-1.5">
                        {guesses
                          .filter(
                            (guess) => !guess.correct
                          )
                          .slice(-5)
                          .map((guess) => (
                            <div
                              key={guess.id}
                              className="max-w-[88%] rounded-2xl border border-zinc-700/70 bg-zinc-950/85 px-3 py-2 shadow-lg backdrop-blur-md"
                            >
                              <div className="flex items-baseline gap-2">
                                <span className="shrink-0 text-[10px] font-semibold text-zinc-400">
                                  {guess.player?.name ||
                                    "Player"}
                                </span>

                                <span className="truncate text-xs font-medium text-white">
                                  {guess.text}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* GUESS INPUT                                                 */}
            {/* ========================================================= */}

            {!isDrawer &&
              timeLeft !== null &&
              timeLeft > 0 && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] px-3"
                  style={{
                    paddingBottom:
                      "calc(env(safe-area-inset-bottom) + 10px)",
                  }}
                >
                  <form
                    onSubmit={submitGuess}
                    className="pointer-events-auto flex gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur-md"
                  >
                    <input
                      type="text"
                      value={guessText}
                      onChange={(event) =>
                        setGuessText(event.target.value)
                      }
                      maxLength={100}
                      placeholder="What is it?"
                      autoComplete="off"
                      enterKeyHint="send"
                      className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500 focus:bg-zinc-800"
                    />

                    <button
                      type="submit"
                      disabled={!guessText.trim()}
                      className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition active:scale-95 disabled:opacity-30"
                    >
                      Guess
                    </button>
                  </form>
                </div>
              )}

          </div>
        </section>

      {/* ============================================================= */}
      {/* DESKTOP DRAWING SCREEN                                        */}
      {/* ============================================================= */}

      <div className="hidden md:block">
        <GameWorkspace
          aside={
            <>
              {/* Round controls */}

              <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Round
                    </p>

                    <p className="mt-1 font-semibold">
                      {currentRound.number}
                    </p>
                  </div>

                </div>
              </div>

              {/* Guesses */}

              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Guesses
                    </p>

                    {isDrawer && (
                      <p className="mt-1 text-xs text-zinc-600">
                        See what everyone is thinking
                      </p>
                    )}
                  </div>

                  <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-500">
                    {
                      guesses.filter(
                        (guess) => !guess.correct
                      ).length
                    }
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {guesses.filter(
                    (guess) => !guess.correct
                  ).length > 0 ? (
                    guesses
                      .filter(
                        (guess) => !guess.correct
                      )
                      .slice()
                      .reverse()
                      .map((guess) => (
                        <div
                          key={guess.id}
                          className="flex items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-3 last:border-0"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold">
                              {guess.player.name
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {guess.player.name}
                              </p>

                              <p className="truncate text-sm text-zinc-500">
                                {guess.text}
                              </p>
                            </div>
                          </div>

                          {isDrawer && (
                            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-700">
                              Wrong
                            </span>
                          )}
                        </div>
                      ))
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-zinc-600">
                        No guesses yet.
                      </p>

                      {isDrawer && (
                        <p className="mt-1 text-xs text-zinc-700">
                          Guesses will appear here.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!isDrawer &&
                  timeLeft !== null &&
                  timeLeft > 0 && (
                    <div className="border-t border-zinc-800 p-3">
                      <form
                        onSubmit={submitGuess}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          value={guessText}
                          onChange={(event) =>
                            setGuessText(
                              event.target.value
                            )
                          }
                          maxLength={100}
                          placeholder="What is it?"
                          className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-600"
                        />

                        <button
                          type="submit"
                          disabled={!guessText.trim()}
                          className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Guess
                        </button>
                      </form>
                    </div>
                  )}
              </div>
            </>
          }
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
                Round {currentRound.number}
              </p>

              <h2 className="mt-1 truncate text-xl font-bold">
                {isDrawer
                  ? "Your turn"
                  : `${currentRound.drawer.name} is drawing`}
              </h2>
            </div>

            {timeLeft !== null && (
              <div
                className={`shrink-0 rounded-xl border px-4 py-2 text-center font-mono text-xl font-bold sm:px-5 sm:text-2xl ${
                  timeLeft <= 10
                    ? "border-red-500/50 bg-red-950/40 text-red-400"
                    : "border-zinc-700 bg-zinc-900 text-white"
                }`}
              >
                {timeLeft}
              </div>
            )}
          </div>

          {isDrawer && selectedWord && (
            <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-center shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Your word
              </div>

              <div className="mt-1 text-2xl font-bold tracking-tight text-white uppercase">
                {selectedWord}
              </div>
            </div>
          )}

          <div className="aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-white">
            <GameCanvas
              roundId={currentRound.id}
              strokes={strokes}
              liveStrokes={liveStrokes}
              canDraw={
                isDrawer &&
                timeLeft !== null &&
                timeLeft > 0
              }
              onStroke={drawStroke}
              onLiveStroke={sendLiveStroke}
              onUndo={undoStroke}
              onClear={clearCanvas}
            />
          </div>
        </GameWorkspace>
      </div>
    </>
  )}

        {/* ================================================================= */}
        {/* ROUND END                                                         */}
        {/* ================================================================= */}

        {gameState === "round_end" &&
          roundResult && (
            <section className="mt-8">
              <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl">

                {/* Header */}

                <div className="border-b border-zinc-800 px-6 py-8 text-center sm:px-10">
                  <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
                    Round {roundResult.number}
                  </p>

                  <h2 className="mt-3 text-4xl font-bold tracking-tight">
                    Round Over
                  </h2>

                  <p className="mt-3 text-zinc-500">
                    The word was
                  </p>

                  <div className="mt-4 inline-flex rounded-2xl border border-zinc-700 bg-zinc-950 px-8 py-4">
                    <span className="text-3xl font-bold capitalize">
                      {roundResult.word}
                    </span>
                  </div>
                </div>

                {/* Summary */}

                <div className="grid gap-4 border-b border-zinc-800 px-6 py-6 sm:grid-cols-2 sm:px-10">

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
                      Drawer
                    </p>

                    <p className="mt-2 text-lg font-semibold">
                      {roundResult.drawer.name}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
                      Winner
                    </p>

                    {roundResult.winner ? (
                      <>
                        <p className="mt-2 text-xl font-bold text-emerald-400">
                          {roundResult.winner.name}
                        </p>

                        <p className="mt-1 text-sm text-zinc-500">
                          Guessed it correctly!
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-lg font-semibold text-zinc-600">
                          Nobody
                        </p>

                        <p className="mt-1 text-sm text-zinc-700">
                          Time ran out.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Drawing */}

                {Array.isArray(roundResult.strokes) &&
                  roundResult.strokes.length > 0 && (
                    <div className="border-b border-zinc-800 px-6 py-6 sm:px-10">
                      <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-zinc-600">
                        Drawing
                      </p>

                      <div className="aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-white">
                        <GameCanvas
                          strokes={roundResult.strokes}
                          canDraw={false}
                          onStroke={() => {}}
                        />
                      </div>
                    </div>
                  )}

                {/* Guesses */}

                {roundResult.guesses &&
                  roundResult.guesses.length > 0 && (
                    <div className="border-b border-zinc-800 px-6 py-6 sm:px-10">
                      <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-zinc-600">
                        Guesses
                      </p>

                      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                        {roundResult.guesses.map(
                          (guess) => (
                            <div
                              key={guess.id}
                              className={`flex items-center justify-between gap-4 border-b border-zinc-800/60 px-4 py-3 last:border-0 ${
                                guess.correct
                                  ? "bg-emerald-950/20"
                                  : ""
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="shrink-0 font-medium">
                                  {guess.player.name}
                                </span>

                                <span className="truncate text-zinc-500">
                                  {guess.text}
                                </span>
                              </div>

                              {guess.correct && (
                                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                                  Correct
                                </span>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* Footer */}

                <div className="px-6 py-5 text-center sm:px-10">
                  <p className="text-sm text-zinc-600">
                    Waiting for the next round...
                  </p>
                </div>

              </div>
            </section>
          )}

        {/* ================================================================= */}
        {/* FINISHED                                                          */}
        {/* ================================================================= */}

        {gameState === "finished" && (
  <section className="mt-6 sm:mt-8">
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* ================================================================
          GAME GALLERY
          ================================================================ */}
      <section className="min-w-0">
        <div className="mb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
            Game Gallery
          </div>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Every round
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            See how the game unfolded.
          </p>
        </div>

        <div className="space-y-4">
          {completedRounds.map((round) => (
            <PreviousRoundResults
              key={round.id}
              round={round}
            />
          ))}
        </div>
      </section>

      {/* ================================================================
          GAME COMPLETE
          ================================================================ */}
          <section className="min-w-0 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 overflow-hidden">
              <div className="px-6 py-7 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-zinc-300">
                  <Trophy className="h-7 w-7" strokeWidth={1.8} />
                </div>

                <div className="mt-5 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
                  Game Complete
                </div>

                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Final Scores
                </h2>

                <p className="mt-2 text-sm text-zinc-500">
                  Great game. Here’s how everyone finished.
                </p>
              </div>

              <div className="border-t border-zinc-800">
                {finalScores.length > 0 ? (
                  <div>
                    {finalScores.map((player, index) => (
                      <div
                        key={player.id}
                        className="flex items-center gap-4 border-b border-zinc-900 px-5 py-4 last:border-b-0"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-zinc-400">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">
                            {player.name}
                          </div>
                        </div>

                        <div className="shrink-0 text-lg font-semibold text-white">
                          {player.score}
                        </div>

                        <div className="text-xs text-zinc-600">
                          pts
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center text-sm text-zinc-500">
                    No scores available.
                  </div>
                )}
              </div>

              {isHost && (
                <div className="border-t border-zinc-800 p-5">
                  <button
                    type="button"
                    onClick={playAgain}
                    className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
                  >
                    Play Again
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    )}

      </div>
    </div>
  </>
)
}
