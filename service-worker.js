const CACHE_NAME = "mindforge-v12-offline";
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  // Adicione todos os seus ícones e arquivos estáticos essenciais aqui
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

// Instalação
self.addEventListener('install', (event) => {
  console.log('🔄 Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Cacheando arquivos essenciais');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        console.log('✅ Service Worker: Instalação completa');
        // Força o novo Service Worker a esperar o mínimo possível
        return self.skipWaiting();
      })
      .catch(error => {
        console.log('❌ Service Worker: Erro na instalação', error);
      })
  );
});

// Ativação - Limpeza de caches antigos
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker: Ativando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Deleta caches que não correspondem ao CACHE_NAME atual
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Importante: Assume o controle de todas as páginas imediatamente
      console.log('⭐ Service Worker: Reivindicando clientes...');
      return self.clients.claim();
    })
  );
});

// Estratégia de Cache-First, Network-Fallback
self.addEventListener('fetch', (event) => {
  // Ignora requisições não-GET e chrome-extension
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 1. Se encontrou no cache, retorna
        if (response) {
          return response;
        }

        // 2. Se é uma navegação (URL principal, como um clique em link), 
        // tenta buscar na rede, mas com fallback para index.html se offline
        if (event.request.mode === 'navigate') {
          return fetch(event.request)
            .catch(() => {
              // Se a rede falhar (offline), retorna o index.html do cache
              return caches.match('/index.html');
            });
        }

        // 3. Para outros recursos (JS, CSS, Imagens), tenta buscar na rede
        return fetch(event.request)
          .then((networkResponse) => {
            // Se a resposta é válida, adiciona ao cache (Cache-First com atualização)
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Fallback simples se a rede falhar e não estiver no cache (normalmente falhará)
            return new Response('', { status: 404, statusText: 'Não encontrado no cache ou rede offline.' });
          });
      })
  );
});