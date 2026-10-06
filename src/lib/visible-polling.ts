/**
 * Like setInterval, but skips ticks while the tab or installed app is hidden
 * and refreshes once as soon as it becomes visible again. A forgotten tab
 * then costs no server time. Returns a cleanup function.
 */
export function startVisiblePolling(task: () => void, intervalMs: number): () => void {
  const tick = () => {
    if (typeof document === "undefined" || !document.hidden) task();
  };
  const timer = window.setInterval(tick, intervalMs);
  const onVisibility = () => {
    if (!document.hidden) task();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
