export function initPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const status = document.querySelector<HTMLElement>('.offline-status')!;
  let ready = false;
  let failed = false;
  function render() {
    status.hidden = false;
    status.textContent = ready
      ? navigator.onLine ? 'Available offline, including recordings.' : 'Offline — pages and recordings are saved. Search uses keywords.'
      : failed ? 'Offline download incomplete. Reconnect and reopen to try again.' : 'Saving pages and recordings for offline use…';
  }
  render();
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
    if (registration.active) {
      ready = true;
      render();
    }
    function watch(worker: ServiceWorker) {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') ready = true;
        if (worker.state === 'redundant' && !ready) failed = true;
        render();
      });
    }
    if (registration.installing) watch(registration.installing);
    registration.addEventListener('updatefound', () => {
      if (registration.installing) watch(registration.installing);
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      ready = true;
      render();
      // Ask for persistence after the complete download; browsers may decline.
      void navigator.storage?.persist?.().catch(() => {});
    });
  }).catch(() => {
    failed = true;
    render();
  });
}
