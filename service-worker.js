const CACHE_NAME = "mindforge-v10-offline";
const FILES_TO_CACHE = [
  './',
  './index.html', 
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
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

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  // Ignora requisições não-GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retorna do cache se encontrado
        if (response) {
          return response;
        }

        // Faz requisição de rede
        return fetch(event.request)
          .then((response) => {
            // Só cacheia respostas válidas
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clona a resposta para adicionar ao cache
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Fallback para página offline
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
            // Para outros recursos, retorna resposta em cache ou faz fallback
            return caches.match(event.request);
          });
      })
  );
});