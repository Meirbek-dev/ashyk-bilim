/**
 * Blinking cursor shown inline at the end of a streaming AI response.
 * Rendered as an aria-hidden span so screen readers skip it.
 */
export function AiStreamingCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse rounded-sm bg-zinc-400"
    />
  );
}
