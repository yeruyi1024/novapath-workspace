/* global window, document */
(function () {
  let language = 'zh';
  try { language = localStorage.getItem('lobster-language') || language; } catch { /* optional preference */ }
  const english = language === 'en';
  document.documentElement.lang = english ? 'en' : 'zh';
  const button = document.getElementById('retry');
  const status = document.getElementById('status');
  if (english) {
    document.getElementById('title').textContent = 'The interface could not load';
    document.getElementById('hint').textContent = 'Please retry. Saved projects and conversations are preserved; no reset is needed.';
    button.textContent = 'Reload';
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const reloaded = await window.electron?.appInfo?.reloadWindow?.();
      if (!reloaded) throw new Error('Recovery unavailable');
    } catch {
      status.textContent = english ? 'Please quit and reopen NovaPath.' : '请退出后重新打开星途。';
      button.disabled = false;
    }
  });
})();
