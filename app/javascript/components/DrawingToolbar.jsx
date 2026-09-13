import {
  Anchor,
  ChevronDown,
  Circle,
  Eraser,
  Minus,
  MousePointer2,
  PaintBucket,
  Pencil,
  RotateCcw,
  PenLine,
  Square,
  Trash2,
  Triangle,
  Undo2,
  Waves,
} from "lucide-react"

import ColorPicker from "./ColorPicker"
import { COLORS, EDIT_TOOLS, SHAPE_TOOLS, STROKE_WIDTHS, TOOLS } from "./drawingConstants"

export default function DrawingToolbar({
  tool,
  selectedOperation,
  colorTarget,
  strokeColor,
  fillColor,
  recentColors,
  pickerHue,
  showColorPicker,
  strokeWidth,
  showShapeMenu,
  showEditMenu,
  showLayers,
  onToolChange,
  onShapeMenuToggle,
  onEditMenuToggle,
  onUndo,
  onClear,
  onShowLayers,
  onChangeSelectedColor,
  onChangeSelectedWidth,
  onDeleteSelected,
  onColorTargetChange,
  onColorChange,
  onToggleColorPicker,
  onHexColorChange,
  onCustomColorChange,
  onPickSaturationValue,
  onPickHue,
  onCloseColorPicker,
}) {
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

  const choose = (nextTool) => {
    onToolChange(nextTool)
  }

  return (
    <div className="border-b border-zinc-200 bg-zinc-100">
      {selectedOperation && tool === TOOLS.SELECT && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Selected
          </span>

          {COLORS.map((nextColor) => (
            <button
              key={nextColor}
              type="button"
              onClick={() => onChangeSelectedColor(nextColor)}
              className={`relative h-7 w-7 shrink-0 rounded-full border-2 ${
                selectedOperation.color === nextColor
                  ? "scale-110 border-zinc-900"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: nextColor }}
              aria-label={`Change selected object to ${nextColor}`}
            >
              {nextColor === "#ffffff" && (
                <span className="absolute inset-0 rounded-full border border-zinc-300" />
              )}
            </button>
          ))}

          <div className="mx-1 h-6 w-px bg-zinc-300" />

          {STROKE_WIDTHS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChangeSelectedWidth(option.value)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                Number(selectedOperation.width) === option.value
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600"
              }`}
              aria-label={`Set selected width to ${option.label}`}
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

          <div className="mx-1 h-6 w-px bg-zinc-300" />

          <button
            type="button"
            onClick={onDeleteSelected}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-600"
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">
        <ToolButton active={tool === TOOLS.SELECT} onClick={() => choose(TOOLS.SELECT)} label="Select" icon={<MousePointer2 size={17} />} />
        <ToolButton active={tool === TOOLS.PENCIL} onClick={() => choose(TOOLS.PENCIL)} label="Pencil" icon={<Pencil size={17} />} />
        <ToolButton active={tool === TOOLS.PEN} onClick={() => choose(TOOLS.PEN)} label="Pen" icon={<PenLine size={17} />} />
        <ToolButton active={tool === TOOLS.FREEFORM} onClick={() => choose(TOOLS.FREEFORM)} label="Freeform" icon={<Waves size={17} />} />

        <div className="relative shrink-0">
          <ToolButton
            active={SHAPE_TOOLS.includes(tool)}
            onClick={() => onShapeMenuToggle(!showShapeMenu)}
            label={shapeLabel}
            icon={
              tool === TOOLS.LINE ? <Minus size={17} />
                : tool === TOOLS.CIRCLE ? <Circle size={17} />
                  : tool === TOOLS.SQUARE ? <Square size={17} />
                    : tool === TOOLS.TRIANGLE ? <Triangle size={17} />
                      : <Square size={17} />
            }
            dropdown
          />
        </div>

        <ToolButton active={tool === TOOLS.ERASER} onClick={() => choose(TOOLS.ERASER)} label="Eraser" icon={<Eraser size={17} />} />
        <ToolButton active={tool === TOOLS.BUCKET} onClick={() => choose(TOOLS.BUCKET)} label="Fill" icon={<PaintBucket size={17} />} />

        <div className="relative shrink-0">
          <ToolButton
            active={EDIT_TOOLS.includes(tool)}
            onClick={() => onEditMenuToggle(!showEditMenu)}
            label={editLabel}
            icon={<MousePointer2 size={17} />}
            dropdown
            activeClass="bg-indigo-600 text-white"
          />
        </div>

        <div className="mx-1 h-7 w-px shrink-0 bg-zinc-300" />

        <ToolButton onClick={onUndo} label="Undo" icon={<Undo2 size={17} />} />
        <ToolButton active={showLayers} onClick={() => onShowLayers(true)} label="Layers" icon={<LayersIcon />} />
        <ToolButton onClick={onClear} label="Clear" icon={<Trash2 size={17} />} />
      </div>

      {(showShapeMenu || showEditMenu) && (
        <div className="border-t border-zinc-200 bg-white px-2 py-2">
          {showShapeMenu && (
            <div className="flex flex-wrap gap-1">
              <MenuButton onClick={() => choose(TOOLS.LINE)} icon={<Minus size={16} />} label="Line" />
              <MenuButton onClick={() => choose(TOOLS.CIRCLE)} icon={<Circle size={16} />} label="Circle" />
              <MenuButton onClick={() => choose(TOOLS.SQUARE)} icon={<Square size={16} />} label="Square" />
              <MenuButton onClick={() => choose(TOOLS.TRIANGLE)} icon={<Triangle size={16} />} label="Triangle" />
            </div>
          )}

          {showEditMenu && (
            <div className="flex flex-wrap gap-1">
              <MenuButton onClick={() => choose(TOOLS.SELECT)} icon={<MousePointer2 size={16} />} label="Select" />
              <MenuButton onClick={() => choose(TOOLS.ANCHOR)} icon={<Anchor size={16} />} label="Anchor" />
              <MenuButton onClick={() => choose(TOOLS.CURVE)} icon={<Waves size={16} />} label="Curve" />
              <MenuButton onClick={() => choose(TOOLS.ROTATE)} icon={<RotateCcw size={16} />} label="Rotate" />
            </div>
          )}
        </div>
      )}

      <ColorPicker
        strokeColor={strokeColor}
        fillColor={fillColor}
        colorTarget={colorTarget}
        recentColors={recentColors}
        pickerHue={pickerHue}
        showColorPicker={showColorPicker}
        strokeWidth={strokeWidth}
        onColorTargetChange={onColorTargetChange}
        onColorChange={onColorChange}
        onTogglePicker={onToggleColorPicker}
        onHexColorChange={onHexColorChange}
        onCustomColorChange={onCustomColorChange}
        onPickSaturationValue={onPickSaturationValue}
        onPickHue={onPickHue}
        onClosePicker={onCloseColorPicker}
        onWidthChange={onChangeSelectedWidth}
      />
    </div>
  )
}

function ToolButton({
  active = false,
  onClick,
  label,
  icon,
  dropdown = false,
  activeClass = "bg-zinc-900 text-white",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
        active ? activeClass : "bg-white text-zinc-700"
      }`}
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {dropdown && <ChevronDown size={14} />}
    </button>
  )
}

function MenuButton({ onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
    >
      {icon}
      {label}
    </button>
  )
}

function LayersIcon() {
  return (
    <span className="relative block h-[17px] w-[17px]">
      <span className="absolute left-0 top-1 h-3 w-4 rounded border-2 border-current" />
      <span className="absolute left-1 top-0 h-3 w-4 rounded border-2 border-current" />
    </span>
  )
}
