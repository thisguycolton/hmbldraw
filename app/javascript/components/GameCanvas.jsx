import { useEffect, useRef, useState } from "react"
import {
  ChevronDown,
  Circle,
  Eraser,
  Eye,
  EyeOff,
  Layers,
  PaintBucket,
  Pencil,
  PenLine,
  RotateCcw,
  Square,
  Trash2,
  Triangle,
  Undo2,
  MousePointer2,
  Minus,
  Anchor,
  Waves,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react"

import { hexToHsv, hsvToHex } from "./colorUtils"
import {
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_WIDTH,
  EDIT_TOOLS,
  SHAPE_TOOLS,
  STROKE_WIDTHS,
  TOOLS,
} from "./drawingConstants"

const CANVAS_SIZE = 1200
const CANVAS_WIDTH = CANVAS_SIZE
const CANVAS_HEIGHT = CANVAS_SIZE
const MAX_CANVAS_PIXEL_RATIO = 1.5

const LIVE_UPDATE_INTERVAL = 30
const MIN_POINT_DISTANCE = 0.0015

const FILL_TOLERANCE = 18
const PEN_SIMPLIFY_TOLERANCE = 0.0018
const PEN_MAX_POINTS = 450

function canvasPixelRatio() {
  if (typeof window === "undefined") return 1

  // The editor already renders into a 1200x1200 logical surface. Letting a
  // 3x mobile display turn each of the three canvases into 3600x3600 buffers
  // consumes well over 150 MB and makes Mobile Safari reload the page. A
  // modest cap stays crisp while keeping the editor comfortably responsive.
  return Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PIXEL_RATIO)
}

function shouldSnapPenClosed(points) {
  // Pen strokes are shape-like freeform paths. Once the user has supplied
  // enough points, we always close the path back to its starting point.
  // This intentionally does NOT require the pointer to return to the start.
  return Array.isArray(points) && points.length >= 3
}

function snapPenClosed(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return points
  }

  return [
    ...points.slice(0, -1),
    clonePoint(points[0]),
  ]
}

const ERASER_MIN_RADIUS = 0.012
const ERASER_MAX_RADIUS = 0.12

/*
 * ---------------------------------------------------------------------------
 * General geometry
 * ---------------------------------------------------------------------------
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function pointDistance(a, b) {
  return Math.hypot(
    a[0] - b[0],
    a[1] - b[1]
  )
}

function normalizedDistance(a, b) {
  return pointDistance(a, b)
}

function createStrokeId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`
}

function clonePoint(point) {
  return [
    point[0],
    point[1],
  ]
}

function clonePoints(points) {
  return Array.isArray(points)
    ? points.map(clonePoint)
    : []
}

function cloneOperation(operation) {
  if (!operation) {
    return null
  }

  return JSON.parse(JSON.stringify(operation))
}

/*
 * ---------------------------------------------------------------------------
 * RDP simplification
 * ---------------------------------------------------------------------------
 */

function perpendicularDistance(
  point,
  start,
  end
) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]

  if (dx === 0 && dy === 0) {
    return pointDistance(point, start)
  }

  const t = clamp(
    (
      (point[0] - start[0]) * dx +
      (point[1] - start[1]) * dy
    ) /
      (dx * dx + dy * dy),
    0,
    1
  )

  const projection = [
    start[0] + t * dx,
    start[1] + t * dy,
  ]

  return pointDistance(
    point,
    projection
  )
}

function simplifyRdp(points, tolerance) {
  if (points.length <= 2) {
    return points
  }

  let maxDistance = 0
  let index = 0

  const first = points[0]
  const last = points[points.length - 1]

  for (
    let i = 1;
    i < points.length - 1;
    i += 1
  ) {
    const distance =
      perpendicularDistance(
        points[i],
        first,
        last
      )

    if (distance > maxDistance) {
      index = i
      maxDistance = distance
    }
  }

  if (maxDistance > tolerance) {
    const left =
      simplifyRdp(
        points.slice(
          0,
          index + 1
        ),
        tolerance
      )

    const right =
      simplifyRdp(
        points.slice(index),
        tolerance
      )

    return [
      ...left.slice(0, -1),
      ...right,
    ]
  }

  return [
    first,
    last,
  ]
}

function resamplePoints(
  points,
  maxPoints
) {
  if (points.length <= maxPoints) {
    return points
  }

  const result = []

  for (
    let i = 0;
    i < maxPoints;
    i += 1
  ) {
    const index = Math.round(
      (
        i /
        (maxPoints - 1)
      ) *
        (points.length - 1)
    )

    result.push(
      points[index]
    )
  }

  return result
}

function preparePenPoints(points) {
  if (
    !Array.isArray(points) ||
    points.length <= 2
  ) {
    return points
  }

  const cleaned = [
    points[0],
  ]

  for (
    let i = 1;
    i < points.length;
    i += 1
  ) {
    if (
      pointDistance(
        points[i],
        cleaned[
          cleaned.length - 1
        ]
      ) >= 0.0008
    ) {
      cleaned.push(
        points[i]
      )
    }
  }

  if (cleaned.length <= 2) {
    return cleaned
  }

  const simplified =
    simplifyRdp(
      cleaned,
      PEN_SIMPLIFY_TOLERANCE
    )

  return resamplePoints(
    simplified,
    PEN_MAX_POINTS
  )
}

/*
 * ---------------------------------------------------------------------------
 * Bounds
 * ---------------------------------------------------------------------------
 */

function calculateBoundsFromPoints(
  points,
  padding = 0
) {
  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
  }

  let minX = points[0][0]
  let minY = points[0][1]
  let maxX = points[0][0]
  let maxY = points[0][1]

  for (
    const point of points
  ) {
    minX = Math.min(
      minX,
      point[0]
    )

    minY = Math.min(
      minY,
      point[1]
    )

    maxX = Math.max(
      maxX,
      point[0]
    )

    maxY = Math.max(
      maxY,
      point[1]
    )
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width:
      maxX -
      minX +
      padding * 2,
    height:
      maxY -
      minY +
      padding * 2,
  }
}

function calculateOperationBounds(
  operation
) {
  if (!operation) {
    return null
  }

  if (
    Array.isArray(
      operation.points
    )
  ) {
    return calculateBoundsFromPoints(
      operation.points
    )
  }

  if (
    operation.bounds
  ) {
    return {
      ...operation.bounds,
    }
  }

  if (
    operation.start &&
    operation.end
  ) {
    return calculateBoundsFromPoints([
      operation.start,
      operation.end,
    ])
  }

  return null
}

/*
 * ---------------------------------------------------------------------------
 * Shape geometry
 * ---------------------------------------------------------------------------
 */

function makeShapeOperation(
  shape,
  start,
  end,
  color,
  width,
  fill = null
) {
  const x1 = Math.min(
    start[0],
    end[0]
  )

  const y1 = Math.min(
    start[1],
    end[1]
  )

  let widthValue =
    Math.abs(
      end[0] -
      start[0]
    )

  let heightValue =
    Math.abs(
      end[1] -
      start[1]
    )

  if (
    shape === "square"
  ) {
    const size =
      Math.max(
        widthValue,
        heightValue
      )

    widthValue = size
    heightValue = size
  }

  const bounds = {
    x: x1,
    y: y1,
    width: widthValue,
    height: heightValue,
  }

  const operation = {
    id: createStrokeId(),
    type: "shape",
    shape,
    start: clonePoint(start),
    end: clonePoint(end),
    color,
    width,
    fill: fill || null,
    bounds,
  }

  // Keep concrete geometry in the payload as well as the parametric shape
  // data. This makes shape operations compatible with the generic drawing
  // persistence/validation path and gives Undo a real persisted operation.
  operation.points = shapePersistencePoints(operation)

  return operation
}

function shapePoints(
  operation
) {
  const bounds =
    operation?.bounds

  if (!bounds) {
    return []
  }

  const {
    x,
    y,
    width,
    height,
  } = bounds

  if (operation.shape === "triangle") {
    return [
      [x + width / 2, y],
      [x + width, y + height],
      [x, y + height],
    ]
  }

  return []
}

// Concrete geometry used for persistence/validation of parametric shapes.
// Rendering can remain parametric, but the saved operation also carries a
// valid points array so generic stroke validators cannot reject it.
function shapePersistencePoints(operation) {
  if (!operation?.bounds) return []

  const { x, y, width, height } = operation.bounds

  if (operation.shape === "line") {
    return [
      clonePoint(operation.start || [x, y]),
      clonePoint(operation.end || [x + width, y + height]),
    ]
  }

  if (operation.shape === "triangle") {
    const points = shapePoints(operation)
    return points.length >= 3
      ? [...points, clonePoint(points[0])]
      : []
  }

  if (operation.shape === "square") {
    return [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y],
    ]
  }

  if (operation.shape === "circle") {
    const cx = x + width / 2
    const cy = y + height / 2
    const rx = width / 2
    const ry = height / 2
    const points = []
    const segments = 48

    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2
      points.push([
        cx + Math.cos(angle) * rx,
        cy + Math.sin(angle) * ry,
      ])
    }

    return points
  }

  return []
}

/*
 * ---------------------------------------------------------------------------
 * Eraser geometry
 * ---------------------------------------------------------------------------
 */

function distanceToSegment(
  point,
  start,
  end
) {
  const dx =
    end[0] -
    start[0]

  const dy =
    end[1] -
    start[1]

  if (
    dx === 0 &&
    dy === 0
  ) {
    return pointDistance(
      point,
      start
    )
  }

  const t = clamp(
    (
      (
        point[0] -
        start[0]
      ) *
        dx +
      (
        point[1] -
        start[1]
      ) *
        dy
    ) /
      (
        dx * dx +
        dy * dy
      ),
    0,
    1
  )

  return pointDistance(
    point,
    [
      start[0] +
        dx * t,
      start[1] +
        dy * t,
    ]
  )
}

function pointToPolylineDistance(
  point,
  points
) {
  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return Infinity
  }

  if (points.length === 1) {
    return pointDistance(
      point,
      points[0]
    )
  }

  let minimum = Infinity

  for (
    let i = 1;
    i < points.length;
    i += 1
  ) {
    minimum = Math.min(
      minimum,
      distanceToSegment(
        point,
        points[i - 1],
        points[i]
      )
    )
  }

  return minimum
}

/*
 * Erase a polyline by removing points inside the eraser radius.
 *
 * We intentionally preserve multiple surviving segments. That means a
 * partially erased Pen becomes multiple visual pieces without needing
 * rasterization.
 */
function erasePolyline(
  points,
  eraserPoint,
  radius
) {
  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return []
  }

  const sampledPoints = [clonePoint(points[0])]

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1]
    const end = points[i]
    const steps = Math.min(
      100,
      Math.max(1, Math.ceil(pointDistance(start, end) / Math.max(radius / 2, 0.001)))
    )

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps
      sampledPoints.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ])
    }
  }

  // Round-trip payloads are capped at 5,000 points by the channel. Keep the
  // local preview within the same limit so canonical reconciliation cannot
  // subtly change a very long erased path.
  const workingPoints =
    sampledPoints.length > 5000
      ? resamplePoints(sampledPoints, 5000)
      : sampledPoints
  const survivingSegments = []
  let current = []

  for (
    let i = 0;
    i < workingPoints.length;
    i += 1
  ) {
    const point =
      workingPoints[i]

    const distance =
      pointDistance(
        point,
        eraserPoint
      )

    if (
      distance > radius
    ) {
      current.push(
        clonePoint(point)
      )
    } else {
      if (
        current.length > 0
      ) {
        survivingSegments.push(
          current
        )
        current = []
      }
    }
  }

  if (
    current.length > 0
  ) {
    survivingSegments.push(
      current
    )
  }

  /*
   * A point-only test can leave a segment whose middle crosses the eraser.
   * Remove tiny fragments that are unlikely to be visually meaningful.
   */
  return survivingSegments.filter(
    (segment) =>
      segment.length >= 2
  )
}

function convertShapeToPath(
  operation
) {
  if (!operation) {
    return null
  }

  if (Array.isArray(operation.points) && operation.points.length >= 2) {
    return clonePoints(operation.points)
  }

  if (
    operation.shape ===
    "line"
  ) {
    return [operation.start, operation.end].filter(Boolean).map(clonePoint)
  }

  if (
    operation.shape ===
    "triangle"
  ) {
    return shapePoints(
      operation
    )
  }

  const bounds =
    operation.bounds

  if (!bounds) {
    return null
  }

  const {
    x,
    y,
    width,
    height,
  } = bounds

  const steps = 64
  const points = []

  if (
    operation.shape ===
    "circle"
  ) {
    const cx =
      x + width / 2

    const cy =
      y + height / 2

    const rx =
      width / 2

    const ry =
      height / 2

    for (
      let i = 0;
      i <= steps;
      i += 1
    ) {
      const angle =
        (
          i /
          steps
        ) *
        Math.PI *
        2

      points.push([
        cx +
          Math.cos(angle) *
            rx,

        cy +
          Math.sin(angle) *
            ry,
      ])
    }

    return points
  }

  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y],
  ]
}

function prepareEditableOperation(operation, pathMode = "linear") {
  const editable = cloneOperation(operation)

  if (editable.type === "shape") {
    editable.type = "stroke"
    editable.pen = false
    editable.points = clonePoints(
      Array.isArray(editable.points) && editable.points.length >= 2
        ? editable.points
        : convertShapeToPath(editable)
    )
    editable.closed = editable.shape !== "line"
    editable.pathMode = pathMode
    editable.bounds = calculateBoundsFromPoints(editable.points)
  } else if (pathMode === "smooth") {
    editable.pathMode = "smooth"
  }

  return editable
}

