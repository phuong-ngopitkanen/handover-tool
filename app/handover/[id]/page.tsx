"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { renderWithMentions } from "@/lib/renderMentions";

type Handover = {
  id: number;
  ticket_id: string;
  title: string;
  from_person: string;
  to_person: string;
  on_call_person: string;
  what_happened: string;
  watch_out: string;
  next_steps: string[];
  open_items: string[];
  acknowledged: number;
  acknowledged_at: string | null;
  created_at: string;
};

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

export default function HandoverDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [handover, setHandover] = useState<Handover | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(`/api/handovers/${id}`);
        if (!res.ok) {
          throw new Error("Failed.");
        }
        const data = (await res.json()) as Handover;
        if (mounted) {
          setHandover(data);
        }
      } catch {
        if (mounted) {
          setError("Could not load this handover.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (id) {
      void load();
    }
    return () => {
      mounted = false;
    };
  }, [id]);

  const isAcknowledged = useMemo(
    () => Boolean(handover?.acknowledged),
    [handover?.acknowledged]
  );

  async function acknowledge() {
    if (!handover || isAcknowledged) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/handovers/${handover.id}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        throw new Error("Failed.");
      }
      const updated = (await res.json()) as Handover;
      setHandover(updated);
    } catch {
      setError("Could not acknowledge this handover.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-6">
        <div className="mx-auto max-w-4xl space-y-3">
          <Link
            href="/"
            className="text-[13px] text-[#9B9B9B] no-underline transition-colors hover:text-[#1A1A1A]"
          >
            ← Home
          </Link>
          <p className="text-sm text-[#6B6B6B]">Loading handover…</p>
        </div>
      </main>
    );
  }

  if (!handover) {
    return (
      <main className="min-h-screen bg-white p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Link
            href="/"
            className="text-[13px] text-[#9B9B9B] no-underline transition-colors hover:text-[#1A1A1A]"
          >
            ← Home
          </Link>
          <p className="border border-[#E9E9E7] bg-[#F7F7F5] px-4 py-3 text-sm text-[#1A1A1A]">
            {error ?? "Handover not found."}
          </p>
          <Link href="/feed" className="text-sm text-[#6B6B6B] underline">
            Back to feed
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-6">
        <div className="flex gap-4 text-[13px] text-[#9B9B9B]">
          <Link
            href="/"
            className="no-underline transition-colors hover:text-[#1A1A1A]"
          >
            ← Home
          </Link>
          <Link
            href="/feed"
            className="no-underline transition-colors hover:text-[#1A1A1A]"
          >
            Back
          </Link>
        </div>

        <section>
          <p className="font-mono text-[12px] text-[#9B9B9B]">{handover.ticket_id}</p>
          <h1 className="mt-1 text-2xl font-bold text-[#1A1A1A]">
            {handover.title || "Handover"}
          </h1>
          <p className="mt-2 text-sm text-[#6B6B6B]">Submitted by {handover.from_person}</p>
          <p className="mt-1 text-sm text-[#1A1A1A]">
            {handover.from_person} → {handover.to_person}
          </p>
          {handover.on_call_person ? (
            <p className="mt-1 text-sm text-[#6B6B6B]">On call: {handover.on_call_person}</p>
          ) : null}
          <p className="mt-1 text-sm text-[#9B9B9B]">{formatTime(handover.created_at)}</p>
        </section>

        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
            What happened
          </h2>
          <div className="rounded-md bg-[#F7F7F5] p-4 text-sm leading-[1.7] whitespace-pre-wrap text-[#1A1A1A]">
            {renderWithMentions(handover.what_happened, (name) =>
              router.push(`/person/${encodeURIComponent(name)}`)
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
            Watch out for
          </h2>
          <div className="rounded-md bg-[#F7F7F5] p-4 text-sm leading-[1.7] whitespace-pre-wrap text-[#1A1A1A]">
            {renderWithMentions(handover.watch_out, (name) =>
              router.push(`/person/${encodeURIComponent(name)}`)
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
            Next steps
          </h2>
          {handover.next_steps.length ? (
            <ul className="space-y-2 text-sm text-[#1A1A1A]">
              {handover.next_steps.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[#1A1A1A]"
                    readOnly
                    disabled
                  />
                  <span>
                    {renderWithMentions(item, (name) =>
                      router.push(`/person/${encodeURIComponent(name)}`)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#9B9B9B]">No next steps.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
            Open items
          </h2>
          {handover.open_items.length ? (
            <ul className="space-y-2">
              {handover.open_items.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[#1A1A1A]"
                    readOnly
                    disabled
                  />
                  <span className="text-sm text-[#1A1A1A]">
                    {renderWithMentions(item, (name) =>
                      router.push(`/person/${encodeURIComponent(name)}`)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#9B9B9B]">No open items.</p>
          )}
        </section>

        {error ? (
          <p className="border border-[#E9E9E7] bg-[#F7F7F5] px-4 py-3 text-sm text-[#1A1A1A]">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void acknowledge()}
            disabled={isAcknowledged || saving}
            className={`w-full max-w-sm rounded-md border border-[#E9E9E7] py-2.5 text-sm font-medium transition ${
              isAcknowledged
                ? "cursor-default bg-[#F7F7F5] text-[#9B9B9B]"
                : "bg-white text-[#1A1A1A] hover:bg-[#F7F7F5] disabled:cursor-not-allowed disabled:opacity-60"
            }`}
          >
            {isAcknowledged
              ? "✓ Acknowledged"
              : saving
                ? "Saving…"
                : "Acknowledge handover"}
          </button>
        </div>
      </div>
    </main>
  );
}
