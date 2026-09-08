import "../application.css"

class RoomLobby {
  constructor(root) {
    this.root = root
    this.initialize()
  }

  initialize() {
    this.bindEvents()
  }

  bindEvents() {
    const copyButton = this.root.querySelector("[data-copy-room-code]")

    copyButton?.addEventListener("click", async () => {
      const code = copyButton.dataset.copyRoomCode

      await navigator.clipboard.writeText(code)

      const originalText = copyButton.textContent
      copyButton.textContent = "Copied!"

      setTimeout(() => {
        copyButton.textContent = originalText
      }, 1500)
    })
  }
}

const root = document.getElementById("room-lobby")

if (root) {
  new RoomLobby(root)
}