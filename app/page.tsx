import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h1 className="mb-2 text-[32px] font-bold leading-tight text-[#1A1A1A]">On-Call Handovers</h1>
        <p className="mb-12 text-base text-[#6B6B6B]">Keep your team in sync across shifts</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/submit"
            className="group cursor-pointer rounded-lg border border-[#E9E9E7] bg-white p-8 text-left transition-colors hover:border-[#C9C9C7] hover:bg-[#F7F7F5]"
          >
            <h2 className="mb-1.5 text-lg font-semibold text-[#1A1A1A]">Submit a handover</h2>
            <p className="text-sm text-[#6B6B6B]">Ending your shift? Upload or paste your notes.</p>
          </Link>

          <Link
            href="/feed"
            className="group cursor-pointer rounded-lg border border-[#E9E9E7] bg-white p-8 text-left transition-colors hover:border-[#C9C9C7] hover:bg-[#F7F7F5]"
          >
            <h2 className="mb-1.5 text-lg font-semibold text-[#1A1A1A]">View handovers</h2>
            <p className="text-sm text-[#6B6B6B]">Starting your shift? See what happened.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
