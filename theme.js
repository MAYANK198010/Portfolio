// ==========================================================================
// MayankZen Studios - Global Theme Controller (Dark & Clean Light Mode)
// ==========================================================================
(function() {
  'use strict';

  const STORAGE_KEY = 'mz_theme';

  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (e) {
      // Storage access blocked or restricted
    }
    return 'dark'; // Studio default aesthetic is cyber dark
  }

  function applyTheme(theme, animate = false) {
    const root = document.documentElement;
    const body = document.body;

    if (animate) {
      root.classList.add('theme-transition');
      window.clearTimeout(window.__mz_theme_timer);
      window.__mz_theme_timer = window.setTimeout(() => {
        root.classList.remove('theme-transition');
      }, 450);
    }

    root.setAttribute('data-theme', theme);
    if (theme === 'light') {
      root.classList.add('light-mode');
      if (body) body.classList.add('light-mode');
    } else {
      root.classList.remove('light-mode');
      if (body) body.classList.remove('light-mode');
    }

    // Update all toggle buttons across the DOM
    const buttons = document.querySelectorAll('.theme-toggle-btn');
    buttons.forEach(btn => {
      const isLight = theme === 'light';
      const label = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    });

    // Notify other components (Three.js WebGL hero, Chart.js, etc.)
    try {
      window.dispatchEvent(new CustomEvent('themeChanged', { 
        detail: { theme, isLight: theme === 'light' } 
      }));
    } catch (e) {
      // Ignore in environments where CustomEvent might be restricted
    }
  }

  function toggleTheme() {
    const current = getStoredTheme();
    const next = current === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      console.warn('Unable to persist theme to localStorage:', e);
    }
    applyTheme(next, true);
  }

  function initThemeButtons() {
    const current = getStoredTheme();
    applyTheme(current, false);

    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      if (btn.__mzThemeBound) return;
      btn.__mzThemeBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleTheme();
      });
    });
  }

  // Run immediately for instant theme sync
  const initialTheme = getStoredTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);
  if (initialTheme === 'light') {
    document.documentElement.classList.add('light-mode');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeButtons);
  } else {
    initThemeButtons();
  }

  // Listen to system color scheme if user hasn't explicitly set a preference
  try {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      mediaQuery.addEventListener('change', (e) => {
        if (!localStorage.getItem(STORAGE_KEY)) {
          applyTheme(e.matches ? 'light' : 'dark', true);
        }
      });
    }
  } catch (e) {
    // Media query listener unsupported
  }

  // Expose global API
  window.MayankZenTheme = {
    get: getStoredTheme,
    set: function(theme) {
      if (theme === 'light' || theme === 'dark') {
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
        applyTheme(theme, true);
      }
    },
    toggle: toggleTheme,
    isLight: function() {
      return (document.documentElement.getAttribute('data-theme') || getStoredTheme()) === 'light';
    }
  };
})();
