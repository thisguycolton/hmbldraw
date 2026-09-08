const STORAGE_KEY = "hmbl_draw_player_token"

export function getPlayerToken() {
  return localStorage.getItem(STORAGE_KEY)
}

export function setPlayerToken(token) {
  if (!token) return

  localStorage.setItem(STORAGE_KEY, token)
}

export function clearPlayerToken() {
  localStorage.removeItem(STORAGE_KEY)
}