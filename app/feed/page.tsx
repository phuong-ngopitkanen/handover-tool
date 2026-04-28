"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { renderWithMentions } from "@/lib/renderMentions";
import {
  getTimelineEventColor,
  TIMELINE_LEGEND,
  timelineEventCardStyle,
} from "@/lib/timelineEventColors";
import { filterMembersForAtMention } from "@/lib/team";

type Handover = {
  id: number;
  ticket_id: string;
  title: string;
  from_person: string;
  to_person: string;
  on_call_person: string;
  what_happened: string;
  watch_out: string;
  people_involved: string[];
  acknowledged: number;
  acknowledged_at: string | null;
  created_at: string;
  next_steps: string[];
  open_items: string[];
};

type EventItem = {
  id: number;
  handover_id: number;
  event_type:
    | "submitted"
    | "followup_added"
    | "update_added"
    | "item_checked"
    | "acknowledged"
    | "person_tagged"
    | "action_required";
  actor: string | null;
  description: string | null;
  created_at: string;
};

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

/** Parse description from item_checked events created by /api/.../check */
function parseItemCheckedDescription(
  description: string | null,
  actor: string | null
): { item: string; comment: string | null } | null {
  if (!actor || !description) return null;
  const start = `${actor} checked off: `;
  if (!description.startsWith(start)) return null;
  const rest = description.slice(start.length);
  const sep = " — ";
  const idx = rest.indexOf(sep);
  if (idx === -1) {
    return { item: rest, comment: null };
  }
  const comment = rest.slice(idx + sep.length);
  return { item: rest.slice(0, idx), comment: comment || null };
}

