'use strict';

// Loaded in <head> so appearance preferences are applied before the first paint.
const Theme = (() => {
    const presets = [
        { id: 'green', name: 'Green', color: '#1ed760', hover: '#3be477', light: '#087f36' },
        { id: 'blue', name: 'Blue', color: '#70b7ff', hover: '#94c9ff', light: '#1264a3' },
        { id: 'purple', name: 'Purple', color: '#bb9aff', hover: '#cfb8ff', light: '#7040b0' },
        { id: 'rose', name: 'Rose', color: '#ff92b0', hover: '#ffb1c6', light: '#b02655' },
        { id: 'amber', name: 'Amber', color: '#f6c85f', hover: '#ffda87', light: '#875d00' },
        { id: 'teal', name: 'Teal', color: '#5ce0cd', hover: '#8aebdd', light: '#08776b' },
    ];
    const modes = ['light', 'dark', 'system', 'daylight', 'nightlight'];
    const validColor = (value) => typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);
    const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    const minutes = (value) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
    const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem('spotdlr.' + key)) ?? fallback; } catch { return fallback; } };
    const write = (key, value) => localStorage.setItem('spotdlr.' + key, JSON.stringify(value));
    const rgbOf = (hex) => hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
    const mix = (from, to, amount) => '#' + rgbOf(from).map((v, i) => Math.round(v + (rgbOf(to)[i] - v) * amount).toString(16).padStart(2, '0')).join('');
    const luminance = (hex) => rgbOf(hex).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    function readable(color, background, toward, tint = 0) {
        for (let step = 0; step <= 100; step++) {
            const candidate = mix(color, toward, step / 100);
            if (contrast(candidate, mix(background, candidate, tint)) >= 4.6) return candidate;
        }
        return toward;
    }
    function customTheme({ id, name, color }) {
        const dark = readable(color, '#282828', '#ffffff', .12);
        const fill = readable(color, '#000000', '#ffffff');
        return { id, name, color, dark, fill, hover: mix(dark, '#ffffff', .2), fillHover: mix(fill, '#ffffff', .2),
            light: readable(color, '#f2f3f5', '#000000', .12), ink: contrast(color, '#000000') >= 4.5 ? '#000000' : '#ffffff' };
    }
    const savedColors = read('customColors', []);
    let customColors = (Array.isArray(savedColors) ? savedColors : []).filter((c) => c && /^custom-[a-z0-9-]+$/.test(c.id)
        && typeof c.name === 'string' && c.name.trim() && c.name.length <= 32 && validColor(c.color)).map(customTheme);
    const colors = () => [...presets, ...customColors];
    let current = 'green';
    let mode = read('mode', 'dark');
    if (!modes.includes(mode)) mode = 'dark';
    let glass = read('glass', false) === true;
    let transparency = Number(read('transparency', 35));
    if (!Number.isFinite(transparency) || transparency < 10 || transparency > 70) transparency = 35;
    const savedSchedule = read('themeSchedule', {});
    let schedule = validTime(savedSchedule?.day) && validTime(savedSchedule?.night) && savedSchedule.day !== savedSchedule.night
        ? { day: savedSchedule.day, night: savedSchedule.night } : { day: '07:00', night: '19:00' };
    let timer;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const scheduled = () => mode === 'daylight' || mode === 'nightlight';

    function isLight(now = new Date()) {
        if (!scheduled()) return mode === 'light' || mode === 'system' && !system.matches;
        const time = now.getHours() * 60 + now.getMinutes(), day = minutes(schedule.day), night = minutes(schedule.night);
        const daytime = day < night ? time >= day && time < night : time >= day || time < night;
        return mode === 'daylight' ? daytime : !daytime;
    }

    function apply(id) {
        const theme = colors().find((item) => item.id === id) || presets[0];
        current = theme.id;
        const root = document.documentElement;
        const light = isLight();
        const accent = light ? theme.light : theme.dark || theme.color;
        const rgb = rgbOf(accent);
        root.dataset.theme = current;
        root.dataset.mode = light ? 'light' : 'dark';
        root.dataset.glass = String(glass);
        root.style.setProperty('--glass-alpha', String(1 - transparency / 100));
        root.style.setProperty('--green', accent);
        root.style.setProperty('--green-hover', light ? theme.light : theme.hover);
        root.style.setProperty('--accent-fill', theme.fill || theme.color);
        root.style.setProperty('--accent-fill-hover', theme.fillHover || theme.hover);
        root.style.setProperty('--accent-rgb', rgb.join(', '));
        // Keep the existing green chart ramp; other accents use five increasing lightness steps.
        const base = light ? 255 : 18;
        const ramp = !light && current === 'green' ? ['#16592e', '#18783b', '#1a9847', '#1cb754', theme.color]
            : [0.35, 0.5, 0.66, 0.82, 1].map((amount) => `rgb(${rgb.map((value) => Math.round(base + (value - base) * amount)).join(', ')})`);
        ramp.forEach((color, i) => root.style.setProperty(`--heat-${i + 1}`, color));
        root.style.setProperty('--chart-mark', light ? accent : ramp[2]);
        root.style.setProperty('--chart-accent', accent);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f2f3f5' : '#121212');
        document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', light ? 'default' : 'black');
        window.webkit?.messageHandlers?.theme?.postMessage({
            mode: light ? 'light' : 'dark', glass, accent, alpha: 1 - transparency / 100,
        });
        document.dispatchEvent(new Event('themechange'));
        return theme;
    }

    function update() {
        apply(current);
        clearTimeout(timer);
        if (!scheduled()) return;
        const now = new Date();
        const next = [schedule.day, schedule.night].map((time) => {
            const [h, m] = time.split(':').map(Number);
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
            if (date <= now) date.setDate(date.getDate() + 1);
            return date.getTime();
        });
        timer = setTimeout(update, Math.min(...next) - now.getTime() + 50);
    }
    current = read('theme', 'green');
    update();
    system.addEventListener('change', () => { if (mode === 'system') update(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
    window.addEventListener('focus', update);

    return {
        get colors() { return colors(); },
        get current() { return current; },
        get mode() { return mode; },
        get glass() { return glass; },
        get transparency() { return transparency; },
        get schedule() { return { ...schedule }; },
        get scheduled() { return scheduled(); },
        setSchedule(day, night) {
            if (!validTime(day) || !validTime(night)) throw new Error('Enter a valid day and night start time.');
            if (day === night) throw new Error('Day and night must start at different times.');
            schedule = { day, night };
            try { write('themeSchedule', schedule); } catch { /* private mode */ }
            update();
        },
        setMode(value) {
            mode = modes.includes(value) ? value : 'dark';
            update();
            try { write('mode', mode); } catch { /* private mode */ }
        },
        setGlass(value) {
            glass = Boolean(value);
            apply(current);
            try { write('glass', glass); } catch { /* private mode */ }
        },
        setTransparency(value) {
            const next = Math.round(Number(value));
            transparency = Number.isFinite(next) ? Math.min(70, Math.max(10, next)) : 35;
            apply(current);
            try { write('transparency', transparency); } catch { /* private mode */ }
        },
        set(id) {
            const theme = apply(id);
            try { write('theme', theme.id); } catch { /* private mode */ }
        },
        saveCustom(name, color) {
            name = name.trim();
            if (!name || name.length > 32) throw new Error('Give this color a name of up to 32 characters.');
            if (!validColor(color)) throw new Error('Enter a six-digit hex color, like #ff8844.');
            if (colors().some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error('A color already uses that name. Choose a different name.');
            const theme = customTheme({ id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name, color: color.toLowerCase() });
            const next = [...customColors, theme];
            try { write('customColors', next.map(({ id, name, color }) => ({ id, name, color }))); }
            catch { throw new Error('Could not save this color. Allow site storage or free some browser storage, then try again.'); }
            customColors = next;
            apply(theme.id);
            try { write('theme', theme.id); } catch { /* private mode */ }
            return theme;
        },
    };
})();
