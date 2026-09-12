import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react"

export default function LayersPanel({
  open,
  operations,
  selectedOperationId,
  hiddenLayers,
  onClose,
  onSelect,
  onToggle,
  onReorder,
  onDelete,
}) {
  if (!open) return null

  return (
    <div className="absolute inset-0 z-[100] flex items-end bg-black/30">
      <div className="max-h-[70%] w-full rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <div className="text-sm font-bold text-zinc-900">Layers</div>
            <div className="text-[11px] text-zinc-500">
              Top layers appear above lower layers.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700"
          >
            Done
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {operations
            .slice()
            .reverse()
            .map((operation) => {
              const selected = operation.id === selectedOperationId
              const hidden =
                Boolean(operation.hidden) ||
                hiddenLayers.has(operation.id)

              const label =
                operation.type === "shape"
                  ? operation.shape
                  : operation.pen
                    ? "Pen"
                    : operation.type === "fill"
                      ? "Fill"
                      : operation.type === "eraser"
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
                    onClick={() => onSelect(operation.id)}
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

                  <LayerButton
                    onClick={() => onToggle(operation.id)}
                    label={hidden ? "Show layer" : "Hide layer"}
                  >
                    {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                  </LayerButton>

                  <LayerButton
                    onClick={() => onReorder(operation.id, "back")}
                    label="Send to back"
                  >
                    <ChevronsDown size={16} />
                  </LayerButton>

                  <LayerButton
                    onClick={() => onReorder(operation.id, "down")}
                    label="Move layer down"
                  >
                    <ArrowDown size={16} />
                  </LayerButton>

                  <LayerButton
                    onClick={() => onReorder(operation.id, "up")}
                    label="Move layer up"
                  >
                    <ArrowUp size={16} />
                  </LayerButton>

                  <LayerButton
                    onClick={() => onReorder(operation.id, "front")}
                    label="Bring to front"
                  >
                    <ChevronsUp size={16} />
                  </LayerButton>

                  <LayerButton
                    onClick={() => onDelete(operation.id)}
                    label="Delete layer"
                    danger
                  >
                    <Trash2 size={16} />
                  </LayerButton>
                </div>
              )
            })}

          {operations.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              No layers yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LayerButton({ onClick, label, danger = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 ${
        danger ? "text-red-600" : "text-zinc-600"
      }`}
      aria-label={label}
    >
      {children}
    </button>
  )
}
