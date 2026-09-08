import { Head, Link } from "@inertiajs/react"

export default function Home() {
  return (
    <>
      <Head title="Pictionary" />

      <div className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <div className="text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
              Multiplayer Drawing Game
            </p>

            <h1 className="text-6xl font-bold tracking-tight">
              HMBLDRAW
            </h1>

            <p className="mx-auto mt-5 max-w-lg text-lg text-zinc-400">
              Draw something. Let your friends figure out what the hell it is.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/rooms/new"
                className="rounded-xl bg-white px-7 py-4 font-semibold text-zinc-950 transition hover:bg-zinc-200"
              >
                Create Game
              </Link>

              <Link
                href="/rooms/join"
                className="rounded-xl border border-zinc-700 px-7 py-4 font-semibold text-white transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                Join Game
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}