export default function FeedPage() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "acknowledged">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [showAddUpdateForm, setShowAddUpdateForm] = useState(false);
  const [updateAuthor, setUpdateAuthor] = useState("");
  const [updateText, setUpdateText] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [updateMentionOptions, setUpdateMentionOptions] = useState<string[]>([]);
  const [updateMentionMessage, setUpdateMentionMessage] = useState<string | null>(null);
  const [updateMentionRange, setUpdateMentionRange] = useState<{ start: number; end: number } | null>(
    null
  );
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [pendingCheck, setPendingCheck] = useState<{ item: string; itemType: "next_step" | "open_item" } | null>(null);
  const [checkActor, setCheckActor] = useState("");
  const [checkComment, setCheckComment] = useState("");
  const [ackName, setAckName] = useState("");
  const [showAckPrompt, setShowAckPrompt] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const eventCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const resetUpdateFormState = useCallback(() => {
    setShowAddUpdateForm(false);
    setUpdateAuthor("");
    setUpdateText("");
    setUpdateMentionOptions([]);
    setUpdateMentionMessage(null);
    setUpdateMentionRange(null);
    setUpdateError(null);
  }, []);

  const selectHandover = useCallback(
    (id: number) => {
      resetUpdateFormState();
      setSelectedId(id);
    },
    [resetUpdateFormState]
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/handovers");
        if (!res.ok) {
          throw new Error("Failed to load.");
        }
        const data = (await res.json()) as Handover[];
        if (mounted) {
          setHandovers(data);
          if (data.length) {
            selectHandover(data[0].id);
          }
        }
      } catch {
        if (mounted) {
          setError("Could not load handovers.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [selectHandover]);

  useEffect(() => {
    const idParam = searchParams.get("id");
    if (!idParam || !handovers.length) return;
    const id = Number(idParam);
    if (!Number.isInteger(id)) return;
    const target = handovers.find((handover) => handover.id === id);
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      selectHandover(id);
      cardRefs.current[id]?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchParams, handovers, selectHandover]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return handovers.filter((handover) => {
      if (filter === "unread" && handover.acknowledged) return false;
      if (filter === "acknowledged" && !handover.acknowledged) return false;
      if (!term) return true;

      return (
        handover.ticket_id.toLowerCase().includes(term) ||
        handover.title.toLowerCase().includes(term) ||
        handover.from_person.toLowerCase().includes(term) ||
        handover.to_person.toLowerCase().includes(term) ||
        handover.on_call_person.toLowerCase().includes(term) ||
        handover.what_happened.toLowerCase().includes(term)
      );
    });
  }, [handovers, filter, search]);

  const selected = useMemo(
    () => handovers.find((handover) => handover.id === selectedId) ?? null,
    [handovers, selectedId]
  );

  useEffect(() => {
    let mounted = true;
    async function loadEvents() {
      if (!selected) {
        setEvents([]);
        return;
      }
      setEventsLoading(true);
      setEventsError(null);
      try {
        const res = await fetch(`/api/handovers/${selected.id}/events`);
        if (!res.ok) throw new Error("Failed to load timeline.");
        const data = (await res.json()) as EventItem[];
        if (mounted) setEvents(data);
      } catch {
        if (mounted) setEventsError("Could not load timeline.");
      } finally {
        if (mounted) setEventsLoading(false);
      }
    }
    void loadEvents();
    return () => {
      mounted = false;
    };
  }, [selected]);

  async function refreshEvents() {
    if (!selected) return;
    const res = await fetch(`/api/handovers/${selected.id}/events`);
    if (!res.ok) return;
    const data = (await res.json()) as EventItem[];
    setEvents(data);
  }

  function replaceUpdateMention(
    fullName: string,
    currentText: string,
    range: { start: number; end: number } | null = null
  ) {
    const r = range ?? updateMentionRange;
    if (!r) return;
    const nextText = `${currentText.slice(0, r.start)}@${fullName} ${currentText.slice(r.end)}`;
    setUpdateText(nextText);
    setUpdateMentionOptions([]);
    setUpdateMentionMessage(null);
    setUpdateMentionRange(null);
  }

  function onUpdateTextChange(value: string, caret: number) {
    setUpdateText(value);
    const uptoCursor = value.slice(0, caret);
    const mentionMatch = uptoCursor.match(/@([a-zA-Z]+)$/);

    if (!mentionMatch) {
      setUpdateMentionOptions([]);
      setUpdateMentionMessage(null);
      setUpdateMentionRange(null);
      return;
    }

    const raw = mentionMatch[1];
    const tokenStart = caret - mentionMatch[0].length;
    const tokenEnd = caret;
    const matches = filterMembersForAtMention(raw);

    const range = { start: tokenStart, end: tokenEnd };
    setUpdateMentionRange(range);
    if (matches.length === 1) {
      replaceUpdateMention(matches[0]!, value, range);
      return;
    }
    if (matches.length > 1) {
      setUpdateMentionOptions(matches);
      setUpdateMentionMessage(null);
      return;
    }
    setUpdateMentionOptions([]);
    setUpdateMentionMessage("Unknown person — will need manual tagging");
  }

  function cancelAddUpdate() {
    resetUpdateFormState();
  }

  async function postUpdate() {
    if (!selected || !updateAuthor.trim() || !updateText.trim()) return;
    setPostingUpdate(true);
    setUpdateError(null);
    try {
      const res = await fetch(`/api/handovers/${selected.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "update_added",
          actor: updateAuthor.trim(),
          description: updateText,
        }),
      });
      if (!res.ok) throw new Error("Failed to post update.");
      const created = (await res.json()) as EventItem;
      setEvents((prev) => [...prev, created]);
      cancelAddUpdate();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          eventCardRefs.current[created.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      });
    } catch {
      setUpdateError("Could not post this update.");
    } finally {
      setPostingUpdate(false);
    }
  }

  async function acknowledge() {
    if (!selected || selected.acknowledged || !ackName.trim()) return;
    setIsAcknowledging(true);
    setError(null);
    try {
      const res = await fetch(`/api/handovers/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgedBy: ackName }),
      });
      if (!res.ok) throw new Error("Failed to acknowledge handover.");
      const updated = (await res.json()) as Handover;
      setHandovers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setShowAckPrompt(false);
      await refreshEvents();
    } catch {
      setError("Could not acknowledge this handover.");
    } finally {
      setIsAcknowledging(false);
    }
  }

  function cancelPendingCheck() {
    setPendingCheck(null);
    setCheckActor("");
    setCheckComment("");
  }

  async function confirmCheckItem() {
    if (!selected || !pendingCheck || !checkActor.trim()) return;
    const itemKey = `${pendingCheck.itemType}:${pendingCheck.item}`;
    try {
      const res = await fetch(`/api/handovers/${selected.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: checkActor.trim(),
          item: pendingCheck.item,
          itemType: pendingCheck.itemType,
          comment: checkComment.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed.");
      setCheckedItems((prev) => ({ ...prev, [itemKey]: true }));
      cancelPendingCheck();
      await refreshEvents();
    } catch {
      setError("Could not record checked item.");
    }
  }

  function getEventLabel(eventType: EventItem["event_type"]) {
    switch (eventType) {
      case "submitted":
        return "Handover submitted";
      case "update_added":
        return "Update added";
      case "followup_added":
        return "Update added";
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

  return (
    <main className="h-screen bg-white">
      <div className="flex h-full">
        <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-[#E9E9E7] bg-[#F7F7F5] p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-[#1A1A1A]">Handovers</span>
            <Link
              href="/submit"
              className="text-[13px] text-[#9B9B9B] no-underline transition-colors hover:text-[#1A1A1A]"
            >
              + New
            </Link>
          </div>
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 text-[13px] text-[#9B9B9B] no-underline transition-colors hover:text-[#1A1A1A]"
          >
            ← Home
          </Link>
          <div className="mb-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by ID, name or keyword…"
              className="w-full border border-[#E9E9E7] py-[7px] pr-3 pl-3 text-[13px] text-[#1A1A1A] placeholder:text-[#9B9B9B] focus:border-[#9B9B9B] focus:outline-none"
            />
          </div>
          <div className="mb-4 flex gap-3 text-[12px]">
            {(
              [
                { key: "all", label: "All" },
                { key: "unread", label: "Unread" },
                { key: "acknowledged", label: "Acknowledged" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key as "all" | "unread" | "acknowledged")}
                className={
                  filter === tab.key
                    ? "font-semibold text-[#1A1A1A]"
                    : "text-[#9B9B9B] hover:text-[#6B6B6B]"
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-[#9B9B9B]">
                <span className="size-4 animate-spin rounded-full border-2 border-[#E9E9E7] border-t-[#1A1A1A]" />
                Loading…
              </div>
            ) : null}
            {items.map((handover) => (
              <button
                key={handover.id}
                ref={(element) => {
                  cardRefs.current[handover.id] = element;
                }}
                type="button"
                onClick={() => selectHandover(handover.id)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  selectedId === handover.id
                    ? "border-[#C9C9C7] bg-[#EFEFED]"
                    : "border-[#E9E9E7] bg-white hover:bg-[#F7F7F5]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-[11px] text-[#9B9B9B]">{handover.ticket_id}</p>
                  <p className="text-[11px] text-[#9B9B9B]">{timeAgo(handover.created_at)}</p>
                </div>
                <p className="mt-1 text-[13px] font-medium text-[#1A1A1A]">{handover.title}</p>
                <p className="mt-0.5 text-[12px] text-[#9B9B9B]">
                  {handover.from_person} → {handover.to_person}
                </p>
                <span
                  className="mt-1.5 inline-block rounded-full border border-[#E9E9E7] bg-[#F7F7F5] px-2 py-0.5 text-[11px] text-[#9B9B9B]"
                >
                  {handover.acknowledged ? "Acknowledged" : "Unread"}
                </span>
              </button>
            ))}
            {!loading && items.length === 0 ? (
              <p className="text-sm text-[#9B9B9B]">No handovers found</p>
            ) : null}
          </div>
        </aside>

        <section className="min-h-0 flex-1 overflow-y-auto bg-white py-10 pr-12 pl-10">
          {error ? (
            <p className="mb-4 border border-[#E9E9E7] bg-[#F7F7F5] px-4 py-3 text-sm text-[#1A1A1A]">
              {error}
            </p>
          ) : null}

          {!selected ? (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-[#9B9B9B]">
              Select a handover to view details
            </div>
          ) : (
            <div className="mx-auto max-w-4xl">
              <div className="mb-8 flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[12px] text-[#9B9B9B]">{selected.ticket_id}</p>
                  <h1 className="mt-1 text-2xl font-bold text-[#1A1A1A]">{selected.title}</h1>
                  <p className="mt-1 text-[13px] text-[#9B9B9B]">
                    Submitted by {selected.from_person} · {selected.from_person} →{" "}
                    {selected.to_person} · {timeAgo(selected.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(selected.ticket_id);
                    setCopyLabel("Copied");
                    setTimeout(() => setCopyLabel("Copy"), 1200);
                  }}
                  className="shrink-0 rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-sm text-[#1A1A1A] transition-colors hover:bg-[#F7F7F5]"
                >
                  {copyLabel}
                </button>
              </div>

              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Who was on call
                </p>
                <div className="rounded-md bg-[#F7F7F5] p-4 text-sm leading-relaxed text-[#1A1A1A]">
                  {selected.on_call_person || "Not specified"}
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  What happened
                </p>
                <div className="rounded-md bg-[#F7F7F5] p-4 text-sm leading-[1.7] whitespace-pre-wrap text-[#1A1A1A]">
                  {renderWithMentions(selected.what_happened, (name) =>
                    router.push(`/person/${encodeURIComponent(name)}`)
                  )}
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  What the next person should know
                </p>
                <div className="rounded-md bg-[#F7F7F5] p-4 text-sm leading-[1.7] whitespace-pre-wrap text-[#1A1A1A]">
                  {renderWithMentions(selected.watch_out, (name) =>
                    router.push(`/person/${encodeURIComponent(name)}`)
                  )}
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Next steps
                </p>
                <div className="mt-2 space-y-2">
                  {selected.next_steps.length ? (
                    <ul className="space-y-2">
                      {selected.next_steps.map((item, index) => {
                        const done = Boolean(checkedItems[`next_step:${item}`]);
                        return (
                          <li key={`${item}-${index}`} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-[15px] shrink-0 accent-[#1A1A1A]"
                              checked={done}
                              onChange={() => {
                                setPendingCheck({ item, itemType: "next_step" });
                                setCheckActor("");
                                setCheckComment("");
                              }}
                            />
                            <span
                              className={
                                done
                                  ? "text-sm text-[#9B9B9B] line-through"
                                  : "text-sm leading-normal text-[#1A1A1A]"
                              }
                            >
                              {renderWithMentions(item, (name) =>
                                router.push(`/person/${encodeURIComponent(name)}`)
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#9B9B9B]">No next steps</p>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Open items
                </p>
                <div className="mt-2 space-y-2">
                  {selected.open_items.length ? (
                    <ul className="space-y-2">
                      {selected.open_items.map((item, index) => {
                        const done = Boolean(checkedItems[`open_item:${item}`]);
                        return (
                          <li key={`${item}-${index}`} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-[15px] shrink-0 accent-[#1A1A1A]"
                              checked={done}
                              onChange={() => {
                                setPendingCheck({ item, itemType: "open_item" });
                                setCheckActor("");
                                setCheckComment("");
                              }}
                            />
                            <span
                              className={
                                done
                                  ? "text-sm text-[#9B9B9B] line-through"
                                  : "text-sm leading-normal text-[#1A1A1A]"
                              }
                            >
                              {renderWithMentions(item, (name) =>
                                router.push(`/person/${encodeURIComponent(name)}`)
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#9B9B9B]">No open items</p>
                  )}
                </div>
              </div>

              {pendingCheck ? (
                <div className="mb-6 rounded-md border border-[#E9E9E7] bg-white p-4">
                  <p className="text-sm font-medium text-[#1A1A1A]">Confirm check-off</p>
                  <p className="mt-1 text-xs text-[#9B9B9B]">
                    {pendingCheck.itemType === "next_step" ? "Next step" : "Open item"}
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-[#6B6B6B]">{pendingCheck.item}</p>
                  <label className="mt-4 block">
                    <span className="mb-1 block text-sm text-[#1A1A1A]">Your name</span>
                    <input
                      value={checkActor}
                      onChange={(event) => setCheckActor(event.target.value)}
                      className="w-full"
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-sm text-[#1A1A1A]">Add a comment</span>
                    <textarea
                      value={checkComment}
                      onChange={(event) => setCheckComment(event.target.value)}
                      rows={3}
                      placeholder="What did you do? Any notes? (optional)"
                      className="w-full"
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmCheckItem()}
                      disabled={!checkActor.trim()}
                      className="rounded-md bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2D2D2D] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelPendingCheck()}
                      className="rounded-md border border-[#E9E9E7] bg-white px-4 py-2 text-sm text-[#1A1A1A] transition hover:bg-[#F7F7F5]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  People involved
                </p>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([selected.from_person, selected.to_person, ...selected.people_involved])].map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => router.push(`/person/${encodeURIComponent(name)}`)}
                      className="rounded-full border border-[#E9E9E7] bg-white py-0.5 pr-2.5 pl-2.5 text-xs text-[#6B6B6B] transition hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <hr className="my-7 border-0 border-t border-[#E9E9E7]" />

              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Timeline
                </p>
                {eventsLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-[#9B9B9B]">
                    <span className="size-4 animate-spin rounded-full border-2 border-[#E9E9E7] border-t-[#1A1A1A]" />
                    Loading timeline…
                  </div>
                ) : eventsError ? (
                  <p className="mt-3 text-sm text-[#6B6B6B]">{eventsError}</p>
                ) : (
                  <div className="mt-1">
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
                    {events.map((event, index) => {
                      const eventColor = getTimelineEventColor(event.event_type);
                      const label = getEventLabel(event.event_type);
                      const isUpdateEvent =
                        event.event_type === "update_added" ||
                        event.event_type === "followup_added";
                      const itemCheckedParsed =
                        event.event_type === "item_checked"
                          ? parseItemCheckedDescription(event.description, event.actor)
                          : null;
                      return (
                        <div
                          key={event.id}
                          ref={(el) => {
                            eventCardRefs.current[event.id] = el;
                          }}
                          className="mb-5 flex gap-3"
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
                            {index < events.length - 1 ? (
                              <div className="w-px min-h-[20px] flex-1 bg-[#E9E9E7]" />
                            ) : null}
                          </div>
                          <div
                            className="min-w-0 flex-1 bg-white py-2 pr-2"
                            style={timelineEventCardStyle(eventColor)}
                          >
                            <p className="text-[12px] text-[#9B9B9B]">{label}</p>
                            {isUpdateEvent ? (
                              <>
                                {event.actor ? (
                                  <p className="mt-0.5 text-[13px] font-medium text-[#1A1A1A]">
                                    {event.actor}
                                  </p>
                                ) : null}
                                {event.description ? (
                                  <div className="mt-0.5 whitespace-pre-wrap text-[13px] text-[#6B6B6B]">
                                    {renderWithMentions(event.description, (name) =>
                                      router.push(`/person/${encodeURIComponent(name)}`)
                                    )}
                                  </div>
                                ) : null}
                              </>
                            ) : itemCheckedParsed ? (
                              <>
                                {event.actor ? (
                                  <p className="mt-0.5 text-[13px] font-medium text-[#1A1A1A]">
                                    {event.actor}
                                  </p>
                                ) : null}
                                <p className="mt-0.5 text-[13px] text-[#6B6B6B]">
                                  checked off:{" "}
                                  {renderWithMentions(
                                    itemCheckedParsed.item,
                                    (name) => router.push(`/person/${encodeURIComponent(name)}`)
                                  )}
                                </p>
                                {itemCheckedParsed.comment ? (
                                  <p className="mt-1 text-[13px] italic text-[#9B9B9B]">
                                    &ldquo;{itemCheckedParsed.comment}&rdquo;
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <>
                                {event.actor ? (
                                  <p className="mt-0.5 text-[13px] font-medium text-[#1A1A1A]">
                                    {event.actor}
                                  </p>
                                ) : null}
                                {event.description ? (
                                  <p className="mt-0.5 text-[13px] text-[#6B6B6B]">{event.description}</p>
                                ) : null}
                              </>
                            )}
                            <p className="mt-0.5 text-[11px] text-[#9B9B9B]">
                              {timeAgo(event.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mb-6 space-y-3">
                {!showAddUpdateForm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUpdateForm(true);
                      setUpdateError(null);
                    }}
                    className="w-full rounded-md border border-[#E9E9E7] bg-white py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F7F7F5]"
                  >
                    Add update
                  </button>
                ) : (
                  <div className="rounded-md border border-[#E9E9E7] p-4">
                    <label className="block">
                      <span className="mb-1 block text-sm text-[#1A1A1A]">Your name</span>
                      <input
                        value={updateAuthor}
                        onChange={(e) => setUpdateAuthor(e.target.value)}
                        className="w-full"
                        placeholder="Your name"
                        autoComplete="name"
                      />
                    </label>
                    <label className="mt-3 block">
                      <span className="mb-1 block text-sm text-[#1A1A1A]">What&apos;s the update?</span>
                      <textarea
                        value={updateText}
                        onChange={(e) =>
                          onUpdateTextChange(
                            e.target.value,
                            e.currentTarget.selectionStart ?? e.target.value.length
                          )
                        }
                        onSelect={(e) => {
                          const t = e.currentTarget;
                          onUpdateTextChange(t.value, t.selectionStart ?? 0);
                        }}
                        onKeyUp={(e) => {
                          const t = e.currentTarget;
                          onUpdateTextChange(t.value, t.selectionStart ?? 0);
                        }}
                        rows={4}
                        placeholder="Share any new information, progress, or context..."
                        className="w-full"
                      />
                    </label>
                    {updateMentionOptions.length > 0 ? (
                      <div className="mt-2 border border-[#E9E9E7] bg-white p-2">
                        <p className="mb-1 text-xs text-[#9B9B9B]">Choose a person</p>
                        <div className="space-y-1">
                          {updateMentionOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className="block w-full rounded px-2 py-1 text-left text-sm text-[#1A1A1A] hover:bg-[#F7F7F5]"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                replaceUpdateMention(option, updateText);
                              }}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {updateMentionMessage ? (
                      <p className="mt-2 text-sm text-[#6B6B6B]">{updateMentionMessage}</p>
                    ) : null}
                    {updateError ? (
                      <p className="mt-2 text-sm text-[#1A1A1A]">{updateError}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void postUpdate()}
                        disabled={postingUpdate || !updateAuthor.trim() || !updateText.trim()}
                        className="rounded-md bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2D2D2D] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {postingUpdate ? "Posting…" : "Post update"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelAddUpdate()}
                        className="rounded-md border border-[#E9E9E7] bg-white px-4 py-2 text-sm text-[#1A1A1A] transition hover:bg-[#F7F7F5]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <hr className="my-7 border-0 border-t border-[#E9E9E7]" />

              {!selected.acknowledged ? (
                <div className="space-y-3">
                  {!showAckPrompt ? (
                    <button
                      type="button"
                      onClick={() => setShowAckPrompt(true)}
                      disabled={isAcknowledging}
                      className="w-full cursor-pointer rounded-md border border-[#E9E9E7] bg-white py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F7F7F5] disabled:cursor-not-allowed"
                    >
                      {isAcknowledging ? "Acknowledging…" : "Acknowledge handover"}
                    </button>
                  ) : (
                    <div className="rounded-md border border-[#E9E9E7] p-4">
                      <p className="text-sm font-medium text-[#1A1A1A]">Your name</p>
                      <input
                        value={ackName}
                        onChange={(event) => setAckName(event.target.value)}
                        className="mt-2 w-full"
                        placeholder="Enter your name"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void acknowledge()}
                          className="rounded-md bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2D2D2D]"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAckPrompt(false)}
                          className="rounded-md border border-[#E9E9E7] bg-white px-4 py-2 text-sm text-[#1A1A1A] transition hover:bg-[#F7F7F5]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-md border border-[#E9E9E7] bg-[#F7F7F5] py-2.5 text-center text-sm text-[#9B9B9B]">
                  ✓ Acknowledged on{" "}
                  {selected.acknowledged_at
                    ? new Date(selected.acknowledged_at).toLocaleString()
                    : "—"}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
