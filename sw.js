/**
 * Service Worker — Enables offline caching and PNG icon generation for the Vault PWA.
 *
 * Caches all application files on install so the app works fully
 * offline after the first visit. Uses a cache-first strategy for
 * app assets and network-first for external resources.
 *
 * Also dynamically generates PNG icons from the lock design using
 * OffscreenCanvas, so no physical PNG files are needed in the repo.
 */

const CACHE_NAME = 'vault-v3';

/**
 * List of all app files to cache on install.
 */
const APP_FILES = [
    './',
    './index.html',
    './css/styles.css',
    './js/main.js',
    './js/CryptoEngine.js',
    './js/FilePackager.js',
    './js/FileEncryptorApp.js',
    './js/ThemeManager.js',
    './icons/icon.svg',
    './icons/icon-maskable.svg',
    './manifest.json',
];

/**
 * PNG icon paths that will be generated dynamically.
 */
const GENERATED_ICONS = [
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-192.png',
    'icons/icon-maskable-512.png',
];

/**
 * Draws the lock icon on an OffscreenCanvas at the given size.
 * Returns a PNG Blob.
 */
async function generateIconPNG(size) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, size, size);

    // Scale drawing to canvas size
    const scale = size / 512;
    ctx.save();
    ctx.translate(size / 2, size * 0.47);
    ctx.scale(scale, scale);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Lock body (rounded rectangle)
    roundRect(ctx, -80, -10, 160, 120, 12);
    ctx.stroke();

    // Lock shackle
    ctx.beginPath();
    ctx.moveTo(-50, -10);
    ctx.lineTo(-50, -60);
    ctx.quadraticCurveTo(-50, -110, 0, -110);
    ctx.quadraticCurveTo(50, -110, 50, -60);
    ctx.lineTo(50, -10);
    ctx.stroke();

    // Keyhole circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 45, 16, 0, Math.PI * 2);
    ctx.fill();

    // Keyhole rectangle
    roundRect(ctx, -6, 50, 12, 30, 4);
    ctx.fill();

    ctx.restore();

    return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * Helper: draw a rounded rectangle path.
 */
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Pre-generates PNG icons and stores them in cache during install.
 */
async function cacheGeneratedIcons(cache) {
    const sizes = [192, 512];

    for (const size of sizes) {
        const blob = await generateIconPNG(size);

        // Regular icon
        const regularResponse = new Response(blob, {
            headers: { 'Content-Type': 'image/png', 'Content-Length': blob.size },
        });
        await cache.put(new Request(`./icons/icon-${size}.png`), regularResponse.clone());

        // Maskable icon (same design — content is centered within safe zone)
        const maskableResponse = new Response(blob, {
            headers: { 'Content-Type': 'image/png', 'Content-Length': blob.size },
        });
        await cache.put(new Request(`./icons/icon-maskable-${size}.png`), maskableResponse);
    }
}

/**
 * Install event — pre-caches all app files + generates PNG icons.
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                await cache.addAll(APP_FILES);
                await cacheGeneratedIcons(cache);
            })
            .then(() => self.skipWaiting())
    );
});

/**
 * Activate event — cleans up old caches when a new version is deployed.
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

/**
 * Fetch event — serves cached files first, falling back to network.
 *
 * Strategy:
 *  - App files (same-origin): Network-first → cache fallback
 *  - Generated PNG icons: Serve from cache (generated at install time)
 *  - External resources (fonts, etc.): Network-first → cache fallback
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only handle GET requests
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // For same-origin requests: network-first
    if (url.origin === self.location.origin) {
        // Check if this is a generated icon request
        const isGeneratedIcon = GENERATED_ICONS.some(
            (path) => url.pathname.endsWith(path) || url.pathname.endsWith('/' + path)
        );

        if (isGeneratedIcon) {
            // For generated icons: serve from cache, regenerate if missing
            event.respondWith(
                caches.match(request)
                    .then(async (cached) => {
                        if (cached) return cached;

                        // Regenerate on-the-fly if not cached
                        const sizeMatch = url.pathname.match(/(\d+)\.png$/);
                        const size = sizeMatch ? parseInt(sizeMatch[1]) : 192;
                        const blob = await generateIconPNG(size);
                        const response = new Response(blob, {
                            headers: { 'Content-Type': 'image/png' },
                        });

                        // Cache for future
                        const cache = await caches.open(CACHE_NAME);
                        cache.put(request, response.clone());
                        return response;
                    })
            );
            return;
        }

        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, responseClone));
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(request).then((cached) => {
                        if (cached) return cached;
                        if (request.destination === 'document') {
                            return caches.match('./index.html');
                        }
                    });
                })
        );
    } else {
        // For cross-origin requests (e.g., Google Fonts): network-first
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, responseClone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
    }
});
