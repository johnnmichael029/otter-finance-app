import React, { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

export const useTheme = useUIStore;

export const ThemeProvider = ({ children }) => {
    const initTheme = useUIStore(state => state.initTheme);

    useEffect(() => {
        initTheme();
    }, [initTheme]);

    return <>{children}</>;
};
