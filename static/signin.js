(() => {
  const status = document.getElementById('status');
  const retry = document.getElementById('retry');
  let returnTo = '/';
  try {
    const saved = sessionStorage.getItem('nodoku.signin.return');
    if (saved) {
      const url = new URL(saved, location.origin);
      if (url.origin === location.origin && url.pathname === '/') returnTo = url.pathname + url.search;
    }
  } catch { /* Guest return still works. */ }
  document.getElementById('back').href = returnTo;
  async function api(path, value) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(value !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Please try again.');
      return result;
    } finally { clearTimeout(timer); }
  }
  function fail(error) {
    status.textContent = error.message || 'Google sign-in is unavailable. Please try again.';
    retry.hidden = false;
  }
  retry.addEventListener('click', () => location.reload());
  (async () => {
    const config = await api('/api/auth/config');
    if (!config.enabled) throw new Error('Google sign-in is not available yet. You can still play as a guest.');
    const { nonce } = await api('/api/auth/challenge', {});
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => reject(new Error('Google sign-in could not load. Check your connection and try again.')), 12000);
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('Google sign-in could not load.')); };
      document.head.append(script);
    });
    window.google.accounts.id.initialize({ client_id: config.clientId, nonce, auto_select: false,
      callback: async ({ credential }) => {
        status.textContent = 'Signing in…';
        try {
          await api('/api/auth/google', { credential });
          try { sessionStorage.setItem('nodoku.signin.done', '1'); } catch { /* Session works without local storage. */ }
          location.replace(returnTo);
        } catch (error) { fail(error); }
      },
    });
    window.google.accounts.id.renderButton(document.getElementById('google-button'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(320, innerWidth - 96) });
    status.textContent = '';
  })().catch(fail);
})();
