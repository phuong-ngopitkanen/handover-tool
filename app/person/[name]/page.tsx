"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { renderWithMentions } from "@/lib/renderMentions";
import {
  getTimelineEventColor,
  TIMELINE_LEGEND,
  timelineEventCardStyle,
} from "@/lib/timelineEventColors";

type PersonEvent = {
  id: number;
  handover_id: number;
  event_type: string;
  actor: string | null;
  description: string | null;
  created_at: string;
  ticket_id: string;
  title: string;
};

type ActivityResponse = {
  name: string;
  events: PersonEvent[];
};

function eventTypeLabel(eventType: string) {
  switch (eventType) {
    case "update_added":
      return "Update added";
    case "followup_added":
      return "Update added";
    case "submitted":
      return "Handover submitted";
    case "item_checked":
      return "Item checked off";
    case "acknowledged":
      return "Acknowledged";
    case "action_required":
      return "Action required";
    case "person_tagged":
      return "Person tagged";
    default:
      return eventType;
  }
}

function timeAgo(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export default function PersonPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const name = useMemo(() => decodeURIComponent(params.name), [params.name]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/people/${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error("Failed to load activity.");
        const payload = (await res.json()) as ActivityResponse;
        if (mounted) setData(payload);
      } catch {
        if (mounted) setError("Could not load this person's activity.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [name]);

  const groupedEvents = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, PersonEvent[]>();
    for (const event of data.events) {
      const dateKey = new Date(event.created_at).toLocaleDateString();
      groups.set(dateKey, [...(groups.get(dateKey) ?? []), event]);
    }
    return [...groups.entries()];
  }, [data]);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[720px] px-6 py-12">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#9B9B9B] no-underline transition-colors hover:text-[#1A1A1A]"
        >
          ← Home
        </Link>

        <h1 className="text-[28px] font-bold text-[#1A1A1A]">@{name}</h1>
        <p className="mt-1 text-sm text-[#6B6B6B]">Handovers and updates mentioning you</p>

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-[#9B9B9B]">
            <span className="size-4 animate-spin rounded-full border-2 border-[#E9E9E7] border-t-[#1A1A1A]" />
            Loading…
          </div>
        ) : null}
        {error ? (
          <p className="mt-6 border border-[#E9E9E7] bg-[#F7F7F5] px-4 py-3 text-sm text-[#1A1A1A]">
            {error}
          </p>
        ) : null}

        {data ? (
          <div className="mt-8 space-y-8">
            {groupedEvents.length ? (
              <>
                <div className="mb-4 flex flex-wrap gap-4">
                  {TIMELINE_LEGEND.map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span
                        className="shrink-0 rounded-full"
                        style={{ width: 8, height: 8, backgroundColor: item.color }}
                      />
                      <span className="text-[11px] text-[#9B9B9B]">{item.label}</span>
                    </div>
                  ))}
                </div>
                {groupedEvents.map(([date, events]) => (
                <section key={date}>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                    {date}
                  </p>
                  <div className="mt-3">
                    {events.map((event, evIndex) => {
                      const eventColor = getTimelineEventColor(event.event_type);
                      return (
                        <div
                          key={event.id}
                          className="mb-4 flex gap-3"
                        >
                          <div className="flex w-[18px] shrink-0 flex-col items-center">
                            <div
                              className="mt-1.5 shrink-0 rounded-full border-2 border-white"
                              style={{
                                width: 10,
                                height: 10,
                                backgroundColor: eventColor,
                              }}
                            />
                            {evIndex < events.length - 1 ? (
                              <div className="w-px min-h-[16px] flex-1 bg-[#E9E9E7]" />
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => router.push(`/feed?id=${event.handover_id}`)}
                            className="min-w-0 flex-1 cursor-pointer bg-white py-2 pr-2 text-left transition-colors hover:bg-[#F7F7F5]"
                            style={timelineEventCardStyle(eventColor)}
                          >
                            <p className="text-sm font-medium text-[#1A1A1A]">
                              {event.title || "Untitled handover"}
                            </p>
                            <p className="mt-1 font-mono text-xs text-[#9B9B9B]">{event.ticket_id}</p>
                            <p className="mt-1 text-[12px] text-[#9B9B9B]">
                              {eventTypeLabel(event.event_type)}
                            </p>
                            {event.actor ? (
                              <p className="mt-1 text-[13px] font-medium text-[#1A1A1A]">{event.actor}</p>
                            ) : null}
                            <div className="mt-1 whitespace-pre-wrap text-[13px] text-[#6B6B6B]">
                              {event.description
                                ? renderWithMentions(event.description, (n) =>
                                    router.push(`/person/${encodeURIComponent(n)}`)
                                  )
                                : "—"}
                            </div>
                            <p className="mt-2 text-[11px] text-[#9B9B9B]">{timeAgo(event.created_at)}</p>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
                ))}
              </>
            ) : (
              <p className="text-sm text-[#9B9B9B]">No activity found</p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
