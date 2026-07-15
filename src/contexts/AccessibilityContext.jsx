import React, { createContext, useContext, useState, useEffect } from 'react';

export const AccessibilityContext = createContext();

export const useAccessibility = () => useContext(AccessibilityContext);

export const AccessibilityProvider = ({ children }) => {
  const [fontScale, setFontScale] = useState(() => localStorage.getItem('agape_fontScale') || 'md');
  const [theme, setTheme] = useState(() => localStorage.getItem('agape_theme') || 'light');

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontScale = fontScale;
    localStorage.setItem('agape_fontScale', fontScale);
  }, [fontScale]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = isDark ? 'dark' : 'light';
      root.classList.toggle('dark', isDark);
    } else {
      root.dataset.theme = theme;
      root.classList.toggle('dark', theme === 'dark');
    }
    localStorage.setItem('agape_theme', theme);
  }, [theme]);

  // Listen for system theme changes if set to system
  useEffect(() => {
    if (theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const root = document.documentElement;
      root.dataset.theme = e.matches ? 'dark' : 'light';
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const increaseFontScale = () => {
    const scales = ['sm', 'md', 'lg', 'xl', 'driver'];
    const currentIndex = scales.indexOf(fontScale);
    if (currentIndex < scales.length - 1) {
      setFontScale(scales[currentIndex + 1]);
    }
  };

  const decreaseFontScale = () => {
    const scales = ['sm', 'md', 'lg', 'xl', 'driver'];
    const currentIndex = scales.indexOf(fontScale);
    if (currentIndex > 0) {
      setFontScale(scales[currentIndex - 1]);
    }
  };

  return (
    <AccessibilityContext.Provider value={{ fontScale, setFontScale, increaseFontScale, decreaseFontScale, theme, setTheme }}>
      {children}
    </AccessibilityContext.Provider>
  );
};
