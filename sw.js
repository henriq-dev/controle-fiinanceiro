// Service worker com cache — faz o app abrir mesmo SEM internet.
// Estratégia "rede primeiro, cache de reserva":
//  1) Online: busca na rede (sempre a versão mais nova) e guarda uma cópia.
//  2) Offline (ou rede lenta): entrega a cópia guardada.
// Sobe a versão abaixo a cada release para limpar caches antigos.
const VERSAO = 'financeiro-v2.2.0';

// Arquivos essenciais: guardados já na instalação, para o 1º uso offline funcionar.
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'favicon.ico',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Apaga caches de versões antigas e assume o controle das abas abertas.
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Tenta a rede por até 4s; se falhar ou demorar, quem chama usa o cache.
function redeComLimite(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('rede lenta')), ms))
  ]);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Só cuidamos de GET do próprio site. Firebase/Google (outros domínios) passam direto:
  // login e nuvem precisam de internet de verdade e não devem ser guardados.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    redeComLimite(request, 4000)
      .then((resposta) => {
        if (resposta && resposta.ok) {
          const copia = resposta.clone(); // a resposta só pode ser lida uma vez
          caches.open(VERSAO).then((cache) => cache.put(request, copia));
        }
        return resposta;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then((guardado) =>
          guardado || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});