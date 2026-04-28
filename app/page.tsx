import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h1 className="mb-2 text-[32px] font-bold leading-tight text-[#1A1A1A]">On-Call Handover Note Tool</h1>
        <p className="mb-12 text-base text-[#6B6B6B]">A simple tool for recording and sharing on-call shift notes across your team.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/submit"
            className="group cursor-pointer rounded-lg border border-[#E9E9E7] bg-white p-8 text-left transition-colors hover:border-[#C9C9C7] hover:bg-[#F7F7F5]"
          >
            <h2 className="mb-1.5 text-lg font-semibold text-[#1A1A1A]">Submit a handover</h2>
            <p className="text-sm text-[#6B6B6B]">Use this after your shift to upload or paste your notes. The tool will extract the key information for the next person.</p>
          </Link>

          <Link
            href="/feed"
            className="group cursor-pointer rounded-lg border border-[#E9E9E7] bg-white p-8 text-left transition-colors hover:border-[#C9C9C7] hover:bg-[#F7F7F5]"
          >
            <h2 className="mb-1.5 text-lg font-semibold text-[#1A1A1A]">View handovers</h2>
            <p className="text-sm text-[#6B6B6B]">Browse past handover notes, track open items, and see what happened during previous shifts.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
