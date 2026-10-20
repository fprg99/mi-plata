// Service worker de Mi plata: permite abrir la app sin conexión.
// Estrategia: primero la red (así siempre llega la última versión) y, si no hay
// conexión o tarda demasiado, lo último que se guardó en el teléfono.
// Los datos de la persona no pasan por acá: viven en localStorage.
var CACHE = 'mi-plata-v3';
var BASICOS = ['./', './index.html'];
var ESPERA_MS = 4000; // con señal muy mala, no hacer esperar más que esto

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(BASICOS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function guardada(req){
  return caches.match(req, {ignoreSearch:true}).then(function(r){
    return r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var propio = url.origin === self.location.origin;
  var fuentes = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!propio && !fuentes) return;

  var red = fetch(req).then(function(res){
    if (res && (res.ok || res.type === 'opaque')) {
      var copia = res.clone();
      caches.open(CACHE).then(function(c){ c.put(req, copia); });
    }
    return res;
  });

  e.respondWith(new Promise(function(ok){
    var listo = false;
    function usar(r){ if(!listo && r){ listo = true; ok(r); } }
    // Si la red tarda, mostrar lo guardado (la red igual sigue y actualiza la copia).
    var t = setTimeout(function(){ guardada(req).then(usar); }, ESPERA_MS);
    red.then(function(res){ clearTimeout(t); usar(res); })
      .catch(function(){
        clearTimeout(t);
        guardada(req).then(function(r){ usar(r || Response.error()); });
      });
  }));
});
