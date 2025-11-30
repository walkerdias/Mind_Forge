const CACHE_NAME = "mindforge-v11-offline";
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
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
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Removendo cache antigo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: Ativação completa');
      return self.clients.claim();
    })
  );
});

// Fetch - ESTRATÉGIA SPA CORRIGIDA
self.addEventListener('fetch', (event) => {
  // Ignora requisições não-GET e chrome-extension
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Se encontrou no cache, retorna
        if (response) {
          return response;
        }

        // Se é uma navegação (HTML), sempre retorna index.html
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }

        // Para outros recursos, tenta buscar na rede
        return fetch(event.request)
          .then((networkResponse) => {
            // Se a resposta é válida, adiciona ao cache
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
            // Fallback para recursos que não são navegação
            if (event.request.destination === 'image') {
              return new Response('', { status: 404 });
            }
            // Para navegações que falharam, retorna index.html
            return caches.match('/index.html');
          });
      })
  );
});