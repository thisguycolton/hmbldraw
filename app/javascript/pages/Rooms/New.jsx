import { Head, useForm } from "@inertiajs/react"

export default function New({ errors = {}, values = {} }) {
  const { data, setData, post, processing } = useForm({
    player: {
      name: values.name || "",
    },
    game_room: {
      total_rounds: values.total_rounds || 5,
      round_duration: values.round_duration || 60,
    },
  })

  function submit(event) {
    event.preventDefault()

    post("/rooms")
  }

  return (
    <>
      <Head title="Create Game" />

      <div className="min-h-screen bg-zinc-950 px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="mb-10">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
              HMBLDRAW
            </p>

            <h1 className="text-4xl font-bold tracking-tight">
              Create a Game
            </h1>

            <p className="mt-3 text-zinc-400">
              Set up your game and invite your friends.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-6">
            {/* Player */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold">
                Your Player
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                You'll be the host of this game.
              </p>

              <div className="mt-6">
                <label
                  htmlFor="player-name"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Your name
                </label>

                <input
                  id="player-name"
                  type="text"
                  value={data.player.name}
                  onChange={(event) =>
                    setData("player", {
                      ...data.player,
                      name: event.target.value,
                    })
                  }
                  placeholder="Enter your name"
                  maxLength={24}
                  autoFocus
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-white"
                />

                {errors.name && (
                  <p className="mt-2 text-sm text-red-400">
                    {errors.name}
                  </p>
                )}
              </div>
            </section>

            {/* Game Settings */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold">
                Game Settings
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Choose how your game will play.
              </p>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                {/* Rounds */}
                <div>
                  <label
                    htmlFor="total-rounds"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    Rounds
                  </label>

                  <select
                    id="total-rounds"
                    value={data.game_room.total_rounds}
                    onChange={(event) =>
                      setData("game_room", {
                        ...data.game_room,
                        total_rounds: Number(event.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-white"
                  >
                    <option value={3}>3 rounds</option>
                    <option value={5}>5 rounds</option>
                    <option value={7}>7 rounds</option>
                    <option value={10}>10 rounds</option>
                  </select>
                </div>

                {/* Drawing Time */}
                <div>
                  <label
                    htmlFor="round-duration"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    Drawing time
                  </label>

                  <select
                    id="round-duration"
                    value={data.game_room.round_duration}
                    onChange={(event) =>
                      setData("game_room", {
                        ...data.game_room,
                        round_duration: Number(event.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-white"
                  >
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                    <option value={120}>2 minutes</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Submit */}
            <button
              type="submit"
              disabled={processing}
              className="w-full rounded-xl bg-white px-6 py-4 text-base font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? "Creating Game…" : "Create Game"}
            </button>

            <p className="text-center text-xs text-zinc-600">
              You'll get a room code after creating the game.
            </p>
          </form>
        </div>
      </div>
    </>
  )
}