function eraseOperation(
  operation,
  eraserPoint,
  radius
) {
  if (!operation) {
    return null
  }

  /*
   * Closed Pen fill is a vector property. When the eraser is inside the
   * filled region, remove the fill property first instead of treating the
   * interior click as an anchor/path hit.
   */
  if (
    operation.pen &&
    operation.fill &&
    Array.isArray(operation.points) &&
    operation.points.length >= 3 &&
    pointInPolygon(
      eraserPoint,
      operation.points
    )
  ) {
    return {
      operation: {
        ...cloneOperation(operation),
        fill: null,
      },
    }
  }

  /*
   * Normal freehand/Pen operation.
   */
  if (
    Array.isArray(
      operation.points
    ) &&
    operation.type !== "shape"
  ) {
    const segments =
      erasePolyline(
        operation.points,
        eraserPoint,
        radius
      )

    if (
      segments.length === 0
    ) {
      return {
        deleted: true,
      }
    }

    return {
      operation: {
        ...cloneOperation(
          operation
        ),
        points:
          segments[0],
        bounds:
          calculateBoundsFromPoints(
            segments[0]
          ),
      },

      additionalSegments:
        segments
          .slice(1)
          .map(
            (points) => ({
              ...cloneOperation(
                operation
              ),

              id:
                createStrokeId(),

              points,

              bounds:
                calculateBoundsFromPoints(
                  points
                ),
            })
          ),
    }
  }

  /*
   * Shapes become paths when touched by the eraser.
   */
  if (
    operation.type ===
    "shape"
  ) {
    const points =
      convertShapeToPath(
        operation
      )

    if (
      !points ||
      points.length < 2
    ) {
      return null
    }

    const segments =
      erasePolyline(
        points,
        eraserPoint,
        radius
      )

    if (
      segments.length === 0
    ) {
      return {
        deleted: true,
      }
    }

    return {
      operation: {
        id: operation.id,
        type: "stroke",
        color:
          operation.color ||
          DEFAULT_COLOR,
        width:
          operation.width ||
          DEFAULT_WIDTH,
        points:
          segments[0],
        bounds:
          calculateBoundsFromPoints(
            segments[0]
          ),
      },

      additionalSegments:
        segments
          .slice(1)
          .map(
            (points) => ({
              id:
                createStrokeId(),

              type: "stroke",

              color:
                operation.color ||
                DEFAULT_COLOR,

              width:
                operation.width ||
                DEFAULT_WIDTH,

              points,

              bounds:
                calculateBoundsFromPoints(
                  points
                ),
            })
          ),
    }
  }

  return null
}

/*
 * ---------------------------------------------------------------------------
 * Path / hit testing
 * ---------------------------------------------------------------------------
 */

function operationContainsPoint(
  context,
  operation,
  point
) {
  if (!operation) {
    return false
  }

  const x =
    point[0] *
    CANVAS_WIDTH

  const y =
    point[1] *
    CANVAS_HEIGHT

  /*
   * Shape hit testing.
   */
  if (
    operation.type ===
    "shape"
  ) {
    const bounds =
      operation.bounds

    if (!bounds) {
      return false
    }

    const bx =
      bounds.x *
      CANVAS_WIDTH

    const by =
      bounds.y *
      CANVAS_HEIGHT

    const bw =
      bounds.width *
      CANVAS_WIDTH

    const bh =
      bounds.height *
      CANVAS_HEIGHT

    if (
      operation.shape ===
      "circle"
    ) {
      const cx =
        bx + bw / 2

      const cy =
        by + bh / 2

      const rx =
        Math.max(
          bw / 2,
          1
        )

      const ry =
        Math.max(
          bh / 2,
          1
        )

      return (
        (
          (x - cx) /
            rx
        ) **
          2 +
        (
          (y - cy) /
            ry
        ) **
          2 <=
        1
      )
    }

    if (
      operation.shape ===
      "square"
    ) {
      return (
        x >= bx &&
        x <= bx + bw &&
        y >= by &&
        y <= by + bh
      )
    }

    if (
      operation.shape ===
      "triangle"
    ) {
      const points =
        shapePoints(
          operation
        )

      return pointInPolygon(
        point,
        points
      )
    }

    if (
      operation.shape ===
      "line"
    ) {
      return (
        pointToPolylineDistance(
          point,
          [
            operation.start,
            operation.end,
          ]
        ) <=
        Math.max(
          0.015,
          (
            operation.width ||
            DEFAULT_WIDTH
          ) /
            CANVAS_SIZE
        )
      )
    }
  }

  /*
   * Stroke / Pen.
   */
  if (
    Array.isArray(
      operation.points
    )
  ) {
    if (
      operation.closed &&
      operation.fill &&
      operation.points.length >= 3 &&
      pointInPolygon(point, operation.points)
    ) {
      return true
    }

    const threshold =
      Math.max(
        0.012,
        (
          operation.width ||
          DEFAULT_WIDTH
        ) /
          CANVAS_SIZE *
          1.8
      )

    return (
      pointToPolylineDistance(
        point,
        operation.points
      ) <= threshold
    )
  }

  return false
}

