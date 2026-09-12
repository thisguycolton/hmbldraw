import { Head } from "@inertiajs/react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

const CANVAS_SIZE = 1200

const COLORS = [
  "#18181b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
]

const SIZES = [4, 10, 20, 40]

const FILL_TOLERANCE = 18
const FILL_EDGE_TOLERANCE = 64

const PEN_CLOSE_DISTANCE = 28
const PEN_SIMPLIFY_TOLERANCE = 2
const PEN_MAX_POINTS = 450

const ANCHOR_HIT_RADIUS = 16
const HANDLE_HIT_RADIUS = 12
const CURVE_HIT_DISTANCE = 18

/*
 * Pointer movements closer than this are ignored.
 *
 * This makes a surprisingly large difference on trackpads and
 * high-refresh-rate mice.
 */
const DRAW_POINT_MIN_DISTANCE = 2

/*
 * Prevent an accidental multi-thousand-point live stroke from
 * making the preview progressively more expensive.
 */
const ACTIVE_STROKE_MAX_POINTS = 1400

/*
 * ---------------------------------------------------------------------------
 * General helpers
 * ---------------------------------------------------------------------------
 */

function makeId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function pointDistance(a, b) {
  return Math.hypot(
    a[0] - b[0],
    a[1] - b[1]
  )
}

/*
 * ---------------------------------------------------------------------------
 * Operation cloning / undo snapshots
 * ---------------------------------------------------------------------------
 */

function cloneOperation(operation) {
  if (!operation) {
    return operation
  }

  return {
    ...operation,

    points: Array.isArray(operation.points)
      ? operation.points.map((point) => [
          point[0],
          point[1],
        ])
      : operation.points,

    point: Array.isArray(operation.point)
      ? [
          operation.point[0],
          operation.point[1],
        ]
      : operation.point,

    anchors: Array.isArray(operation.anchors)
      ? operation.anchors.map((anchor) => ({
          x: anchor.x,
          y: anchor.y,

          in: {
            x: anchor.in.x,
            y: anchor.in.y,
          },

          out: {
            x: anchor.out.x,
            y: anchor.out.y,
          },
        }))
      : operation.anchors,
  }
}

function cloneOperations(operations) {
  return operations.map(cloneOperation)
}

/*
 * ---------------------------------------------------------------------------
 * Pen simplification
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

  const denominator =
    dx * dx + dy * dy

  const t = clamp(
    (
      (point[0] - start[0]) * dx +
      (point[1] - start[1]) * dy
    ) / denominator,
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

function simplifyRdp(
  points,
  tolerance
) {
  if (points.length <= 2) {
    return points
  }

  let maxDistance = 0
  let index = 0

  const first = points[0]
  const last =
    points[points.length - 1]

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
      maxDistance = distance
      index = i
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyRdp(
      points.slice(
        0,
        index + 1
      ),
      tolerance
    )

    const right = simplifyRdp(
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
  if (
    points.length <= maxPoints
  ) {
    return points
  }

  const result = new Array(
    maxPoints
  )

  const lastIndex =
    points.length - 1

  for (
    let i = 0;
    i < maxPoints;
    i += 1
  ) {
    const index =
      Math.round(
        (
          i /
          (maxPoints - 1)
        ) *
          lastIndex
      )

    result[i] = points[index]
  }

  return result
}

function preparePenPoints(points) {
  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return []
  }

  if (
    points.length <= 2
  ) {
    return points.map(
      (point) => [
        point[0],
        point[1],
      ]
    )
  }

  const cleaned = [
    [
      points[0][0],
      points[0][1],
    ],
  ]

  for (
    let i = 1;
    i < points.length;
    i += 1
  ) {
    const previous =
      cleaned[
        cleaned.length - 1
      ]

    const current =
      points[i]

    if (
      pointDistance(
        current,
        previous
      ) >= 1
    ) {
      cleaned.push([
        current[0],
        current[1],
      ])
    }
  }

  if (
    cleaned.length <= 2
  ) {
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

function shouldSnapPenClosed(points) {
  if (
    !Array.isArray(points) ||
    points.length < 3
  ) {
    return false
  }

  return (
    pointDistance(
      points[0],
      points[
        points.length - 1
      ]
    ) <=
    PEN_CLOSE_DISTANCE
  )
}

function snapPenClosed(points) {
  if (
    !Array.isArray(points) ||
    points.length < 2
  ) {
    return points
  }

  return [
    ...points.slice(0, -1),
    [
      points[0][0],
      points[0][1],
    ],
  ]
}

/*
 * ---------------------------------------------------------------------------
 * Vector anchor generation
 * ---------------------------------------------------------------------------
 */

function createPenAnchors(points) {
  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return []
  }

  if (
    points.length === 1
  ) {
    const x = points[0][0]
    const y = points[0][1]

    return [
      {
        x,
        y,

        in: {
          x,
          y,
        },

        out: {
          x,
          y,
        },
      },
    ]
  }

  const anchors =
    new Array(points.length)

  for (
    let i = 0;
    i < points.length;
    i += 1
  ) {
    const current =
      points[i]

    const previous =
      points[
        (i - 1 + points.length) %
          points.length
      ]

    const next =
      points[
        (i + 1) %
          points.length
      ]

    const tangentX =
      next[0] - previous[0]

    const tangentY =
      next[1] - previous[1]

    const tangentLength =
      Math.hypot(
        tangentX,
        tangentY
      )

    if (
      tangentLength <
      0.001
    ) {
      anchors[i] = {
        x: current[0],
        y: current[1],

        in: {
          x: current[0],
          y: current[1],
        },

        out: {
          x: current[0],
          y: current[1],
        },
      }

      continue
    }

    const normalX =
      tangentX /
      tangentLength

    const normalY =
      tangentY /
      tangentLength

    const previousDistance =
      pointDistance(
        current,
        previous
      )

    const nextDistance =
      pointDistance(
        current,
        next
      )

    const handleLength =
      Math.min(
        previousDistance,
        nextDistance
      ) * 0.28

    anchors[i] = {
      x: current[0],
      y: current[1],

      in: {
        x:
          current[0] -
          normalX *
            handleLength,

        y:
          current[1] -
          normalY *
            handleLength,
      },

      out: {
        x:
          current[0] +
          normalX *
            handleLength,

        y:
          current[1] +
          normalY *
            handleLength,
      },
    }
  }

  return anchors
}

function cloneAnchors(anchors) {
  if (!Array.isArray(anchors)) {
    return anchors
  }

  return anchors.map(
    (anchor) => ({
      x: anchor.x,
      y: anchor.y,

      in: {
        x: anchor.in.x,
        y: anchor.in.y,
      },

      out: {
        x: anchor.out.x,
        y: anchor.out.y,
      },
    })
  )
}

/*
 * ---------------------------------------------------------------------------
 * Bézier helpers
 * ---------------------------------------------------------------------------
 */

function cubicPoint(
  p0,
  p1,
  p2,
  p3,
  t
) {
  const mt = 1 - t

  return [
    mt * mt * mt * p0[0] +
      3 *
        mt *
        mt *
        t *
        p1[0] +
      3 *
        mt *
        t *
        t *
        p2[0] +
      t *
        t *
        t *
        p3[0],

    mt * mt * mt * p0[1] +
      3 *
        mt *
        mt *
        t *
        p1[1] +
      3 *
        mt *
        t *
        t *
        p2[1] +
      t *
        t *
        t *
        p3[1],
  ]
}

function distanceToSegment(
  point,
  a,
  b
) {
  const dx =
    b[0] - a[0]

  const dy =
    b[1] - a[1]

  if (
    dx === 0 &&
    dy === 0
  ) {
    return pointDistance(
      point,
      a
    )
  }

  const denominator =
    dx * dx + dy * dy

  const t = clamp(
    (
      (point[0] - a[0]) * dx +
      (point[1] - a[1]) * dy
    ) /
      denominator,
    0,
    1
  )

  const projection = [
    a[0] + t * dx,
    a[1] + t * dy,
  ]

  return pointDistance(
    point,
    projection
  )
}

function findClosestPenSegment(
  operation,
  point
) {
  const anchors =
    operation.anchors

  if (
    !Array.isArray(
      anchors
    ) ||
    anchors.length < 2
  ) {
    return null
  }

  let best = null

  /*
   * Pen paths are always geometrically closed because they are filled.
   */
  const segmentCount =
    anchors.length

  for (
    let index = 0;
    index < segmentCount;
    index += 1
  ) {
    const start =
      anchors[index]

    const end =
      anchors[
        (index + 1) %
          anchors.length
      ]

    const p0 = [
      start.x,
      start.y,
    ]

    const p1 = [
      start.out.x,
      start.out.y,
    ]

    const p2 = [
      end.in.x,
      end.in.y,
    ]

    const p3 = [
      end.x,
      end.y,
    ]

    let previous = p0

    for (
      let step = 1;
      step <= 16;
      step += 1
    ) {
      const t =
        step / 16

      const current =
        cubicPoint(
          p0,
          p1,
          p2,
          p3,
          t
        )

      const distance =
        distanceToSegment(
          point,
          previous,
          current
        )

      if (
        !best ||
        distance <
          best.distance
      ) {
        best = {
          distance,
          segmentIndex:
            index,
        }
      }

      previous = current
    }
  }

  return best
}

/*
 * ---------------------------------------------------------------------------
 * Pen Path2D
 * ---------------------------------------------------------------------------
 */

function buildPenPath(operation) {
  if (
    !operation?.pen ||
    !Array.isArray(
      operation.anchors
    ) ||
    operation.anchors.length === 0
  ) {
    return null
  }

  const path =
    new Path2D()

  const anchors =
    operation.anchors

  path.moveTo(
    anchors[0].x,
    anchors[0].y
  )

  /*
   * Pen objects are filled shapes.
   * The final segment implicitly closes the path.
   */
  for (
    let index = 0;
    index < anchors.length;
    index += 1
  ) {
    const start =
      anchors[index]

    const end =
      anchors[
        (index + 1) %
          anchors.length
      ]

    path.bezierCurveTo(
      start.out.x,
      start.out.y,
      end.in.x,
      end.in.y,
      end.x,
      end.y
    )
  }

  path.closePath()

  return path
}

/*
 * ---------------------------------------------------------------------------
 * DrawingDebug
 * ---------------------------------------------------------------------------
 */

