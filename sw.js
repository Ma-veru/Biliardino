// Service Worker - Torneo Giallo
// Consente all'app di funzionare anche offline dopo il primo caricamento,
// mettendo in cache sia i file locali (app shell) sia le librerie esterne da CDN.

const CACHE_NAME = 'biliardino-tornei-cache-v5';

// File locali essenziali per il funzionamento dell'app
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './biliardino-icon.svg',
    './icon-192.png',
    './icon-512.png'
];

// Installazione: precarica l'app shell
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
});

// Attivazione: rimuove le vecchie versioni della cache
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: strategie differenziate
// - File dell'app (stesso dominio): "network first" -> prova prima la rete per avere sempre
//   l'ultima versione; se offline, usa la cache come riserva.
// - Librerie esterne da CDN: "cache first, aggiornamento in background" -> risposta immediata
//   dalla cache (più veloce, funziona offline), aggiornandola comunque per la prossima volta.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const isSameOrigin = new URL(req.url).origin === self.location.origin;

    if (isSameOrigin) {
        event.respondWith(
            fetch(req)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then((cached) => {
            const fetchPromise = fetch(req)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => cached); // Offline e non in cache: nessuna risposta disponibile

            return cached || fetchPromise;
        })
    );
});
