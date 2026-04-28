"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TEAM_MEMBERS, filterMembersForAtMention, isResolved } from "@/lib/team";
import { renderWithMentions } from "@/lib/renderMentions";

function safeString(val: unknown): string {
  if (typeof val === "string") return val.trim();
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

type ExtractedPayload = {
  title: string;
  onCallPerson: string;
  whatHappened: string;
  watchOut: string;
  nextSteps: string[];
  openItems: string[];
  peopleInvolved: string[];
  unresolvedMentions: string[];
};

function caretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return el.innerText.length;
  const range = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function MentionLineEditor({
  value,
  onChange,
  onMentionNavigate,
}: {
  value: string;
  onChange: (next: string) => void;
  onMentionNavigate: (name: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pickOptions, setPickOptions] = useState<string[]>([]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.innerText !== value) {
      el.textContent = value;
    }
  }, [value]);

  function handleInput() {
    const el = ref.current;
    if (!el) return;

    const text = el.innerText;
    onChange(text);

    const offset = caretOffsetIn(el);
    const upto = text.slice(0, offset);
    const mentionMatch = upto.match(/@([a-zA-Z]+)$/);

    if (!mentionMatch) {
      setPickOptions([]);
      return;
    }

    const start = offset - mentionMatch[0].length;
    const end = offset;
    const matches = filterMembersForAtMention(mentionMatch[1]);

    if (matches.length === 1) {
      const merged = `${text.slice(0, start)}@${matches[0]} ${text.slice(end)}`;
      onChange(merged);
      setPickOptions([]);
      queueMicrotask(() => {
        el.textContent = merged;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      return;
    }

    if (matches.length > 1) {
      setPickOptions(matches);
      return;
    }

    setPickOptions([]);
  }

  return (
    <div className="space-y-2">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="min-h-[44px] w-full whitespace-pre-wrap rounded border border-[#E9E9E7] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#9B9B9B] focus:outline-none"
        onInput={handleInput}
      />
      <div className="rounded border border-[#E9E9E7] bg-[#F7F7F5] px-3 py-2 text-sm whitespace-pre-wrap text-[#1A1A1A]">
        {renderWithMentions(value, onMentionNavigate)}
      </div>
      {pickOptions.length > 1 ? (
        <div className="rounded border border-[#E9E9E7] bg-white p-2">
          <p className="mb-1 text-xs text-[#9B9B9B]">Choose a person</p>
          <div className="flex flex-wrap gap-1">
            {pickOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="rounded border border-[#E9E9E7] px-2 py-1 text-xs text-[#1A1A1A] hover:bg-[#F7F7F5]"
                onMouseDown={(event) => {
                  event.preventDefault();
                  const el = ref.current;
                  const text = el?.innerText ?? value;
                  const offset = el ? caretOffsetIn(el) : text.length;
                  const upto = text.slice(0, offset);
                  const mm = upto.match(/@([a-zA-Z]+)$/);
                  if (!mm || !el) return;
                  const start = offset - mm[0].length;
                  const merged = `${text.slice(0, start)}@${option} ${text.slice(offset)}`;
                  onChange(merged);
                  setPickOptions([]);
                  queueMicrotask(() => {
                    el.textContent = merged;
                    el.focus();
                  });
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SubmitPage() {
  const [submittedBy, setSubmittedBy] = useState("");
  const [handoverTo, setHandoverTo] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [manualMentions, setManualMentions] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPayload | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [activeUnresolved, setActiveUnresolved] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<string[]>([]);
  const [mentionMessage, setMentionMessage] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(
    null
  );
  const [inputTab, setInputTab] = useState<"upload" | "paste">("upload");

  const router = useRouter();

  const canSubmit = useMemo(
    () =>
      Boolean(
        safeString(submittedBy) &&
          safeString(handoverTo) &&
          extracted &&
          safeString(extracted.title) &&
          !isSubmitting &&
          !isExtracting
      ),
    [submittedBy, handoverTo, extracted, isSubmitting, isExtracting]
  );

  const canExtract = useMemo(
    () =>
      !isExtracting &&
      ((inputTab === "upload" && selectedFile !== null) ||
        (inputTab === "paste" && pastedText.trim().length > 0)),
    [isExtracting, inputTab, selectedFile, pastedText]
  );

  async function handleExtract() {
    if (!canExtract) {
      return;
    }

    setExtracted(null);
    setError(null);
    setIsExtracting(true);

    try {
      let res: Response;
      if (inputTab === "upload" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        res = await fetch("/api/extract", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pastedText }),
        });
      }

      if (!res.ok) {
        throw new Error("Failed to extract notes from file.");
      }

      const data = (await res.json()) as Record<string, unknown>;
      if (data.error) {
        throw new Error(String(data.error));
      }
      setHandoverTo(safeString(data.handoverTo));
      setExtracted({
        title: safeString(data.title),
        onCallPerson: safeString(data.onCallPerson),
        whatHappened: safeString(data.whatHappened),
        watchOut: safeString(data.watchOut),
        nextSteps: Array.isArray(data.nextSteps)
          ? (data.nextSteps as unknown[]).map((s) => safeString(s)).filter(Boolean)
          : [],
        openItems: Array.isArray(data.openItems)
          ? (data.openItems as unknown[]).map((s) => safeString(s)).filter(Boolean)
          : [],
        peopleInvolved: [
          ...new Set(
            (Array.isArray(data.peopleInvolved) ? (data.peopleInvolved as unknown[]) : [])
              .map((n) => safeString(n))
              .filter(Boolean)
          ),
        ],
        unresolvedMentions: Array.isArray(data.unresolvedMentions)
          ? (data.unresolvedMentions as unknown[]).map((n) => safeString(n)).filter(Boolean)
          : [],
      });
    } catch {
      setError("Could not extract handover details.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function submitHandover() {
    if (!extracted || !safeString(submittedBy) || !safeString(handoverTo)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);

    const mergedPeople = [
      ...new Set(
        [
          ...extracted.peopleInvolved.filter((name) => isResolved(name)),
          ...manualMentions,
          safeString(submittedBy),
          safeString(handoverTo),
          safeString(extracted.onCallPerson),
        ].filter(Boolean)
      ),
    ];

    try {
      const res = await fetch("/api/handovers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: safeString(extracted.title),
          from_person: safeString(submittedBy),
          to_person: safeString(handoverTo),
          on_call_person: safeString(extracted.onCallPerson),
          filename: selectedFile?.name || "pasted-text.txt",
          what_happened: safeString(extracted.whatHappened),
          watch_out: safeString(extracted.watchOut),
          next_steps: extracted.nextSteps.map((s) => safeString(s)).filter(Boolean),
          open_items: extracted.openItems.map((s) => safeString(s)).filter(Boolean),
          people_involved: mergedPeople,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit handover.");
      }

      setShowSuccess(true);
    } catch {
      setError("Could not submit this handover. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function addResolvedPerson(name: string) {
    if (!extracted || !isResolved(name)) return;
    setExtracted({
      ...extracted,
      peopleInvolved: [...new Set([...extracted.peopleInvolved, name])],
    });
  }

  function resolveUnresolved(name: string, selection: string) {
    if (!extracted) return;
    const nextUnresolved = extracted.unresolvedMentions.filter((item) => item !== name);
    if (selection === "__not_team__") {
      setExtracted({ ...extracted, unresolvedMentions: nextUnresolved });
      return;
    }
    setExtracted({
      ...extracted,
      unresolvedMentions: nextUnresolved,
      peopleInvolved: [...new Set([...extracted.peopleInvolved, selection])],
    });
    setActiveUnresolved(null);
  }

  function replaceMentionWith(fullName: string) {
    if (!mentionRange) return;
    const nextText = `${pastedText.slice(0, mentionRange.start)}@${fullName} ${pastedText.slice(
      mentionRange.end
    )}`;
    setPastedText(nextText);
    setManualMentions((prev) => [...new Set([...prev, fullName])]);
    setMentionOptions([]);
    setMentionMessage(null);
    setMentionRange(null);
  }

  function onPasteChange(value: string, caret: number) {
    setPastedText(value);
    const uptoCursor = value.slice(0, caret);
    const mentionMatch = uptoCursor.match(/@([a-zA-Z]+)$/);

    if (!mentionMatch) {
      setMentionOptions([]);
      setMentionMessage(null);
      setMentionRange(null);
      return;
    }

    const raw = mentionMatch[1];
    const tokenStart = caret - mentionMatch[0].length;
    const tokenEnd = caret;
    const matches = filterMembersForAtMention(raw);

    setMentionRange({ start: tokenStart, end: tokenEnd });
    if (matches.length === 1) {
      replaceMentionWith(matches[0]);
      return;
    }
    if (matches.length > 1) {
      setMentionOptions(matches);
      setMentionMessage(null);
      return;
    }
    setMentionOptions([]);
    setMentionMessage("Unknown person — will need manual tagging");
  }

  if (showSuccess) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6 py-20 text-center">
          <p className="text-[32px] leading-none text-[#1A1A1A]">✓</p>
          <h1 className="mt-4 text-2xl font-bold text-[#1A1A1A]">Handover submitted</h1>
          <p className="mt-2 text-sm text-[#6B6B6B]">Your notes are now ready for the next shift.</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="rounded-md border border-[#E9E9E7] bg-white px-5 py-2.5 text-sm text-[#1A1A1A] transition-colors hover:bg-[#F7F7F5]"
            >
              Go home
            </Link>
            <Link
              href="/feed"
              className="rounded-md border border-[#E9E9E7] bg-white px-5 py-2.5 text-sm text-[#1A1A1A] transition-colors hover:bg-[#F7F7F5]"
            >
              View handovers
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[680px] px-6 py-12">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#9B9B9B] no-underline transition-colors hover:text-[#1A1A1A]"
        >
          ← Home
        </Link>
        <p className="mb-8 text-[12px] text-[#9B9B9B]">
          {extracted ? "Step 2 of 2" : "Step 1 of 2"}
        </p>
        <h1 className="mb-1 text-[28px] font-bold text-[#1A1A1A]">Submit handover</h1>
        <p className="mb-8 text-sm text-[#6B6B6B]">
          {extracted
            ? "Review and edit all fields, then submit."
            : "Upload a document or paste text, then extract with AI."}
        </p>

        {!extracted ? (
        <section>
          <div className="mb-5 flex gap-6 border-b border-[#E9E9E7]">
            <button
              type="button"
              onClick={() => setInputTab("upload")}
              className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
                inputTab === "upload"
                  ? "border-[#1A1A1A] font-semibold text-[#1A1A1A]"
                  : "border-transparent text-[#9B9B9B] hover:text-[#6B6B6B]"
              }`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setInputTab("paste")}
              className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
                inputTab === "paste"
                  ? "border-[#1A1A1A] font-semibold text-[#1A1A1A]"
                  : "border-transparent text-[#9B9B9B] hover:text-[#6B6B6B]"
              }`}
            >
              Paste
            </button>
          </div>

          <div className="space-y-4">
            {inputTab === "upload" ? (
              <label
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed p-12 text-center transition-colors ${
                  selectedFile
                    ? "border-[#C9C9C7] border-solid bg-[#F7F7F5]"
                    : "border-[#E9E9E7] border-dashed bg-white hover:border-[#C9C9C7] hover:bg-[#F7F7F5]"
                }`}
              >
                <input
                  type="file"
                  className="hidden"
                  accept=".docx,.txt,.md"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                    }
                  }}
                />
                <span className="mb-3 text-2xl" aria-hidden>
                  📄
                </span>
                <p className="text-[15px] text-[#6B6B6B]">
                  {selectedFile ? selectedFile.name : "Click to upload handover notes"}
                </p>
                <p className="mt-1 text-[13px] text-[#9B9B9B]">Accepts .docx, .txt, .md</p>
              </label>
            ) : (
              <>
                <textarea
                  value={pastedText}
                  onChange={(event) =>
                    onPasteChange(event.target.value, event.currentTarget.selectionStart ?? 0)
                  }
                  rows={8}
                  className="min-h-[200px] w-full resize-y text-sm leading-[1.7] text-[#1A1A1A] focus:border-[#9B9B9B] focus:outline-none"
                  style={{ padding: 16 }}
                  placeholder="Paste handover notes here..."
                />
                {mentionOptions.length ? (
                  <div className="rounded border border-[#E9E9E7] bg-white p-2">
                    <p className="mb-1 text-xs text-[#9B9B9B]">Choose a person</p>
                    <div className="space-y-1">
                      {mentionOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => replaceMentionWith(option)}
                          className="block w-full rounded px-2 py-1 text-left text-sm text-[#1A1A1A] hover:bg-[#F7F7F5]"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {mentionMessage ? (
                  <p className="text-sm text-[#6B6B6B]">{mentionMessage}</p>
                ) : null}
              </>
            )}
            <button
              type="button"
              onClick={() => void handleExtract()}
              disabled={!canExtract}
              className="rounded-md bg-[#1A1A1A] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2D2D2D] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isExtracting ? "Extracting…" : "Extract"}
            </button>
          </div>
        </section>
        ) : null}

        {extracted ? (
          <section className="mt-2">
            <div className="space-y-7">
              <label className="mb-7 block">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Submitted by
                </span>
                <input
                  value={submittedBy}
                  onChange={(event) => setSubmittedBy(event.target.value)}
                  className="w-full"
                  placeholder="Your name"
                  required
                  autoComplete="name"
                />
              </label>
              <label className="mb-7 block">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Handover to
                </span>
                <input
                  value={handoverTo}
                  onChange={(event) => setHandoverTo(event.target.value)}
                  className="w-full"
                  placeholder={"Next person's name"}
                  required
                />
              </label>
              <label className="mb-7 block">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Handover title
                </span>
                <input
                  value={extracted.title}
                  onChange={(event) =>
                    setExtracted((prev) =>
                      prev ? { ...prev, title: event.target.value } : prev
                    )
                  }
                  placeholder="e.g. Night shift Apr 27 — DB incident"
                  className="w-full"
                  required
                />
              </label>
              <label className="mb-7 block">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  On-call person
                </span>
                <input
                  value={extracted.onCallPerson}
                  onChange={(event) =>
                    setExtracted((prev) =>
                      prev
                        ? {
                            ...prev,
                            onCallPerson: event.target.value,
                            peopleInvolved: [
                              ...new Set(
                                [...prev.peopleInvolved, event.target.value.trim()].filter(Boolean)
                              ),
                            ],
                          }
                        : prev
                    )
                  }
                  className="w-full"
                />
              </label>
              <label className="mb-7 block">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  What happened
                </span>
                <textarea
                  value={extracted.whatHappened}
                  onChange={(event) =>
                    setExtracted((prev) =>
                      prev ? { ...prev, whatHappened: event.target.value } : prev
                    )
                  }
                  rows={4}
                  className="w-full"
                />
              </label>
              <label className="mb-7 block">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Watch out
                </span>
                <textarea
                  value={extracted.watchOut}
                  onChange={(event) =>
                    setExtracted((prev) =>
                      prev ? { ...prev, watchOut: event.target.value } : prev
                    )
                  }
                  rows={4}
                  className="w-full"
                />
              </label>
              <div className="mb-7">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Next steps
                </span>
                {(extracted.nextSteps.length === 0 ? [""] : extracted.nextSteps).map(
                  (line, index) => (
                    <div
                      key={`next-${index}`}
                      className="mb-2 flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <MentionLineEditor
                          value={line}
                          onChange={(next) =>
                            setExtracted((prev) => {
                              if (!prev) return prev;
                              const steps = [...prev.nextSteps];
                              if (steps.length === 0) {
                                return { ...prev, nextSteps: [next] };
                              }
                              steps[index] = next;
                              return { ...prev, nextSteps: steps };
                            })
                          }
                          onMentionNavigate={(name) =>
                            router.push(`/person/${encodeURIComponent(name)}`)
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="shrink-0 p-0 text-lg leading-none text-[#9B9B9B] hover:text-[#1A1A1A]"
                        onClick={() =>
                          setExtracted((prev) => {
                            if (!prev) return prev;
                            const steps = prev.nextSteps.filter((_, i) => i !== index);
                            return { ...prev, nextSteps: steps.length ? steps : [""] };
                          })
                        }
                        aria-label="Remove step"
                      >
                        ×
                      </button>
                    </div>
                  )
                )}
                <button
                  type="button"
                  className="text-[13px] text-[#9B9B9B] hover:text-[#1A1A1A]"
                  onClick={() =>
                    setExtracted((prev) =>
                      prev ? { ...prev, nextSteps: [...prev.nextSteps, ""] } : prev
                    )
                  }
                >
                  + Add step
                </button>
              </div>
              <div className="mb-7">
                <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Open items
                </span>
                {(extracted.openItems.length === 0 ? [""] : extracted.openItems).map(
                  (line, index) => (
                    <div
                      key={`open-${index}`}
                      className="mb-2 flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <MentionLineEditor
                          value={line}
                          onChange={(next) =>
                            setExtracted((prev) => {
                              if (!prev) return prev;
                              const items = [...prev.openItems];
                              if (items.length === 0) {
                                return { ...prev, openItems: [next] };
                              }
                              items[index] = next;
                              return { ...prev, openItems: items };
                            })
                          }
                          onMentionNavigate={(name) =>
                            router.push(`/person/${encodeURIComponent(name)}`)
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="shrink-0 p-0 text-lg leading-none text-[#9B9B9B] hover:text-[#1A1A1A]"
                        onClick={() =>
                          setExtracted((prev) => {
                            if (!prev) return prev;
                            const items = prev.openItems.filter((_, i) => i !== index);
                            return { ...prev, openItems: items.length ? items : [""] };
                          })
                        }
                        aria-label="Remove item"
                      >
                        ×
                      </button>
                    </div>
                  )
                )}
                <button
                  type="button"
                  className="text-[13px] text-[#9B9B9B] hover:text-[#1A1A1A]"
                  onClick={() =>
                    setExtracted((prev) =>
                      prev ? { ...prev, openItems: [...prev.openItems, ""] } : prev
                    )
                  }
                >
                  + Add open item
                </button>
              </div>

              <div className="mb-7 space-y-3">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  People involved
                </p>
                <div className="flex flex-wrap gap-2">
                  {extracted.peopleInvolved.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E9E9E7] bg-white py-1 pr-1 pl-3 text-[13px] text-[#1A1A1A] hover:bg-[#F7F7F5]"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() =>
                          setExtracted((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  peopleInvolved: prev.peopleInvolved.filter((person) => person !== name),
                                }
                              : prev
                          )
                        }
                        className="px-1 text-[#9B9B9B] hover:text-[#1A1A1A]"
                        aria-label={`Remove ${name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddPersonOpen((prev) => !prev)}
                    className="text-[13px] text-[#9B9B9B] hover:text-[#1A1A1A]"
                  >
                    Add person
                  </button>
                </div>
                {addPersonOpen ? (
                  <select
                    className="w-full text-sm"
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) {
                        addResolvedPerson(event.target.value);
                        setAddPersonOpen(false);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Select team member
                    </option>
                    {TEAM_MEMBERS.filter(
                      (member) => !extracted.peopleInvolved.includes(member)
                    ).map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                ) : null}

                <p className="pt-2 text-[11px] font-semibold tracking-[0.08em] text-[#9B9B9B] uppercase">
                  Needs your attention
                </p>
                <div className="flex flex-wrap gap-2">
                  {extracted.unresolvedMentions.map((name) => (
                    <div key={name} className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveUnresolved((prev) => (prev === name ? null : name))
                        }
                        className="rounded-full border border-[#C9C9C7] bg-[#F7F7F5] px-3 py-1 text-[13px] text-[#1A1A1A] hover:bg-[#EFEFED]"
                      >
                        <span className="text-[#9B9B9B]">⚠</span> {name}
                      </button>
                      {activeUnresolved === name ? (
                        <div className="rounded border border-[#E9E9E7] bg-white p-2">
                          <p className="mb-1 text-xs text-[#6B6B6B]">Who is {name}?</p>
                          <div className="space-y-1">
                            {TEAM_MEMBERS.map((member) => (
                              <button
                                key={member}
                                type="button"
                                onClick={() => resolveUnresolved(name, member)}
                                className="block w-full rounded px-2 py-1 text-left text-sm text-[#1A1A1A] hover:bg-[#F7F7F5]"
                              >
                                {member}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => resolveUnresolved(name, "__not_team__")}
                              className="block w-full rounded px-2 py-1 text-left text-sm text-[#6B6B6B] hover:bg-[#F7F7F5]"
                            >
                              Not a team member
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!extracted.unresolvedMentions.length ? (
                    <p className="text-sm text-[#9B9B9B]">None</p>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-end border-t border-[#E9E9E7] pt-6">
                <button
                  type="button"
                  onClick={() => void submitHandover()}
                  disabled={!canSubmit}
                  className="rounded-md bg-[#1A1A1A] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2D2D2D] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting ? "Submitting…" : "Submit handover"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {extracted && extracted.unresolvedMentions.length ? (
          <section className="mt-8 rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-6">
            <h2 className="text-base font-semibold text-[#1A1A1A]">Unresolved mentions</h2>
            <p className="mt-1 text-sm text-[#6B6B6B]">
              These names were found but could not be matched to a team member. Choose a match
              or dismiss.
            </p>
            <div className="mt-4 space-y-3">
              {extracted.unresolvedMentions.map((name) => (
                <div key={name} className="grid gap-2 sm:grid-cols-2 sm:items-center">
                  <p className="text-sm font-medium text-[#1A1A1A]">{name}</p>
                  <select
                    className="w-full text-sm"
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) {
                        resolveUnresolved(name, event.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose match
                    </option>
                    {TEAM_MEMBERS.map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                    <option value="__not_team__">Not a team member</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="mt-6 rounded border border-[#E9E9E7] bg-[#F7F7F5] px-4 py-3 text-sm text-[#1A1A1A]">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
