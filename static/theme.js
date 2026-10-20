'use strict';

// Loaded in <head> so appearance preferences are applied before the first paint.
const Theme = (() => {
    const colors = [
        { id: 'green', name: 'Green', color: '#1ed760', hover: '#3be477', light: '#087f36' },
        { id: 'blue', name: 'Blue', color: '#70b7ff', hover: '#94c9ff', light: '#1264a3' },
        { id: 'purple', name: 'Purple', color: '#bb9aff', hover: '#cfb8ff', light: '#7040b0' },
        { id: 'rose', name: 'Rose', color: '#ff92b0', hover: '#ffb1c6', light: '#b02655' },
        { id: 'amber', name: 'Amber', color: '#f6c85f', hover: '#ffda87', light: '#875d00' },
        { id: 'teal', name: 'Teal', color: '#5ce0cd', hover: '#8aebdd', light: '#08776b' },
    ];
    let current = 'green';
    let mode = 'dark';
    const system = window.matchMedia('(prefers-color-scheme: dark)');

    function apply(id) {
        const theme = colors.find((item) => item.id === id) || colors[0];
        current = theme.id;
        const root = document.documentElement;
        const light = mode === 'light' || (mode === 'system' && !system.matches);
        const accent = light ? theme.light : theme.color;
        const rgb = accent.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
        root.dataset.theme = current;
        root.dataset.mode = light ? 'light' : 'dark';
        root.style.setProperty('--green', accent);
        root.style.setProperty('--green-hover', light ? theme.light : theme.hover);
        root.style.setProperty('--accent-fill', theme.color);
        root.style.setProperty('--accent-fill-hover', theme.hover);
        root.style.setProperty('--accent-rgb', rgb.join(', '));
        // Keep the existing green chart ramp; other accents use five increasing lightness steps.
        const base = light ? 255 : 18;
        const ramp = !light && current === 'green' ? ['#16592e', '#18783b', '#1a9847', '#1cb754', theme.color]
            : [0.35, 0.5, 0.66, 0.82, 1].map((amount) => `rgb(${rgb.map((value) => Math.round(base + (value - base) * amount)).join(', ')})`);
        ramp.forEach((color, i) => root.style.setProperty(`--heat-${i + 1}`, color));
        root.style.setProperty('--chart-mark', light ? accent : ramp[2]);
        root.style.setProperty('--chart-accent', accent);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f2f3f5' : '#121212');
        return theme;
    }

    let saved;
    try {
        saved = JSON.parse(localStorage.getItem('spotdlr.theme'));
        const savedMode = JSON.parse(localStorage.getItem('spotdlr.mode'));
        if (['light', 'dark', 'system'].includes(savedMode)) mode = savedMode;
    } catch { /* storage may be unavailable */ }
    apply(saved);
    system.addEventListener('change', () => { if (mode === 'system') apply(current); });

    return {
        colors,
        get current() { return current; },
        get mode() { return mode; },
        setMode(value) {
            mode = ['light', 'dark', 'system'].includes(value) ? value : 'dark';
            apply(current);
            try { localStorage.setItem('spotdlr.mode', JSON.stringify(mode)); } catch { /* private mode */ }
        },
        set(id) {
            const theme = apply(id);
            try { localStorage.setItem('spotdlr.theme', JSON.stringify(theme.id)); } catch { /* private mode */ }
        },
    };
})();