export default function DrawingDebug() {
  /*
   * Visible drawing layer.
   */
  const canvasRef =
    useRef(null)

  /*
  * Active live-stroke layer.
  *
  * This layer is never part of the committed scene cache.
  */
  const activeCanvasRef =
    useRef(null)

  /*
   * Selection / grid layer.
   */
  const overlayCanvasRef =
    useRef(null)

  const containerRef =
    useRef(null)

  /*
   * Offscreen raster cache containing all committed operations.
   */
  const sceneCacheRef =
    useRef(null)

  const sceneCacheContextRef =
    useRef(null)

  const sceneCacheDirtyRef =
    useRef(true)

    /*
    * Which operation is currently excluded from the scene cache.
    *
    * Move / Anchor / Curve edit the selected Pen separately on the
    * foreground layer so the rest of the scene does not need to repaint.
    */
    const sceneCacheExcludedIdRef =
      useRef(null)
  /*
   * Animation frame scheduler.
   */
  const renderFrameRef =
    useRef(null)

  /*
   * Authoritative mutable drawing state.
   */
  const operationsRef =
    useRef([])

  const undoStackRef =
    useRef([])

  /*
   * Pointer interaction state.
   */
  const drawingRef =
    useRef(false)

  const currentStrokeRef =
    useRef(null)

  const editRef =
    useRef(null)

  /*
   * React state.
   */
  const [tool, setTool] =
    useState("stroke")

  const [color, setColor] =
    useState("#18181b")

  const [width, setWidth] =
    useState(20)

  const [operations, setOperations] =
    useState([])

  const [showGrid, setShowGrid] =
    useState(false)

  const [
    showCoordinates,
    setShowCoordinates,
  ] = useState(false)

  const [showLog, setShowLog] =
    useState(true)

  const [pointer, setPointer] =
    useState(null)

  const [canvasSize, setCanvasSize] =
    useState({
      width: 0,
      height: 0,
    })

  const [
    selectedOperationId,
    setSelectedOperationId,
  ] = useState(null)

  const [
    selectedAnchorIndex,
    setSelectedAnchorIndex,
  ] = useState(null)

  /*
   * -------------------------------------------------------------------------
   * State mirrors
   *
   * Pointer/render code can read these without waiting for React state
   * updates.
   * -------------------------------------------------------------------------
   */

  const toolRef =
    useRef(tool)

  const colorRef =
    useRef(color)

  const widthRef =
    useRef(width)

  const showGridRef =
    useRef(showGrid)

  const showCoordinatesRef =
    useRef(showCoordinates)

  const selectedOperationIdRef =
    useRef(selectedOperationId)

  const selectedAnchorIndexRef =
    useRef(selectedAnchorIndex)

  useEffect(() => {
    toolRef.current = tool
  }, [tool])

  useEffect(() => {
    colorRef.current = color
  }, [color])

  useEffect(() => {
    widthRef.current = width
  }, [width])

  useEffect(() => {
    showGridRef.current =
      showGrid

    scheduleRender()
  }, [showGrid])

  useEffect(() => {
    showCoordinatesRef.current =
      showCoordinates

    if (!showCoordinates) {
      setPointer(null)
    }
  }, [showCoordinates])

  useEffect(() => {
    selectedOperationIdRef.current =
      selectedOperationId

    scheduleRender()
  }, [selectedOperationId])

  useEffect(() => {
    selectedAnchorIndexRef.current =
      selectedAnchorIndex

    scheduleRender()
  }, [selectedAnchorIndex])

  /*
   * -------------------------------------------------------------------------
   * Undo
   * -------------------------------------------------------------------------
   */

  const pushUndoSnapshot =
    useCallback(() => {
      undoStackRef.current.push(
        cloneOperations(
          operationsRef.current
        )
      )

      /*
       * Keep accidental runaway undo history from becoming its own
       * memory problem during debugging.
       */
      if (
        undoStackRef.current.length >
        100
      ) {
        undoStackRef.current.shift()
      }
    }, [])

  /*
   * -------------------------------------------------------------------------
   * Canvas coordinate conversion
   * -------------------------------------------------------------------------
   */

  const getCanvasPoint =
    useCallback(
      (event) => {
        const canvas =
          canvasRef.current

        if (!canvas) {
          return null
        }

        const rect =
          canvas.getBoundingClientRect()

        if (
          rect.width === 0 ||
          rect.height === 0
        ) {
          return null
        }

        return {
          x:
            (
              (
                event.clientX -
                rect.left
              ) /
              rect.width
            ) *
            CANVAS_SIZE,

          y:
            (
              (
                event.clientY -
                rect.top
              ) /
              rect.height
            ) *
            CANVAS_SIZE,
        }
      },
      []
    )

  /*
   * -------------------------------------------------------------------------
   * Scene cache
   * -------------------------------------------------------------------------
   */

  const ensureSceneCache =
    useCallback(() => {
      if (
        sceneCacheRef.current &&
        sceneCacheContextRef.current
      ) {
        return {
          canvas:
            sceneCacheRef.current,

          context:
            sceneCacheContextRef.current,
        }
      }

      const cache =
        document.createElement(
          "canvas"
        )

      cache.width =
        CANVAS_SIZE

      cache.height =
        CANVAS_SIZE

      const context =
        cache.getContext("2d")

      if (!context) {
        return null
      }

      sceneCacheRef.current =
        cache

      sceneCacheContextRef.current =
        context

      return {
        canvas: cache,
        context,
      }
    }, [])

  /*
   * -------------------------------------------------------------------------
   * Pen path cache
   * -------------------------------------------------------------------------
   */

  const penPathCacheRef =
    useRef(
      new Map()
    )

  const getPenPath =
    useCallback(
      (operation) => {
        if (
          !operation?.pen
        ) {
          return null
        }

        const cached =
          penPathCacheRef.current.get(
            operation.id
          )

        const version =
          operation.geometryVersion ||
          0

        if (
          cached &&
          cached.version ===
            version
        ) {
          return cached.path
        }

        const path =
          buildPenPath(
            operation
          )

        if (!path) {
          return null
        }

        penPathCacheRef.current.set(
          operation.id,
          {
            version,
            path,
          }
        )

        return path
      },
      []
    )

  /*
   * -------------------------------------------------------------------------
   * Ordinary stroke renderer
   * -------------------------------------------------------------------------
   */

  const drawPenAnchors =
    useCallback(
      (
        context,
        anchors
      ) => {
        if (
          !Array.isArray(
            anchors
          ) ||
          anchors.length === 0
        ) {
          return
        }

        context.beginPath()

        context.moveTo(
          anchors[0].x,
          anchors[0].y
        )

        for (
          let i = 0;
          i < anchors.length;
          i += 1
        ) {
          const start =
            anchors[i]

          const end =
            anchors[
              (i + 1) %
                anchors.length
            ]

          context.bezierCurveTo(
            start.out.x,
            start.out.y,
            end.in.x,
            end.in.y,
            end.x,
            end.y
          )
        }

        context.closePath()

        context.fill()
        context.stroke()
      },
      []
    )

  const drawPenCurve =
    useCallback(
      (
        context,
        points,
        {
          fill = true,
          close = true,
        } = {}
      ) => {
        if (
          !Array.isArray(
            points
          ) ||
          points.length === 0
        ) {
          return
        }

        if (
          points.length === 1
        ) {
          const point =
            points[0]

          context.beginPath()

          context.arc(
            point[0],
            point[1],
            context.lineWidth / 2,
            0,
            Math.PI * 2
          )

          if (fill) {
            context.fill()
          }

          context.stroke()

          return
        }

        if (
          points.length === 2
        ) {
          context.beginPath()

          context.moveTo(
            points[0][0],
            points[0][1]
          )

          context.lineTo(
            points[1][0],
            points[1][1]
          )

          if (close) {
            context.closePath()
          }

          if (fill) {
            context.fill()
          }

          context.stroke()

          return
        }

        context.beginPath()

        context.moveTo(
          points[0][0],
          points[0][1]
        )

        for (
          let index = 1;
          index <
            points.length - 1;
          index += 1
        ) {
          const current =
            points[index]

          const next =
            points[index + 1]

          const midpointX =
            (
              current[0] +
              next[0]
            ) / 2

          const midpointY =
            (
              current[1] +
              next[1]
            ) / 2

          context.quadraticCurveTo(
            current[0],
            current[1],
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
          penultimate[0],
          penultimate[1],
          last[0],
          last[1]
        )

        if (close) {
          context.closePath()
        }

        if (fill) {
          context.fill()
        }

        context.stroke()
      },
      []
    )

  const drawStroke =
    useCallback(
      (
        context,
        operation
      ) => {
        const points =
          Array.isArray(
            operation.points
          )
            ? operation.points
            : []

        if (
          points.length === 0
        ) {
          return
        }

        context.save()

        context.lineCap =
          "round"

        context.lineJoin =
          "round"

        context.lineWidth =
          Number(
            operation.width
          ) || 1

        if (
          operation.type ===
          "eraser"
        ) {
          context.globalCompositeOperation =
            "destination-out"

          context.strokeStyle =
            "#000000"

          context.fillStyle =
            "#000000"
        } else {
          context.globalCompositeOperation =
            "source-over"

          const operationColor =
            operation.color ||
            "#18181b"

          context.strokeStyle =
            operationColor

          context.fillStyle =
            operationColor
        }

        if (
          operation.pen &&
          Array.isArray(
            operation.anchors
          ) &&
          operation.anchors.length
        ) {
          /*
           * Pen always renders as a filled shape.
           */
          context.globalCompositeOperation =
            "source-over"

          drawPenAnchors(
            context,
            operation.anchors
          )

          context.restore()

          return
        }

        if (
          operation.pen
        ) {
          drawPenCurve(
            context,
            points,
            {
              close: true,
              fill: true,
            }
          )

          context.restore()

          return
        }

        if (
          points.length === 1
        ) {
          const point =
            points[0]

          context.beginPath()

          context.arc(
            point[0],
            point[1],
            context.lineWidth / 2,
            0,
            Math.PI * 2
          )

          context.fill()

          context.restore()

          return
        }

        if (
          points.length === 2
        ) {
          context.beginPath()

          context.moveTo(
            points[0][0],
            points[0][1]
          )

          context.lineTo(
            points[1][0],
            points[1][1]
          )

          context.stroke()

          context.restore()

          return
        }

        context.beginPath()

        context.moveTo(
          points[0][0],
          points[0][1]
        )

        for (
          let index = 1;
          index <
            points.length - 1;
          index += 1
        ) {
          const current =
            points[index]

          const next =
            points[index + 1]

          const midpointX =
            (
              current[0] +
              next[0]
            ) / 2

          const midpointY =
            (
              current[1] +
              next[1]
            ) / 2

          context.quadraticCurveTo(
            current[0],
            current[1],
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
          penultimate[0],
          penultimate[1],
          last[0],
          last[1]
        )

        context.stroke()

        context.restore()
      },
      [
        drawPenAnchors,
        drawPenCurve,
      ]
    )

  /*
   * -------------------------------------------------------------------------
   * Fast fill renderer
   * -------------------------------------------------------------------------
   *
   * Fill operations are now ONLY executed when rebuilding the scene cache.
   * They are never replayed during ordinary pointer movement.
   * -------------------------------------------------------------------------
   */

  const hexToRgba =
    useCallback(
      (hex) => {
        const value =
          hex.replace("#", "")

        const normalized =
          value.length === 3
            ? value
                .split("")
                .map(
                  (char) =>
                    char + char
                )
                .join("")
            : value

        return [
          parseInt(
            normalized.slice(
              0,
              2
            ),
            16
          ),
          parseInt(
            normalized.slice(
              2,
              4
            ),
            16
          ),
          parseInt(
            normalized.slice(
              4,
              6
            ),
            16
          ),
          255,
        ]
      },
      []
    )

  const colorDistanceSquared =
    useCallback(
      (
        data,
        index,
        target
      ) => {
        const dr =
          data[index] -
          target[0]

        const dg =
          data[index + 1] -
          target[1]

        const db =
          data[index + 2] -
          target[2]

        const da =
          data[index + 3] -
          target[3]

        return (
          dr * dr +
          dg * dg +
          db * db +
          da * da
        )
      },
      []
    )

  const applyFillOperation =
    useCallback(
      (
        context,
        operation
      ) => {
        const x =
          Math.round(
            operation.point?.[0]
          )

        const y =
          Math.round(
            operation.point?.[1]
          )

        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0 ||
          x >= CANVAS_SIZE ||
          y < 0 ||
          y >= CANVAS_SIZE
        ) {
          return
        }

        const imageData =
          context.getImageData(
            0,
            0,
            CANVAS_SIZE,
            CANVAS_SIZE
          )

        const data =
          imageData.data

        const replacement =
          hexToRgba(
            operation.color ||
              "#18181b"
          )

        const startPixel =
          y *
            CANVAS_SIZE +
          x

        const startIndex =
          startPixel * 4

        const target = [
          data[startIndex],
          data[startIndex + 1],
          data[startIndex + 2],
          data[startIndex + 3],
        ]

        const toleranceSquared =
          FILL_TOLERANCE *
          FILL_TOLERANCE

        if (
          colorDistanceSquared(
            data,
            startIndex,
            replacement
          ) <=
          toleranceSquared
        ) {
          return
        }

        const pixelCount =
          CANVAS_SIZE *
          CANVAS_SIZE

        /*
         * One integer per pixel instead of an array of [x,y] arrays.
         *
         * This eliminates millions of temporary JS arrays during large fills.
         */
        const queue =
          new Int32Array(
            pixelCount
          )

        const visited =
          new Uint8Array(
            pixelCount
          )

        let head = 0
        let tail = 0

        queue[tail++] =
          startPixel

        visited[startPixel] =
          1

        while (
          head < tail
        ) {
          const pixel =
            queue[head++]

          const px =
            pixel %
            CANVAS_SIZE

          const py =
            Math.floor(
              pixel /
                CANVAS_SIZE
            )

          const dataIndex =
            pixel * 4

          data[dataIndex] =
            replacement[0]

          data[dataIndex + 1] =
            replacement[1]

          data[dataIndex + 2] =
            replacement[2]

          data[dataIndex + 3] =
            replacement[3]

          /*
           * Left
           */
          if (px > 0) {
            const neighbor =
              pixel - 1

            if (
              !visited[
                neighbor
              ]
            ) {
              const neighborIndex =
                neighbor * 4

              if (
                colorDistanceSquared(
                  data,
                  neighborIndex,
                  target
                ) <=
                toleranceSquared
              ) {
                visited[
                  neighbor
                ] = 1

                queue[tail++] =
                  neighbor
              }
            }
          }

          /*
           * Right
           */
          if (
            px <
            CANVAS_SIZE - 1
          ) {
            const neighbor =
              pixel + 1

            if (
              !visited[
                neighbor
              ]
            ) {
              const neighborIndex =
                neighbor * 4

              if (
                colorDistanceSquared(
                  data,
                  neighborIndex,
                  target
                ) <=
                toleranceSquared
              ) {
                visited[
                  neighbor
                ] = 1

                queue[tail++] =
                  neighbor
              }
            }
          }

          /*
           * Up
           */
          if (py > 0) {
            const neighbor =
              pixel -
              CANVAS_SIZE

            if (
              !visited[
                neighbor
              ]
            ) {
              const neighborIndex =
                neighbor * 4

              if (
                colorDistanceSquared(
                  data,
                  neighborIndex,
                  target
                ) <=
                toleranceSquared
              ) {
                visited[
                  neighbor
                ] = 1

                queue[tail++] =
                  neighbor
              }
            }
          }

          /*
           * Down
           */
          if (
            py <
            CANVAS_SIZE - 1
          ) {
            const neighbor =
              pixel +
              CANVAS_SIZE

            if (
              !visited[
                neighbor
              ]
            ) {
              const neighborIndex =
                neighbor * 4

              if (
                colorDistanceSquared(
                  data,
                  neighborIndex,
                  target
                ) <=
                toleranceSquared
              ) {
                visited[
                  neighbor
                ] = 1

                queue[tail++] =
                  neighbor
              }
            }
          }
        }

        /*
         * Anti-aliased edge fringe.
         *
         * We only inspect pixels immediately adjacent to the filled region.
         * This preserves the existing edge tolerance without scanning the
         * entire image again.
         */
        const edgeToleranceSquared =
          FILL_EDGE_TOLERANCE *
          FILL_EDGE_TOLERANCE

        const fringe =
          new Int32Array(
            Math.min(
              pixelCount,
              tail * 2
            )
          )

        let fringeLength = 0

        for (
          let index = 0;
          index < tail;
          index += 1
        ) {
          const pixel =
            queue[index]

          const px =
            pixel %
            CANVAS_SIZE

          const py =
            Math.floor(
              pixel /
                CANVAS_SIZE
            )

          /*
           * Check four neighboring pixels for fringe candidates.
           */
          if (px > 0) {
            const neighbor =
              pixel - 1

            if (
              !visited[
                neighbor
              ] &&
              colorDistanceSquared(
                data,
                neighbor * 4,
                target
              ) <=
              edgeToleranceSquared
            ) {
              fringe[
                fringeLength++
              ] = neighbor
            }
          }

          if (
            px <
            CANVAS_SIZE - 1
          ) {
            const neighbor =
              pixel + 1

            if (
              !visited[
                neighbor
              ] &&
              colorDistanceSquared(
                data,
                neighbor * 4,
                target
              ) <=
              edgeToleranceSquared
            ) {
              fringe[
                fringeLength++
              ] = neighbor
            }
          }

          if (py > 0) {
            const neighbor =
              pixel -
              CANVAS_SIZE

            if (
              !visited[
                neighbor
              ] &&
              colorDistanceSquared(
                data,
                neighbor * 4,
                target
              ) <=
              edgeToleranceSquared
            ) {
              fringe[
                fringeLength++
              ] = neighbor
            }
          }

          if (
            py <
            CANVAS_SIZE - 1
          ) {
            const neighbor =
              pixel +
              CANVAS_SIZE

            if (
              !visited[
                neighbor
              ] &&
              colorDistanceSquared(
                data,
                neighbor * 4,
                target
              ) <=
              edgeToleranceSquared
            ) {
              fringe[
                fringeLength++
              ] = neighbor
            }
          }
        }

        for (
          let index = 0;
          index < fringeLength;
          index += 1
        ) {
          const pixel =
            fringe[index]

          const dataIndex =
            pixel * 4

          data[dataIndex] =
            replacement[0]

          data[dataIndex + 1] =
            replacement[1]

          data[dataIndex + 2] =
            replacement[2]

          data[dataIndex + 3] =
            replacement[3]
        }

        context.putImageData(
          imageData,
          0,
          0
        )
      },
      [
        colorDistanceSquared,
        hexToRgba,
      ]
    )

  /*
   * -------------------------------------------------------------------------
   * Draw operation
   * -------------------------------------------------------------------------
   */

  const drawOperation =
    useCallback(
      (
        context,
        operation
      ) => {
        if (!operation) {
          return
        }

        if (
          operation.type ===
          "fill"
        ) {
          applyFillOperation(
            context,
            operation
          )

          return
        }

        drawStroke(
          context,
          operation
        )
      },
      [
        applyFillOperation,
        drawStroke,
      ]
    )

  /*
   * -------------------------------------------------------------------------
   * Rebuild cached scene
   * -------------------------------------------------------------------------
   */

  const rebuildSceneCache =
    useCallback(() => {
      const cache =
        ensureSceneCache()

      if (!cache) {
        return
      }

      const context =
        cache.context

      context.clearRect(
        0,
        0,
        CANVAS_SIZE,
        CANVAS_SIZE
      )

      context.save()

      context.globalCompositeOperation =
        "source-over"

      context.fillStyle =
        "#ffffff"

      context.fillRect(
        0,
        0,
        CANVAS_SIZE,
        CANVAS_SIZE
      )

      context.restore()

      for (
        const operation of
          operationsRef.current
      ) {
        drawOperation(
          context,
          operation
        )
      }

      sceneCacheDirtyRef.current =
        false
    }, [
      drawOperation,
      ensureSceneCache,
    ])


  /*
   * -------------------------------------------------------------------------
   * Editor overlay
   * -------------------------------------------------------------------------
   */

  const drawEditorOverlay =
    useCallback(
      (context) => {
        const selectedId =
          selectedOperationIdRef.current

        if (!selectedId) {
          return
        }

        const operation =
          operationsRef.current.find(
            (item) =>
              item.id === selectedId
          )

        if (
          !operation?.pen ||
          !Array.isArray(
            operation.anchors
          ) ||
          operation.anchors.length ===
            0
        ) {
          return
        }

        const anchors =
          operation.anchors

        const currentTool =
          toolRef.current

        const isMove =
          currentTool ===
          "move"

        const selectedAnchor =
          selectedAnchorIndexRef.current

        context.save()

        /*
         * Move mode gets a deliberately quieter editor display.
         */
        if (isMove) {
          context.strokeStyle =
            "rgba(99,102,241,0.30)"

          context.lineWidth = 1

          context.setLineDash([
            5,
            7,
          ])
        } else {
          context.strokeStyle =
            "rgba(99,102,241,0.70)"

          context.lineWidth = 2

          context.setLineDash([
            8,
            6,
          ])
        }

        context.beginPath()

        context.moveTo(
          anchors[0].x,
          anchors[0].y
        )

        /*
         * Pen is always geometrically closed.
         */
        for (
          let i = 0;
          i < anchors.length;
          i += 1
        ) {
          const start =
            anchors[i]

          const end =
            anchors[
              (i + 1) %
                anchors.length
            ]

          context.bezierCurveTo(
            start.out.x,
            start.out.y,
            end.in.x,
            end.in.y,
            end.x,
            end.y
          )
        }

        context.closePath()
        context.stroke()

        context.setLineDash([])

        /*
         * Handles only matter in Anchor mode.
         *
         * Move mode deliberately hides them.
         */
        if (
          !isMove &&
          selectedAnchor !==
            null
        ) {
          const anchor =
            anchors[
              selectedAnchor
            ]

          if (anchor) {
            context.strokeStyle =
              "rgba(99,102,241,0.65)"

            context.lineWidth = 2

            context.beginPath()

            context.moveTo(
              anchor.x,
              anchor.y
            )

            context.lineTo(
              anchor.in.x,
              anchor.in.y
            )

            context.moveTo(
              anchor.x,
              anchor.y
            )

            context.lineTo(
              anchor.out.x,
              anchor.out.y
            )

            context.stroke()

            context.beginPath()

            context.arc(
              anchor.in.x,
              anchor.in.y,
              7,
              0,
              Math.PI * 2
            )

            context.fillStyle =
              "#ffffff"

            context.fill()

            context.strokeStyle =
              "#6366f1"

            context.stroke()

            context.beginPath()

            context.arc(
              anchor.out.x,
              anchor.out.y,
              7,
              0,
              Math.PI * 2
            )

            context.fillStyle =
              "#ffffff"

            context.fill()

            context.stroke()
          }
        }

        /*
         * Anchors.
         */
        for (
          let index = 0;
          index < anchors.length;
          index += 1
        ) {
          const anchor =
            anchors[index]

          const selected =
            index ===
            selectedAnchor

          let radius
          let fill
          let stroke

          if (isMove) {
            /*
             * Small + subtle in Move mode.
             */
            radius =
              selected
                ? 5
                : 4

            fill =
              selected
                ? "rgba(99,102,241,0.45)"
                : "rgba(99,102,241,0.24)"

            stroke =
              "rgba(255,255,255,0.42)"
          } else {
            radius =
              selected
                ? 10
                : 7

            fill =
              selected
                ? "#ffffff"
                : "#6366f1"

            stroke =
              selected
                ? "#6366f1"
                : "#ffffff"
          }

          context.beginPath()

          context.arc(
            anchor.x,
            anchor.y,
            radius,
            0,
            Math.PI * 2
          )

          context.fillStyle =
            fill

          context.fill()

          context.lineWidth =
            isMove
              ? 1
              : 2

          context.strokeStyle =
            stroke

          context.stroke()
        }

        context.restore()
      },
      []
    )

  /*
   * -------------------------------------------------------------------------
   * Grid
   * -------------------------------------------------------------------------
   */

  const drawGrid =
    useCallback(
      (context) => {
        if (
          !showGridRef.current
        ) {
          return
        }

        context.save()

        context.strokeStyle =
          "rgba(0,0,0,0.08)"

        context.lineWidth = 1

        const gridSize = 100

        context.beginPath()

        for (
          let position = 0;
          position <=
          CANVAS_SIZE;
          position +=
            gridSize
        ) {
          context.moveTo(
            position,
            0
          )

          context.lineTo(
            position,
            CANVAS_SIZE
          )

          context.moveTo(
            0,
            position
          )

          context.lineTo(
            CANVAS_SIZE,
            position
          )
        }

        context.stroke()

        context.restore()
      },
      []
    )
/*
 * -------------------------------------------------------------------------
 * Operation mutation
 * -------------------------------------------------------------------------
 *
 * IMPORTANT:
 *
 * During an active editor drag we mutate the selected operation in place.
 *
 * React does NOT need to know about every pointer movement.
 * The canvas renderer reads operationsRef directly.
 *
 * React state is committed once on pointer-up.
 * -------------------------------------------------------------------------
 */

const updateOperation =
  useCallback(
    (
      operationId,
      updater
    ) => {
      const operation =
        operationsRef.current.find(
          (item) =>
            item.id ===
            operationId
        )

      if (!operation) {
        return null
      }

      const updated =
        updater(operation)

      /*
       * The updater normally mutates the existing operation and
       * returns it.
       */
      const result =
        updated || operation

      /*
       * Invalidate the cached Path2D for vector Pen geometry.
       */
      if (
        result.pen
      ) {
        result.geometryVersion =
          (
            result.geometryVersion ||
            0
          ) + 1
      }

      return result
    },
    []
  )
  /*
   * -------------------------------------------------------------------------
   * Move whole vector object
   * -------------------------------------------------------------------------
   */

/*
 * -------------------------------------------------------------------------
 * Move whole vector object
 * -------------------------------------------------------------------------
 *
 * Do NOT clamp individual points.
 *
 * Canvas rendering naturally clips geometry outside the 1200 × 1200
 * viewport. Clamping individual anchors/handles can distort the object
 * when it reaches an edge.
 * -------------------------------------------------------------------------
 */

const moveOperation =
  useCallback(
    (
      operationId,
      dx,
      dy
    ) => {
      updateOperation(
        operationId,
        (operation) => {
          if (
            Array.isArray(
              operation.anchors
            )
          ) {
            for (
              const anchor of
                operation.anchors
            ) {
              anchor.x += dx
              anchor.y += dy

              anchor.in.x += dx
              anchor.in.y += dy

              anchor.out.x += dx
              anchor.out.y += dy
            }
          }

          if (
            Array.isArray(
              operation.points
            )
          ) {
            for (
              const point of
                operation.points
            ) {
              point[0] += dx
              point[1] += dy
            }
          }

          if (
            Array.isArray(
              operation.point
            )
          ) {
            operation.point[0] += dx
            operation.point[1] += dy
          }

          return operation
        }
      )
    },
    [updateOperation]
  )
  /*
   * -------------------------------------------------------------------------
   * Render base scene
   * -------------------------------------------------------------------------
   *
   * IMPORTANT:
   *
   * The selected vector object is excluded from the cached scene while
   * editing. It is then drawn separately on top.
   *
   * This means moving an object does NOT require repainting every other
   * operation on every pointer event.
   * -------------------------------------------------------------------------
   */

  const renderBase =
    useCallback(() => {
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

      const editingTool =
        toolRef.current ===
          "anchor" ||
        toolRef.current ===
          "curve" ||
        toolRef.current ===
          "move"

      const selectedId =
        editingTool
          ? selectedOperationIdRef.current
          : null

      const cachedExclusion =
        sceneCacheExcludedIdRef.current

      if (
        sceneCacheDirtyRef.current ||
        cachedExclusion !==
          selectedId
      ) {
        const cache =
          ensureSceneCache()

        if (!cache) {
          return
        }

        const cacheContext =
          cache.context

        cacheContext.clearRect(
          0,
          0,
          CANVAS_SIZE,
          CANVAS_SIZE
        )

        cacheContext.save()

        cacheContext.globalCompositeOperation =
          "source-over"

        cacheContext.fillStyle =
          "#ffffff"

        cacheContext.fillRect(
          0,
          0,
          CANVAS_SIZE,
          CANVAS_SIZE
        )

        cacheContext.restore()

        for (
          const operation of
            operationsRef.current
        ) {
          if (
            selectedId &&
            operation.id ===
              selectedId
          ) {
            continue
          }

          drawOperation(
            cacheContext,
            operation
          )
        }

        sceneCacheExcludedIdRef.current =
          selectedId

        sceneCacheDirtyRef.current =
          false
      }

      context.clearRect(
        0,
        0,
        CANVAS_SIZE,
        CANVAS_SIZE
      )

      context.drawImage(
        sceneCacheRef.current,
        0,
        0
      )

      /*
       * Draw the selected vector object separately.
       *
       * Because the object was excluded from the cache, its current
       * geometry can move freely without leaving a ghost behind.
       */
      if (
        selectedId
      ) {
        const selected =
          operationsRef.current.find(
            (operation) =>
              operation.id ===
              selectedId
          )

        if (selected) {
          drawStroke(
            context,
            selected
          )
        }
      }
    }, [
      drawOperation,
      drawStroke,
      ensureSceneCache,
    ])

  /*
   * -------------------------------------------------------------------------
   * Fast active-stroke renderer
   * -------------------------------------------------------------------------
   *
   * Do NOT use the expensive smoothed Pen renderer while the pointer is
   * moving. The final stroke is smoothed after pointer-up.
   *
   * This avoids repeatedly calculating every quadratic/Bézier segment from
   * the beginning of a growing stroke.
   * -------------------------------------------------------------------------
   */

  const drawActiveStroke =
    useCallback(
      (
        context,
        stroke
      ) => {
        if (
          !stroke ||
          !Array.isArray(
            stroke.points
          ) ||
          stroke.points.length ===
            0
        ) {
          return
        }

        const points =
          stroke.points

        context.save()

        context.globalCompositeOperation =
          stroke.type ===
          "eraser"
            ? "destination-out"
            : "source-over"

        context.strokeStyle =
          stroke.color ||
          "#18181b"

        context.fillStyle =
          stroke.color ||
          "#18181b"

        context.lineWidth =
          Number(
            stroke.width
          ) || 1

        context.lineCap =
          "round"

        context.lineJoin =
          "round"

        /*
         * Single point.
         */
        if (
          points.length === 1
        ) {
          context.beginPath()

          context.arc(
            points[0][0],
            points[0][1],
            context.lineWidth / 2,
            0,
            Math.PI * 2
          )

          context.fill()

          context.restore()

          return
        }

        context.beginPath()

        context.moveTo(
          points[0][0],
          points[0][1]
        )

        /*
         * Raw line rendering is intentionally used here.
         *
         * It is dramatically cheaper than rebuilding the entire smoothed
         * quadratic path on every pointer movement.
         */
        for (
          let index = 1;
          index < points.length;
          index += 1
        ) {
          context.lineTo(
            points[index][0],
            points[index][1]
          )
        }

        /*
         * Pen dynamically fills the area while drawing.
         */
        if (
          stroke.pen
        ) {
          context.closePath()
          context.fill()
        }

        context.stroke()

        context.restore()
      },
      []
    )

  /*
   * -------------------------------------------------------------------------
   * Render active layer
   * -------------------------------------------------------------------------
   */

  const renderActive =
    useCallback(() => {
      const canvas =
        activeCanvasRef.current

      if (!canvas) {
        return
      }

      const context =
        canvas.getContext("2d")

      if (!context) {
        return
      }

      context.clearRect(
        0,
        0,
        CANVAS_SIZE,
        CANVAS_SIZE
      )

      if (
        !drawingRef.current ||
        !currentStrokeRef.current
      ) {
        return
      }

      drawActiveStroke(
        context,
        currentStrokeRef.current
      )
    }, [
      drawActiveStroke,
    ])

  /*
   * -------------------------------------------------------------------------
   * Render overlay
   * -------------------------------------------------------------------------
   */

  const renderOverlay =
    useCallback(() => {
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

      context.clearRect(
        0,
        0,
        CANVAS_SIZE,
        CANVAS_SIZE
      )

      drawGrid(
        context
      )

      if (
        toolRef.current ===
          "anchor" ||
        toolRef.current ===
          "curve" ||
        toolRef.current ===
          "move"
      ) {
        drawEditorOverlay(
          context
        )
      }
    }, [
      drawEditorOverlay,
      drawGrid,
    ])

  /*
   * -------------------------------------------------------------------------
   * Unified render scheduler
   * -------------------------------------------------------------------------
   *
   * Everything funnels through one RAF.
   *
   * Multiple pointer events between frames therefore collapse into a single
   * paint operation.
   * -------------------------------------------------------------------------
   */

  const scheduleRender =
    useCallback(() => {
      if (
        renderFrameRef.current !==
        null
      ) {
        return
      }

      renderFrameRef.current =
        requestAnimationFrame(
          () => {
            renderFrameRef.current =
              null

            renderBase()
            renderActive()
            renderOverlay()
          }
        )
    }, [
      renderActive,
      renderBase,
      renderOverlay,
    ])

  /*
   * -------------------------------------------------------------------------
   * Pointer coordinate display
   * -------------------------------------------------------------------------
   */

  const pointerFrameRef =
    useRef(null)

  const pendingPointerRef =
    useRef(null)

  const updatePointerDisplay =
    useCallback(
      (point) => {
        if (
          !showCoordinatesRef.current
        ) {
          return
        }

        pendingPointerRef.current =
          point

        if (
          pointerFrameRef.current !==
          null
        ) {
          return
        }

        pointerFrameRef.current =
          requestAnimationFrame(
            () => {
              pointerFrameRef.current =
                null

              const next =
                pendingPointerRef.current

              pendingPointerRef.current =
                null

              if (
                next &&
                showCoordinatesRef.current
              ) {
                setPointer(next)
              }
            }
          )
      },
      []
    )

  /*
   * -------------------------------------------------------------------------
   * Find Pen by fill
   * -------------------------------------------------------------------------
   */

  const findPenAtPoint =
    useCallback(
      (point) => {
        const canvas =
          canvasRef.current

        if (!canvas) {
          return null
        }

        const context =
          canvas.getContext("2d")

        if (!context) {
          return null
        }

        /*
         * Later operations are visually on top.
         */
        for (
          let index =
            operationsRef.current.length -
            1;
          index >= 0;
          index -= 1
        ) {
          const operation =
            operationsRef.current[
              index
            ]

          if (
            !operation?.pen ||
            !Array.isArray(
              operation.anchors
            )
          ) {
            continue
          }

          const path =
            getPenPath(
              operation
            )

          if (
            !path
          ) {
            continue
          }

          if (
            context.isPointInPath(
              path,
              point[0],
              point[1]
            )
          ) {
            return operation
          }
        }

        return null
      },
      [getPenPath]
    )

  /*
   * -------------------------------------------------------------------------
   * Find last Pen
   * -------------------------------------------------------------------------
   */

  const findLastPenOperation =
    useCallback(() => {
      for (
        let index =
          operationsRef.current.length -
          1;
        index >= 0;
        index -= 1
      ) {
        const operation =
          operationsRef.current[
            index
          ]

        if (
          operation?.pen &&
          Array.isArray(
            operation.anchors
          ) &&
          operation.anchors.length
        ) {
          return operation
        }
      }

      return null
    }, [])

  /*
   * -------------------------------------------------------------------------
   * Find anchor / handle
   * -------------------------------------------------------------------------
   */

  const findAnchorHit =
    useCallback(
      (point) => {
        const selectedId =
          selectedOperationIdRef.current

        const selected =
          selectedId
            ? operationsRef.current.find(
                (operation) =>
                  operation.id ===
                  selectedId
              )
            : null

        /*
         * Selected object gets priority.
         */
        const ordered =
          selected
            ? [
                selected,
                ...operationsRef.current.filter(
                  (operation) =>
                    operation.id !==
                    selected.id
                ),
              ]
            : [
                ...operationsRef.current,
              ].reverse()

        let best = null

        for (
          const operation of
            ordered
        ) {
          if (
            !operation.pen ||
            !Array.isArray(
              operation.anchors
            )
          ) {
            continue
          }

          for (
            let index = 0;
            index <
            operation.anchors.length;
            index += 1
          ) {
            const anchor =
              operation.anchors[
                index
              ]

            const anchorDistance =
              Math.hypot(
                point[0] -
                  anchor.x,
                point[1] -
                  anchor.y
              )

            if (
              anchorDistance <=
              ANCHOR_HIT_RADIUS
            ) {
              const candidate = {
                operation,
                anchorIndex:
                  index,
                handle:
                  "anchor",
                distance:
                  anchorDistance,
                priority:
                  operation.id ===
                  selectedId
                    ? 0
                    : 1,
              }

              if (
                !best ||
                candidate.priority <
                  best.priority ||
                (
                  candidate.priority ===
                    best.priority &&
                  candidate.distance <
                    best.distance
                )
              ) {
                best =
                  candidate
              }
            }

            const inDistance =
              Math.hypot(
                point[0] -
                  anchor.in.x,
                point[1] -
                  anchor.in.y
              )

            if (
              inDistance <=
              HANDLE_HIT_RADIUS
            ) {
              const candidate = {
                operation,
                anchorIndex:
                  index,
                handle: "in",
                distance:
                  inDistance,
                priority:
                  operation.id ===
                  selectedId
                    ? 0
                    : 1,
              }

              if (
                !best ||
                candidate.priority <
                  best.priority ||
                (
                  candidate.priority ===
                    best.priority &&
                  candidate.distance <
                    best.distance
                )
              ) {
                best =
                  candidate
              }
            }

            const outDistance =
              Math.hypot(
                point[0] -
                  anchor.out.x,
                point[1] -
                  anchor.out.y
              )

            if (
              outDistance <=
              HANDLE_HIT_RADIUS
            ) {
              const candidate = {
                operation,
                anchorIndex:
                  index,
                handle: "out",
                distance:
                  outDistance,
                priority:
                  operation.id ===
                  selectedId
                    ? 0
                    : 1,
              }

              if (
                !best ||
                candidate.priority <
                  best.priority ||
                (
                  candidate.priority ===
                    best.priority &&
                  candidate.distance <
                    best.distance
                )
              ) {
                best =
                  candidate
              }
            }
          }
        }

        return best
      },
      []
    )

  /*
   * -------------------------------------------------------------------------
   * Pointer down
   * -------------------------------------------------------------------------
   */

  const handlePointerDown =
    useCallback(
      (event) => {
        if (
          event.pointerType ===
            "mouse" &&
          event.button !== 0
        ) {
          return
        }

        const point =
          getCanvasPoint(event)

        if (!point) {
          return
        }

        updatePointerDisplay(
          point
        )

        const canvas =
          canvasRef.current

        if (!canvas) {
          return
        }

        canvas.setPointerCapture(
          event.pointerId
        )

        const currentTool =
          toolRef.current

        /*
         * ---------------------------------------------------------------
         * MOVE
         * ---------------------------------------------------------------
         */

        if (
          currentTool ===
          "move"
        ) {
          const operation =
            findPenAtPoint([
              point.x,
              point.y,
            ])

          if (!operation) {
            selectedOperationIdRef.current =
              null

            selectedAnchorIndexRef.current =
              null

            setSelectedOperationId(
              null
            )

            setSelectedAnchorIndex(
              null
            )

            scheduleRender()

            return
          }

          selectedOperationIdRef.current =
            operation.id

          selectedAnchorIndexRef.current =
            null

          setSelectedOperationId(
            operation.id
          )

          setSelectedAnchorIndex(
            null
          )

          editRef.current = {
            mode: "move",

            operationId:
              operation.id,

            startPoint: [
              point.x,
              point.y,
            ],

            historyPushed:
              false,
          }

          scheduleRender()

          return
        }

        /*
         * ---------------------------------------------------------------
         * ANCHOR
         * ---------------------------------------------------------------
         */

        if (
          currentTool ===
          "anchor"
        ) {
          const hit =
            findAnchorHit([
              point.x,
              point.y,
            ])

          if (hit) {
            selectedOperationIdRef.current =
              hit.operation.id

            selectedAnchorIndexRef.current =
              hit.anchorIndex

            setSelectedOperationId(
              hit.operation.id
            )

            setSelectedAnchorIndex(
              hit.anchorIndex
            )

            editRef.current = {
              mode:
                hit.handle,

              operationId:
                hit.operation.id,

              anchorIndex:
                hit.anchorIndex,

              startPoint: [
                point.x,
                point.y,
              ],

              historyPushed:
                false,
            }

            scheduleRender()

            return
          }

          /*
           * No anchor/handle hit:
           * select another Pen by clicking its fill.
           */
          const operation =
            findPenAtPoint([
              point.x,
              point.y,
            ])

          if (operation) {
            selectedOperationIdRef.current =
              operation.id

            selectedAnchorIndexRef.current =
              null

            setSelectedOperationId(
              operation.id
            )

            setSelectedAnchorIndex(
              null
            )

            scheduleRender()

            return
          }

          selectedOperationIdRef.current =
            null

          selectedAnchorIndexRef.current =
            null

          setSelectedOperationId(
            null
          )

          setSelectedAnchorIndex(
            null
          )

          scheduleRender()

          return
        }

        /*
         * ---------------------------------------------------------------
         * CURVE
         * ---------------------------------------------------------------
         */

        if (
          currentTool ===
          "curve"
        ) {
          const selectedId =
            selectedOperationIdRef.current

          const selected =
            selectedId
              ? operationsRef.current.find(
                  (operation) =>
                    operation.id ===
                    selectedId
                )
              : null

          const candidates =
            selected
              ? [
                  selected,
                  ...operationsRef.current.filter(
                    (operation) =>
                      operation.id !==
                      selected.id
                  ),
                ]
              : [
                  ...operationsRef.current,
                ].reverse()

          let best = null

          for (
            const operation of
              candidates
          ) {
            if (
              !operation.pen ||
              !Array.isArray(
                operation.anchors
              )
            ) {
              continue
            }

            const hit =
              findClosestPenSegment(
                operation,
                [
                  point.x,
                  point.y,
                ]
              )

            if (
              hit &&
              hit.distance <=
                CURVE_HIT_DISTANCE
            ) {
              best = {
                operation,
                ...hit,
              }

              break
            }
          }

          if (!best) {
            const operation =
              findPenAtPoint([
                point.x,
                point.y,
              ])

            if (operation) {
              selectedOperationIdRef.current =
                operation.id

              selectedAnchorIndexRef.current =
                null

              setSelectedOperationId(
                operation.id
              )

              setSelectedAnchorIndex(
                null
              )

              scheduleRender()

              return
            }

            selectedOperationIdRef.current =
              null

            selectedAnchorIndexRef.current =
              null

            setSelectedOperationId(
              null
            )

            setSelectedAnchorIndex(
              null
            )

            scheduleRender()

            return
          }

          selectedOperationIdRef.current =
            best.operation.id

          selectedAnchorIndexRef.current =
            null

          setSelectedOperationId(
            best.operation.id
          )

          setSelectedAnchorIndex(
            null
          )

          const startAnchor =
            best.operation
              .anchors[
              best.segmentIndex
            ]

          const endAnchor =
            best.operation
              .anchors[
              (
                best.segmentIndex +
                1
              ) %
                best.operation
                  .anchors
                  .length
            ]

          editRef.current = {
            mode: "curve",

            operationId:
              best.operation.id,

            segmentIndex:
              best.segmentIndex,

            startPoint: [
              point.x,
              point.y,
            ],

            originalOut: {
              x:
                startAnchor.out.x,
              y:
                startAnchor.out.y,
            },

            originalIn: {
              x:
                endAnchor.in.x,
              y:
                endAnchor.in.y,
            },

            historyPushed:
              false,
          }

          scheduleRender()

          return
        }

        /*
         * ---------------------------------------------------------------
         * BUCKET
         * ---------------------------------------------------------------
         */

        if (
          currentTool ===
          "fill"
        ) {
          pushUndoSnapshot()

          const operation = {
            id: makeId(),

            type: "fill",

            point: [
              Math.round(
                point.x
              ),
              Math.round(
                point.y
              ),
            ],

            color:
              colorRef.current,
          }

          operationsRef.current =
            [
              ...operationsRef.current,
              operation,
            ]

          sceneCacheDirtyRef.current =
            true

          setOperations(
            cloneOperations(
              operationsRef.current
            )
          )

          scheduleRender()

          return
        }

        /*
         * ---------------------------------------------------------------
         * DRAWING
         * ---------------------------------------------------------------
         */

        selectedOperationIdRef.current =
          null

        selectedAnchorIndexRef.current =
          null

        setSelectedOperationId(
          null
        )

        setSelectedAnchorIndex(
          null
        )

        drawingRef.current =
          true

        currentStrokeRef.current = {
          id: makeId(),

          type:
            currentTool ===
            "eraser"
              ? "eraser"
              : "stroke",

          pen:
            currentTool ===
            "pen",

          closed: false,

          points: [
            [
              Math.round(
                point.x
              ),
              Math.round(
                point.y
              ),
            ],
          ],

          color:
            colorRef.current,

          width:
            widthRef.current,
        }

        scheduleRender()
      },
      [
        findAnchorHit,
        findPenAtPoint,
        getCanvasPoint,
        pushUndoSnapshot,
        scheduleRender,
        updatePointerDisplay,
      ]
    )

  /*
   * -------------------------------------------------------------------------
   * Pointer move
   * -------------------------------------------------------------------------
   */

  const handlePointerMove =
    useCallback(
      (event) => {
        const point =
          getCanvasPoint(event)

        if (!point) {
          return
        }

        updatePointerDisplay(
          point
        )

        /*
         * ---------------------------------------------------------------
         * VECTOR EDIT / MOVE
         * ---------------------------------------------------------------
         */

        const edit =
          editRef.current

        if (edit) {
          if (
            !edit.historyPushed
          ) {
            pushUndoSnapshot()

            edit.historyPushed =
              true
          }

          const currentPoint = [
            point.x,
            point.y,
          ]

          /*
           * MOVE
           */
          if (
            edit.mode ===
            "move"
          ) {
            const dx =
              currentPoint[0] -
              edit.startPoint[0]

            const dy =
              currentPoint[1] -
              edit.startPoint[1]

            moveOperation(
              edit.operationId,
              dx,
              dy
            )

            edit.startPoint = [
              currentPoint[0],
              currentPoint[1],
            ]

            /*
             * The selected object is excluded from the scene cache,
             * so only the lightweight foreground layers need painting.
             */
            scheduleRender()

            return
          }

          /*
           * ANCHOR / HANDLE
           */
          if (
            edit.mode ===
              "anchor" ||
            edit.mode ===
              "in" ||
            edit.mode ===
              "out"
          ) {
            updateOperation(
              edit.operationId,
              (operation) => {
                const anchor =
                  operation
                    .anchors?.[
                    edit.anchorIndex
                  ]

                if (!anchor) {
                  return operation
                }

                if (
                  edit.mode ===
                  "anchor"
                ) {
                  const dx =
                    currentPoint[0] -
                    edit.startPoint[0]

                  const dy =
                    currentPoint[1] -
                    edit.startPoint[1]

                  anchor.x += dx
                  anchor.y += dy

                  anchor.in.x += dx
                  anchor.in.y += dy

                  anchor.out.x += dx
                  anchor.out.y += dy

                  edit.startPoint = [
                    currentPoint[0],
                    currentPoint[1],
                  ]
                }

                if (
                  edit.mode ===
                  "in"
                ) {
                  anchor.in.x =
                    currentPoint[0]

                  anchor.in.y =
                    currentPoint[1]
                }

                if (
                  edit.mode ===
                  "out"
                ) {
                  anchor.out.x =
                    currentPoint[0]

                  anchor.out.y =
                    currentPoint[1]
                }

                return operation
              }
            )

            scheduleRender()

            return
          }

          /*
           * CURVE
           */
          if (
            edit.mode ===
            "curve"
          ) {
            const dx =
              currentPoint[0] -
              edit.startPoint[0]

            const dy =
              currentPoint[1] -
              edit.startPoint[1]

            updateOperation(
              edit.operationId,
              (operation) => {
                const anchors =
                  operation.anchors

                if (
                  !Array.isArray(
                    anchors
                  ) ||
                  anchors.length <
                    2
                ) {
                  return operation
                }

                const start =
                  anchors[
                    edit.segmentIndex
                  ]

                const end =
                  anchors[
                    (
                      edit.segmentIndex +
                      1
                    ) %
                      anchors.length
                  ]

                if (
                  !start ||
                  !end
                ) {
                  return operation
                }

                start.out.x =
                  edit.originalOut.x +
                  dx

                start.out.y =
                  edit.originalOut.y +
                  dy

                end.in.x =
                  edit.originalIn.x +
                  dx

                end.in.y =
                  edit.originalIn.y +
                  dy

                return operation
              }
            )

            scheduleRender()

            return
          }
        }

        /*
         * ---------------------------------------------------------------
         * FREEHAND DRAWING
         * ---------------------------------------------------------------
         */

        if (
          !drawingRef.current ||
          !currentStrokeRef.current
        ) {
          return
        }

        const stroke =
          currentStrokeRef.current

        const points =
          stroke.points

        const last =
          points[
            points.length - 1
          ]

        const next = [
          Math.round(
            point.x
          ),
          Math.round(
            point.y
          ),
        ]

        /*
         * Ignore tiny pointer movements.
         */
        if (
          pointDistance(
            last,
            next
          ) <
          DRAW_POINT_MIN_DISTANCE
        ) {
          return
        }

        /*
         * Hard cap for safety.
         *
         * Once reached, replace the final point instead of allowing
         * unbounded memory growth.
         */
        if (
          points.length >=
          ACTIVE_STROKE_MAX_POINTS
        ) {
          points[
            points.length - 1
          ] = next
        } else {
          points.push(next)
        }

        /*
         * No React state update.
         *
         * One RAF paints the active layer.
         */
        scheduleRender()
      },
      [
        getCanvasPoint,
        moveOperation,
        pushUndoSnapshot,
        scheduleRender,
        updateOperation,
        updatePointerDisplay,
      ]
    )

  /*
   * -------------------------------------------------------------------------
   * Finish pointer interaction
   * -------------------------------------------------------------------------
   */

  const finishStroke =
    useCallback(
      (event) => {
        /*
         * ---------------------------------------------------------------
         * Finish vector edit
         * ---------------------------------------------------------------
         */

        if (
          editRef.current
        ) {
          editRef.current =
            null

          /*
           * The edited object was excluded from the scene cache.
           * Rebuild the cache with its final position.
           */
          sceneCacheDirtyRef.current =
            true

          sceneCacheExcludedIdRef.current =
            null

          setOperations(
            cloneOperations(
              operationsRef.current
            )
          )

          scheduleRender()

          const canvas =
            canvasRef.current

          if (
            canvas &&
            event?.pointerId !==
              undefined
          ) {
            try {
              canvas.releasePointerCapture(
                event.pointerId
              )
            } catch {
              // Already released.
            }
          }

          return
        }

        /*
         * ---------------------------------------------------------------
         * Finish freehand stroke
         * ---------------------------------------------------------------
         */

        if (
          !drawingRef.current
        ) {
          return
        }

        drawingRef.current =
          false

        const stroke =
          currentStrokeRef.current

        currentStrokeRef.current =
          null

        if (
          stroke &&
          stroke.points.length > 0
        ) {
          pushUndoSnapshot()

          let completedStroke = {
            ...stroke,

            points:
              stroke.points.map(
                (point) => [
                  point[0],
                  point[1],
                ]
              ),
          }

          /*
           * Convert Pen into editable vector geometry.
           */
          if (
            stroke.pen
          ) {
            let prepared =
              preparePenPoints(
                stroke.points
              )

            const closed =
              shouldSnapPenClosed(
                prepared
              )

            if (
              closed
            ) {
              prepared =
                snapPenClosed(
                  prepared
                )
            }

            const anchors =
              createPenAnchors(
                prepared
              )

            completedStroke = {
              ...completedStroke,

              points:
                prepared,

              anchors,

              closed,

              geometryVersion:
                1,
            }
          }

          operationsRef.current =
            [
              ...operationsRef.current,
              completedStroke,
            ]

          /*
           * Any new committed operation invalidates the scene cache.
           */
          sceneCacheDirtyRef.current =
            true

          sceneCacheExcludedIdRef.current =
            null

          /*
           * A completed operation invalidates all cached Path2D data
           * only for itself. Existing paths remain cached.
           */
          if (
            completedStroke.pen
          ) {
            penPathCacheRef.current.delete(
              completedStroke.id
            )
          }

          setOperations(
            cloneOperations(
              operationsRef.current
            )
          )
        }

        scheduleRender()

        const canvas =
          canvasRef.current

        if (
          canvas &&
          event?.pointerId !==
            undefined
        ) {
          try {
            canvas.releasePointerCapture(
              event.pointerId
            )
          } catch {
            // Already released.
          }
        }
      },
      [
        pushUndoSnapshot,
        scheduleRender,
      ]
    )

  /*
   * -------------------------------------------------------------------------
   * Tool selection
   * -------------------------------------------------------------------------
   */

  const selectTool =
    useCallback(
      (value) => {
        toolRef.current =
          value

        setTool(value)

        editRef.current =
          null

        drawingRef.current =
          false

        currentStrokeRef.current =
          null

        /*
         * Anchor automatically selects the newest Pen.
         */
        if (
          value ===
          "anchor"
        ) {
          const operation =
            findLastPenOperation()

          if (operation) {
            selectedOperationIdRef.current =
              operation.id

            selectedAnchorIndexRef.current =
              null

            setSelectedOperationId(
              operation.id
            )

            setSelectedAnchorIndex(
              null
            )
          } else {
            selectedOperationIdRef.current =
              null

            selectedAnchorIndexRef.current =
              null

            setSelectedOperationId(
              null
            )

            setSelectedAnchorIndex(
              null
            )
          }
        }

        /*
         * Move/Curve preserve the current object selection.
         */
        if (
          value ===
            "move" ||
          value ===
            "curve"
        ) {
          selectedAnchorIndexRef.current =
            null

          setSelectedAnchorIndex(
            null
          )
        }

        /*
         * Drawing tools clear vector selection.
         */
        if (
          value ===
            "stroke" ||
          value ===
            "pen" ||
          value ===
            "eraser" ||
          value ===
            "fill"
        ) {
          selectedOperationIdRef.current =
            null

          selectedAnchorIndexRef.current =
            null

          setSelectedOperationId(
            null
          )

          setSelectedAnchorIndex(
            null
          )
        }

        scheduleRender()
      },
      [
        findLastPenOperation,
        scheduleRender,
      ]
    )

  /*
   * -------------------------------------------------------------------------
   * Automatically select newest Pen in Anchor mode
   * -------------------------------------------------------------------------
   */

  useEffect(() => {
    if (
      tool !==
      "anchor"
    ) {
      return
    }

    const operation =
      findLastPenOperation()

    if (!operation) {
      selectedOperationIdRef.current =
        null

      setSelectedOperationId(
        null
      )

      return
    }

    selectedOperationIdRef.current =
      operation.id

    selectedAnchorIndexRef.current =
      null

    setSelectedOperationId(
      operation.id
    )

    setSelectedAnchorIndex(
      null
    )

    scheduleRender()
  }, [
    findLastPenOperation,
    operations,
    scheduleRender,
    tool,
  ])

  /*
   * -------------------------------------------------------------------------
   * Undo
   * -------------------------------------------------------------------------
   */

  const undo =
    useCallback(() => {
      if (
        undoStackRef.current.length ===
        0
      ) {
        return
      }

      const previous =
        undoStackRef.current.pop()

      const restored =
        cloneOperations(
          previous
        )

      operationsRef.current =
        restored

      drawingRef.current =
        false

      currentStrokeRef.current =
        null

      editRef.current =
        null

      selectedOperationIdRef.current =
        null

      selectedAnchorIndexRef.current =
        null

      /*
       * Geometry changed globally.
       */
      sceneCacheDirtyRef.current =
        true

      sceneCacheExcludedIdRef.current =
        null

      /*
       * Old Path2D objects are cheap compared with accidentally retaining
       * hundreds of obsolete geometries.
       */
      penPathCacheRef.current.clear()

      setSelectedOperationId(
        null
      )

      setSelectedAnchorIndex(
        null
      )

      setOperations(
        cloneOperations(
          restored
        )
      )

      scheduleRender()
    }, [
      scheduleRender,
    ])

  /*
   * -------------------------------------------------------------------------
   * Clear
   * -------------------------------------------------------------------------
   */

  const clear =
    useCallback(() => {
      if (
        operationsRef.current.length >
        0
      ) {
        pushUndoSnapshot()
      }

      operationsRef.current =
        []

      drawingRef.current =
        false

      currentStrokeRef.current =
        null

      editRef.current =
        null

      selectedOperationIdRef.current =
        null

      selectedAnchorIndexRef.current =
        null

      sceneCacheDirtyRef.current =
        true

      sceneCacheExcludedIdRef.current =
        null

      penPathCacheRef.current.clear()

      setOperations([])

      setSelectedOperationId(
        null
      )

      setSelectedAnchorIndex(
        null
      )

      scheduleRender()
    }, [
      pushUndoSnapshot,
      scheduleRender,
    ])

  /*
   * -------------------------------------------------------------------------
   * Canvas sizing
   * -------------------------------------------------------------------------
   */

  useEffect(() => {
    const updateSize =
      () => {
        const canvas =
          canvasRef.current

        if (!canvas) {
          return
        }

        const rect =
          canvas.getBoundingClientRect()

        setCanvasSize({
          width:
            Math.round(
              rect.width
            ),

          height:
            Math.round(
              rect.height
            ),
        })
      }

    updateSize()

    const observer =
      new ResizeObserver(
        updateSize
      )

    if (
      canvasRef.current
    ) {
      observer.observe(
        canvasRef.current
      )
    }

    window.addEventListener(
      "resize",
      updateSize
    )

    return () => {
      observer.disconnect()

      window.removeEventListener(
        "resize",
        updateSize
      )
    }
  }, [])

  /*
   * -------------------------------------------------------------------------
   * Initial render / resize
   * -------------------------------------------------------------------------
   */

  useEffect(() => {
    scheduleRender()
  }, [
    canvasSize.width,
    canvasSize.height,
    scheduleRender,
  ])

  /*
   * -------------------------------------------------------------------------
   * Keyboard shortcuts
   * -------------------------------------------------------------------------
   */

  useEffect(() => {
    const handleKeyDown =
      (event) => {
        if (
          event.target instanceof
            HTMLInputElement ||
          event.target instanceof
            HTMLTextAreaElement ||
          event.target instanceof
            HTMLSelectElement
        ) {
          return
        }

        if (
          (
            event.metaKey ||
            event.ctrlKey
          ) &&
          event.key.toLowerCase() ===
            "z"
        ) {
          event.preventDefault()

          undo()

          return
        }

        const key =
          event.key.toLowerCase()

        if (
          key ===
          "p"
        ) {
          selectTool(
            "pen"
          )
        } else if (
          key ===
          "l"
        ) {
          selectTool(
            "stroke"
          )
        } else if (
          key ===
          "v"
        ) {
          selectTool(
            "move"
          )
        } else if (
          key ===
          "a"
        ) {
          selectTool(
            "anchor"
          )
        } else if (
          key ===
          "c"
        ) {
          selectTool(
            "curve"
          )
        } else if (
          key ===
          "e"
        ) {
          selectTool(
            "eraser"
          )
        } else if (
          key ===
          "b"
        ) {
          selectTool(
            "fill"
          )
        }
      }

    window.addEventListener(
      "keydown",
      handleKeyDown
    )

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      )
    }
  }, [
    selectTool,
    undo,
  ])

  /*
   * -------------------------------------------------------------------------
   * Cleanup
   * -------------------------------------------------------------------------
   */

  useEffect(() => {
    return () => {
      if (
        renderFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          renderFrameRef.current
        )
      }

      if (
        pointerFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          pointerFrameRef.current
        )
      }
    }
  }, [])

  /*
   * -------------------------------------------------------------------------
   * UI
   * -------------------------------------------------------------------------
   */

  return (
    <>
      <Head title="Drawing Debug" />

      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
                HUMBLDRAW
              </p>

              <h1 className="mt-1 text-2xl font-bold">
                Drawing Canvas Debug
              </h1>

              <p className="mt-1 text-sm text-zinc-500">
                Isolated canvas playground —
                optimized layered renderer.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={
                  undoStackRef.current
                    .length === 0
                }
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold transition hover:border-zinc-500 disabled:opacity-30"
              >
                Undo
              </button>

              <button
                type="button"
                onClick={clear}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div
              ref={containerRef}
              className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-3 shadow-2xl"
            >
              <div className="relative mx-auto w-full max-w-[900px] aspect-square">
                {/*
                 * -----------------------------------------------------------------
                 * BASE / COMMITTED SCENE
                 * -----------------------------------------------------------------
                 */}
                <canvas
                  ref={canvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  onPointerDown={
                    handlePointerDown
                  }
                  onPointerMove={
                    handlePointerMove
                  }
                  onPointerUp={
                    finishStroke
                  }
                  onPointerCancel={
                    finishStroke
                  }
                  onPointerLeave={() => {
                    if (
                      !drawingRef.current &&
                      !editRef.current
                    ) {
                      setPointer(
                        null
                      )
                    }
                  }}
                  className={[
                    "absolute inset-0 block h-full w-full rounded-2xl bg-white touch-none select-none",

                    tool ===
                        "anchor" ||
                    tool ===
                        "curve" ||
                    tool ===
                        "move"
                      ? "cursor-default"
                      : "cursor-crosshair",
                  ].join(" ")}
                  style={{
                    touchAction:
                      "none",

                    userSelect:
                      "none",

                    WebkitUserSelect:
                      "none",

                    WebkitTouchCallout:
                      "none",
                  }}
                />

                {/*
                 * -----------------------------------------------------------------
                 * ACTIVE STROKE LAYER
                 * -----------------------------------------------------------------
                 */}
                <canvas
                  ref={
                    activeCanvasRef
                  }
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 block h-full w-full rounded-2xl"
                />

                {/*
                 * -----------------------------------------------------------------
                 * EDITOR / GRID LAYER
                 * -----------------------------------------------------------------
                 */}
                <canvas
                  ref={
                    overlayCanvasRef
                  }
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 block h-full w-full rounded-2xl"
                />

                {showCoordinates &&
                  pointer && (
                    <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-zinc-950/85 px-3 py-2 font-mono text-xs text-white backdrop-blur">
                      X:{" "}
                      {Math.round(
                        pointer.x
                      )}
                      {"  "}
                      Y:{" "}
                      {Math.round(
                        pointer.y
                      )}
                    </div>
                  )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-500">
                <span>
                  Logical canvas:{" "}
                  <span className="font-mono text-zinc-300">
                    1200 × 1200
                  </span>
                </span>

                <span>
                  Display:{" "}
                  <span className="font-mono text-zinc-300">
                    {canvasSize.width} ×{" "}
                    {canvasSize.height}
                  </span>
                </span>
              </div>
            </div>

            <aside className="space-y-4">
              {/* Tools */}

              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Tool
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    [
                      "stroke",
                      "Pencil",
                    ],
                    [
                      "pen",
                      "Pen",
                    ],
                    [
                      "move",
                      "Move",
                    ],
                    [
                      "anchor",
                      "Anchor",
                    ],
                    [
                      "curve",
                      "Curve",
                    ],
                    [
                      "eraser",
                      "Eraser",
                    ],
                    [
                      "fill",
                      "Bucket",
                    ],
                  ].map(
                    ([
                      value,
                      label,
                    ]) => (
                      <button
                        key={
                          value
                        }
                        type="button"
                        onClick={() =>
                          selectTool(
                            value
                          )
                        }
                        className={[
                          "rounded-xl border px-3 py-3 text-sm font-semibold transition",

                          tool ===
                          value
                            ? "border-white bg-white text-zinc-950"
                            : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500 hover:text-white",
                        ].join(
                          " "
                        )}
                      >
                        {
                          label
                        }
                      </button>
                    )
                  )}
                </div>

                {tool ===
                  "pen" && (
                  <div className="mt-3 rounded-xl bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-500">
                    <p className="font-semibold text-zinc-300">
                      Freeform Pen
                    </p>

                    <p className="mt-1">
                      Draw naturally.
                      The area behind
                      your stroke fills
                      dynamically.
                    </p>

                    <p className="mt-2">
                      Finish near the
                      starting point to
                      mark the shape
                      closed.
                    </p>

                    <p className="mt-2 text-zinc-600">
                      The Pen becomes a
                      filled editable
                      vector object.
                    </p>
                  </div>
                )}

                {tool ===
                  "move" && (
                  <div className="mt-3 rounded-xl bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-500">
                    <p className="font-semibold text-zinc-300">
                      Move Tool
                    </p>

                    <p className="mt-1">
                      Click inside a Pen
                      shape to select it.
                    </p>

                    <p className="mt-2">
                      Drag the shape to
                      move the entire
                      object.
                    </p>

                    <p className="mt-2 text-zinc-600">
                      Anchors are shown
                      smaller and lighter
                      while moving.
                    </p>
                  </div>
                )}

                {tool ===
                  "anchor" && (
                  <div className="mt-3 rounded-xl bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-500">
                    <p className="font-semibold text-zinc-300">
                      Anchor Editor
                    </p>

                    <p className="mt-1">
                      The most recently
                      created Pen path is
                      selected automatically.
                    </p>

                    <p className="mt-2">
                      Click another shape's
                      fill to switch selection.
                    </p>

                    <p className="mt-2">
                      Drag an anchor to move
                      the point and its
                      handles.
                    </p>

                    <p className="mt-2">
                      Drag either handle to
                      reshape the curve.
                    </p>
                  </div>
                )}

                {tool ===
                  "curve" && (
                  <div className="mt-3 rounded-xl bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-500">
                    <p className="font-semibold text-zinc-300">
                      Curve Editor
                    </p>

                    <p className="mt-1">
                      Drag any part of a
                      Pen curve to bend
                      that segment.
                    </p>

                    <p className="mt-2 text-zinc-600">
                      The endpoints stay
                      fixed while the
                      Bézier handles move.
                    </p>
                  </div>
                )}
              </section>

              {/* Colors */}

              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Color
                </p>

                <div className="grid grid-cols-5 gap-2">
                  {COLORS.map(
                    (value) => (
                      <button
                        key={
                          value
                        }
                        type="button"
                        aria-label={`Select ${value}`}
                        onClick={() =>
                          setColor(
                            value
                          )
                        }
                        className={[
                          "aspect-square rounded-full border-2 transition active:scale-95",
                          color ===
                          value
                            ? "scale-110 border-white"
                            : "border-transparent",
                        ].join(
                          " "
                        )}
                        style={{
                          backgroundColor:
                            value,
                        }}
                      />
                    )
                  )}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="color"
                    value={
                      color
                    }
                    onChange={(
                      event
                    ) =>
                      setColor(
                        event.target
                          .value
                      )
                    }
                    className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent"
                  />

                  <code className="text-sm text-zinc-400">
                    {color}
                  </code>
                </div>
              </section>

              {/* Sizes */}

              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Brush size
                </p>

                <div className="grid grid-cols-4 gap-2">
                  {SIZES.map(
                    (value) => (
                      <button
                        key={
                          value
                        }
                        type="button"
                        onClick={() =>
                          setWidth(
                            value
                          )
                        }
                        className={[
                          "flex h-12 items-center justify-center rounded-xl border transition",
                          width ===
                          value
                            ? "border-white bg-white text-zinc-950"
                            : "border-zinc-700 bg-zinc-950 text-zinc-400",
                        ].join(
                          " "
                        )}
                      >
                        <span
                          className="rounded-full bg-current"
                          style={{
                            width:
                              Math.min(
                                value,
                                24
                              ),
                            height:
                              Math.min(
                                value,
                                24
                              ),
                          }}
                        />
                      </button>
                    )
                  )}
                </div>

                <label className="mt-4 block">
                  <div className="mb-2 flex justify-between text-xs text-zinc-500">
                    <span>
                      Custom width
                    </span>

                    <span className="font-mono text-zinc-300">
                      {width}px
                    </span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={
                      width
                    }
                    onChange={(
                      event
                    ) =>
                      setWidth(
                        Number(
                          event
                            .target
                            .value
                        )
                      )
                    }
                    className="w-full"
                  />
                </label>
              </section>

              {/* Debug */}

              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Debug
                </p>

                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-300">
                      Show grid
                    </span>

                    <input
                      type="checkbox"
                      checked={
                        showGrid
                      }
                      onChange={(
                        event
                      ) => {
                        showGridRef.current =
                          event.target.checked

                        setShowGrid(
                          event.target
                            .checked
                        )

                        scheduleRender()
                      }}
                      className="h-5 w-5"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-300">
                      Coordinates
                    </span>

                    <input
                      type="checkbox"
                      checked={
                        showCoordinates
                      }
                      onChange={(
                        event
                      ) => {
                        const enabled =
                          event.target
                            .checked

                        showCoordinatesRef.current =
                          enabled

                        setShowCoordinates(
                          enabled
                        )

                        if (
                          !enabled
                        ) {
                          setPointer(
                            null
                          )
                        }
                      }}
                      className="h-5 w-5"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-300">
                      Operation log
                    </span>

                    <input
                      type="checkbox"
                      checked={
                        showLog
                      }
                      onChange={(
                        event
                      ) =>
                        setShowLog(
                          event.target
                            .checked
                        )
                      }
                      className="h-5 w-5"
                    />
                  </label>
                </div>
              </section>

              {/* Operation log */}

              {showLog && (
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Operations
                    </p>

                    <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs font-mono text-zinc-400">
                      {
                        operations.length
                      }
                    </span>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {operations.length ===
                    0 ? (
                      <p className="py-6 text-center text-xs text-zinc-600">
                        No operations
                        yet.
                      </p>
                    ) : (
                      operations
                        .slice()
                        .reverse()
                        .map(
                          (
                            operation,
                            index
                          ) => (
                            <button
                              key={
                                operation.id
                              }
                              type="button"
                              onClick={() => {
                                if (
                                  operation.pen
                                ) {
                                  selectedOperationIdRef.current =
                                    operation.id

                                  selectedAnchorIndexRef.current =
                                    null

                                  setSelectedOperationId(
                                    operation.id
                                  )

                                  setSelectedAnchorIndex(
                                    null
                                  )

                                  scheduleRender()
                                }
                              }}
                              className={[
                                "block w-full rounded-lg bg-zinc-950 p-2 text-left font-mono text-[10px] text-zinc-500",
                                selectedOperationId ===
                                operation.id
                                  ? "ring-1 ring-indigo-500"
                                  : "",
                                operation.pen
                                  ? "cursor-pointer hover:bg-zinc-900"
                                  : "",
                              ].join(
                                " "
                              )}
                            >
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold text-zinc-300">
                                  #
                                  {operations.length -
                                    index}
                                </span>

                                <span>
                                  {
                                    operation.type
                                  }
                                </span>
                              </div>

                              <div className="mt-1 truncate">
                                id:{" "}
                                {
                                  operation.id
                                }
                              </div>

                              {operation.pen && (
                                <div className="text-violet-400">
                                  vector pen
                                  {" · "}
                                  filled
                                  {operation.closed
                                    ? " · closed"
                                    : " · open"}
                                </div>
                              )}

                              {operation.pen &&
                                operation.anchors && (
                                  <div className="text-indigo-400">
                                    anchors:{" "}
                                    {
                                      operation
                                        .anchors
                                        .length
                                    }
                                  </div>
                                )}

                              {operation.points && (
                                <div>
                                  points:{" "}
                                  {
                                    operation
                                      .points
                                      .length
                                  }
                                </div>
                              )}

                              {operation.point && (
                                <div>
                                  point:{" "}
                                  {operation.point.join(
                                    ", "
                                  )}
                                </div>
                              )}

                              {operation.color && (
                                <div>
                                  color:{" "}
                                  {
                                    operation.color
                                  }
                                </div>
                              )}

                              {operation.width && (
                                <div>
                                  width:{" "}
                                  {
                                    operation.width
                                  }px
                                </div>
                              )}
                            </button>
                          )
                        )
                    )}
                  </div>
                </section>
              )}
            </aside>
          </div>

          {/* Testing notes */}

          <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Keyboard shortcuts
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["P", "Pen"],
                ["L", "Pencil"],
                ["V", "Move"],
                ["A", "Anchor"],
                ["C", "Curve"],
                ["E", "Eraser"],
                ["B", "Bucket"],
                [
                  "⌘/Ctrl + Z",
                  "Undo",
                ],
              ].map(
                ([
                  key,
                  description,
                ]) => (
                  <div
                    key={key}
                    className="rounded-lg bg-zinc-950 px-3 py-2 text-xs"
                  >
                    <kbd className="font-mono text-white">
                      {key}
                    </kbd>

                    <span className="ml-2 text-zinc-500">
                      {
                        description
                      }
                    </span>
                  </div>
                )
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}