/* global window, document */
// Runs before React without requiring inline scripts in the production CSP.
(function () {
  let appearance = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let language = navigator.language === 'zh-CN' ? 'zh' : 'en';
  try {
    const savedAppearance = localStorage.getItem('lobster-theme-appearance');
    if (savedAppearance === 'dark' || savedAppearance === 'light') appearance = savedAppearance;
    const savedLanguage = localStorage.getItem('lobster-language');
    if (savedLanguage === 'zh' || savedLanguage === 'en') language = savedLanguage;
  } catch {
    // System preferences remain available when storage is unavailable.
  }
  // The main process already read the persisted choice before creating this window.
  const nativeAppearance = window.electron?.appInfo?.initialAppearance;
  if (nativeAppearance === 'dark' || nativeAppearance === 'light') appearance = nativeAppearance;
  document.documentElement.dataset.theme = appearance === 'dark' ? 'classic-dark' : 'classic-light';
  document.documentElement.style.colorScheme = appearance;
  document.documentElement.classList.remove(appearance === 'dark' ? 'light' : 'dark');
  document.documentElement.classList.add(appearance);
  document.documentElement.lang = language;
  document.documentElement.style.backgroundColor = appearance === 'dark' ? '#212121' : '#FFFFFF';

  // This guard runs independently of the module graph, including import failures.
  let timer;
  let observer;
  const hasStartupShell = () => Boolean(document.getElementById('startup-shell'));
  const cleanup = () => {
    window.clearTimeout(timer);
    observer?.disconnect();
    window.removeEventListener('error', handleFailure);
    window.removeEventListener('unhandledrejection', handleFailure);
  };
  const showRecovery = () => {
    if (!hasStartupShell()) { cleanup(); return; }
    const shell = document.getElementById('startup-shell');
    shell.setAttribute('aria-busy', 'false');
    const status = shell.querySelector('.starpath-startup-status');
    status.textContent = language === 'zh' ? '界面未能启动，请重试' : 'The interface could not start. Please retry.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = language === 'zh' ? '重新加载' : 'Reload';
    button.className = 'starpath-startup-retry';
    button.addEventListener('click', () => {
      if (window.electron?.appInfo?.reloadWindow) {
        void window.electron.appInfo.reloadWindow().catch(() => window.location.reload());
      } else window.location.reload();
    });
    status.appendChild(button);
    cleanup();
  };
  const handleFailure = () => {
    // Never replace a running React UI or reload automatically.
    if (hasStartupShell()) showRecovery();
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (!hasStartupShell()) return;
    const root = document.getElementById('root');
    observer = new MutationObserver(() => {
      if (!hasStartupShell()) cleanup();
    });
    observer.observe(root, { childList: true, subtree: true });
    timer = window.setTimeout(showRecovery, 30000);
  }, { once: true });
  window.addEventListener('error', handleFailure);
  window.addEventListener('unhandledrejection', handleFailure);
})();
