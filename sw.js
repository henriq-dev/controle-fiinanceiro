// Service worker com cache offline de verdade.
//
// Estratégia: "rede primeiro, cache como reserva".
// - Com internet: sempre busca a versão mais nova no servidor (mantém a
//   promessa original de nunca servir algo desatualizado por engano) e
//   guarda uma cópia fresca no cache enquanto isso.
// - Sem internet: usa essa última cópia salva, em vez de mostrar a tela de
//   erro do navegador. É o que faltava pro app funcionar de verdade como
//   PWA offline.
//
// CACHE_NAME tem um número de versão. Trocar esse número (ex: v1 -> v2) na
// próxima atualização do app força os aparelhos das pessoas a descartarem
// o cache antigo e baixarem tudo de novo — é assim que se invalida cache
// de service worker, não tem outro jeito.
const CACHE_NAME = 'controle-financeiro-v2';

// Arquivos "essenciais": sem eles o app nem abre. Pré-carregados na
// instalação, pra já existir alguma coisa no cache mesmo antes da pessoa
// perder internet pela primeira vez.
const ARQUIVOS_ESSENCIAIS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './fonts/Sora.woff2',
  './fonts/PlusJakartaSans.woff2',
  './fonts/PlusJakartaSans-Italic.woff2',
  './fonts/IBMPlexMono-Regular.woff2',
  './fonts/IBMPlexMono-Bold.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARQUIVOS_ESSENCIAIS))
      .catch(e => console.error('Falha ao pré-carregar arquivos essenciais:', e))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Apaga caches de versões antigas (ex: "controle-financeiro-v0" de uma
  // atualização anterior) — sem isso, o armazenamento do aparelho cresce
  // pra sempre a cada nova versão do app.
  event.waitUntil(
    caches.keys().then(chaves =>
      Promise.all(chaves.filter(chave => chave !== CACHE_NAME).map(chave => caches.delete(chave)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Só mexemos em GET. POST/PUT (ex: chamadas ao Firestore quando logado)
  // sempre vão direto pra rede — não faz sentido "cachear" uma escrita.
  if (event.request.method !== 'GET') return;

  // Requisições pra outros domínios (Firebase, Google Fonts se algum dia
  // forem usadas, etc) passam direto, sem entrar na nossa estratégia de
  // cache — mexer em autenticação de terceiros por engano pode causar
  // problema de login difícil de depurar.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(respostaFresca => {
        const copia = respostaFresca.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        return respostaFresca;
      })
      .catch(() => {
        // Sem internet: tenta servir a última cópia salva. Se nem isso
        // existir (primeira visita já offline), cai no erro padrão do
        // navegador — não tem como inventar um arquivo que nunca chegou.
        return caches.match(event.request);
      })
  );
});
