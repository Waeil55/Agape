import { createContext, useContext, useState, useEffect } from 'react';

export const AccessibilityContext = createContext();

export const useAccessibility = () => useContext(AccessibilityContext);

export const AccessibilityProvider = ({ children }) => {
  const [fontScale, setFontScale] = useState(() => localStorage.getItem('agape_fontScale') || 'md');

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontScale = fontScale;
    localStorage.setItem('agape_fontScale', fontScale);
  }, [fontScale]);

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
    <AccessibilityContext.Provider value={{ fontScale, setFontScale, increaseFontScale, decreaseFontScale }}>
      {children}
    </AccessibilityContext.Provider>
  );
};
