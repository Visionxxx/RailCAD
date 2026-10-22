/** Skriver brukeren i et tekstfelt? Da skal hurtigtaster (Del, bokstaver, Mellomrom) ikke tolkes som kommandoer. */
export function isTypingTarget(e: Event): boolean {
  const el = e.target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  );
}
