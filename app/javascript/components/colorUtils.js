function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function hexToHsv(hex) {
  const value = String(hex || "#18181b").replace("#", "")

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return { h: 0, s: 0, v: 0.0941 }
  }

  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0

  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4

    h *= 60
    if (h < 0) h += 360
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

export function hsvToHex(h, s, v) {
  const hue = ((Number(h) % 360) + 360) % 360
  const saturation = clamp(Number(s) || 0, 0, 1)
  const value = clamp(Number(v) || 0, 0, 1)
  const c = value * saturation
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - c

  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) {
    r = c
    g = x
  } else if (hue < 120) {
    r = x
    g = c
  } else if (hue < 180) {
    g = c
    b = x
  } else if (hue < 240) {
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  const ch = (n) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0")

  return `#${ch(r)}${ch(g)}${ch(b)}`
}
