import { Head, useForm } from "@inertiajs/react"
import { getPlayerToken } from "../../player_identity"

export default function Join({ error }) {
  const form = useForm({
    code: "",
    player: {
      name: "",
    },
    player_token: getPlayerToken() || "",
  })

  function submit(event) {
  event.preventDefault()

  const code = form.data.code.toUpperCase()

  console.log("[Join] Submitting", {
    code,
    name: form.data.player.name,
    hasPlayerToken: Boolean(form.data.player_token),
  })

  form.post(`/rooms/${code}/join`)
}

  return (
    <>
      <Head title="Join Game" />

      <div className="min-h-screen bg-zinc-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-lg">

          <div className="mb-10">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
              HMBLDRAW
            </p>

            <h1 className="text-4xl font-bold tracking-tight">
              Join a Game
            </h1>

            <p className="mt-3 text-zinc-400">
              Enter the room code your friend gave you.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-6">

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">

              <div className="space-y-6">

                <div>
                  <label
                    htmlFor="room-code"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    Room code
                  </label>

                  <input
                    id="room-code"
                    type="text"
                    value={form.data.code}
                    onChange={(event) =>
                      form.setData(
                        "code",
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 4)
                      )
                    }
                    placeholder="ABCD"
                    maxLength={4}
                    autoComplete="off"
                    required
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-4 text-center font-mono text-2xl font-bold tracking-[0.4em] text-white uppercase outline-none transition placeholder:text-zinc-700 focus:border-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="player-name"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    Your name
                  </label>

                  <input
                    id="player-name"
                    type="text"
                    value={form.data.player.name}
                    onChange={(event) =>
                      form.setData("player", {
                        ...form.data.player,
                        name: event.target.value,
                      })
                    }
                    placeholder="Enter your name"
                    maxLength={24}
                    required
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-white"
                  />
                </div>

              </div>

              {error && (
                <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {form.errors.player_token && (
                <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                  {form.errors.player_token}
                </div>
              )}

            </section>

            <button
              type="submit"
              disabled={
                form.processing ||
                form.data.code.length !== 4 ||
                !form.data.player.name.trim()
              }
              className="w-full rounded-xl bg-white px-6 py-4 font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {form.processing
                ? "Joining Game…"
                : "Join Game"}
            </button>

          </form>
        </div>
      </div>
    </>
  )
}