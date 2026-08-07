// Service worker mínimo.
// Sua única função aqui é existir e responder ao evento "fetch":
// isso é o que o Chrome/Edge exigem para considerar o site "instalável".
// Não fazemos cache agressivo de propósito, para a pessoa sempre
// receber a versão mais recente do app.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
