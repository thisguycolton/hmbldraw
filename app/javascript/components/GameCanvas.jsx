import { useEffect, useRef, useState } from "react"
import { Undo } from "lucide-react"

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 800

const DEFAULT_COLOR = "#18181b"
const DEFAULT_WIDTH = 6

const COLORS = [
  "#18181b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
]

const STROKE_WIDTHS = [
  { label: "Thin", value: 3 },
  { label: "Medium", value: 6 },
  { label: "Thick", value: 12 },
  { label: "Huge", value: 24 },
]

// Send live drawing updates at most about 30 times per second.
const LIVE_UPDATE_INTERVAL = 30

// Ignore points that are extremely close together.
// This reduces noisy mobile input without visibly changing the drawing.
const MIN_POINT_DISTANCE = 0.0015

export default function GameCanvas({
  roundId,
  strokes,
  canDraw,
  onStroke,
  onLiveStroke,
  onUndo,
}) {
  const [strokeColor, setStrokeColor] =
    useState(DEFAULT_COLOR)

  const [strokeWidth, setStrokeWidth] =
    useState(DEFAULT_WIDTH)

  const canvasRef = useRef(null)

  // --------------------------------------------------------------------------
  // Refs
  // --------------------------------------------------------------------------

  const strokesRef = useRef(
    Array.isArray(strokes) ? strokes : []
  )

  const drawingRef = useRef(false)
  const currentStrokeRef = useRef(null)

  const pendingPointsRef = useRef([])

  const lastLiveUpdateRef = useRef(0)

  // Keep callbacks/current settings in refs so pointer listeners don't
  // have to be destroyed/recreated every time React renders.
  const canDrawRef = useRef(canDraw)
  const strokeColorRef = useRef(strokeColor)
  const strokeWidthRef = useRef(strokeWidth)

  const onStrokeRef = useRef(onStroke)
  const onLiveStrokeRef = useRef(onLiveStroke)
  const onUndoRef = useRef(onUndo)

  // --------------------------------------------------------------------------
  // Keep refs synchronized
  // --------------------------------------------------------------------------

  useEffect(() => {
    strokesRef.current = Array.isArray(strokes)
      ? strokes
      : []

    renderCanvas()
  }, [strokes])

  useEffect(() => {
    canDrawRef.current = canDraw
  }, [canDraw])

  useEffect(() => {
    strokeColorRef.current = strokeColor
  }, [strokeColor])

  useEffect(() => {
    strokeWidthRef.current = strokeWidth
  }, [strokeWidth])

  useEffect(() => {
    onStrokeRef.current = onStroke
  }, [onStroke])

  useEffect(() => {
    onLiveStrokeRef.current = onLiveStroke
  }, [onLiveStroke])

  useEffect(() => {
    onUndoRef.current = onUndo
  }, [onUndo])

  // --------------------------------------------------------------------------
  // Canvas setup
  // --------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    setupCanvas()

    function handleResize() {
      setupCanvas()
    }

    window.addEventListener(
      "resize",
      handleResize
    )

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      )
    }
  }, [])

  // --------------------------------------------------------------------------
  // Pointer listeners
  // --------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    canvas.addEventListener(
      "pointerdown",
      handlePointerDown
    )

    canvas.addEventListener(
      "pointermove",
      handlePointerMove
    )

    canvas.addEventListener(
      "pointerup",
      handlePointerUp
    )

    canvas.addEventListener(
      "pointercancel",
      handlePointerCancel
    )

    return () => {
      canvas.removeEventListener(
        "pointerdown",
        handlePointerDown
      )

      canvas.removeEventListener(
        "pointermove",
        handlePointerMove
      )

      canvas.removeEventListener(
        "pointerup",
        handlePointerUp
      )

      canvas.removeEventListener(
        "pointercancel",
        handlePointerCancel
      )
    }
  }, [])

  // --------------------------------------------------------------------------
  // Canvas sizing
  // --------------------------------------------------------------------------

  function setupCanvas() {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const dpr =
      window.devicePixelRatio || 1

    /*
     * The logical canvas is always 1200 × 800.
     *
     * On a Retina display:
     *
     *   logical: 1200 × 800
     *   physical: 2400 × 1600
     *
     * This gives us much cleaner lines on iPhone/iPad/Mac displays.
     */
    canvas.width =
      CANVAS_WIDTH * dpr

    canvas.height =
      CANVAS_HEIGHT * dpr

    canvas.style.aspectRatio =
      `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`

    const context =
      canvas.getContext("2d")

    if (!context) {
      return
    }

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    )

    context.imageSmoothingEnabled = true

    renderCanvas()
  }

  // --------------------------------------------------------------------------
  // Pointer down
  // --------------------------------------------------------------------------

  function handlePointerDown(event) {
    if (!canDrawRef.current) {
      return
    }

    event.preventDefault()

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    /*
     * Pointer capture is particularly important on mobile.
     *
     * Once the finger starts drawing, the canvas continues receiving
     * pointer events even if the finger moves slightly outside the element.
     */
    try {
      canvas.setPointerCapture(
        event.pointerId
      )
    } catch {
      // Ignore unsupported pointer capture.
    }

    const point =
      getNormalizedPoint(
        canvas,
        event
      )

    const stroke = {
      id: createStrokeId(),
      points: [point],
      color: strokeColorRef.current,
      width: strokeWidthRef.current,
    }

    drawingRef.current = true

    currentStrokeRef.current =
      stroke

    pendingPointsRef.current = [
      point,
    ]

    lastLiveUpdateRef.current =
      performance.now()

    /*
     * Draw the first dot immediately.
     *
     * This also ensures a tap produces a visible dot.
     */
    renderCanvas()

    // Preserve the existing HUMBLDRAW live protocol.
    sendLiveStart(stroke)
  }

  // --------------------------------------------------------------------------
  // Pointer move
  // --------------------------------------------------------------------------

  function handlePointerMove(event) {
    if (!drawingRef.current) {
      return
    }

    if (!canDrawRef.current) {
      return
    }

    event.preventDefault()

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const stroke =
      currentStrokeRef.current

    if (!stroke) {
      return
    }

    /*
     * This is one of the biggest improvements for iOS.
     *
     * Safari can combine several physical pointer samples into one
     * pointermove event. getCoalescedEvents() lets us recover those
     * intermediate positions.
     *
     * Without this:
     *
     *   finger:  •           •
     *             \         /
     *              \       /
     *               \_____/
     *
     * With coalesced events:
     *
     *   finger:  • • • • • • •
     *
     * giving our curve many more points to work with.
     */
    const pointerEvents =
      typeof event.getCoalescedEvents ===
      "function"
        ? event.getCoalescedEvents()
        : [event]

    let addedAny = false

    for (const pointerEvent of pointerEvents) {
      const point =
        getNormalizedPoint(
          canvas,
          pointerEvent
        )

      if (addPointToCurrentStroke(point)) {
        pendingPointsRef.current.push(
          point
        )

        addedAny = true
      }
    }

    if (!addedAny) {
      return
    }

    /*
     * Render immediately locally.
     *
     * The person drawing sees this without waiting for ActionCable.
     */
    renderCanvas()

    /*
     * Send live points approximately every 30ms.
     */
    const now = performance.now()

    if (
      now -
        lastLiveUpdateRef.current >=
      LIVE_UPDATE_INTERVAL
    ) {
      sendPendingPoints()
    }
  }

  // --------------------------------------------------------------------------
  // Pointer up
  // --------------------------------------------------------------------------

  function handlePointerUp(event) {
    if (!drawingRef.current) {
      return
    }

    event.preventDefault()

    const canvas = canvasRef.current

    /*
     * Capture the final coalesced pointer positions.
     *
     * This is important because on mobile the final pointermove isn't
     * guaranteed to arrive before pointerup.
     */
    if (canvas) {
      const pointerEvents =
        typeof event.getCoalescedEvents ===
        "function"
          ? event.getCoalescedEvents()
          : [event]

      for (const pointerEvent of pointerEvents) {
        const point =
          getNormalizedPoint(
            canvas,
            pointerEvent
          )

        if (
          addPointToCurrentStroke(
            point
          )
        ) {
          pendingPointsRef.current.push(
            point
          )
        }
      }
    }

    /*
     * Make sure the final points reach the other clients.
     */
    sendPendingPoints()

    drawingRef.current = false

    const stroke =
      currentStrokeRef.current

    currentStrokeRef.current = null
    pendingPointsRef.current = []

    try {
      if (
        canvas &&
        canvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId
        )
      }
    } catch {
      // Pointer capture may already have been released.
    }

    if (!stroke) {
      renderCanvas()
      return
    }

    if (stroke.points.length === 0) {
      renderCanvas()
      return
    }

    /*
     * Send the complete stroke to Show.jsx.
     *
     * Clone the points so future mutations can't alter the
     * committed stroke.
     */
    const completedStroke = {
      ...stroke,
      points: [
        ...stroke.points,
      ],
    }

    if (
      typeof onStrokeRef.current ===
      "function"
    ) {
      onStrokeRef.current(
        completedStroke
      )
    }

    renderCanvas()
  }

  // --------------------------------------------------------------------------
  // Pointer cancel
  // --------------------------------------------------------------------------

  function handlePointerCancel(event) {
    drawingRef.current = false

    currentStrokeRef.current = null
    pendingPointsRef.current = []

    try {
      const canvas = canvasRef.current

      if (
        canvas &&
        event.pointerId != null &&
        canvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId
        )
      }
    } catch {
      // Ignore pointer capture errors.
    }

    renderCanvas()
  }

  // --------------------------------------------------------------------------
  // Add point
  // --------------------------------------------------------------------------

  function addPointToCurrentStroke(
    point
  ) {
    const stroke =
      currentStrokeRef.current

    if (!stroke) {
      return false
    }

    const points =
      stroke.points

    if (points.length === 0) {
      points.push(point)
      return true
    }

    const previous =
      points[points.length - 1]

    /*
     * Ignore extremely tiny movements.
     *
     * This is especially useful on mobile where the finger can generate
     * a lot of almost-identical coordinates.
     */
    if (
      normalizedDistance(
        previous,
        point
      ) < MIN_POINT_DISTANCE
    ) {
      return false
    }

    points.push(point)

    return true
  }

  // --------------------------------------------------------------------------
  // Live drawing - stroke start
  // --------------------------------------------------------------------------

  function sendLiveStart(stroke) {
    const callback =
      onLiveStrokeRef.current

    if (
      typeof callback !==
      "function"
    ) {
      return
    }

    callback({
      type: "start",
      stroke: {
        id: stroke.id,
        points: [
          ...stroke.points,
        ],
        color: stroke.color,
        width: stroke.width,
      },
    })
  }

  // --------------------------------------------------------------------------
  // Live drawing - points
  // --------------------------------------------------------------------------

  function sendPendingPoints() {
    const callback =
      onLiveStrokeRef.current

    const stroke =
      currentStrokeRef.current

    const points =
      pendingPointsRef.current

    if (
      !stroke ||
      points.length === 0
    ) {
      return
    }

    if (
      typeof callback !==
      "function"
    ) {
      pendingPointsRef.current = []

      lastLiveUpdateRef.current =
        performance.now()

      return
    }

    callback({
      type: "points",
      stroke: {
        id: stroke.id,
        points: [
          ...points,
        ],
        color: stroke.color,
        width: stroke.width,
      },
    })

    pendingPointsRef.current = []

    lastLiveUpdateRef.current =
      performance.now()
  }

  // --------------------------------------------------------------------------
  // Renderer
  // --------------------------------------------------------------------------

  function renderCanvas() {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext("2d")

    if (!context) {
      return
    }

    const dpr =
      window.devicePixelRatio || 1

    /*
     * Always restore our logical coordinate system.
     */
    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    )

    context.clearRect(
      0,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    )

    /*
     * White drawing surface.
     */
    context.fillStyle =
      "#ffffff"

    context.fillRect(
      0,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    )

    /*
     * Rendering defaults.
     *
     * round caps + round joins are extremely important for
     * freehand drawing.
     */
    context.lineCap = "round"
    context.lineJoin = "round"
    context.miterLimit = 2
    context.imageSmoothingEnabled = true

    // ------------------------------------------------------------------------
    // Committed strokes
    // ------------------------------------------------------------------------

    for (
      const stroke of
        strokesRef.current
    ) {
      drawStroke(
        context,
        stroke
      )
    }

    // ------------------------------------------------------------------------
    // Active stroke
    // ------------------------------------------------------------------------

    const activeStroke =
      currentStrokeRef.current

    if (
      drawingRef.current &&
      activeStroke
    ) {
      drawStroke(
        context,
        activeStroke
      )
    }
  }

  // --------------------------------------------------------------------------
  // Undo
  // --------------------------------------------------------------------------

  function handleUndo() {
    if (!canDrawRef.current) {
      return
    }

    const current =
      strokesRef.current

    if (
      !Array.isArray(current) ||
      current.length === 0
    ) {
      return
    }

    const lastStroke =
      current[current.length - 1]

    if (!lastStroke?.id) {
      return
    }

    if (
      typeof onUndoRef.current ===
      "function"
    ) {
      onUndoRef.current(
        lastStroke.id
      )
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-white shadow-2xl">

      {/* -------------------------------------------------------------------- */}
      {/* Drawing toolbar                                                     */}
      {/* -------------------------------------------------------------------- */}

      {canDraw && (
        <div className="border-b border-zinc-200 bg-zinc-100 p-3">
          <div className="flex flex-wrap items-center gap-4">

            {/* Colors */}

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Color
              </span>

              <div className="flex items-center gap-1.5">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() =>
                      setStrokeColor(
                        color
                      )
                    }
                    aria-label={`Choose ${color}`}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      strokeColor ===
                      color
                        ? "scale-110 border-zinc-900"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{
                      backgroundColor:
                        color,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Width */}

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Size
              </span>

              <div className="flex items-center gap-1">
                {STROKE_WIDTHS.map(
                  (option) => (
                    <button
                      key={
                        option.value
                      }
                      type="button"
                      onClick={() =>
                        setStrokeWidth(
                          option.value
                        )
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        strokeWidth ===
                        option.value
                          ? "bg-zinc-900 text-white"
                          : "bg-white text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Undo */}

            <div className="ml-auto">
              <button
                type="button"
                onClick={handleUndo}
                disabled={
                  !strokes ||
                  strokes.length === 0
                }
                aria-label="Undo last stroke"
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Undo
                  size={16}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Canvas                                                               */}
      {/* -------------------------------------------------------------------- */}

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className={`block h-auto w-full ${
          canDraw
            ? "cursor-crosshair touch-none"
            : "cursor-default"
        }`}
        style={{
          aspectRatio:
            `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
          touchAction:
            canDraw
              ? "none"
              : "auto",
        }}
      />
    </div>
  )
}

// ==============================================================================
// Stroke renderer
// ==============================================================================

function drawStroke(
  context,
  stroke
) {
  const points =
    Array.isArray(stroke?.points)
      ? stroke.points
      : []

  if (points.length === 0) {
    return
  }

  const color =
    stroke.color ||
    DEFAULT_COLOR

  const width =
    Number(stroke.width) ||
    DEFAULT_WIDTH

  context.strokeStyle = color
  context.fillStyle = color

  context.lineWidth = width
  context.lineCap = "round"
  context.lineJoin = "round"

  // --------------------------------------------------------------------------
  // Single point
  // --------------------------------------------------------------------------

  if (points.length === 1) {
    const [x, y] =
      points[0]

    context.beginPath()

    context.arc(
      x * CANVAS_WIDTH,
      y * CANVAS_HEIGHT,
      width / 2,
      0,
      Math.PI * 2
    )

    context.fill()

    return
  }

  // --------------------------------------------------------------------------
  // Two points
  // --------------------------------------------------------------------------

  if (points.length === 2) {
    const [x1, y1] =
      points[0]

    const [x2, y2] =
      points[1]

    context.beginPath()

    context.moveTo(
      x1 * CANVAS_WIDTH,
      y1 * CANVAS_HEIGHT
    )

    context.lineTo(
      x2 * CANVAS_WIDTH,
      y2 * CANVAS_HEIGHT
    )

    context.stroke()

    return
  }

  // --------------------------------------------------------------------------
  // Three or more points
  // --------------------------------------------------------------------------

  /*
   * Smooth quadratic Bézier rendering.
   *
   * Instead of:
   *
   *   A ─── B ─── C ─── D
   *
   * which produces visible corners, we use each point as a control point
   * and travel through midpoints:
   *
   *          B
   *        /   \
   *      A       midpoint(B,C)
   *                \
   *                 C
   *
   * The result follows the original path while removing the sharp
   * polygonal appearance of low-frequency mobile input.
   */

  context.beginPath()

  const first =
    points[0]

  context.moveTo(
    first[0] * CANVAS_WIDTH,
    first[1] * CANVAS_HEIGHT
  )

  for (
    let index = 1;
    index <
      points.length - 1;
    index++
  ) {
    const current =
      points[index]

    const next =
      points[index + 1]

    const currentX =
      current[0] *
      CANVAS_WIDTH

    const currentY =
      current[1] *
      CANVAS_HEIGHT

    const nextX =
      next[0] *
      CANVAS_WIDTH

    const nextY =
      next[1] *
      CANVAS_HEIGHT

    const midpointX =
      (currentX + nextX) /
      2

    const midpointY =
      (currentY + nextY) /
      2

    context.quadraticCurveTo(
      currentX,
      currentY,
      midpointX,
      midpointY
    )
  }

  // Finish at the actual final point.
  const penultimate =
    points[
      points.length - 2
    ]

  const last =
    points[
      points.length - 1
    ]

  context.quadraticCurveTo(
    penultimate[0] *
      CANVAS_WIDTH,
    penultimate[1] *
      CANVAS_HEIGHT,
    last[0] *
      CANVAS_WIDTH,
    last[1] *
      CANVAS_HEIGHT
  )

  context.stroke()
}

// ==============================================================================
// Coordinate conversion
// ==============================================================================

function getNormalizedPoint(
  canvas,
  event
) {
  const rect =
    canvas.getBoundingClientRect()

  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return [0, 0]
  }

  const x =
    (event.clientX - rect.left) /
    rect.width

  const y =
    (event.clientY - rect.top) /
    rect.height

  return [
    clamp(x, 0, 1),
    clamp(y, 0, 1),
  ]
}

// ==============================================================================
// Distance
// ==============================================================================

function normalizedDistance(
  a,
  b
) {
  const dx =
    a[0] - b[0]

  const dy =
    a[1] - b[1]

  return Math.sqrt(
    dx * dx +
    dy * dy
  )
}

// ==============================================================================
// Utilities
// ==============================================================================

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(min, value)
  )
}

function createStrokeId() {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`
}