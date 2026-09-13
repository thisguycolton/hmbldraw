import { COLORS, STROKE_WIDTHS } from "./drawingConstants"
import { hexToHsv } from "./colorUtils"

export default function ColorPicker({
  strokeColor,
  fillColor,
  colorTarget,
  recentColors,
  pickerHue,
  showColorPicker,
  strokeWidth,
  onColorTargetChange,
  onColorChange,
  onTogglePicker,
  onHexColorChange,
  onCustomColorChange,
  onPickSaturationValue,
  onPickHue,
  onClosePicker,
  onWidthChange,
}) {
  const activeColor =
    colorTarget === "fill"
      ? fillColor
      : strokeColor

  return (
    <div className="relative border-t border-zinc-200 bg-zinc-50">
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <button
            type="button"
            onClick={() => {
              onColorTargetChange("stroke")
              onTogglePicker(true)
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
              onColorTargetChange("fill")
              onTogglePicker(true)
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
          onClick={() => onTogglePicker(!showColorPicker)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white"
          aria-label="Open color picker"
        >
          <span
            className="h-5 w-5 rounded-full border border-zinc-300"
            style={{ backgroundColor: activeColor }}
          />
        </button>

        {recentColors.map((nextColor) => (
          <button
            key={nextColor}
            type="button"
            onClick={() => onColorChange(nextColor)}
            className={`h-7 w-7 shrink-0 rounded-full border-2 ${
              activeColor.toLowerCase() === nextColor.toLowerCase()
                ? "scale-110 border-zinc-900"
                : "border-transparent"
            }`}
            style={{ backgroundColor: nextColor }}
            aria-label={`Set ${colorTarget} to ${nextColor}`}
          />
        ))}

        <input
          type="text"
          defaultValue={activeColor}
          key={`${colorTarget}-${activeColor}`}
          onChange={onHexColorChange}
          className="h-8 w-[78px] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 font-mono text-[11px] uppercase text-zinc-700 outline-none focus:border-zinc-400"
          maxLength={7}
          aria-label={`Hex ${colorTarget} color`}
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-zinc-300" />

        {STROKE_WIDTHS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onWidthChange(option.value)}
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
        <div className="absolute left-3 top-full z-[90] mt-1 max-h-[calc(100dvh-250px)] w-[272px] touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border border-zinc-700 bg-zinc-900 p-3 text-white shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                {colorTarget === "fill" ? "Fill" : "Stroke"}
              </div>
              <div className="font-mono text-xs">
                {activeColor}
              </div>
            </div>

            <button
              type="button"
              onClick={onClosePicker}
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
              onPickSaturationValue(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                onPickSaturationValue(event)
              }
            }}
          >
            {(() => {
              const hsv = hexToHsv(activeColor)

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
                onPickHue(event)
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                  onPickHue(event)
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
                onClick={() => onColorChange(nextColor)}
                className="h-7 rounded-md border border-white/20"
                style={{ backgroundColor: nextColor }}
                aria-label={`Set ${colorTarget} to ${nextColor}`}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={activeColor}
              onChange={onHexColorChange}
              className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 font-mono text-xs uppercase text-white outline-none"
              maxLength={7}
              aria-label={`Hex ${colorTarget} color`}
            />

            <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
              <span
                className="h-5 w-5 rounded-full"
                style={{ backgroundColor: activeColor }}
              />
              <input
                type="color"
                value={activeColor}
                onChange={onCustomColorChange}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`Native ${colorTarget} picker`}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
