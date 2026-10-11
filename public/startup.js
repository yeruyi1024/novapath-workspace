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
  document.documentElement.classList.add(appearance);
  document.documentElement.lang = language;
  document.documentElement.style.backgroundColor = appearance === 'dark' ? '#212121' : '#FFFFFF';
})();
