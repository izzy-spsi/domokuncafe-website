(function () {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const status = document.getElementById('status');
  document.getElementById('go').addEventListener('click', async () => {
    const response = await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await response.json().catch(() => ({}));
    status.textContent = response.ok ? 'You are unsubscribed. A repeat of this link does not change that.' : (data.message || 'This unsubscribe link is not valid.');
  });
})();
