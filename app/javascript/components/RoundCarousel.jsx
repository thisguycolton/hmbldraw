import { useEffect, useState } from "react"
import GameCanvas from "./GameCanvas"

export default function RoundCarousel({ rounds = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Keep the index valid if the rounds array changes.
  useEffect(() => {
    if (rounds.length === 0) {
      setCurrentIndex(0)
      return
    }

    setCurrentIndex((current) =>
      Math.min(current, rounds.length - 1)
    )
  }, [rounds.length])

  if (rounds.length === 0) {
    return null
  }

  const round = rounds[currentIndex]

  if (!round) {
    return null
  }

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < rounds.length - 1

  function previousRound() {
    if (!hasPrevious) return

    setCurrentIndex((current) => current - 1)
  }

  function nextRound() {
    if (!hasNext) return

    setCurrentIndex((current) => current + 1)
  }

  return (
    <section className="mt-8">
      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl">

        {/* Header */}
        <div className="border-b border-zinc-800 px-6 py-6 text-center sm:px-10">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
            Game Gallery
          </p>

          <h3 className="mt-2 text-2xl font-bold tracking-tight">
            The Drawings
          </h3>

          <p className="mt-2 text-sm text-zinc-600">
            Relive each round of the game.
          </p>
        </div>

        {/* Round indicator */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={previousRound}
            disabled={!hasPrevious}
            aria-label="Previous round"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-lg text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
          >
            ←
          </button>

          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-600">
              Round
            </p>

            <p className="mt-1 font-mono text-lg font-bold">
              {currentIndex + 1}
              <span className="mx-1 text-zinc-700">
                /
              </span>
              {rounds.length}
            </p>
          </div>

          <button
            type="button"
            onClick={nextRound}
            disabled={!hasNext}
            aria-label="Next round"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-lg text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
          >
            →
          </button>
        </div>

        {/* Drawing */}
        <div className="px-4 py-6 sm:px-8">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            {round.strokes && round.strokes.length > 0 ? (
              <GameCanvas
                key={round.id}
                strokes={round.strokes}
                canDraw={false}
                onStroke={() => {}}
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center">
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-600">
                    No drawing
                  </p>

                  <p className="mt-1 text-xs text-zinc-700">
                    Nothing was drawn this round.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Round information */}
        <div className="grid gap-4 border-t border-zinc-800 px-5 py-5 sm:grid-cols-2 sm:px-8">

          {/* Word */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
              The Word
            </p>

            <p className="mt-2 text-xl font-bold capitalize">
              {round.word || "Unknown"}
            </p>
          </div>

          {/* Drawer */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
              Drawn By
            </p>

            <p className="mt-2 text-xl font-bold">
              {round.drawer?.name || "Unknown"}
            </p>
          </div>

        </div>

        {/* Winner */}
        <div className="border-t border-zinc-800 px-5 py-5 sm:px-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center">

            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
              Winner
            </p>

            {round.winner ? (
              <>
                <p className="mt-2 text-xl font-bold text-emerald-400">
                  {round.winner.name}
                </p>

                <p className="mt-1 text-sm text-zinc-600">
                  Guessed it correctly
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-lg font-semibold text-zinc-600">
                  Nobody
                </p>

                <p className="mt-1 text-sm text-zinc-700">
                  Time ran out
                </p>
              </>
            )}

          </div>
        </div>

        {/* Dots */}
        {rounds.length > 1 && (
          <div className="flex justify-center gap-2 border-t border-zinc-800 px-5 py-5">
            {rounds.map((item, index) => (
              <button
                key={item.id || index}
                type="button"
                onClick={() => setCurrentIndex(index)}
                aria-label={`View round ${index + 1}`}
                aria-current={
                  index === currentIndex
                    ? "true"
                    : undefined
                }
                className={`h-2 rounded-full transition-all ${
                  index === currentIndex
                    ? "w-6 bg-white"
                    : "w-2 bg-zinc-700 hover:bg-zinc-500"
                }`}
              />
            ))}
          </div>
        )}

      </div>
    </section>
  )
}