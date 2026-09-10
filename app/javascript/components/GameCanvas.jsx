import { useEffect, useRef, useState } from "react"
import {
  Eraser,
  PaintBucket,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"

const CANVAS_SIZE = 1200

const CANVAS_WIDTH = CANVAS_SIZE
const CANVAS_HEIGHT = CANVAS_SIZE

const DEFAULT_COLOR = "#18181b"
const DEFAULT_WIDTH = 6

const COLORS = [
  "#18181b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
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
const MIN_POINT_DISTANCE = 0.0015

// Flood-fill color tolerance.
//
// Anti-aliased drawing edges contain pixels that aren't exactly the
// foreground/background color. A small tolerance prevents the bucket
// from leaking through those edges.
const FILL_TOLERANCE = 18
const FILL_EDGE_TOLERANCE = 64


const TOOLS = {
  PENCIL: "pencil",
  ERASER: "eraser",
  BUCKET: "bucket",
}

export default function GameCanvas({
  roundId,
  strokes,
  canDraw,
  onStroke,
  onLiveStroke,
  onUndo,
  onClear,
}) {
  const [strokeColor, setStrokeColor] =
    useState(DEFAULT_COLOR)

  const [strokeWidth, setStrokeWidth] =
    useState(DEFAULT_WIDTH)

  const [tool, setTool] =
    useState(TOOLS.PENCIL)

  const [cursorPosition, setCursorPosition] =
    useState(null)

  const canvasRef = useRef(null)

  // --------------------------------------------------------------------------
  // Refs
  // --------------------------------------------------------------------------

  const strokesRef = useRef(
    Array.isArray(strokes)
      ? strokes
      : []
  )

  const drawingRef = useRef(false)

  const currentStrokeRef =
    useRef(null)

  const pendingPointsRef =
    useRef([])

  const lastLiveUpdateRef =
    useRef(0)

  const canDrawRef =
    useRef(canDraw)

  const strokeColorRef =
    useRef(strokeColor)

  const strokeWidthRef =
    useRef(strokeWidth)

  const toolRef =
    useRef(tool)

  const onStrokeRef =
    useRef(onStroke)

  const onLiveStrokeRef =
    useRef(onLiveStroke)

  const onUndoRef =
    useRef(onUndo)

  const onClearRef =
    useRef(onClear)

  // Local operations allow fills to appear immediately while the
  // server round-trip is happening.
  //
  // Once the parent receives the operation through ActionCable and
  // includes it in `strokes`, the local copy is removed.
  const localOperationsRef =
    useRef([])

  // --------------------------------------------------------------------------
  // Keep refs synchronized
  // --------------------------------------------------------------------------

  useEffect(() => {
    const nextStrokes =
      Array.isArray(strokes)
        ? strokes
        : []

    strokesRef.current =
      nextStrokes

    const serverIds =
      new Set(
        nextStrokes
          .map((stroke) => stroke?.id)
          .filter(Boolean)
      )

    localOperationsRef.current =
      localOperationsRef.current.filter(
        (operation) =>
          !serverIds.has(operation.id)
      )

    renderCanvas()
  }, [strokes])

  useEffect(() => {
    canDrawRef.current =
      canDraw
  }, [canDraw])

  useEffect(() => {
    strokeColorRef.current =
      strokeColor
  }, [strokeColor])

  useEffect(() => {
    strokeWidthRef.current =
      strokeWidth
  }, [strokeWidth])

  useEffect(() => {
    toolRef.current =
      tool
  }, [tool])

  useEffect(() => {
    onStrokeRef.current =
      onStroke
  }, [onStroke])

  useEffect(() => {
    onLiveStrokeRef.current =
      onLiveStroke
  }, [onLiveStroke])

  useEffect(() => {
    onUndoRef.current =
      onUndo
  }, [onUndo])

  useEffect(() => {
    onClearRef.current =
      onClear
  }, [onClear])

  // --------------------------------------------------------------------------
  // Canvas setup
  // --------------------------------------------------------------------------

  useEffect(() => {
    const canvas =
      canvasRef.current

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
    const canvas =
      canvasRef.current

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

    canvas.addEventListener(
      "pointermove",
      handleCursorMove
    )

    canvas.addEventListener(
      "pointerleave",
      handleCursorLeave
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

      canvas.removeEventListener(
        "pointermove",
        handleCursorMove
      )

      canvas.removeEventListener(
        "pointerleave",
        handleCursorLeave
      )
    }
  }, [])

  // --------------------------------------------------------------------------
  // Cursor
  // --------------------------------------------------------------------------

  function handleCursorMove(event) {
    if (!canDrawRef.current) {
      setCursorPosition(null)
      return
    }

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const rect =
      canvas.getBoundingClientRect()

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return
    }

    setCursorPosition({
      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top,
    })
  }

  function handleCursorLeave() {
    setCursorPosition(null)
  }

  // --------------------------------------------------------------------------
  // Canvas sizing
  // --------------------------------------------------------------------------

  function setupCanvas() {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const dpr =
      window.devicePixelRatio || 1

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

    context.imageSmoothingEnabled =
      true

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

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const currentTool =
      toolRef.current

    const point =
      getNormalizedPoint(
        canvas,
        event
      )

    // ------------------------------------------------------------------------
    // Bucket
    // ------------------------------------------------------------------------

    if (
      currentTool ===
      TOOLS.BUCKET
    ) {
      handleBucketFill(point)
      return
    }

    // ------------------------------------------------------------------------
    // Pencil / Eraser
    // ------------------------------------------------------------------------

    try {
      canvas.setPointerCapture(
        event.pointerId
      )
    } catch {
      // Ignore unsupported pointer capture.
    }

    const isEraser =
      currentTool ===
      TOOLS.ERASER

    const stroke = {
      id: createStrokeId(),

      type:
        isEraser
          ? "eraser"
          : "stroke",

      points: [point],

      color:
        strokeColorRef.current,

      width:
        isEraser
          ? Math.max(
              strokeWidthRef.current * 2,
              12
            )
          : strokeWidthRef.current,
    }

    drawingRef.current =
      true

    currentStrokeRef.current =
      stroke

    pendingPointsRef.current = [
      point,
    ]

    lastLiveUpdateRef.current =
      performance.now()

    renderCanvas()

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

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const stroke =
      currentStrokeRef.current

    if (!stroke) {
      return
    }

    const pointerEvents =
      typeof event.getCoalescedEvents ===
      "function"
        ? event.getCoalescedEvents()
        : [event]

    let addedAny =
      false

    for (
      const pointerEvent of
        pointerEvents
    ) {
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

        addedAny =
          true
      }
    }

    if (!addedAny) {
      return
    }

    renderCanvas()

    const now =
      performance.now()

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

    const canvas =
      canvasRef.current

    if (canvas) {
      const pointerEvents =
        typeof event.getCoalescedEvents ===
        "function"
          ? event.getCoalescedEvents()
          : [event]

      for (
        const pointerEvent of
          pointerEvents
      ) {
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

    sendPendingPoints()

    drawingRef.current =
      false

    const stroke =
      currentStrokeRef.current

    currentStrokeRef.current =
      null

    pendingPointsRef.current =
      []

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
      // Pointer capture may already be released.
    }

    if (!stroke) {
      renderCanvas()
      return
    }

    if (
      !Array.isArray(
        stroke.points
      ) ||
      stroke.points.length === 0
    ) {
      renderCanvas()
      return
    }

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
    drawingRef.current =
      false

    currentStrokeRef.current =
      null

    pendingPointsRef.current =
      []

    try {
      const canvas =
        canvasRef.current

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
  // Live drawing - start
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

        type:
          stroke.type ||
          "stroke",

        points: [
          ...stroke.points,
        ],

        color:
          stroke.color,

        width:
          stroke.width,
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
      pendingPointsRef.current =
        []

      lastLiveUpdateRef.current =
        performance.now()

      return
    }

    callback({
      type: "points",

      stroke: {
        id: stroke.id,

        type:
          stroke.type ||
          "stroke",

        points: [
          ...points,
        ],

        color:
          stroke.color,

        width:
          stroke.width,
      },
    })

    pendingPointsRef.current =
      []

    lastLiveUpdateRef.current =
      performance.now()
  }

  // --------------------------------------------------------------------------
  // Bucket fill
  // --------------------------------------------------------------------------

  function handleBucketFill(point) {
    if (!canDrawRef.current) {
      return
    }

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const operation = {
      id: createStrokeId(),

      type: "fill",

      point: [
        point[0],
        point[1],
      ],

      color:
        strokeColorRef.current,
    }

    // Render the drawing first so the flood-fill operates on the
    // exact current visual state.
    renderCanvas()

    // Apply immediately to the local canvas.
    applyFillOperation(
      canvas,
      operation
    )

    // Keep the operation around until the server sends it back.
    localOperationsRef.current.push(
      operation
    )

    renderCanvas()

    if (
      typeof onStrokeRef.current ===
      "function"
    ) {
      onStrokeRef.current(
        operation
      )
    }
  }

  // --------------------------------------------------------------------------
  // Renderer
  // --------------------------------------------------------------------------

  function renderCanvas() {
    const canvas =
      canvasRef.current

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

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    )

    context.globalCompositeOperation =
      "source-over"

    context.clearRect(
      0,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    )

    // ------------------------------------------------------------------------
    // White drawing surface
    // ------------------------------------------------------------------------

    context.fillStyle =
      "#ffffff"

    context.fillRect(
      0,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    )

    context.lineCap =
      "round"

    context.lineJoin =
      "round"

    context.miterLimit =
      2

    context.imageSmoothingEnabled =
      true


    // ------------------------------------------------------------------------
    // Server-authoritative operations
    // ------------------------------------------------------------------------
    //
    // Draw the complete operation history first.
    //
    // Fills are intentionally included here because they need the existing
    // rasterized drawing as their boundary.
    //
    // ------------------------------------------------------------------------

    for (
      const operation of
        strokesRef.current
    ) {
      drawOperation(
        context,
        operation
      )
    }

    // ------------------------------------------------------------------------
    // Locally pending operations
    // ------------------------------------------------------------------------

    for (
      const operation of
        localOperationsRef.current
    ) {
      const existsOnServer =
        strokesRef.current.some(
          (stroke) =>
            stroke?.id ===
            operation?.id
        )

      if (!existsOnServer) {
        drawOperation(
          context,
          operation
        )
      }
    }


    // ------------------------------------------------------------------------
    // Active pencil / eraser stroke
    // ------------------------------------------------------------------------

    const activeStroke =
      currentStrokeRef.current

    if (
      drawingRef.current &&
      activeStroke
    ) {
      drawOperation(
        context,
        activeStroke
      )
    }

    context.globalCompositeOperation =
      "source-over"
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

    const lastOperation =
      current[
        current.length - 1
      ]

    if (!lastOperation?.id) {
      return
    }

    if (
      typeof onUndoRef.current ===
      "function"
    ) {
      onUndoRef.current(
        lastOperation.id
      )
    }
  }

  // --------------------------------------------------------------------------
  // Tool selection
  // --------------------------------------------------------------------------

  function selectPencil() {
    setTool(
      TOOLS.PENCIL
    )
  }

  function selectEraser() {
    setTool(
      TOOLS.ERASER
    )
  }

  function selectBucket() {
    setTool(
      TOOLS.BUCKET
    )
  }

  // --------------------------------------------------------------------------
  // Color selection
  // --------------------------------------------------------------------------

  function selectColor(color) {
    setStrokeColor(color)

    // Choosing a color automatically returns to pencil mode.
    setTool(
      TOOLS.PENCIL
    )
  }

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  function handleClear() {
    if (!canDrawRef.current) {
      return
    }

    if (
      typeof onClearRef.current !==
      "function"
    ) {
      return
    }

    if (
      !strokesRef.current ||
      strokesRef.current.length ===
        0
    ) {
      return
    }

    const confirmed =
      window.confirm(
        "Clear the entire drawing?"
      )

    if (!confirmed) {
      return
    }

    localOperationsRef.current =
      []

    onClearRef.current()
  }

  // --------------------------------------------------------------------------
  // Cursor helpers
  // --------------------------------------------------------------------------

  const isDesktopPointer =
    typeof window !==
      "undefined" &&
    window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches

  const showBrushCursor =
    canDraw &&
    cursorPosition &&
    isDesktopPointer &&
    tool !== TOOLS.BUCKET

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-white shadow-2xl">

      {/* ==================================================================== */}
      {/* Drawing toolbar                                                     */}
      {/* ==================================================================== */}

      {canDraw && (
        <div className="border-b border-zinc-200 bg-zinc-100">

          <div className="flex min-w-0 flex-col">

            {/* ================================================================ */}
            {/* Color row                                                        */}
            {/* ================================================================ */}

            <div className="flex min-w-0 items-center gap-2 px-3 py-2">

              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Color
              </span>

              <div
                className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
                style={{
                  scrollbarWidth:
                    "none",

                  WebkitOverflowScrolling:
                    "touch",
                }}
              >
                <div className="flex w-max items-center gap-2 pr-2">

                  {COLORS.map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() =>
                          selectColor(
                            color
                          )
                        }
                        aria-label={`Choose ${color}`}
                        aria-pressed={
                          strokeColor ===
                            color &&
                          tool ===
                            TOOLS.PENCIL
                        }
                        className={`relative h-8 w-8 shrink-0 rounded-full border-2 transition-transform ${
                          strokeColor ===
                            color &&
                          tool ===
                            TOOLS.PENCIL
                            ? "scale-110 border-zinc-900"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{
                          backgroundColor:
                            color,
                        }}
                      >
                        {color ===
                          "#ffffff" && (
                          <span className="absolute inset-0 rounded-full border border-zinc-300" />
                        )}
                      </button>
                    )
                  )}

                </div>
              </div>
            </div>

            {/* ================================================================ */}
            {/* Tools row                                                        */}
            {/* ================================================================ */}

            <div className="flex items-center gap-2 overflow-x-auto border-t border-zinc-200 px-3 py-2">

              {/* Size */}

              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Size
              </span>

              <div className="flex shrink-0 items-center gap-1">

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
                      aria-label={`Choose ${option.label} brush`}
                      aria-pressed={
                        strokeWidth ===
                          option.value &&
                        tool !==
                          TOOLS.BUCKET
                      }
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                        strokeWidth ===
                            option.value &&
                        tool !==
                            TOOLS.BUCKET
                          ? "bg-zinc-900 text-white"
                          : "bg-white text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      <span
                        className="block rounded-full bg-current"
                        style={{
                          width:
                            Math.min(
                              option.value,
                              20
                            ),

                          height:
                            Math.min(
                              option.value,
                              20
                            ),
                        }}
                      />
                    </button>
                  )
                )}

              </div>

              <div className="mx-1 h-7 w-px shrink-0 bg-zinc-300" />

              {/* Pencil */}

              <button
                type="button"
                onClick={
                  selectPencil
                }
                aria-label="Pencil"
                aria-pressed={
                  tool ===
                  TOOLS.PENCIL
                }
                className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${
                  tool ===
                  TOOLS.PENCIL
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                <Pencil
                  size={16}
                />

                <span>
                  Pencil
                </span>
              </button>

              {/* Eraser */}

              <button
                type="button"
                onClick={
                  selectEraser
                }
                aria-label="Eraser"
                aria-pressed={
                  tool ===
                  TOOLS.ERASER
                }
                className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${
                  tool ===
                  TOOLS.ERASER
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                <Eraser
                  size={16}
                />

                <span>
                  Eraser
                </span>
              </button>

              {/* Bucket */}

              <button
                type="button"
                onClick={
                  selectBucket
                }
                aria-label="Fill bucket"
                aria-pressed={
                  tool ===
                  TOOLS.BUCKET
                }
                className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${
                  tool ===
                  TOOLS.BUCKET
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                <PaintBucket
                  size={16}
                />

                <span>
                  Fill
                </span>
              </button>

              <div className="mx-1 h-7 w-px shrink-0 bg-zinc-300" />

              {/* Undo */}

              <button
                type="button"
                onClick={
                  handleUndo
                }
                disabled={
                  !strokes ||
                  strokes.length ===
                    0
                }
                aria-label="Undo last drawing operation"
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw
                  size={16}
                />

                <span>
                  Undo
                </span>
              </button>

              {/* Clear */}

              <button
                type="button"
                onClick={
                  handleClear
                }
                disabled={
                  !strokes ||
                  strokes.length ===
                    0 ||
                  typeof onClear !==
                    "function"
                }
                aria-label="Clear drawing"
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2
                  size={16}
                />

                <span>
                  Clear
                </span>
              </button>

            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* Canvas                                                               */}
      {/* ==================================================================== */}

      <div className="relative">

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={`block h-auto w-full ${
            canDraw
              ? "cursor-none touch-none"
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

        {/* ================================================================ */}
        {/* Desktop brush cursor                                             */}
        {/* ================================================================ */}

        {showBrushCursor && (
          <div
            className="pointer-events-none absolute rounded-full border-2 border-zinc-900"
            style={{
              left:
                cursorPosition.x,

              top:
                cursorPosition.y,

              width:
                tool ===
                  TOOLS.ERASER
                  ? Math.max(
                      strokeWidth * 2,
                      12
                    )
                  : strokeWidth,

              height:
                tool ===
                  TOOLS.ERASER
                  ? Math.max(
                      strokeWidth * 2,
                      12
                    )
                  : strokeWidth,

              transform:
                "translate(-50%, -50%)",

              backgroundColor:
                tool ===
                  TOOLS.ERASER
                  ? "rgba(255,255,255,0.45)"
                  : `${strokeColor}22`,
            }}
          />
        )}

        {/* ================================================================ */}
        {/* Bucket cursor                                                    */}
        {/* ================================================================ */}

        {canDraw &&
          cursorPosition &&
          isDesktopPointer &&
          tool ===
            TOOLS.BUCKET && (
            <div
              className="pointer-events-none absolute flex h-9 w-9 items-center justify-center rounded-lg border-2 border-zinc-900 bg-white/80 shadow-sm"
              style={{
                left:
                  cursorPosition.x,

                top:
                  cursorPosition.y,

                transform:
                  "translate(-50%, -50%)",
              }}
            >
              <PaintBucket
                size={17}
                className="text-zinc-900"
              />
            </div>
          )}

      </div>
    </div>
  )
}

// ==============================================================================
// Drawing operation renderer
// ==============================================================================

function drawOperation(
  context,
  operation
) {
  if (!operation) {
    return
  }

  const type =
    operation.type ||
    "stroke"

  // --------------------------------------------------------------------------
  // Fill
  // --------------------------------------------------------------------------

  if (type === "fill") {
    applyFillOperation(
      context.canvas,
      operation
    )

    return
  }

  // --------------------------------------------------------------------------
  // Stroke / Eraser
  // --------------------------------------------------------------------------

  drawStroke(
    context,
    operation
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

  const isEraser =
    stroke?.type ===
    "eraser"

  const color =
    stroke.color ||
    DEFAULT_COLOR

  const width =
    Number(stroke.width) ||
    DEFAULT_WIDTH

  context.save()

  if (isEraser) {
    // ------------------------------------------------------------------------
    // REAL ERASER
    //
    // This removes pixels rather than drawing white pixels.
    // ------------------------------------------------------------------------

    context.globalCompositeOperation =
      "destination-out"
  } else {
    context.globalCompositeOperation =
      "source-over"
  }

  context.strokeStyle =
    color

  context.fillStyle =
    color

  context.lineWidth =
    width

  context.lineCap =
    "round"

  context.lineJoin =
    "round"

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

    context.restore()

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

    context.restore()

    return
  }

  // --------------------------------------------------------------------------
  // Three or more points
  // --------------------------------------------------------------------------

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
      (currentX + nextX) / 2

    const midpointY =
      (currentY + nextY) / 2

    context.quadraticCurveTo(
      currentX,
      currentY,
      midpointX,
      midpointY
    )
  }

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

  context.restore()
}

// ==============================================================================
// Flood fill
// ==============================================================================
//
// The canvas is rendered at device-pixel resolution, so flood fill must work
// against the actual backing-store dimensions rather than the logical
// 1200 × 1200 drawing coordinates.
//
// The fill uses two tolerances:
//
//   FILL_TOLERANCE
//     Pixels that clearly belong to the region are included.
//
//   FILL_EDGE_TOLERANCE
//     Anti-aliased pixels immediately adjacent to the region are allowed
//     to be painted so we don't leave a thin white halo around outlines.
//
// We deliberately keep the edge tolerance well below the difference between
// a white interior pixel and a dark outline pixel, preventing normal outlines
// from being crossed.
// ==============================================================================


function applyFillOperation(
  canvas,
  operation
) {
  if (
    !canvas ||
    operation?.type !== "fill"
  ) {
    return
  }

  const point =
    Array.isArray(operation.point)
      ? operation.point
      : null

  if (
    !point ||
    point.length !== 2
  ) {
    return
  }

  const context =
    canvas.getContext("2d")

  if (!context) {
    return
  }

  // --------------------------------------------------------------------------
  // Actual backing-store dimensions
  // --------------------------------------------------------------------------

  const width =
    canvas.width

  const height =
    canvas.height

  if (
    width <= 0 ||
    height <= 0
  ) {
    return
  }

  // --------------------------------------------------------------------------
  // Normalized point -> backing-store pixel
  // --------------------------------------------------------------------------

  const x = clamp(
    Math.floor(
      point[0] * width
    ),
    0,
    width - 1
  )

  const y = clamp(
    Math.floor(
      point[1] * height
    ),
    0,
    height - 1
  )

  // --------------------------------------------------------------------------
  // Read the actual raster
  // --------------------------------------------------------------------------

  const image =
    context.getImageData(
      0,
      0,
      width,
      height
    )

  const data =
    image.data

  const startIndex =
    (y * width + x) * 4

  const targetR =
    data[startIndex]

  const targetG =
    data[startIndex + 1]

  const targetB =
    data[startIndex + 2]

  const targetA =
    data[startIndex + 3]

  const fillRgb =
    hexToRgb(
      operation.color ||
        DEFAULT_COLOR
    )

  if (!fillRgb) {
    return
  }

  // --------------------------------------------------------------------------
  // Nothing to do if we're already on the fill color.
  // --------------------------------------------------------------------------

  if (
    colorWithinTolerance(
      targetR,
      targetG,
      targetB,
      targetA,
      fillRgb.r,
      fillRgb.g,
      fillRgb.b,
      255,
      FILL_TOLERANCE
    )
  ) {
    return
  }

  const pixelCount =
    width * height

  const visited =
    new Uint8Array(
      pixelCount
    )

  const queue =
    new Int32Array(
      pixelCount
    )

  let head = 0
  let tail = 0

  const startPixel =
    y * width + x

  queue[tail++] =
    startPixel

  visited[startPixel] =
    1

  // --------------------------------------------------------------------------
  // First pass: find the actual region.
  // --------------------------------------------------------------------------

  while (
    head < tail
  ) {
    const pixel =
      queue[head++]

    const px =
      pixel % width

    const py =
      Math.floor(
        pixel / width
      )

    const index =
      pixel * 4

    const r =
      data[index]

    const g =
      data[index + 1]

    const b =
      data[index + 2]

    const a =
      data[index + 3]

    if (
      !colorWithinTolerance(
        r,
        g,
        b,
        a,
        targetR,
        targetG,
        targetB,
        targetA,
        FILL_TOLERANCE
      )
    ) {
      continue
    }

    // Paint the actual region immediately.
    data[index] =
      fillRgb.r

    data[index + 1] =
      fillRgb.g

    data[index + 2] =
      fillRgb.b

    data[index + 3] =
      255

    // ------------------------------------------------------------------------
    // Neighbors
    // ------------------------------------------------------------------------

    if (px > 0) {
      tail =
        addFillNeighbor(
          pixel - 1,
          targetR,
          targetG,
          targetB,
          targetA,
          data,
          visited,
          queue,
          tail,
          width
        )
    }

    if (px < width - 1) {
      tail =
        addFillNeighbor(
          pixel + 1,
          targetR,
          targetG,
          targetB,
          targetA,
          data,
          visited,
          queue,
          tail,
          width
        )
    }

    if (py > 0) {
      tail =
        addFillNeighbor(
          pixel - width,
          targetR,
          targetG,
          targetB,
          targetA,
          data,
          visited,
          queue,
          tail,
          width
        )
    }

    if (py < height - 1) {
      tail =
        addFillNeighbor(
          pixel + width,
          targetR,
          targetG,
          targetB,
          targetA,
          data,
          visited,
          queue,
          tail,
          width
        )
    }
  }

  // --------------------------------------------------------------------------
  // Second pass: cover the anti-aliased fringe.
  //
  // We inspect pixels immediately surrounding the filled region. A fringe
  // pixel is only accepted when it is reasonably close to the original
  // target color AND is adjacent to a pixel that we actually filled.
  //
  // This is what removes the thin white halo without allowing the bucket to
  // walk through the dark outline.
  // --------------------------------------------------------------------------

  const fringe =
    []

  for (
    let pixel = 0;
    pixel < pixelCount;
    pixel++
  ) {
    if (!visited[pixel]) {
      continue
    }

    const px =
      pixel % width

    const py =
      Math.floor(
        pixel / width
      )

    if (px > 0) {
      collectFillFringe(
        pixel - 1,
        targetR,
        targetG,
        targetB,
        targetA,
        data,
        visited,
        fringe,
        fillRgb
      )
    }

    if (px < width - 1) {
      collectFillFringe(
        pixel + 1,
        targetR,
        targetG,
        targetB,
        targetA,
        data,
        visited,
        fringe,
        fillRgb
      )
    }

    if (py > 0) {
      collectFillFringe(
        pixel - width,
        targetR,
        targetG,
        targetB,
        targetA,
        data,
        visited,
        fringe,
        fillRgb
      )
    }

    if (py < height - 1) {
      collectFillFringe(
        pixel + width,
        targetR,
        targetG,
        targetB,
        targetA,
        data,
        visited,
        fringe,
        fillRgb
      )
    }
  }

  // --------------------------------------------------------------------------
  // Paint the fringe.
  // --------------------------------------------------------------------------

  for (
    const pixel of fringe
  ) {
    const index =
      pixel * 4

    data[index] =
      fillRgb.r

    data[index + 1] =
      fillRgb.g

    data[index + 2] =
      fillRgb.b

    data[index + 3] =
      255
  }

  context.putImageData(
    image,
    0,
    0
  )
}

// ==============================================================================
// Flood-fill neighbor
// ==============================================================================

function addFillNeighbor(
  pixel,
  targetR,
  targetG,
  targetB,
  targetA,
  data,
  visited,
  queue,
  queueIndex,
  width
) {
  if (
    visited[pixel]
  ) {
    return queueIndex
  }

  const index =
    pixel * 4

  const r =
    data[index]

  const g =
    data[index + 1]

  const b =
    data[index + 2]

  const a =
    data[index + 3]

  if (
    !colorWithinTolerance(
      r,
      g,
      b,
      a,
      targetR,
      targetG,
      targetB,
      targetA,
      FILL_TOLERANCE
    )
  ) {
    return queueIndex
  }

  visited[pixel] =
    1

  queue[queueIndex] =
    pixel

  return queueIndex + 1
}

// ==============================================================================
// Anti-aliased fill fringe
// ==============================================================================


function collectFillFringe(
  pixel,
  targetR,
  targetG,
  targetB,
  targetA,
  data,
  visited,
  fringe,
  fillRgb
) {
  if (
    visited[pixel]
  ) {
    return
  }

  const index =
    pixel * 4

  const r =
    data[index]

  const g =
    data[index + 1]

  const b =
    data[index + 2]

  const a =
    data[index + 3]

  // The main flood fill already handles pixels that closely match the
  // original region. Here we only capture the slightly different,
  // anti-aliased pixels immediately surrounding that region.
  if (
    !colorWithinTolerance(
      r,
      g,
      b,
      a,
      targetR,
      targetG,
      targetB,
      targetA,
      FILL_EDGE_TOLERANCE
    )
  ) {
    return
  }

  if (
    colorWithinTolerance(
      r,
      g,
      b,
      a,
      targetR,
      targetG,
      targetB,
      targetA,
      FILL_TOLERANCE
    )
  ) {
    return
  }

  visited[pixel] =
    1

  fringe.push(
    pixel
  )
}

// ==============================================================================
// Color comparison
// ==============================================================================

function colorWithinTolerance(
  r1,
  g1,
  b1,
  a1,
  r2,
  g2,
  b2,
  a2,
  tolerance
) {
  return (
    Math.abs(r1 - r2) <=
      tolerance &&
    Math.abs(g1 - g2) <=
      tolerance &&
    Math.abs(b1 - b2) <=
      tolerance &&
    Math.abs(a1 - a2) <=
      tolerance
  )
}

// ==============================================================================
// Hex → RGB
// ==============================================================================

function hexToRgb(hex) {
  if (
    typeof hex !==
      "string"
  ) {
    return null
  }

  const match =
    hex.match(
      /^#([0-9a-f]{6})$/i
    )

  if (!match) {
    return null
  }

  const value =
    match[1]

  return {
    r: parseInt(
      value.slice(0, 2),
      16
    ),

    g: parseInt(
      value.slice(2, 4),
      16
    ),

    b: parseInt(
      value.slice(4, 6),
      16
    ),
  }
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
    (event.clientX -
      rect.left) /
    rect.width

  const y =
    (event.clientY -
      rect.top) /
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
    Math.max(
      min,
      value
    )
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