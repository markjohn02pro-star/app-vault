/**
 * main.js — Application entry point.
 *
 * Bootstraps the FileEncryptorApp once the DOM has finished loading.
 * This is the only script loaded by the HTML — all other modules are
 * pulled in via ES6 imports from FileEncryptorApp.
 */
import { FileEncryptorApp } from './FileEncryptorApp.js';

document.addEventListener('DOMContentLoaded', () => {
    const app = new FileEncryptorApp();

    // Expose to console for debugging (development only)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.__vault = app;
    }
});
