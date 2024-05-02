// hooks/useCurrentTheme.js
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export const useCurrentTheme = () => {
    const [isMounted, setIsMounted] = useState(false);
    const { theme, setTheme } = useTheme();
    const [isSystemDark, setIsSystemDark] = useState(false);

    // Ensure we're in the client
    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (theme === 'system') {
            setIsSystemDark(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        }
    }, [theme]);

    useEffect(() => {
        // On mount, we check if the user has a preferred theme in local storage
        const preferredTheme = localStorage.getItem('preferred-theme');
        if (preferredTheme && ['dark', 'light'].includes(preferredTheme)) {
            setTheme(preferredTheme);
        }
    }, [isMounted, setTheme]);

    useEffect(() => {
        // When the theme changes, we save it in local storage
        if (theme) {
            localStorage.setItem('preferred-theme', theme);
        }
    }, [theme]);

    if (!isMounted) {
        return 'light'; // return a default theme when not mounted
    }

    if (theme === 'dark' || (theme === 'system' && isSystemDark)) {
        return 'dark';
    } else {
        return 'light';
    }
};