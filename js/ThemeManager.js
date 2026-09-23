/**
 * ThemeManager — Manages light/dark theme switching.
 *
 * Handles toggling between light and dark themes, persists the user's
 * preference in localStorage, and respects the system's color-scheme
 * preference as a default. Updates the `data-theme` attribute on the
 * root `<html>` element, which CSS custom properties react to.
 *
 * @example
 *   const theme = new ThemeManager('theme-toggle');
 *   // Theme is automatically applied from saved preference or system default.
 *   // Clicking the toggle button switches themes.
 */
export class ThemeManager {

    /** localStorage key for persisting the theme choice */
    static STORAGE_KEY = 'vault-theme';

    /** Enum of supported themes */
    static THEMES = Object.freeze({
        LIGHT: 'light',
        DARK: 'dark',
    });

    /** SVG icon for the moon (shown in light mode — click to switch to dark) */
    static MOON_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

    /** SVG icon for the sun (shown in dark mode — click to switch to light) */
    static SUN_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

    /**
     * @param {string} toggleBtnId - The DOM id of the theme toggle button.
     */
    constructor(toggleBtnId) {
        this.toggleBtn = document.getElementById(toggleBtnId);
        this.currentTheme = this._getSavedTheme();

        this._applyTheme(this.currentTheme);
        this._bindEvents();
    }

    /**
     * Toggles between light and dark themes.
     */
    toggle() {
        const newTheme =
            this.currentTheme === ThemeManager.THEMES.LIGHT
                ? ThemeManager.THEMES.DARK
                : ThemeManager.THEMES.LIGHT;

        this._applyTheme(newTheme);
    }

    /**
     * Returns the current active theme name.
     *
     * @returns {string} 'light' or 'dark'
     */
    getTheme() {
        return this.currentTheme;
    }

    // ── Private Methods ──────────────────────────────────────────

    /**
     * Reads the saved theme from localStorage, falling back to the
     * system's preferred color scheme, and finally defaulting to light.
     *
     * @returns {string} The theme to apply.
     * @private
     */
    _getSavedTheme() {
        const saved = localStorage.getItem(ThemeManager.STORAGE_KEY);

        if (saved && Object.values(ThemeManager.THEMES).includes(saved)) {
            return saved;
        }

        // Respect the OS-level preference if no explicit choice has been saved
        if (
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
        ) {
            return ThemeManager.THEMES.DARK;
        }

        return ThemeManager.THEMES.LIGHT;
    }

    /**
     * Applies a theme by updating the DOM attribute and persisting the choice.
     *
     * @param {string} theme - 'light' or 'dark'
     * @private
     */
    _applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        localStorage.setItem(ThemeManager.STORAGE_KEY, theme);
        this._updateToggleButton();
    }

    /**
     * Updates the toggle button's icon and accessible label to reflect
     * the current theme state.
     *
     * @private
     */
    _updateToggleButton() {
        if (!this.toggleBtn) return;

        const isLight = this.currentTheme === ThemeManager.THEMES.LIGHT;
        const icon = isLight ? ThemeManager.MOON_ICON : ThemeManager.SUN_ICON;
        const label = isLight ? 'Dark mode' : 'Light mode';

        this.toggleBtn.innerHTML =
            `<span class="icon">${icon}</span><span class="theme-text">${label}</span>`;
        this.toggleBtn.setAttribute('aria-label', `Switch to ${label.toLowerCase()}`);
    }

    /**
     * Binds the click event on the toggle button.
     *
     * @private
     */
    _bindEvents() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }
    }
}
