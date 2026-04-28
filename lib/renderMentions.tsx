import type { ReactNode } from "react";

/**
 * Splits on @FirstName LastName tokens (two capitalized words).
 * Matches the handover convention for tagged team members.
 */
export function renderWithMentions(
  text: string,
  onNameClick: (name: string) => void
): ReactNode[] {
  const parts = text.split(/(@[A-Z][a-z]+ [A-Z][a-z]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const name = part.slice(1);
      return (
        <span
          key={i}
          role="button"
          tabIndex={0}
          onClick={() => onNameClick(name)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onNameClick(name);
            }
          }}
          className="cursor-pointer rounded bg-[#F7F7F5] px-1 font-medium text-[#1A1A1A] hover:bg-[#EFEFED]"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
