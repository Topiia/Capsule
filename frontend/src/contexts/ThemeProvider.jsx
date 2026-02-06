import { useState, useEffect } from "react";
import { ThemeContext } from "./ThemeContext";

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("capsule-theme");
    return savedTheme || import.meta.env.VITE_DEFAULT_THEME || "noir-velvet";
  });

  const [isTransitioning, setIsTransitioning] = useState(false);

  const themes = {
    "noir-velvet": {
      name: "Noir Velvet",
      gradient: "from-gray-800 to-gray-900",
      accent: "blue-400",
      description: "Deep, sophisticated dark theme",
    },
    "deep-space": {
      name: "Deep Space",
      gradient: "from-blue-900 to-indigo-900",
      accent: "cyan-400",
      description: "Cosmic blue theme for explorers",
    },
    "crimson-night": {
      name: "Crimson Night",
      gradient: "from-purple-900 to-red-900",
      accent: "pink-400",
      description: "Bold, passionate crimson theme",
    },
  };

  useEffect(() => {
    // Apply theme to document
    document.documentElement.className = `theme-${theme}`;
    localStorage.setItem("capsule-theme", theme);
  }, [theme]);

  const changeTheme = (newTheme) => {
    if (themes[newTheme] && newTheme !== theme) {
      setIsTransitioning(true);

      // Add transition effect
      document.body.style.transition = "all 0.5s ease-in-out";

      setTimeout(() => {
        setTheme(newTheme);
        setIsTransitioning(false);
        document.body.style.transition = "";
      }, 100);
    }
  };

  const toggleTheme = () => {
    const themeKeys = Object.keys(themes);
    const currentIndex = themeKeys.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeKeys.length;
    changeTheme(themeKeys[nextIndex]);
  };

  const currentTheme = themes[theme];

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themes,
        currentTheme,
        changeTheme,
        toggleTheme,
        isTransitioning,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