function pointInPolygon(
  point,
  polygon
) {
  let inside = false

  for (
    let i = 0, j =
      polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const xi =
      polygon[i][0]

    const yi =
      polygon[i][1]

    const xj =
      polygon[j][0]

    const yj =
      polygon[j][1]

    const intersects =
      yi > point[1] !==
        yj > point[1] &&
      point[0] <
        (
          (
            xj - xi
          ) *
            (
              point[1] -
              yi
            )
        ) /
          (
            yj - yi
          ) +
        xi

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

/*
 * ---------------------------------------------------------------------------
 * Game canvas
 * ---------------------------------------------------------------------------
 */

export default function GameCanvas({
  roundId,
  strokes,
  liveStrokes = {},
  canDraw,
  onStroke,
  onLiveStroke,
  onUndo,
  onClear,
  mobileViewport = false,
}) {
  const [strokeColor, setStrokeColor] =
    useState(DEFAULT_COLOR)

  const [fillColor, setFillColor] =
    useState(DEFAULT_COLOR)

  const [colorTarget, setColorTarget] =
    useState("stroke")

  const [showColorPicker, setShowColorPicker] =
    useState(false)

  const [pickerHue, setPickerHue] =
    useState(0)

  const [recentColors, setRecentColors] =
    useState(() => [...COLORS])

  const [strokeWidth, setStrokeWidth] =
    useState(DEFAULT_WIDTH)

  const [tool, setTool] =
    useState(TOOLS.PENCIL)

  const [cursorPosition, setCursorPosition] =
    useState(null)

  const [selectedOperationId, setSelectedOperationId] =
    useState(null)

  const [selectedAnchorIndex, setSelectedAnchorIndex] =
    useState(null)

  const [showShapeMenu, setShowShapeMenu] =
    useState(false)

  const [showEditMenu, setShowEditMenu] =
    useState(false)

  const [showLayers, setShowLayers] =
    useState(false)

  const canvasRef =
    useRef(null)

  const overlayCanvasRef =
    useRef(null)

  const liveCanvasRef =
    useRef(null)

  const canvasViewportRef =
    useRef(null)

  const canvasStageRef =
    useRef(null)

  const stageSizeRef =
    useRef(0)

  const viewportPointersRef =
    useRef(new Map())

  const viewportGestureRef =
    useRef(null)

  const suppressTouchRef =
    useRef(false)

  const viewportTransformRef =
    useRef({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    })

  const editRenderFrameRef =
    useRef(null)

  const cursorFrameRef =
    useRef(null)

  const pendingCursorRef =
    useRef(null)

  const drawingRef =
    useRef(false)

  const currentStrokeRef =
    useRef(null)

  const currentShapeRef =
    useRef(null)

  const pendingPointsRef =
    useRef([])

  const lastLiveUpdateRef =
    useRef(0)

  const strokesRef =
    useRef(
      Array.isArray(strokes)
        ? strokes
        : []
    )

  const activeRoundIdRef =
    useRef(roundId)

  const localOperationsRef =
    useRef([])

  // Resolved drawing is immutable between commits/server updates. Cache it
  // so selection and edit pointer moves do not repeatedly deep-clone every
  // stroke in the room.
  const resolvedCacheRef =
    useRef({
      server: null,
      localVersion: 0,
      operations: [],
    })

  const localVersionRef =
    useRef(0)

  const canDrawRef =
    useRef(canDraw)

  const strokeColorRef =
    useRef(strokeColor)

  const fillColorRef =
    useRef(fillColor)

  const colorTargetRef =
    useRef(colorTarget)

  const strokeWidthRef =
    useRef(strokeWidth)

  const toolRef =
    useRef(tool)

  const selectedOperationIdRef =
    useRef(selectedOperationId)

  const selectedAnchorIndexRef =
    useRef(selectedAnchorIndex)

  const onStrokeRef =
    useRef(onStroke)

  const onLiveStrokeRef =
    useRef(onLiveStroke)

  const onUndoRef =
    useRef(onUndo)

  const onClearRef =
    useRef(onClear)

  const editRef =
    useRef(null)

  const eraseEditRef =
    useRef(null)

  useEffect(() => {
    if (activeRoundIdRef.current === roundId) return

    activeRoundIdRef.current = roundId
    localOperationsRef.current = []
    localVersionRef.current += 1
    resolvedCacheRef.current.server = null
    drawingRef.current = false
    currentStrokeRef.current = null
    currentShapeRef.current = null
    editRef.current = null
    eraseEditRef.current = null
    selectedOperationIdRef.current = null
    selectedAnchorIndexRef.current = null
    viewportPointersRef.current.clear()
    viewportGestureRef.current = null
    suppressTouchRef.current = false
    resetViewportTransform()
    setSelectedOperationId(null)
    setSelectedAnchorIndex(null)
  }, [roundId])

  useEffect(() => {
    strokesRef.current =
      Array.isArray(strokes)
        ? strokes
        : []

    const serverIds =
      new Set(
        strokesRef.current
          .map(
            (operation) =>
              operation?.id
          )
          .filter(Boolean)
      )

    localOperationsRef.current =
      localOperationsRef.current.filter(
        (operation) =>
          !serverIds.has(
            operation.id
          )
      )

    localVersionRef.current += 1
    resolvedCacheRef.current.server = null

    renderCanvas()
  }, [strokes])

  useEffect(() => {
    renderLiveCanvas()
  }, [liveStrokes])

  useEffect(() => {
    canDrawRef.current =
      canDraw
  }, [canDraw])

  useEffect(() => {
    strokeColorRef.current =
      strokeColor
  }, [strokeColor])

  useEffect(() => {
    fillColorRef.current =
      fillColor
  }, [fillColor])

  useEffect(() => {
    colorTargetRef.current =
      colorTarget
  }, [colorTarget])

  useEffect(() => {
    strokeWidthRef.current =
      strokeWidth
  }, [strokeWidth])

  useEffect(() => {
    toolRef.current =
      tool
    renderOverlay()
  }, [tool])

  useEffect(() => {
    selectedOperationIdRef.current =
      selectedOperationId

    renderOverlay()
  }, [selectedOperationId])

  useEffect(() => {
    selectedAnchorIndexRef.current =
      selectedAnchorIndex

    renderOverlay()
  }, [selectedAnchorIndex])

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

  useEffect(() => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    setupCanvas()

    const handleResize =
      () => setupCanvas()

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

  useEffect(() => {
    if (!mobileViewport) return

    const viewport = canvasViewportRef.current
    const stage = canvasStageRef.current

    if (!viewport || !stage) return

    const resizeStage = () => {
      const size = Math.max(
        160,
        Math.min(
          viewport.clientWidth - 24,
          viewport.clientHeight - 24
        )
      )

      stageSizeRef.current = size
      stage.style.width = `${size}px`
      stage.style.height = `${size}px`
      stage.style.marginLeft = `${-size / 2}px`
      stage.style.marginTop = `${-size / 2}px`
      applyViewportTransform()
    }

    const observer = new ResizeObserver(resizeStage)
    observer.observe(viewport)
    resizeStage()

    return () => observer.disconnect()
  }, [mobileViewport])

  useEffect(() => {
    return () => {
      if (editRenderFrameRef.current != null) {
        cancelAnimationFrame(editRenderFrameRef.current)
      }

      if (cursorFrameRef.current != null) {
        cancelAnimationFrame(cursorFrameRef.current)
      }
    }
  }, [])

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

  /*
   * -------------------------------------------------------------------------
   * Operation stream
   * -------------------------------------------------------------------------
   *
   * object_update and object_delete are interpreted here.
   *
   * This means the server can append edits to the same Round.strokes history
   * without requiring a second database model.
   */

  function getResolvedOperations() {
    const cached = resolvedCacheRef.current

    if (
      cached.server === strokesRef.current &&
      cached.localVersion === localVersionRef.current
    ) {
      return cached.operations
    }

    const result = []
    const indexById = new Map()

    const rebuildIndex = () => {
      indexById.clear()
      result.forEach((item, index) => {
        indexById.set(String(item.id), index)
      })
    }

    const applyOperation = (operation) => {
      if (!operation) return

      if (operation.type === "canvas_clear") {
        result.splice(0, result.length)
        rebuildIndex()
        return
      }

      if (operation.type === "layer_reorder") {
        const order = Array.isArray(operation.order)
          ? operation.order.map(String)
          : []

        if (order.length > 0) {
          const rank = new Map(
            order.map((id, position) => [id, position])
          )
          const originalRank = new Map(
            result.map((item, position) => [String(item.id), position])
          )

          result.sort((a, b) => {
            const ar = rank.has(String(a.id))
              ? rank.get(String(a.id))
              : order.length + originalRank.get(String(a.id))
            const br = rank.has(String(b.id))
              ? rank.get(String(b.id))
              : order.length + originalRank.get(String(b.id))
            return ar - br
          })
          rebuildIndex()
        }
        return
      }

      if (operation.type === "object_update") {
        const index = indexById.get(String(operation.objectId))
        if (index == null) return

        result[index] = {
          ...result[index],
          ...cloneOperation(operation.changes || {}),
        }
        return
      }

      if (operation.type === "object_delete") {
        const index = indexById.get(String(operation.objectId))
        if (index == null) return

        result.splice(index, 1)
        rebuildIndex()
        return
      }

      if (operation.type === "erase") {
        for (const change of operation.changes || []) {
          const index = indexById.get(String(change.objectId))
          if (index == null) continue

          const after = Array.isArray(change.after)
            ? change.after.map(cloneOperation).filter(Boolean)
            : []
          result.splice(index, 1, ...after)
          rebuildIndex()
        }
        return
      }

      indexById.set(String(operation.id), result.length)
      result.push(cloneOperation(operation))
    }

    for (
      const operation of
        strokesRef.current
    ) {
      applyOperation(
        operation
      )
    }

    for (
      const operation of
        localOperationsRef.current
    ) {
      const alreadyExists =
        strokesRef.current.some(
          (serverOperation) =>
            serverOperation?.id ===
            operation?.id
        )

      if (!alreadyExists) {
        applyOperation(
          operation
        )
      }
    }

    cached.server = strokesRef.current
    cached.localVersion = localVersionRef.current
    cached.operations = result

    return result
  }

  /*
   * -------------------------------------------------------------------------
   * Mobile canvas viewport
   * -------------------------------------------------------------------------
   */

  function applyViewportTransform() {
    const stage = canvasStageRef.current
    if (!stage) return

    const transform = viewportTransformRef.current
    stage.style.transform =
      `translate3d(${transform.x}px, ${transform.y}px, 0) ` +
      `rotate(${transform.rotation}deg) scale(${transform.scale})`
  }

  function resetViewportTransform() {
    viewportTransformRef.current = {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    }
    applyViewportTransform()
  }

  function cancelInteractionForViewportGesture() {
    const liveId =
      currentStrokeRef.current?.id ||
      currentShapeRef.current?.id

    if (liveId) {
      onLiveStrokeRef.current?.({
        type: "cancel",
        stroke: { id: liveId },
      })
    }

    drawingRef.current = false
    currentStrokeRef.current = null
    currentShapeRef.current = null
    pendingPointsRef.current = []
    eraseEditRef.current = null
    editRef.current = null
    selectedAnchorIndexRef.current = null
    setSelectedAnchorIndex(null)
    renderCanvas()
    renderLiveCanvas()
    renderOverlay()
  }

  function handleViewportPointerDownCapture(event) {
    if (!mobileViewport || event.pointerType !== "touch") return

    viewportPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (viewportPointersRef.current.size < 2) return

    event.preventDefault()
    event.stopPropagation()
    suppressTouchRef.current = true
    cancelInteractionForViewportGesture()

    const points = [...viewportPointersRef.current.values()].slice(0, 2)
    const [first, second] = points
    const transform = viewportTransformRef.current

    viewportGestureRef.current = {
      midpoint: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
      distance: Math.max(
        1,
        Math.hypot(second.x - first.x, second.y - first.y)
      ),
      angle: Math.atan2(second.y - first.y, second.x - first.x),
      transform: { ...transform },
    }
  }

  function handleViewportPointerMoveCapture(event) {
    if (
      !mobileViewport ||
      event.pointerType !== "touch" ||
      !viewportPointersRef.current.has(event.pointerId)
    ) {
      return
    }

    viewportPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    const gesture = viewportGestureRef.current
    if (!gesture || viewportPointersRef.current.size < 2) return

    event.preventDefault()
    event.stopPropagation()

    const [first, second] =
      [...viewportPointersRef.current.values()].slice(0, 2)
    const midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    }
    const distance = Math.max(
      1,
      Math.hypot(second.x - first.x, second.y - first.y)
    )
    const angle = Math.atan2(
      second.y - first.y,
      second.x - first.x
    )

    viewportTransformRef.current = {
      x:
        gesture.transform.x +
        midpoint.x -
        gesture.midpoint.x,
      y:
        gesture.transform.y +
        midpoint.y -
        gesture.midpoint.y,
      scale: clamp(
        gesture.transform.scale *
          (distance / gesture.distance),
        0.5,
        4
      ),
      rotation:
        gesture.transform.rotation +
        ((angle - gesture.angle) * 180) / Math.PI,
    }

    applyViewportTransform()
  }

  function handleViewportPointerEndCapture(event) {
    if (!mobileViewport || event.pointerType !== "touch") return

    if (suppressTouchRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }

    viewportPointersRef.current.delete(event.pointerId)

    if (viewportPointersRef.current.size < 2) {
      viewportGestureRef.current = null
    }

    if (viewportPointersRef.current.size === 0) {
      suppressTouchRef.current = false
    }
  }

  function scheduleEditRender() {
    if (editRenderFrameRef.current != null) return

    editRenderFrameRef.current = requestAnimationFrame(() => {
      editRenderFrameRef.current = null
      renderLiveCanvas()
      renderOverlay()
    })
  }

  /*
   * -------------------------------------------------------------------------
   * Canvas setup
   * -------------------------------------------------------------------------
   */

  function setupCanvas() {
    const canvas =
      canvasRef.current

    const overlay =
      overlayCanvasRef.current

    const live =
      liveCanvasRef.current

    if (!canvas) {
      return
    }

    const dpr = canvasPixelRatio()

    canvas.width =
      CANVAS_WIDTH * dpr

    canvas.height =
      CANVAS_HEIGHT * dpr

    canvas.style.aspectRatio =
      `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`

    if (live) {
      live.width =
        CANVAS_WIDTH * dpr

      live.height =
        CANVAS_HEIGHT * dpr

      live.style.aspectRatio =
        `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`
    }

    if (overlay) {
      overlay.width =
        CANVAS_WIDTH * dpr

      overlay.height =
        CANVAS_HEIGHT * dpr

      overlay.style.aspectRatio =
        `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`
    }

    renderCanvas()
    renderOverlay()
  }

  /*
   * -------------------------------------------------------------------------
   * Pointer conversion
   * -------------------------------------------------------------------------
   */

  function getNormalizedPoint(
    canvas,
    event
  ) {
    if (
      mobileViewport &&
      canvasViewportRef.current &&
      canvasStageRef.current
    ) {
      const viewportRect =
        canvasViewportRef.current.getBoundingClientRect()
      const transform = viewportTransformRef.current
      const size =
        stageSizeRef.current ||
        canvasStageRef.current.offsetWidth
      const centerX =
        viewportRect.left +
        viewportRect.width / 2 +
        transform.x
      const centerY =
        viewportRect.top +
        viewportRect.height / 2 +
        transform.y
      const radians =
        (transform.rotation * Math.PI) / 180
      const cosine = Math.cos(radians)
      const sine = Math.sin(radians)
      const screenX = event.clientX - centerX
      const screenY = event.clientY - centerY
      const localX =
        (screenX * cosine + screenY * sine) /
        transform.scale
      const localY =
        (-screenX * sine + screenY * cosine) /
        transform.scale

      return [
        clamp(localX / size + 0.5, 0, 1),
        clamp(localY / size + 0.5, 0, 1),
      ]
    }

    const rect =
      canvas.getBoundingClientRect()

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return [0, 0]
    }

    return [
      clamp(
        (
          event.clientX -
          rect.left
        ) /
          rect.width,
        0,
        1
      ),

      clamp(
        (
          event.clientY -
          rect.top
        ) /
          rect.height,
        0,
        1
      ),
    ]
  }

  function handleCursorMove(
    event
  ) {
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

    pendingCursorRef.current = {
      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top,
    }

    if (cursorFrameRef.current != null) return

    cursorFrameRef.current = requestAnimationFrame(() => {
      cursorFrameRef.current = null
      setCursorPosition(pendingCursorRef.current)
    })
  }

  const handleClear = () => {
    if (!canDraw) return

    if (getResolvedOperations().length === 0) return

    // Clear local editing state
    selectedOperationIdRef.current = null
    selectedAnchorIndexRef.current = null

    setSelectedOperationId(null)
    setSelectedAnchorIndex(null)

    // Clear any active interaction
    drawingRef.current = false
    currentStrokeRef.current = null
    currentShapeRef.current = null
    editRef.current = null

    // Clear all canvases immediately
    const canvases = [
      canvasRef.current,
      overlayCanvasRef.current,
    ]

    canvases.forEach((canvas) => {
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    })

    const operation = {
      id: createStrokeId(),
      type: "canvas_clear",
    }

    localOperationsRef.current.push(operation)
    localVersionRef.current += 1

    // Tell the game/server to append an undoable clear operation.
    onClearRef.current?.(operation)
  }

  function handleCursorLeave() {
    pendingCursorRef.current = null
    setCursorPosition(null)
  }

  /*
   * -------------------------------------------------------------------------
   * Pointer down
   * -------------------------------------------------------------------------
   */

  function handlePointerDown(
    event
  ) {
    if (!canDrawRef.current) {
      return
    }

    event.preventDefault()

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const point =
      getNormalizedPoint(
        canvas,
        event
      )

    const currentTool =
      toolRef.current

    /*
     * SELECT
     */

    if (
      currentTool ===
      TOOLS.SELECT
    ) {
      handleSelectDown(
        point,
        event
      )
      return
    }

    /*
     * ANCHOR / CURVE
     */

    if (
      currentTool ===
        TOOLS.ANCHOR ||
      currentTool ===
        TOOLS.CURVE ||
      currentTool ===
        TOOLS.ROTATE
    ) {
      handleEditDown(
        point,
        currentTool,
        event
      )
      return
    }

    /*
     * BUCKET
     */

    if (
      currentTool ===
      TOOLS.BUCKET
    ) {
      handleBucketFill(
        point
      )
      return
    }

    /*
     * ERASER
     */

    if (
      currentTool ===
      TOOLS.ERASER
    ) {
      beginPointerCapture(
        canvas,
        event
      )

      drawingRef.current =
        true

      currentStrokeRef.current =
        {
          id:
            createStrokeId(),

          type:
            "eraser",

          points: [
            point,
          ],

          width:
            Math.max(
              strokeWidthRef.current *
                2,
              12
            ),
        }

      eraseEditRef.current = {
        operations: getResolvedOperations().map(cloneOperation),
        changedRoots: new Set(),
      }

      pendingPointsRef.current =
        [point]

      lastLiveUpdateRef.current =
        performance.now()

      eraseAtPoint(
        point
      )

      return
    }

    /*
     * SHAPES
     */

    if (
      SHAPE_TOOLS.includes(
        currentTool
      )
    ) {
      beginPointerCapture(
        canvas,
        event
      )

      drawingRef.current =
        true

      currentShapeRef.current =
        {
          id:
            createStrokeId(),
          start: point,
          end: point,
          shape:
            currentTool,
        }

      lastLiveUpdateRef.current =
        performance.now()

      sendLiveShape({
        ...currentShapeRef.current,
        eventType: "start",
      })

      renderLiveCanvas()
      return
    }

    /*
     * PENCIL / PEN / LINE
     */

    beginPointerCapture(
      canvas,
      event
    )

    const type =
      currentTool ===
      TOOLS.PEN
        ? "stroke"
        : "stroke"

    const stroke = {
      id:
        createStrokeId(),

      type,

      pen:
        currentTool ===
        TOOLS.PEN,

      closed: false,

      points: [
        point,
      ],

      color:
        strokeColorRef.current,

      fill:
        currentTool === TOOLS.PEN
          ? fillColorRef.current
          : null,

      width:
        strokeWidthRef.current,
    }

    drawingRef.current =
      true

    currentStrokeRef.current =
      stroke

    pendingPointsRef.current =
      [point]

    lastLiveUpdateRef.current =
      performance.now()

    renderLiveCanvas()

    sendLiveStart(
      stroke
    )
  }

  function beginPointerCapture(
    canvas,
    event
  ) {
    try {
      canvas.setPointerCapture(
        event.pointerId
      )
    } catch {
      // Ignore unsupported pointer capture.
    }
  }

  /*
   * -------------------------------------------------------------------------
   * Pointer move
   * -------------------------------------------------------------------------
   */

  function handlePointerMove(
    event
  ) {
    if (editRef.current) {
      const canvas = canvasRef.current
      if (!canvas) return

      event.preventDefault()
      handleEditMove(
        getNormalizedPoint(canvas, event)
      )
      return
    }

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

    const point =
      getNormalizedPoint(
        canvas,
        event
      )

    const currentTool =
      toolRef.current

    /*
     * Shape preview.
     */

    if (
      SHAPE_TOOLS.includes(
        currentTool
      )
    ) {
      if (
        currentShapeRef.current
      ) {
        currentShapeRef.current.end =
          point

        renderLiveCanvas()

        const now =
          performance.now()

        if (
          now -
            lastLiveUpdateRef.current >=
          LIVE_UPDATE_INTERVAL
        ) {
          sendLiveShape(
            currentShapeRef.current
          )
        }
      }

      return
    }

    /*
     * Eraser.
     */

    if (
      currentTool ===
      TOOLS.ERASER
    ) {
      const stroke =
        currentStrokeRef.current

      if (
        stroke &&
        addPointToCurrentStroke(
          point
        )
      ) {
        eraseAtPoint(
          point
        )
      }

      return
    }

    /*
     * Normal drawing.
     */

    const stroke =
      currentStrokeRef.current

    if (!stroke) {
      return
    }

    const events =
      typeof event.getCoalescedEvents ===
      "function"
        ? event.getCoalescedEvents()
        : [event]

    let addedAny = false

    for (
      const pointerEvent of
        events
    ) {
      const nextPoint =
        getNormalizedPoint(
          canvas,
          pointerEvent
        )

      if (
        addPointToCurrentStroke(
          nextPoint
        )
      ) {
        pendingPointsRef.current.push(
          nextPoint
        )

        addedAny = true
      }
    }

    if (!addedAny) {
      return
    }

    if (stroke.pen) {
      stroke.closed =
        shouldSnapPenClosed(
          stroke.points
        )

      // Once a Pen has enough points to form a shape, keep its selected
      // fill on the operation instead of clearing it during pointer moves.
      if (stroke.closed) {
        stroke.fill =
          stroke.fill ||
          fillColorRef.current
      }
    }

    renderLiveCanvas()

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

  /*
   * -------------------------------------------------------------------------
   * Pointer up
   * -------------------------------------------------------------------------
   */

  function handlePointerUp(
    event
  ) {
    if (editRef.current) {
      event.preventDefault()
      finishEdit(event)
      return
    }

    if (!drawingRef.current) {
      return
    }

    event.preventDefault()

    const canvas =
      canvasRef.current

    const currentTool =
      toolRef.current

    drawingRef.current =
      false

    /*
     * Shape.
     */

    if (
      SHAPE_TOOLS.includes(
        currentTool
      )
    ) {
      const shape =
        currentShapeRef.current

      currentShapeRef.current =
        null

      releasePointerCapture(
        canvas,
        event
      )

      if (!shape) {
        renderLiveCanvas()
        return
      }

      const operation =
        makeShapeOperation(
          shape.shape,
          shape.start,
          shape.end,
          strokeColorRef.current,
          strokeWidthRef.current,
          fillColorRef.current
        )

      operation.id =
        shape.id

      /*
       * Ignore accidental taps before publishing a final live snapshot.
       */

      if (
        operation.bounds.width <
          0.002 &&
        operation.bounds.height <
          0.002
      ) {
        renderLiveCanvas()
        return
      }

      // Send one final shape snapshot so remote canvases reach the exact
      // geometry immediately before the persisted stroke is broadcast.
      sendLiveShape(
        {
          ...shape,
          operation,
        }
      )

      commitOperation(
        operation
      )

      return
    }

    /*
     * Eraser.
     */

    if (
      currentTool ===
      TOOLS.ERASER
    ) {
      const eraseStroke = currentStrokeRef.current
      const eraseEdit = eraseEditRef.current

      if (eraseStroke && eraseEdit && eraseEdit.changedRoots.size > 0) {
        const changes = [...eraseEdit.changedRoots].map((objectId) => ({
          objectId,
          after: eraseEdit.operations
            .filter(
              (operation) =>
                (operation._eraseRootId || operation.id) === objectId
            )
            .map((operation) => {
              const persisted = cloneOperation(operation)
              delete persisted._eraseRootId
              return persisted
            }),
        }))

        commitOperation({
          id: eraseStroke.id,
          type: "erase",
          changes,
        })
      }

      currentStrokeRef.current =
        null

      eraseEditRef.current =
        null

      pendingPointsRef.current =
        []

      releasePointerCapture(
        canvas,
        event
      )

      renderLiveCanvas()
      return
    }

    /*
     * Normal stroke.
     */

    if (canvas) {
      const events =
        typeof event.getCoalescedEvents ===
        "function"
          ? event.getCoalescedEvents()
          : [event]

      for (
        const pointerEvent of
          events
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

    const stroke =
      currentStrokeRef.current

    drawingRef.current =
      false

    currentStrokeRef.current =
      null

    pendingPointsRef.current =
      []

    releasePointerCapture(
      canvas,
      event
    )

    if (!stroke) {
      renderLiveCanvas()
      return
    }

    if (
      !Array.isArray(
        stroke.points
      ) ||
      stroke.points.length === 0
    ) {
      renderLiveCanvas()
      return
    }

    const completedPoints =
      currentTool === TOOLS.PEN
        ? preparePenPoints(stroke.points)
        : clonePoints(stroke.points)

    const penClosed =
      currentTool === TOOLS.PEN &&
      stroke.points.length >= 3

    const completedPenPoints =
      penClosed
        ? snapPenClosed(completedPoints)
        : completedPoints

    const completedStroke = {
      ...stroke,
      points: completedPenPoints,
      closed: penClosed,
      fill:
        currentTool === TOOLS.PEN && penClosed
          ? (
              stroke.fill ||
              fillColorRef.current
            )
          : null,
    }

    completedStroke.bounds =
      calculateBoundsFromPoints(
        completedStroke.points
      )

    commitOperation(
      completedStroke
    )
  }

  function handlePointerCancel(
    event
  ) {
    if (editRef.current) {
      editRef.current = null
      selectedAnchorIndexRef.current = null
      setSelectedAnchorIndex(null)
      releasePointerCapture(canvasRef.current, event)
      renderOverlay()
      return
    }

    drawingRef.current =
      false

    currentStrokeRef.current =
      null

    currentShapeRef.current =
      null

    eraseEditRef.current =
      null

    pendingPointsRef.current =
      []

    releasePointerCapture(
      canvasRef.current,
      event
    )

    renderCanvas()
    renderLiveCanvas()
  }

  function releasePointerCapture(
    canvas,
    event
  ) {
    try {
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
  }

  /*
   * -------------------------------------------------------------------------
   * Drawing points
   * -------------------------------------------------------------------------
   */

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

    if (
      points.length === 0
    ) {
      points.push(point)
      return true
    }

    const previous =
      points[
        points.length - 1
      ]

    if (
      normalizedDistance(
        previous,
        point
      ) <
      MIN_POINT_DISTANCE
    ) {
      return false
    }

    points.push(point)

    return true
  }

  /*
   * -------------------------------------------------------------------------
   * Commit
   * -------------------------------------------------------------------------
   */

  function commitOperation(
    operation
  ) {
    if (!operation) {
      return
    }

    localOperationsRef.current.push(
      operation
    )
    localVersionRef.current += 1

    if (
      typeof onStrokeRef.current ===
      "function"
    ) {
      onStrokeRef.current(
        operation
      )
    }

    renderCanvas()
    renderLiveCanvas()
  }

  /*
   * -------------------------------------------------------------------------
   * Live drawing
   * -------------------------------------------------------------------------
   */

  function sendLiveStart(
    stroke
  ) {
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
        id:
          stroke.id,

        type:
          stroke.type ||
          "stroke",

        points:
          clonePoints(
            stroke.points
          ),

        color:
          stroke.color,

        width:
          stroke.width,

        pen:
          Boolean(stroke.pen),

        closed:
          Boolean(stroke.closed),

        fill:
          stroke.fill || null,
      },
    })
  }

  function sendLiveShape(shape) {
    const callback =
      onLiveStrokeRef.current

    if (typeof callback !== "function" || !shape) {
      return
    }

    const operation =
      shape.operation ||
      makeShapeOperation(
        shape.shape,
        shape.start,
        shape.end,
        strokeColorRef.current,
        strokeWidthRef.current,
        fillColorRef.current
      )

    // Reuse the same identity for the live preview and the committed
    // operation so the final ActionCable broadcast can collapse cleanly
    // into the optimistic local operation.
    const liveOperation = {
      ...operation,
      id:
        shape.operation?.id ||
        shape.id ||
        operation.id,
    }

    callback({
      type: "start" === shape.eventType ? "start" : "points",
      stroke: cloneOperation(liveOperation),
    })

    lastLiveUpdateRef.current =
      performance.now()
  }

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
        id:
          stroke.id,

        type:
          stroke.type ||
          "stroke",

        points:
          clonePoints(
            points
          ),

        color:
          stroke.color,

        width:
          stroke.width,

        pen:
          Boolean(stroke.pen),

        closed:
          Boolean(stroke.closed),

        fill:
          stroke.fill || null,
      },
    })

    pendingPointsRef.current =
      []

    lastLiveUpdateRef.current =
      performance.now()
  }

  /*
   * -------------------------------------------------------------------------
   * Selection
   * -------------------------------------------------------------------------
   */

  function handleSelectDown(
    point,
    event
  ) {
    const operations = getResolvedOperations()

    let found = null

    for (
      let i =
        operations.length - 1;
      i >= 0;
      i -= 1
    ) {
      const operation =
        operations[i]

      if (
        operation.hidden
      ) {
        continue
      }

      if (
        operationContainsPoint(
          null,
          operation,
          point
        )
      ) {
        found =
          operation
        break
      }
    }

    if (!found) {
      setSelectedOperationId(
        null
      )

      editRef.current =
        null

      renderCanvas()
      renderLiveCanvas()
      renderOverlay()
      return
    }

    setSelectedOperationId(
      found.id
    )

    editRef.current = {
      type: "move",
      operationId:
        found.id,
      start:
        clonePoint(point),
      last:
        clonePoint(point),
      changed: false,
      previewOperation: null,
    }

    selectedOperationIdRef.current =
      found.id

    beginCanvasEditCapture(event)

    renderCanvas(found.id)
    renderLiveCanvas()
    renderOverlay()
  }

  function getSelectedOperation() {
    const id =
      selectedOperationIdRef.current

    if (!id) {
      return null
    }

    return getResolvedOperations()
      .find(
        (operation) =>
          operation.id === id
      )
  }

  /*
   * -------------------------------------------------------------------------
   * Selection drag
   * -------------------------------------------------------------------------
   */

  function handleSelectedMove(
    point
  ) {
    const edit =
      editRef.current

    if (
      !edit ||
      edit.operationId == null
    ) {
      return
    }

    const operation =
      getSelectedOperation()

    if (!operation) {
      return
    }

    const dx =
      point[0] -
      edit.last[0]

    const dy =
      point[1] -
      edit.last[1]

    if (
      Math.abs(dx) <
        0.000001 &&
      Math.abs(dy) <
        0.000001
    ) {
      return
    }

    edit.last =
      point

    edit.changed =
      true

    const updated =
      moveOperation(
        operation,
        dx,
        dy
      )

    /*
     * Replace the local resolved representation with an update operation.
     */
    const update = {
      id:
        createStrokeId(),

      type:
        "object_update",

      objectId:
        operation.id,

      changes:
        updated,
    }

      /*
     * For continuous dragging we do NOT emit an operation on every
     * pointermove. We mutate the local representation and emit one
     * object_update when the drag finishes.
     *
     * This keeps ActionCable traffic sane on mobile.
     */
    editRef.current.previewOperation =
      updated

    updateLocalOperation(
      operation.id,
      updated
    )

    renderCanvas()
    renderOverlay()
  }

  /*
   * -------------------------------------------------------------------------
   * Pointer handling for Select / Anchor / Curve
   * -------------------------------------------------------------------------
   */

  function handleEditDown(
    point,
    currentTool,
    event
  ) {
    const operations =
      getResolvedOperations()

    /*
     * Anchor / Curve require a Pen-like operation.
     *
     * If nothing is selected yet, select the topmost drawable operation.
     */
    let operation =
      getSelectedOperation()

    if (!operation) {
      for (
        let i =
          operations.length - 1;
        i >= 0;
        i -= 1
      ) {
        const candidate =
          operations[i]

        if (
          candidate.hidden
        ) {
          continue
        }

        if (
          operationContainsPoint(
            null,
            candidate,
            point
          )
        ) {
          operation =
            candidate
          break
        }
      }
    }

    if (!operation) {
      setSelectedOperationId(
        null
      )
      setSelectedAnchorIndex(
        null
      )
      editRef.current =
        null
      renderOverlay()
      return
    }

    setSelectedOperationId(
      operation.id
    )

    selectedOperationIdRef.current =
      operation.id

    renderCanvas(operation.id)
    renderLiveCanvas()

    const editableOperation = prepareEditableOperation(
      operation,
      currentTool === TOOLS.CURVE ? "smooth" : "linear"
    )

    /*
     * Anchor editing works against actual points.
     *
     * We intentionally don't require a separate anchor data structure for
     * the game canvas. This keeps the wire format compatible with the
     * existing normalized stroke representation.
     */
    if (
      currentTool ===
      TOOLS.ANCHOR
    ) {
      const index =
        findNearestPointIndex(
          editableOperation,
          point
        )

      if (
        index == null
      ) {
        setSelectedAnchorIndex(
          null
        )
        renderOverlay()
        return
      }

      setSelectedAnchorIndex(
        index
      )

      selectedAnchorIndexRef.current =
        index

      editRef.current = {
        type: "anchor",
        operationId:
          operation.id,
        anchorIndex:
          index,
        start:
          clonePoint(point),
        last:
          clonePoint(point),
        changed: false,
        previewOperation:
          editableOperation,
      }

      beginCanvasEditCapture(event)

      return
    }

    /*
     * Curve editing selects a point and gives it a soft Bézier-style
     * adjustment. We keep the underlying points format intact by moving
     * neighboring points rather than introducing a new server format.
     */
    if (
      currentTool ===
      TOOLS.CURVE
    ) {
      const index =
        findNearestPointIndex(
          editableOperation,
          point
        )

      if (
        index == null
      ) {
        renderOverlay()
        return
      }

      setSelectedAnchorIndex(
        index
      )

      selectedAnchorIndexRef.current =
        index

      editRef.current = {
        type: "curve",
        operationId:
          operation.id,
        anchorIndex:
          index,
        start:
          clonePoint(point),
        last:
          clonePoint(point),
        changed: false,
        previewOperation:
          editableOperation,
      }

      beginCanvasEditCapture(event)

      return
    }

    if (currentTool === TOOLS.ROTATE) {
      const bounds = calculateOperationBounds(editableOperation)
      if (!bounds || !Array.isArray(editableOperation.points)) return

      const center = [
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      ]

      editRef.current = {
        type: "rotate",
        operationId: operation.id,
        center,
        startAngle: Math.atan2(point[1] - center[1], point[0] - center[0]),
        start: clonePoint(point),
        last: clonePoint(point),
        changed: false,
        originalOperation: editableOperation,
        previewOperation: editableOperation,
      }

      beginCanvasEditCapture(event)
    }
  }

  function beginCanvasEditCapture(event) {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    try {
      canvas.setPointerCapture(
        event?.pointerId
      )
    } catch {
      /*
       * Selection editing can still work without pointer capture.
       */
    }
  }

  function findNearestPointIndex(
    operation,
    point
  ) {
    const points =
      Array.isArray(
        operation?.points
      )
        ? operation.points
        : null

    if (
      !points ||
      points.length === 0
    ) {
      return null
    }

    const threshold =
      Math.max(
        0.025,
        (
          operation.width ||
          DEFAULT_WIDTH
        ) /
          CANVAS_SIZE *
          3
      )

    let bestIndex =
      null

    let bestDistance =
      Infinity

    for (
      let i = 0;
      i < points.length;
      i += 1
    ) {
      const distance =
        pointDistance(
          points[i],
          point
        )

      if (
        distance <
          bestDistance &&
        distance <=
          threshold
      ) {
        bestDistance =
          distance
        bestIndex =
          i
      }
    }

    return bestIndex
  }

  /*
   * -------------------------------------------------------------------------
   * Local operation mutation
   * -------------------------------------------------------------------------
   *
   * We keep an edited copy locally until the server's authoritative
   * operation_update comes back.
   */

  function updateLocalOperation(
    operationId,
    updated
  ) {
    const existing =
      localOperationsRef.current.find(
        (operation) =>
          operation.id ===
          operationId
      )

    if (existing) {
      Object.assign(
        existing,
        cloneOperation(
          updated
        )
      )
      localVersionRef.current += 1

      return
    }

    /*
     * The object may be server-authoritative. Add a local update operation
     * rather than copying the entire drawing.
     */
    localOperationsRef.current.push({
      id:
        createStrokeId(),

      type:
        "object_update",

      objectId:
        operationId,

      changes:
        cloneOperation(
          updated
        ),
    })
    localVersionRef.current += 1
  }

  /*
   * -------------------------------------------------------------------------
   * Move operation
   * -------------------------------------------------------------------------
   */

  function moveOperation(
    operation,
    dx,
    dy
  ) {
    const updated =
      cloneOperation(operation)

    const movePoint = (point) => [
      clamp(point[0] + dx, 0, 1),
      clamp(point[1] + dy, 0, 1),
    ]

    if (Array.isArray(updated.points)) {
      updated.points = updated.points.map(movePoint)
      if (updated.start) updated.start = movePoint(updated.start)
      if (updated.end) updated.end = movePoint(updated.end)
      updated.bounds = calculateBoundsFromPoints(updated.points)
      return updated
    }

    if (updated.start && updated.end) {
      updated.start = movePoint(updated.start)
      updated.end = movePoint(updated.end)
      updated.bounds = calculateBoundsFromPoints([
        updated.start,
        updated.end,
      ])
      return updated
    }

    if (updated.bounds) {
      updated.bounds = {
        ...updated.bounds,
        x: clamp(updated.bounds.x + dx, 0, 1),
        y: clamp(updated.bounds.y + dy, 0, 1),
      }
    }

    return updated
  }

  /*
   * -------------------------------------------------------------------------
   * Pointer move continuation for selection editing
   * -------------------------------------------------------------------------
   */

  function handleEditMove(
    point
  ) {
    const edit =
      editRef.current

    if (!edit) {
      return
    }

    const selectedOperation =
      getSelectedOperation()

    if (!selectedOperation) {
      return
    }

    const operation =
      edit.previewOperation ||
      selectedOperation

    const dx =
      point[0] -
      edit.last[0]

    const dy =
      point[1] -
      edit.last[1]

    if (
      Math.abs(dx) <
        0.000001 &&
      Math.abs(dy) <
        0.000001
    ) {
      return
    }

    /*
     * First actual movement establishes the edit.
     */
    edit.changed =
      true

    edit.last =
      clonePoint(point)

    if (
      edit.type ===
      "move"
    ) {
      edit.deltaX =
        (edit.deltaX || 0) + dx
      edit.deltaY =
        (edit.deltaY || 0) + dy

      scheduleEditRender()

      return
    }

    if (edit.type === "rotate") {
      const original = edit.originalOperation
      const center = edit.center

      if (!original || !center || !Array.isArray(original.points)) {
        return
      }

      const angle =
        Math.atan2(point[1] - center[1], point[0] - center[0]) -
        edit.startAngle
      const cosine = Math.cos(angle)
      const sine = Math.sin(angle)
      const updated = cloneOperation(original)

      updated.points = original.points.map(([x, y]) => {
        const dxFromCenter = x - center[0]
        const dyFromCenter = y - center[1]
        return [
          clamp(center[0] + dxFromCenter * cosine - dyFromCenter * sine, 0, 1),
          clamp(center[1] + dxFromCenter * sine + dyFromCenter * cosine, 0, 1),
        ]
      })
      updated.bounds = calculateBoundsFromPoints(updated.points)
      edit.previewOperation = updated
      scheduleEditRender()
      return
    }

    /*
     * Anchor editing.
     */
    if (
      edit.type ===
      "anchor"
    ) {
      const updated =
        cloneOperation(
          operation
        )

      if (
        Array.isArray(
          updated.points
        ) &&
        updated.points[
          edit.anchorIndex
        ]
      ) {
        updated.points[
          edit.anchorIndex
        ][0] += dx

        updated.points[
          edit.anchorIndex
        ][1] += dy

        updated.bounds =
          calculateBoundsFromPoints(
            updated.points
          )

      }

      edit.previewOperation = updated
      scheduleEditRender()

      return
    }

    /*
     * Curve editing.
     *
     * Move the selected point and gently move its immediate neighbors in
     * the opposite direction. The resulting polyline is then rendered with
     * the normal quadratic smoothing already used by the canvas.
     */
    if (
      edit.type ===
      "curve"
    ) {
      const updated =
        cloneOperation(
          operation
        )

      const points =
        updated.points

      if (
        !Array.isArray(
          points
        ) ||
        !points[
          edit.anchorIndex
        ]
      ) {
        return
      }

      points[
        edit.anchorIndex
      ][0] += dx

      points[
        edit.anchorIndex
      ][1] += dy

      const neighborOffset =
        0.35

      if (
        points[
          edit.anchorIndex - 1
        ]
      ) {
        points[
          edit.anchorIndex - 1
        ][0] -=
          dx *
          neighborOffset

        points[
          edit.anchorIndex - 1
        ][1] -=
          dy *
          neighborOffset
      }

      if (
        points[
          edit.anchorIndex + 1
        ]
      ) {
        points[
          edit.anchorIndex + 1
        ][0] -=
          dx *
          neighborOffset

        points[
          edit.anchorIndex + 1
        ][1] -=
          dy *
          neighborOffset
      }

      updated.bounds =
        calculateBoundsFromPoints(
          points
        )

      edit.previewOperation = updated
      scheduleEditRender()
    }
  }

  /*
   * -------------------------------------------------------------------------
   * Pointer up edit finalization
   * -------------------------------------------------------------------------
   */

  function finishEdit(
    event
  ) {
    const edit =
      editRef.current

    if (!edit) {
      return
    }

    releasePointerCapture(
      canvasRef.current,
      event
    )

    editRef.current =
      null

    if (
      !edit.changed
    ) {
      renderOverlay()
      return
    }

    const selectedOperation =
      getSelectedOperation()

    if (!selectedOperation) {
      return
    }

    const operation =
      edit.type === "move"
        ? moveOperation(
            selectedOperation,
            edit.deltaX || 0,
            edit.deltaY || 0
          )
        : (edit.previewOperation || selectedOperation)

    if (!operation) {
      return
    }

    /*
     * Emit exactly one update for the entire drag.
     */
    const update =
      {
        id:
          createStrokeId(),

        type:
          "object_update",

        objectId:
          operation.id,

        changes:
          cloneOperation(
            operation
          ),
      }

    /*
     * Remove the local preview updates. The single authoritative update
     * below replaces them.
     */
    localOperationsRef.current =
      localOperationsRef.current.filter(
        (local) =>
          !(
            local.type ===
              "object_update" &&
            local.objectId ===
              operation.id
          )
      )

    localOperationsRef.current.push(
      update
    )
    localVersionRef.current += 1

    if (
      typeof onStrokeRef.current ===
      "function"
    ) {
      onStrokeRef.current(
        update
      )
    }

    renderCanvas()
    renderLiveCanvas()
    renderOverlay()
  }

  /*
   * -------------------------------------------------------------------------
   * Eraser
   * -------------------------------------------------------------------------
   */

  function eraseAtPoint(
    point
  ) {
    const eraseEdit = eraseEditRef.current
    const operations = eraseEdit?.operations

    if (!eraseEdit || !Array.isArray(operations)) {
      return
    }

    const radius =
      clamp(
        (
          (
            strokeWidthRef.current ||
            DEFAULT_WIDTH
          ) *
            2
        ) /
          CANVAS_SIZE,
        ERASER_MIN_RADIUS,
        ERASER_MAX_RADIUS
      )

    /*
     * Erase from topmost object downward.
     */
    for (
      let i =
        operations.length - 1;
      i >= 0;
      i -= 1
    ) {
      const operation =
        operations[i]

      if (
        operation.hidden
      ) {
        continue
      }

      /*
       * Don't let an eraser stroke modify the same object repeatedly at
       * every pointer event if it has already been deleted.
       */
      if (
        !operationContainsPoint(
          null,
          operation,
          point
        ) &&
        !operationIntersectsEraser(
          operation,
          point,
          radius
        )
      ) {
        continue
      }

      const result =
        eraseOperation(
          operation,
          point,
          radius
        )

      if (!result) {
        continue
      }

      applyEraseResult(
        operation,
        result
      )

      /*
       * Erase only the topmost object touched by the eraser during a single
       * pointer event. This feels much more natural when objects overlap.
       */
      break
    }

    renderCanvas()
    renderOverlay()
  }

  function operationIntersectsEraser(
    operation,
    point,
    radius
  ) {
    if (
      Array.isArray(
        operation?.points
      )
    ) {
      return (
        pointToPolylineDistance(
          point,
          operation.points
        ) <= radius
      )
    }

    if (
      operation?.type ===
      "shape"
    ) {
      const points =
        convertShapeToPath(
          operation
        )

      return (
        pointToPolylineDistance(
          point,
          points
        ) <= radius
      )
    }

    return false
  }

  function applyEraseResult(
    original,
    result
  ) {
    const eraseEdit = eraseEditRef.current
    if (!eraseEdit) return

    const index = eraseEdit.operations.findIndex(
      (operation) => operation.id === original.id
    )
    if (index < 0) return

    const rootId = original._eraseRootId || original.id
    const replacements = result.deleted
      ? []
      : [result.operation, ...(result.additionalSegments || [])]
          .filter(Boolean)
          .map((operation) => ({
            ...cloneOperation(operation),
            _eraseRootId: rootId,
          }))

    eraseEdit.operations.splice(index, 1, ...replacements)
    eraseEdit.changedRoots.add(rootId)
  }

  /*
   * -------------------------------------------------------------------------
   * Object style editing
   * -------------------------------------------------------------------------
   */

  function updateSelectedStyle(
    changes
  ) {
    const operation =
      getSelectedOperation()

    if (!operation) {
      return
    }

    const updated = {
      ...cloneOperation(
        operation
      ),
      ...changes,
    }

    updateLocalOperation(
      operation.id,
      updated
    )

    /*
     * Remove older local previews for this object.
     */
    localOperationsRef.current =
      localOperationsRef.current.filter(
        (local) =>
          !(
            local.type ===
              "object_update" &&
            local.objectId ===
              operation.id
          )
      )
    localVersionRef.current += 1

    const update = {
      id:
        createStrokeId(),

      type:
        "object_update",

      objectId:
        operation.id,

      changes:
        cloneOperation(
          changes
        ),
    }

    localOperationsRef.current.push(
      update
    )
    localVersionRef.current += 1

    if (
      typeof onStrokeRef.current ===
      "function"
    ) {
      onStrokeRef.current(
        update
      )
    }

    renderCanvas()
    renderOverlay()
  }

  function applyColorToSelection(
    target,
    nextColor
  ) {
    const operation =
      getSelectedOperation()

    if (!operation) {
      return
    }

    const changes =
      target === "fill"
        ? { fill: nextColor }
        : { color: nextColor }

    updateSelectedStyle(changes)
  }

  function selectColor(nextColor) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(nextColor || ""))) {
      return
    }

    const normalizedColor =
      String(nextColor).toLowerCase()

    const target =
      colorTargetRef.current

    if (target === "fill") {
      setFillColor(normalizedColor)
      fillColorRef.current = normalizedColor
    } else {
      setStrokeColor(normalizedColor)
      strokeColorRef.current = normalizedColor
    }

    setPickerHue(
      hexToHsv(normalizedColor).h
    )

    setRecentColors((current) =>
      [
        normalizedColor,
        ...current.filter(
          (color) =>
            color.toLowerCase() !==
            normalizedColor
        ),
      ].slice(0, 12)
    )

    if (selectedOperationIdRef.current) {
      applyColorToSelection(
        target,
        normalizedColor
      )
    }
  }

  function selectColorTarget(target) {
    if (
      target !== "stroke" &&
      target !== "fill"
    ) {
      return
    }

    colorTargetRef.current = target
    setColorTarget(target)

    const currentColor =
      target === "fill"
        ? fillColorRef.current
        : strokeColorRef.current

    setPickerHue(
      hexToHsv(currentColor).h
    )
  }

  function handleCustomColorChange(event) {
    selectColor(event.target.value)
  }

  function handleHexColorChange(event) {
    const value =
      String(event.target.value || "").trim()

    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      selectColor(value)
    }
  }

  function pickSaturationValue(event) {
    const rect =
      event.currentTarget.getBoundingClientRect()

    if (!rect.width || !rect.height) return

    const saturation =
      clamp(
        (event.clientX - rect.left) / rect.width,
        0,
        1
      )

    const value =
      clamp(
        1 -
          (event.clientY - rect.top) / rect.height,
        0,
        1
      )

    selectColor(
      hsvToHex(
        pickerHue,
        saturation,
        value
      )
    )
  }

  function pickHue(event) {
    const rect =
      event.currentTarget.getBoundingClientRect()

    if (!rect.width) return

    const hue =
      clamp(
        (event.clientX - rect.left) / rect.width,
        0,
        1
      ) * 360

    setPickerHue(hue)

    const currentColor =
      colorTargetRef.current === "fill"
        ? fillColorRef.current
        : strokeColorRef.current

    const hsv =
      hexToHsv(currentColor)

    selectColor(
      hsvToHex(
        hue,
        hsv.s,
        hsv.v
      )
    )
  }

  function changeSelectedColor(
    nextColor
  ) {
    selectColor(nextColor)
  }

  function changeSelectedWidth(
    nextWidth
  ) {
    setStrokeWidth(
      nextWidth
    )

    if (
      selectedOperationIdRef.current
    ) {
      updateSelectedStyle({
        width:
          nextWidth,
      })
    }
  }

  /*
   * -------------------------------------------------------------------------
   * Delete
   * -------------------------------------------------------------------------
   */

  function deleteSelected() {
    const operation =
      getSelectedOperation()

    if (!operation) {
      return
    }

    emitObjectDelete(
      operation.id
    )

    setSelectedOperationId(
      null
    )

    selectedOperationIdRef.current =
      null

    setSelectedAnchorIndex(
      null
    )

    selectedAnchorIndexRef.current =
      null

    editRef.current =
      null

    renderCanvas()
    renderOverlay()
  }

  function emitObjectDelete(
    objectId
  ) {
    const operation = {
      id:
        createStrokeId(),

      type:
        "object_delete",

      objectId,
    }

    localOperationsRef.current.push(
      operation
    )
    localVersionRef.current += 1

    if (
      typeof onStrokeRef.current ===
      "function"
    ) {
      onStrokeRef.current(
        operation
      )
    }
  }

  /*
   * -------------------------------------------------------------------------
   * Undo
   * -------------------------------------------------------------------------
   */

  function handleUndo() {
    if (!canDrawRef.current) {
      return
    }

    const persisted =
      Array.isArray(strokesRef.current)
        ? strokesRef.current
        : []

    const optimistic =
      Array.isArray(localOperationsRef.current)
        ? localOperationsRef.current
        : []

    const seen = new Set(
      persisted
        .map((operation) => String(operation?.id || ""))
        .filter(Boolean)
    )

    const history = [
      ...persisted,
      ...optimistic.filter((operation) => {
        const id = String(operation?.id || "")
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      }),
    ]

    const undoable =
      new Set([
        "stroke",
        "eraser",
        "erase",
        "fill",
        "shape",
        "object_update",
        "object_delete",
        "layer_reorder",
        "canvas_clear",
      ])

    let lastAction = null

    for (let i = history.length - 1; i >= 0; i -= 1) {
      const candidate = history[i]
      if (
        candidate?.id &&
        undoable.has(candidate.type)
      ) {
        lastAction = candidate
        break
      }
    }

    if (!lastAction) {
      return
    }

    onUndoRef.current?.(lastAction.id)
  }

  /*
   * -------------------------------------------------------------------------
   * Bucket
   * -------------------------------------------------------------------------
   */

  function handleBucketFill(
    point
  ) {
    const operations = getResolvedOperations()
    const color = fillColorRef.current

    // Prefer vector fills for vector objects. This is deterministic across
    // clients and avoids a 1200x1200 flood-fill on every replay.
    for (let i = operations.length - 1; i >= 0; i -= 1) {
      const operation = operations[i]

      if (!operation || operation.hidden) {
        continue
      }

      let inside = false

      if (operation.type === "shape") {
        inside = operationContainsPoint(null, operation, point)
      } else if (
        Array.isArray(operation.points) &&
        operation.points.length >= 3 &&
        (operation.closed || operation.pen)
      ) {
        inside = pointInPolygon(point, operation.points)
      }

      if (!inside) {
        continue
      }

      // Remove any stale optimistic updates for this object, then append one
      // compact authoritative update. The server persists this in Round.strokes.
      localOperationsRef.current =
        localOperationsRef.current.filter(
          (local) =>
            !(local.type === "object_update" &&
              local.objectId === operation.id)
        )

      const update = {
        id: createStrokeId(),
        type: "object_update",
        objectId: operation.id,
        changes: { fill: color },
      }

      localOperationsRef.current.push(update)
      localVersionRef.current += 1

      onStrokeRef.current?.(update)
      renderCanvas()
      renderOverlay()
      return
    }

    // Fill is a vector object update. Clicking outside a closed vector object
    // intentionally does nothing instead of creating a drawer-only raster fill.
  }

  /*
   * -------------------------------------------------------------------------
   * Rendering
   * -------------------------------------------------------------------------
   */

  function renderCanvas(excludeOperationId = null) {
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

    const dpr = canvasPixelRatio()

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

    context.globalCompositeOperation =
      "source-over"

    context.fillStyle =
      "#ffffff"

    context.fillRect(
      0,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    )

    const operations =
      eraseEditRef.current?.operations || getResolvedOperations()

    const edit = editRef.current
    const previewOperation =
      edit?.previewOperation

    for (
      const operation of
        operations
    ) {
      if (
        (
          operation.hidden
        ) ||
        operation.id === excludeOperationId
      ) {
        continue
      }

      if (
        edit?.type === "move" &&
        edit.operationId === operation.id
      ) {
        const dx = edit.deltaX || 0
        const dy = edit.deltaY || 0

        context.save()
        context.translate(
          dx * CANVAS_WIDTH,
          dy * CANVAS_HEIGHT
        )
        drawOperation(context, operation)
        context.restore()
      } else {
        const drawable =
          previewOperation &&
          operation.id === edit.operationId
            ? previewOperation
            : operation

        drawOperation(
          context,
          drawable
        )
      }
    }

    context.globalCompositeOperation =
      "source-over"
  }

  function renderLiveCanvas() {
    const canvas =
      liveCanvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext("2d")

    if (!context) {
      return
    }

    const dpr = canvasPixelRatio()

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

    context.globalCompositeOperation =
      "source-over"

    const localId =
      currentStrokeRef.current?.id ||
      currentShapeRef.current?.id ||
      editRef.current?.operationId

    for (const operation of Object.values(liveStrokes || {})) {
      if (!operation || operation.id === localId) {
        continue
      }

      drawOperation(context, operation, true)
    }

    if (editRef.current) {
      const edit = editRef.current
      const selected =
        getSelectedOperation()

      if (selected) {
        let preview = edit.previewOperation

        if (edit.type === "move") {
          context.save()
          context.translate(
            (edit.deltaX || 0) * CANVAS_WIDTH,
            (edit.deltaY || 0) * CANVAS_HEIGHT
          )
          drawOperation(context, selected, true)
          context.restore()
        } else if (preview) {
          drawOperation(context, preview, true)
        }
      }
    }

    const shape =
      currentShapeRef.current

    if (drawingRef.current && shape) {
      const preview =
        makeShapeOperation(
          shape.shape,
          shape.start,
          shape.end,
          strokeColorRef.current,
          strokeWidthRef.current,
          fillColorRef.current
        )

      preview.id = shape.id
      drawOperation(context, preview, true)
    }

    const stroke =
      currentStrokeRef.current

    if (drawingRef.current && stroke) {
      drawOperation(context, stroke, true)
    }

    context.globalCompositeOperation =
      "source-over"
  }

  function colorDistance(
    data,
    index,
    target
  ) {
    return Math.max(
      Math.abs(data[index] - target[0]),
      Math.abs(data[index + 1] - target[1]),
      Math.abs(data[index + 2] - target[2]),
      Math.abs(data[index + 3] - target[3])
    )
  }

  function parseHexColor(
    color
  ) {
    const value =
      String(color || "")
        .replace("#", "")

    if (value.length !== 6) {
      return [
        24,
        24,
        27,
        255,
      ]
    }

    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
      255,
    ]
  }

  function applyFillOperation(
    canvas,
    operation
  ) {
    if (
      !canvas ||
      !operation?.point
    ) {
      return
    }

    const context =
      canvas.getContext("2d")

    if (!context) {
      return
    }

    const width =
      canvas.width

    const height =
      canvas.height

    const image =
      context.getImageData(
        0,
        0,
        width,
        height
      )

    const data =
      image.data

    const startX =
      clamp(
        Math.floor(
          operation.point[0] *
            width
        ),
        0,
        width - 1
      )

    const startY =
      clamp(
        Math.floor(
          operation.point[1] *
            height
        ),
        0,
        height - 1
      )

    const startIndex =
      (
        startY *
          width +
        startX
      ) *
      4

    const target = [
      data[startIndex],
      data[startIndex + 1],
      data[startIndex + 2],
      data[startIndex + 3],
    ]

    const replacement =
      parseHexColor(
        operation.color
      )

    if (
      colorDistance(
        data,
        startIndex,
        replacement
      ) === 0
    ) {
      return
    }

    const tolerance =
      FILL_TOLERANCE

    const queue = [
      startX,
      startY,
    ]

    let head = 0

    while (
      head <
      queue.length
    ) {
      const x =
        queue[head++]

      const y =
        queue[head++]

      if (
        x < 0 ||
        x >= width ||
        y < 0 ||
        y >= height
      ) {
        continue
      }

      const index =
        (
          y *
            width +
          x
        ) *
        4

      if (
        colorDistance(
          data,
          index,
          target
        ) >
        tolerance
      ) {
        continue
      }

      data[index] =
        replacement[0]
      data[index + 1] =
        replacement[1]
      data[index + 2] =
        replacement[2]
      data[index + 3] =
        replacement[3]

      queue.push(
        x + 1,
        y,
        x - 1,
        y,
        x,
        y + 1,
        x,
        y - 1
      )
    }

    context.putImageData(
      image,
      0,
      0
    )
  }

  function drawOperation(
    context,
    operation,
    preview = false
  ) {
    if (!operation || operation.hidden) {
      return
    }

    if (
      operation.type ===
      "fill"
    ) {
      /*
       * Fill operations must be replayed against the current raster.
       */
      applyFillOperation(
        context.canvas,
        operation
      )

      return
    }

    if (
      operation.type ===
      "shape"
    ) {
      drawShape(
        context,
        operation
      )

      return
    }

    drawStroke(
      context,
      operation
    )
  }

  function drawShape(
    context,
    operation
  ) {
    const bounds =
      operation.bounds

    if (!bounds) {
      return
    }

    const x =
      bounds.x *
      CANVAS_WIDTH

    const y =
      bounds.y *
      CANVAS_HEIGHT

    const width =
      bounds.width *
      CANVAS_WIDTH

    const height =
      bounds.height *
      CANVAS_HEIGHT

    context.save()

    context.strokeStyle =
      operation.color ||
      DEFAULT_COLOR

    context.lineWidth =
      Number(
        operation.width
      ) ||
      DEFAULT_WIDTH

    context.lineCap =
      "round"

    context.lineJoin =
      "round"

    context.beginPath()

    if (
      operation.shape ===
      "line" &&
      operation.start &&
      operation.end
    ) {
      context.moveTo(
        operation.start[0] * CANVAS_WIDTH,
        operation.start[1] * CANVAS_HEIGHT
      )
      context.lineTo(
        operation.end[0] * CANVAS_WIDTH,
        operation.end[1] * CANVAS_HEIGHT
      )
    } else if (
      operation.shape ===
      "circle"
    ) {
      context.ellipse(
        x + width / 2,
        y + height / 2,
        Math.abs(width / 2),
        Math.abs(height / 2),
        0,
        0,
        Math.PI * 2
      )
    } else if (
      operation.shape ===
      "square"
    ) {
      context.rect(
        x,
        y,
        width,
        height
      )
    } else if (
      operation.shape ===
      "triangle"
    ) {
      const points =
        shapePoints(
          operation
        )

      if (
        points.length >= 3
      ) {
        context.moveTo(
          points[0][0] *
            CANVAS_WIDTH,
          points[0][1] *
            CANVAS_HEIGHT
        )

        context.lineTo(
          points[1][0] *
            CANVAS_WIDTH,
          points[1][1] *
            CANVAS_HEIGHT
        )

        context.lineTo(
          points[2][0] *
            CANVAS_WIDTH,
          points[2][1] *
            CANVAS_HEIGHT
        )

        context.closePath()
      }
    }

    if (operation.fill) {
      context.fillStyle = operation.fill
      context.fill()
    }

    context.stroke()

    context.restore()
  }

  function drawPen(
    context,
    points,
    color,
    width,
    fillColor = null,
    closed = false
  ) {
    if (!Array.isArray(points) || points.length === 0) {
      return
    }

    context.save()
    context.globalCompositeOperation = "source-over"
    context.strokeStyle = color || DEFAULT_COLOR
    context.fillStyle = color || DEFAULT_COLOR
    context.lineWidth = Number(width) || DEFAULT_WIDTH
    context.lineCap = "round"
    context.lineJoin = "round"

    if (points.length === 1) {
      context.beginPath()
      context.arc(
        points[0][0] * CANVAS_WIDTH,
        points[0][1] * CANVAS_HEIGHT,
        context.lineWidth / 2,
        0,
        Math.PI * 2
      )
      context.fill()
      context.stroke()
      context.restore()
      return
    }

    context.beginPath()
    context.moveTo(
      points[0][0] * CANVAS_WIDTH,
      points[0][1] * CANVAS_HEIGHT
    )

    if (points.length === 2) {
      context.lineTo(
        points[1][0] * CANVAS_WIDTH,
        points[1][1] * CANVAS_HEIGHT
      )
    } else {
      for (let i = 1; i < points.length - 1; i += 1) {
        const current = points[i]
        const next = points[i + 1]
        const cx = current[0] * CANVAS_WIDTH
        const cy = current[1] * CANVAS_HEIGHT
        const nx = next[0] * CANVAS_WIDTH
        const ny = next[1] * CANVAS_HEIGHT
        context.quadraticCurveTo(
          cx,
          cy,
          (cx + nx) / 2,
          (cy + ny) / 2
        )
      }

      const last = points[points.length - 1]
      const previous = points[points.length - 2]
      context.quadraticCurveTo(
        previous[0] * CANVAS_WIDTH,
        previous[1] * CANVAS_HEIGHT,
        last[0] * CANVAS_WIDTH,
        last[1] * CANVAS_HEIGHT
      )
    }

    // Pen fill is independent from its stroke color. Only close/fill when
    // the pen is actually closed; this keeps open freehand lines from
    // painting a giant accidental polygon.
    if (closed && fillColor) {
      context.closePath()
      context.fillStyle = fillColor
      context.fill()
    }

    context.stroke()
    context.restore()
  }

  function drawStroke(
    context,
    stroke
  ) {
    const points =
      Array.isArray(
        stroke?.points
      )
        ? stroke.points
        : []

    if (
      points.length === 0
    ) {
      return
    }

    if (stroke.pen) {
      drawPen(
        context,
        points,
        stroke.color,
        stroke.width,
        stroke.fill,
        Boolean(stroke.closed)
      )
      return
    }

    const isEraser =
      stroke.type ===
      "eraser"

    const width =
      Number(
        stroke.width
      ) ||
      DEFAULT_WIDTH

    context.save()

    context.globalCompositeOperation =
      isEraser
        ? "destination-out"
        : "source-over"

    context.strokeStyle =
      stroke.color ||
      DEFAULT_COLOR

    context.fillStyle =
      stroke.color ||
      DEFAULT_COLOR

    context.lineWidth =
      width

    context.lineCap =
      "round"

    context.lineJoin =
      "round"

    if (
      points.length === 1
    ) {
      context.beginPath()

      context.arc(
        points[0][0] *
          CANVAS_WIDTH,
        points[0][1] *
          CANVAS_HEIGHT,
        width / 2,
        0,
        Math.PI * 2
      )

      context.fill()

      context.restore()

      return
    }

    context.beginPath()

    context.moveTo(
      points[0][0] *
        CANVAS_WIDTH,
      points[0][1] *
        CANVAS_HEIGHT
    )

    if (stroke.pathMode === "linear") {
      for (let i = 1; i < points.length; i += 1) {
        context.lineTo(
          points[i][0] * CANVAS_WIDTH,
          points[i][1] * CANVAS_HEIGHT
        )
      }
    } else {
      for (let i = 1; i < points.length - 1; i += 1) {
        const current = points[i]
        const next = points[i + 1]

        context.quadraticCurveTo(
          current[0] * CANVAS_WIDTH,
          current[1] * CANVAS_HEIGHT,
          ((current[0] + next[0]) / 2) * CANVAS_WIDTH,
          ((current[1] + next[1]) / 2) * CANVAS_HEIGHT
        )
      }

      const last = points[points.length - 1]
      const previous = points[points.length - 2]

      context.quadraticCurveTo(
        previous[0] * CANVAS_WIDTH,
        previous[1] * CANVAS_HEIGHT,
        last[0] * CANVAS_WIDTH,
        last[1] * CANVAS_HEIGHT
      )
    }

    if (stroke.closed && stroke.fill) {
      context.closePath()
      context.fillStyle = stroke.fill
      context.fill()
    }

    context.stroke()

    context.restore()
  }

  /*
   * -------------------------------------------------------------------------
   * Overlay
   * -------------------------------------------------------------------------
   */

  function renderOverlay() {
    const canvas =
      overlayCanvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext("2d")

    if (!context) {
      return
    }

    const dpr = canvasPixelRatio()

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

    const selected =
      getSelectedOperation()

    if (!selected) {
      return
    }

    const edit = editRef.current
    const overlayOperation =
      edit?.previewOperation || selected

    const baseBounds =
      calculateOperationBounds(
        overlayOperation
      )

    const bounds =
      baseBounds && edit?.type === "move"
        ? {
            ...baseBounds,
            x: baseBounds.x + (edit.deltaX || 0),
            y: baseBounds.y + (edit.deltaY || 0),
          }
        : baseBounds

    if (bounds) {
      context.save()

      context.setLineDash([
        8,
        6,
      ])

      context.strokeStyle =
        "rgba(99,102,241,0.85)"

      context.lineWidth =
        2

      context.strokeRect(
        bounds.x *
          CANVAS_WIDTH -
          6,
        bounds.y *
          CANVAS_HEIGHT -
          6,
        bounds.width *
          CANVAS_WIDTH +
          12,
        bounds.height *
          CANVAS_HEIGHT +
          12
      )

      context.restore()
    }

    /*
     * Anchor points.
     */
    if (
      (
        toolRef.current ===
          TOOLS.ANCHOR ||
        toolRef.current ===
          TOOLS.CURVE
      ) &&
      Array.isArray(
        overlayOperation.points
      )
    ) {
      overlayOperation.points.forEach(
        (
          point,
          index
        ) => {
          const isSelected =
            index ===
            selectedAnchorIndexRef.current

          context.beginPath()

          context.arc(
            point[0] *
              CANVAS_WIDTH,
            point[1] *
              CANVAS_HEIGHT,
            isSelected
              ? 10
              : 6,
            0,
            Math.PI * 2
          )

          context.fillStyle =
            isSelected
              ? "#ffffff"
              : "rgba(99,102,241,0.75)"

          context.fill()

          context.strokeStyle =
            "#4f46e5"

          context.lineWidth =
            2

          context.stroke()
        }
      )
    }
  }

  /*
   * -------------------------------------------------------------------------
   * Layer helpers
   * -------------------------------------------------------------------------
   */

  function toggleLayer(
    operationId
  ) {
    const operation =
      getResolvedOperations().find(
        (item) => item.id === operationId
      )

    if (!operation) {
      return
    }

    const nextHidden =
      !Boolean(operation.hidden)

    const update = {
      id: createStrokeId(),
      type: "object_update",
      objectId: operationId,
      changes: {
        hidden: nextHidden,
      },
    }

    localOperationsRef.current.push(update)
    localVersionRef.current += 1

    onStrokeRef.current?.(update)
    renderCanvas()
    renderOverlay()
  }

  function reorderLayers(
    operationId,
    direction
  ) {
    const operations =
      getResolvedOperations()

    const ids =
      operations.map(
        (operation) => operation.id
      )

    const index =
      ids.indexOf(operationId)

    if (index < 0) {
      return
    }

    let targetIndex = index

    if (direction === "up") {
      targetIndex = Math.min(
        ids.length - 1,
        index + 1
      )
    } else if (direction === "down") {
      targetIndex = Math.max(
        0,
        index - 1
      )
    } else if (direction === "front") {
      targetIndex = ids.length - 1
    } else if (direction === "back") {
      targetIndex = 0
    }

    if (targetIndex === index) {
      return
    }

    ids.splice(index, 1)
    ids.splice(targetIndex, 0, operationId)

    const operation = {
      id: createStrokeId(),
      type: "layer_reorder",
      order: ids,
    }

    localOperationsRef.current.push(operation)
    localVersionRef.current += 1

    onStrokeRef.current?.(operation)

    renderCanvas()
    renderOverlay()
  }

  function deleteLayer(
    operationId
  ) {
    emitObjectDelete(operationId)

    if (
      selectedOperationIdRef.current ===
      operationId
    ) {
      selectedOperationIdRef.current = null
      setSelectedOperationId(null)
    }

    renderCanvas()
    renderOverlay()
  }

  function selectLayer(
    operationId
  ) {
    setSelectedOperationId(
      operationId
    )

    selectedOperationIdRef.current =
      operationId

    renderOverlay()
  }

  /*
   * -------------------------------------------------------------------------
   * Tool selection
   * -------------------------------------------------------------------------
   */

  function chooseTool(
    nextTool
  ) {
    setTool(
      nextTool
    )

    toolRef.current =
      nextTool

    setShowShapeMenu(
      false
    )

    setShowEditMenu(
      false
    )

    setShowColorPicker(
      false
    )

    /*
     * Selection remains selected when switching between Select / Anchor /
     * Curve.
     */
    if (
      nextTool !==
        TOOLS.SELECT &&
      nextTool !==
        TOOLS.ANCHOR &&
      nextTool !==
        TOOLS.CURVE &&
      nextTool !==
        TOOLS.ROTATE
    ) {
      setSelectedAnchorIndex(
        null
      )

      selectedAnchorIndexRef.current =
        null
    }

    renderOverlay()
  }

  function selectPencil() {
    chooseTool(
      TOOLS.PENCIL
    )
  }

  function selectPen() {
    chooseTool(
      TOOLS.PEN
    )
  }

  function selectLine() {
    chooseTool(
      TOOLS.LINE
    )
  }

  function selectCircle() {
    chooseTool(
      TOOLS.CIRCLE
    )
  }

  function selectSquare() {
    chooseTool(
      TOOLS.SQUARE
    )
  }

  function selectTriangle() {
    chooseTool(
      TOOLS.TRIANGLE
    )
  }

  function selectEraser() {
    chooseTool(
      TOOLS.ERASER
    )
  }

  function selectBucket() {
    chooseTool(
      TOOLS.BUCKET
    )
  }

  function selectSelect() {
    chooseTool(
      TOOLS.SELECT
    )
  }

  function selectAnchor() {
    chooseTool(
      TOOLS.ANCHOR
    )
  }

  function selectCurve() {
    chooseTool(
      TOOLS.CURVE
    )
  }

  function selectRotate() {
    chooseTool(
      TOOLS.ROTATE
    )
  }

  /*
   * -------------------------------------------------------------------------
   * Brush cursor
   * -------------------------------------------------------------------------
   */

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
    tool !== TOOLS.SELECT &&
    !EDIT_TOOLS.includes(tool) &&
    tool !== TOOLS.BUCKET

  const showEditCursor =
    canDraw &&
    cursorPosition &&
    isDesktopPointer &&
    (tool === TOOLS.SELECT || EDIT_TOOLS.includes(tool))


  const resolvedOperations =
    getResolvedOperations()

  const selectedOperation =
    getSelectedOperation()

  const shapeLabel =
    tool === TOOLS.CIRCLE
      ? "Circle"
      : tool === TOOLS.SQUARE
        ? "Square"
        : tool === TOOLS.TRIANGLE
          ? "Triangle"
          : "Shape"

  const editLabel =
    tool === TOOLS.ANCHOR
      ? "Anchor"
      : tool === TOOLS.CURVE
        ? "Curve"
        : tool === TOOLS.ROTATE
          ? "Rotate"
        : "Edit"

  /*
   * -------------------------------------------------------------------------
   * Render
   * -------------------------------------------------------------------------
   */

  return (
    <div
      className={
        mobileViewport
          ? "relative flex h-full min-h-0 flex-col overflow-hidden bg-zinc-800"
          : "relative overflow-hidden rounded-2xl border border-zinc-800 bg-white shadow-2xl"
      }
    >

      {canDraw && (
        <div
          className={
            mobileViewport
              ? "order-2 shrink-0 border-t border-zinc-300 bg-zinc-100 pb-[env(safe-area-inset-bottom)]"
              : "border-b border-zinc-200 bg-zinc-100"
          }
        >

          {/* --------------------------------------------------------------- */}
          {/* Selected-object contextual controls                             */}
          {/* --------------------------------------------------------------- */}

          {selectedOperation &&
            tool === TOOLS.SELECT && (
            <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2">

              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Selected
              </span>

              {COLORS.map(
                (nextColor) => (
                  <button
                    key={
                      nextColor
                    }
                    type="button"
                    onClick={() =>
                      changeSelectedColor(
                        nextColor
                      )
                    }
                    className={`relative h-7 w-7 shrink-0 rounded-full border-2 ${
                      selectedOperation.color ===
                      nextColor
                        ? "scale-110 border-zinc-900"
                        : "border-transparent"
                    }`}
                    style={{
                      backgroundColor:
                        nextColor,
                    }}
                    aria-label={`Change selected object to ${nextColor}`}
                  >
                    {nextColor ===
                      "#ffffff" && (
                      <span className="absolute inset-0 rounded-full border border-zinc-300" />
                    )}
                  </button>
                )
              )}

              <div className="mx-1 h-6 w-px bg-zinc-300" />

              {STROKE_WIDTHS.map(
                (option) => (
                  <button
                    key={
                      option.value
                    }
                    type="button"
                    onClick={() =>
                      changeSelectedWidth(
                        option.value
                      )
                    }
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      Number(
                        selectedOperation.width
                      ) ===
                      option.value
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                    aria-label={`Set selected width to ${option.label}`}
                  >
                    <span
                      className="rounded-full bg-current"
                      style={{
                        width:
                          Math.min(
                            option.value,
                            18
                          ),
                        height:
                          Math.min(
                            option.value,
                            18
                          ),
                      }}
                    />
                  </button>
                )
              )}

              <div className="mx-1 h-6 w-px bg-zinc-300" />

              <button
                type="button"
                onClick={
                  deleteSelected
                }
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-600"
              >
                <Trash2
                  size={15}
                />
                Delete
              </button>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* Main mobile toolbar                                             */}
          {/* --------------------------------------------------------------- */}

          <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">

            <button
              type="button"
              onClick={
                selectSelect
              }
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                tool === TOOLS.SELECT
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700"
              }`}
              aria-label="Select"
            >
              <MousePointer2
                size={17}
              />
              <span className="hidden sm:inline">
                Select
              </span>
            </button>

            <button
              type="button"
              onClick={
                selectPencil
              }
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                tool === TOOLS.PENCIL
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700"
              }`}
            >
              <Pencil
                size={17}
              />
              <span className="hidden sm:inline">
                Pencil
              </span>
            </button>

            <button
              type="button"
              onClick={
                selectPen
              }
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                tool === TOOLS.PEN
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700"
              }`}
            >
              <PenLine
                size={17}
              />
              <span className="hidden sm:inline">
                Pen
              </span>
            </button>

            {/* Shape dropdown */}

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowShapeMenu(
                    (value) => !value
                  )
                  setShowEditMenu(false)
                }}
                className={`flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                  SHAPE_TOOLS.includes(
                    tool
                  )
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-700"
                }`}
              >
                {tool ===
                TOOLS.LINE ? (
                  <Minus
                    size={17}
                  />
                ) : tool ===
                TOOLS.CIRCLE ? (
                  <Circle
                    size={17}
                  />
                ) : tool ===
                  TOOLS.SQUARE ? (
                  <Square
                    size={17}
                  />
                ) : tool ===
                  TOOLS.TRIANGLE ? (
                  <Triangle
                    size={17}
                  />
                ) : (
                  <Square
                    size={17}
                  />
                )}

                <span className="hidden sm:inline">
                  {shapeLabel}
                </span>

                <ChevronDown
                  size={14}
                />
              </button>

            </div>

            <button
              type="button"
              onClick={
                selectEraser
              }
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                tool === TOOLS.ERASER
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700"
              }`}
            >
              <Eraser
                size={17}
              />
              <span className="hidden sm:inline">
                Eraser
              </span>
            </button>

            <button
              type="button"
              onClick={
                selectBucket
              }
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                tool === TOOLS.BUCKET
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700"
              }`}
            >
              <PaintBucket
                size={17}
              />
              <span className="hidden sm:inline">
                Fill
              </span>
            </button>

            {/* Edit dropdown */}

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowEditMenu(
                    (value) => !value
                  )
                  setShowShapeMenu(false)
                }}
                className={`flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                  EDIT_TOOLS.includes(
                    tool
                  )
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-zinc-700"
                }`}
              >
                <MousePointer2
                  size={17}
                />

                <span className="hidden sm:inline">
                  {editLabel}
                </span>

                <ChevronDown
                  size={14}
                />
              </button>

            </div>

            <div className="mx-1 h-7 w-px shrink-0 bg-zinc-300" />

            <button
              type="button"
              onClick={
                handleUndo
              }
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-zinc-700"
            >
              <Undo2
                size={17}
              />
              <span className="hidden sm:inline">
                Undo
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setShowLayers(
                  true
                )
              }
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                showLayers
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700"
              }`}
            >
              <Layers
                size={17}
              />
              <span className="hidden sm:inline">
                Layers
              </span>
            </button>

            <button
              type="button"
              onClick={
                handleClear
              }
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-zinc-700"
            >
              <Trash2
                size={17}
              />
              <span className="hidden sm:inline">
                Clear
              </span>
            </button>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* Dropdown menus — outside the horizontal scroller               */}
          {/* --------------------------------------------------------------- */}

          {(showShapeMenu || showEditMenu) && (
            <div className="border-t border-zinc-200 bg-white px-2 py-2">
              {showShapeMenu && (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={selectLine}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Minus size={16} />
                    Line
                  </button>

                  <button
                    type="button"
                    onClick={selectCircle}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Circle size={16} />
                    Circle
                  </button>

                  <button
                    type="button"
                    onClick={selectSquare}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Square size={16} />
                    Square
                  </button>

                  <button
                    type="button"
                    onClick={selectTriangle}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Triangle size={16} />
                    Triangle
                  </button>
                </div>
              )}

              {showEditMenu && (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={selectSelect}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <MousePointer2 size={16} />
                    Select
                  </button>

                  <button
                    type="button"
                    onClick={selectAnchor}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Anchor size={16} />
                    Anchor
                  </button>

                  <button
                    type="button"
                    onClick={selectCurve}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Waves size={16} />
                    Curve
                  </button>

                  <button
                    type="button"
                    onClick={selectRotate}
                    className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <RotateCcw size={16} />
                    Rotate
                  </button>
                </div>
              )}
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* Compact stroke / fill color controls */}

          <div className="relative border-t border-zinc-200 bg-zinc-50">
            <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    selectColorTarget("stroke")
                    setShowColorPicker(true)
                  }}
                  className={`flex h-8 items-center gap-1.5 px-2.5 text-[10px] font-bold uppercase ${
                    colorTarget === "stroke"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-500"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-white/40"
                    style={{ backgroundColor: strokeColor }}
                  />
                  Stroke
                </button>

                <button
                  type="button"
                  onClick={() => {
                    selectColorTarget("fill")
                    setShowColorPicker(true)
                  }}
                  className={`flex h-8 items-center gap-1.5 border-l border-zinc-200 px-2.5 text-[10px] font-bold uppercase ${
                    colorTarget === "fill"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-500"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded border border-zinc-300"
                    style={{ backgroundColor: fillColor }}
                  />
                  Fill
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowColorPicker((open) => !open)
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white"
                aria-label="Open color picker"
              >
                <span
                  className="h-5 w-5 rounded-full border border-zinc-300"
                  style={{
                    backgroundColor:
                      colorTarget === "fill"
                        ? fillColor
                        : strokeColor,
                  }}
                />
              </button>

              {recentColors.map((nextColor) => (
                <button
                  key={nextColor}
                  type="button"
                  onClick={() => selectColor(nextColor)}
                  className={`h-7 w-7 shrink-0 rounded-full border-2 ${
                    (
                      colorTarget === "fill"
                        ? fillColor
                        : strokeColor
                    ).toLowerCase() ===
                    nextColor.toLowerCase()
                      ? "scale-110 border-zinc-900"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: nextColor }}
                  aria-label={`Set ${colorTarget} to ${nextColor}`}
                />
              ))}

              <input
                type="text"
                defaultValue={
                  colorTarget === "fill"
                    ? fillColor
                    : strokeColor
                }
                key={`${colorTarget}-${colorTarget === "fill" ? fillColor : strokeColor}`}
                onChange={handleHexColorChange}
                className="h-8 w-[78px] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 font-mono text-[11px] uppercase text-zinc-700 outline-none focus:border-zinc-400"
                maxLength={7}
                aria-label={`Hex ${colorTarget} color`}
              />

              <div className="mx-1 h-6 w-px shrink-0 bg-zinc-300" />

              {STROKE_WIDTHS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    changeSelectedWidth(option.value)
                  }
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    strokeWidth === option.value
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-600"
                  }`}
                  aria-label={option.label}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{
                      width: Math.min(option.value, 18),
                      height: Math.min(option.value, 18),
                    }}
                  />
                </button>
              ))}
            </div>

            {showColorPicker && (
              <div
                className={`absolute left-3 z-[90] max-h-[calc(100dvh-250px)] w-[272px] touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border border-zinc-700 bg-zinc-900 p-3 text-white shadow-2xl ${
                  mobileViewport ? "bottom-full mb-1" : "top-full mt-1"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                      {colorTarget === "fill" ? "Fill" : "Stroke"}
                    </div>
                    <div className="font-mono text-xs">
                      {colorTarget === "fill" ? fillColor : strokeColor}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(false)}
                    className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    Done
                  </button>
                </div>

                <div
                  className="relative h-[145px] cursor-crosshair overflow-hidden rounded-xl"
                  style={{
                    backgroundColor: `hsl(${pickerHue} 100% 50%)`,
                    backgroundImage:
                      "linear-gradient(to right,#fff,transparent),linear-gradient(to top,#000,transparent)",
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                    pickSaturationValue(event)
                  }}
                  onPointerMove={(event) => {
                    if (
                      event.currentTarget.hasPointerCapture?.(event.pointerId)
                    ) {
                      pickSaturationValue(event)
                    }
                  }}
                >
                  {(() => {
                    const hsv = hexToHsv(
                      colorTarget === "fill"
                        ? fillColor
                        : strokeColor
                    )
                    return (
                      <span
                        className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.55)]"
                        style={{
                          left: `${hsv.s * 100}%`,
                          top: `${(1 - hsv.v) * 100}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    )
                  })()}
                </div>

                <div className="mt-3">
                  <div
                    className="relative h-5 cursor-pointer rounded-full"
                    style={{
                      background:
                        "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture?.(event.pointerId)
                      pickHue(event)
                    }}
                    onPointerMove={(event) => {
                      if (
                        event.currentTarget.hasPointerCapture?.(event.pointerId)
                      ) {
                        pickHue(event)
                      }
                    }}
                  >
                    <span
                      className="pointer-events-none absolute top-1/2 h-6 w-6 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.55)]"
                      style={{
                        left: `${(pickerHue / 360) * 100}%`,
                        transform: "translate(-50%, -50%)",
                        backgroundColor: `hsl(${pickerHue} 100% 50%)`,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-6 gap-1.5">
                  {COLORS.map((nextColor) => (
                    <button
                      key={nextColor}
                      type="button"
                      onClick={() => selectColor(nextColor)}
                      className="h-7 rounded-md border border-white/20"
                      style={{ backgroundColor: nextColor }}
                      aria-label={`Set ${colorTarget} to ${nextColor}`}
                    />
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={
                      colorTarget === "fill"
                        ? fillColor
                        : strokeColor
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                        selectColor(value)
                      }
                    }}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 font-mono text-xs uppercase text-white outline-none"
                    maxLength={7}
                  />
                  <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                    <span
                      className="h-5 w-5 rounded-full"
                      style={{
                        backgroundColor:
                          colorTarget === "fill"
                            ? fillColor
                            : strokeColor,
                      }}
                    />
                    <input
                      type="color"
                      value={
                        colorTarget === "fill"
                          ? fillColor
                          : strokeColor
                      }
                      onChange={handleCustomColorChange}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label={`Native ${colorTarget} picker`}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Canvas                                                             */}
      {/* ================================================================== */}

      <div
        ref={canvasViewportRef}
        className={
          mobileViewport
            ? "relative order-1 min-h-0 flex-1 overflow-hidden bg-zinc-800"
            : "relative"
        }
        style={{ touchAction: mobileViewport ? "none" : undefined }}
        onPointerDownCapture={handleViewportPointerDownCapture}
        onPointerMoveCapture={handleViewportPointerMoveCapture}
        onPointerUpCapture={handleViewportPointerEndCapture}
        onPointerCancelCapture={handleViewportPointerEndCapture}
      >
        <div
          ref={canvasStageRef}
          className={
            mobileViewport
              ? "absolute left-1/2 top-1/2 origin-center overflow-hidden border border-zinc-600 bg-white shadow-2xl will-change-transform"
              : "relative"
          }
        >

        <canvas
          ref={canvasRef}
          width={
            CANVAS_WIDTH
          }
          height={
            CANVAS_HEIGHT
          }
          className={`block h-auto w-full ${
            canDraw
              ? "cursor-none touch-none"
              : "cursor-default"
          }`}
          style={{
            aspectRatio:
              `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
            touchAction:
              canDraw || mobileViewport
                ? "none"
                : "auto",
          }}
        />

        <canvas
          ref={liveCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="pointer-events-none absolute inset-0 z-10 block h-full w-full"
          style={{
            aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
          }}
        />

        <canvas
          ref={
            overlayCanvasRef
          }
          width={
            CANVAS_WIDTH
          }
          height={
            CANVAS_HEIGHT
          }
          className="pointer-events-none absolute inset-0 z-20 block h-full w-full"
          style={{
            aspectRatio:
              `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
          }}
        />

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
                      strokeWidth *
                        2,
                      12
                    )
                  : strokeWidth,

              height:
                tool ===
                TOOLS.ERASER
                  ? Math.max(
                      strokeWidth *
                        2,
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

        {showEditCursor && (
          <div
            className="pointer-events-none absolute z-30 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-900 bg-white/85 shadow-sm"
            style={{
              left: cursorPosition.x,
              top: cursorPosition.y,
              transform: "translate(-50%, -50%)",
            }}
          >
            {tool === TOOLS.ROTATE ? (
              <RotateCcw size={15} className="text-zinc-900" />
            ) : tool === TOOLS.ANCHOR ? (
              <Anchor size={15} className="text-zinc-900" />
            ) : tool === TOOLS.CURVE ? (
              <Waves size={15} className="text-zinc-900" />
            ) : (
              <MousePointer2
                size={15}
                strokeWidth={2.25}
                className="text-zinc-900"
              />
            )}
          </div>
        )}

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

        {mobileViewport && (
          <>
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-zinc-950/65 px-3 py-1.5 text-[10px] font-medium text-zinc-300 backdrop-blur-sm">
              Two fingers to move, pinch, and rotate
            </div>

            <button
              type="button"
              onClick={resetViewportTransform}
              className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-zinc-950/75 text-white shadow-lg backdrop-blur-sm active:scale-95"
              aria-label="Reset canvas view"
            >
              <RotateCcw size={16} />
            </button>
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* Layers bottom sheet                                                */}
      {/* ================================================================== */}

      {showLayers && (
        <div className="absolute inset-0 z-[100] flex items-end bg-black/30">

          <div className="max-h-[70%] w-full rounded-t-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-zinc-900">
                  Layers
                </div>

                <div className="text-[11px] text-zinc-500">
                  Top layers appear above lower layers.
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowLayers(
                    false
                  )
                }
                className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700"
              >
                Done
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-2">
              {resolvedOperations
                .slice()
                .reverse()
                .map((operation) => {
                  const selected =
                    operation.id ===
                    selectedOperationId

                  const hidden =
                    Boolean(operation.hidden)

                  const label =
                    operation.type ===
                    "shape"
                      ? operation.shape
                      : operation.pen
                        ? "Pen"
                        : operation.type ===
                            "fill"
                          ? "Fill"
                          : operation.type ===
                              "eraser"
                            ? "Eraser"
                            : "Drawing"

                  return (
                    <div
                      key={operation.id}
                      className={`mb-1 flex items-center gap-1 rounded-xl p-1 ${
                        selected
                          ? "bg-indigo-50 ring-1 ring-indigo-200"
                          : "bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          selectLayer(
                            operation.id
                          )
                        }
                        className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-5 w-5 shrink-0 rounded border border-zinc-300"
                            style={{
                              backgroundColor:
                                operation.color ||
                                operation.fill ||
                                "#ffffff",
                            }}
                          />

                          <span className="truncate text-sm font-medium capitalize text-zinc-800">
                            {label}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          toggleLayer(
                            operation.id
                          )
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"
                        aria-label={
                          hidden
                            ? "Show layer"
                            : "Hide layer"
                        }
                      >
                        {hidden ? (
                          <EyeOff
                            size={16}
                          />
                        ) : (
                          <Eye
                            size={16}
                          />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          reorderLayers(
                            operation.id,
                            "back"
                          )
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"
                        aria-label="Send to back"
                      >
                        <ChevronsDown
                          size={16}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          reorderLayers(
                            operation.id,
                            "down"
                          )
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"
                        aria-label="Move layer down"
                      >
                        <ArrowDown
                          size={16}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          reorderLayers(
                            operation.id,
                            "up"
                          )
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"
                        aria-label="Move layer up"
                      >
                        <ArrowUp
                          size={16}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          reorderLayers(
                            operation.id,
                            "front"
                          )
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"
                        aria-label="Bring to front"
                      >
                        <ChevronsUp
                          size={16}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteLayer(
                            operation.id
                          )
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-red-600"
                        aria-label="Delete layer"
                      >
                        <Trash2
                          size={16}
                        />
                      </button>
                    </div>
                  )
                })}

              {resolvedOperations.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  No layers yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
