import { Head, useForm } from "@inertiajs/react"
import {
  PawPrint,
  Utensils,
  Box,
  MapPin,
  Trophy,
  Sparkles,
  Leaf,
  Music,
  Gamepad2,
  HeartHandshake,
  CircleHelp,
} from "lucide-react"

const CATEGORY_ICONS = {
  animals: PawPrint,
  "food-drink": Utensils,
  food: Utensils,
  objects: Box,
  places: MapPin,
  sports: Trophy,
  nature: Leaf,
  music: Music,
  games: Gamepad2,
  sobriety: HeartHandshake,
  random: Sparkles,
}

function CategoryIcon({ slug }) {
  const Icon = CATEGORY_ICONS[slug] || CircleHelp

  return <Icon className="h-7 w-7" strokeWidth={1.8} />
}

export default function New({
  errors = {},
  values = {},
  categories = [],
}) {
  const { data, setData, post, processing } = useForm({
    player: {
      name: values.name || "",
    },
    game_room: {
      total_rounds: values.total_rounds || 5,
      round_duration: values.round_duration || 60,
      category_id: values.category_id || "",
    },
  })

  function submit(event) {
    event.preventDefault()

    post("/rooms")
  }

  function selectCategory(categoryId) {
    setData("game_room", {
      ...data.game_room,
      category_id: categoryId,
    })
  }

  return (
    <>
      <Head title="Create Game" />

      <div className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6 sm:py-12">
        <div className="mx-auto max-w-3xl">
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
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
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
            <section>
              <div className="mb-3">
                <h2 className="text-sm font-medium text-white">
                  Difficulty
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Choose how challenging the words should be.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    value: 1,
                    name: "Easy",
                    description: "Mostly simple words",
                  },
                  {
                    value: 2,
                    name: "Normal",
                    description: "A balanced mix",
                  },
                  {
                    value: 3,
                    name: "Hard",
                    description: "More challenging words",
                  },
                ].map((option) => {
                  const selected = Number(data.game_room.difficulty) === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setData("game_room", {
                          ...data.game_room,
                          difficulty: option.value,
                        })
                      }
                      className={[
                        "rounded-xl border px-4 py-4 text-left transition",
                        selected
                          ? "border-white bg-white text-zinc-950"
                          : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600",
                      ].join(" ")}
                    >
                      <div className="font-semibold">
                        {option.name}
                      </div>

                      <div
                        className={[
                          "mt-1 text-xs",
                          selected ? "text-zinc-600" : "text-zinc-500",
                        ].join(" ")}
                      >
                        {option.description}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-semibold">
                  Game Settings
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Choose how your game will play.
                </p>
              </div>

              {/* Category */}
              <div className="mt-8">
                <div className="mb-3">
                  <label className="block text-sm font-medium text-zinc-300">
                    Category
                  </label>

                  <p className="mt-1 text-xs text-zinc-500">
                    Choose the kind of things you'll be drawing.
                  </p>
                </div>

                {categories.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {categories.map((category) => {
                      const selected =
                        Number(data.game_room.category_id) ===
                        Number(category.id)

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => selectCategory(category.id)}
                          aria-pressed={selected}
                          className={[
                            "group relative flex min-h-32 flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center transition",
                            "active:scale-[0.98]",
                            selected
                              ? "border-white bg-white text-zinc-950 shadow-lg shadow-black/20"
                              : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800",
                          ].join(" ")}
                        >
                          {/* Selected indicator */}
                          {selected && (
                            <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-zinc-950" />
                          )}

                          <span
                            className={[
                              "mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition",
                              selected
                                ? "bg-zinc-950/10"
                                : "bg-zinc-900 group-hover:bg-zinc-800",
                            ].join(" ")}
                          >
                            <CategoryIcon slug={category.slug} />
                          </span>

                          <span className="text-sm font-semibold">
                            {category.name}
                          </span>

                          {category.description && (
                            <span
                              className={[
                                "mt-1 line-clamp-2 text-xs",
                                selected
                                  ? "text-zinc-600"
                                  : "text-zinc-500",
                              ].join(" ")}
                            >
                              {category.description}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-sm text-zinc-500">
                    No categories are currently available.
                  </div>
                )}

                {errors.category_id && (
                  <p className="mt-3 text-sm text-red-400">
                    {errors.category_id}
                  </p>
                )}
              </div>

              {/* Rules */}
              <div className="mt-8 border-t border-zinc-800 pt-8">
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-zinc-300">
                    Rules
                  </h3>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
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
              </div>
            </section>

            {/* Submit */}
            <button
              type="submit"
              disabled={processing || !data.game_room.category_id}
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