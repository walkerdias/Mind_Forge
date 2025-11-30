const CACHE_NAME = "mindforge-v12-offline";
const FILES_TO_CACHE = [
  './', // Representa a raiz do escopo (ex: /repo-name/ ou /)
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icons/icon-192x192.png',
  'icons/icon-512x512.png'
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
            console.log('🗑️ Service Worker: Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Estratégia Cache, depois Network com Fallback
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

        // Se é uma navegação (HTML), sempre tenta retornar index.html do cache
        if (event.request.mode === 'navigate') {
          return caches.match('index.html') // Usa o caminho relativo
             .then(cacheResponse => {
                 if (cacheResponse) return cacheResponse;
                 return fetch(event.request); // Tenta a rede se index.html não estiver no cache (erro improvável após o install)
             })
             .catch(() => caches.match('index.html')); // Fallback final para index.html
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
            // Retorna a página offline padrão ou um erro
            return new Response('Sem conexão e recurso não cacheado.', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});