# GrungeTab

Lector de tablaturas con scroll automático para guitarra. Lee Google Docs almacenados en Google Drive y los muestra con auto-scroll a velocidad regulable, pensado para tocar sin tener que tocar la pantalla.

---

## Requisitos previos

- Python 3 (para el servidor local de desarrollo)
- Una cuenta de Google con los archivos en Google Drive (formato Google Docs)
- Un proyecto en [Google Cloud Console](https://console.cloud.google.com/)

---

## Configuración en Google Cloud Console

### 1. Habilitar las APIs necesarias

En **APIs & Services → Library**, buscar y habilitar:
- `Google Drive API`
- `Google Docs API`

### 2. Crear las credenciales OAuth

En **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**:
- Tipo de aplicación: **Web application**
- Nombre: cualquiera (ej. `GrungeTab`)

### 3. Configurar la pantalla de consentimiento OAuth

En **APIs & Services → OAuth consent screen**:
- Mantener el estado en **Testing** (no publicar)
- En **Test users**, agregar únicamente tu email de Google

Esto garantiza que solo tu cuenta pueda hacer login, sin importar que el repositorio sea público.

### 4. Agregar orígenes autorizados

En las credenciales OAuth recién creadas, bajo **Authorized JavaScript origins**:

```
http://localhost:8080          ← para desarrollo local
https://<tu-usuario>.github.io ← para producción
```

Bajo **Authorized redirect URIs**:
```
http://localhost:8080/index.local.html
https://<tu-usuario>.github.io/grungetab-app/
```

---

## Configuración del proyecto

### Obtener el ID de la carpeta de Drive (TABS_FOLDER_ID)

Abrir la carpeta de tablaturas en Google Drive. El ID está en la URL:
```
https://drive.google.com/drive/folders/ESTE_ES_EL_ID
```

### Crear el archivo `.env.local`

En la raíz del proyecto, crear `.env.local` (nunca se sube al repo):

```
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
ALLOWED_EMAIL=tu@gmail.com
TABS_FOLDER_ID=id_de_tu_carpeta_tabs
```

---

## Desarrollo local

```bash
./dev.sh --serve
```

Genera `index.local.html` con las variables inyectadas y abre `http://localhost:8080/index.local.html` en el navegador.

```bash
./dev.sh
```

Solo genera `index.local.html` sin levantar el servidor (para abrir con WebStorm).

> El Service Worker está deshabilitado en `localhost` — no afecta el desarrollo.

---

## Deploy a GitHub Pages

El deploy es automático al hacer push a `main` via GitHub Actions.

Antes del primer deploy, agregar estos tres secrets en **GitHub → Settings → Secrets → Actions**:

| Secret | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | El Client ID de Google Cloud |
| `ALLOWED_EMAIL` | Tu email de Google |
| `TABS_FOLDER_ID` | El ID de la carpeta de Drive |

---

## Backlog / Mejoras pendientes

Priorizado por impacto sobre el caso de uso real (tocar guitarra sin tocar la pantalla).

### Alta prioridad

- [x] **Wake Lock API (UX)** — la pantalla se apaga durante el auto-scroll, justo contra el propósito de la app. Pedir `navigator.wakeLock.request('screen')` al entrar al reader y liberar al salir.
- [x] **Service Worker: network-first para HTML/JS (perf/UX)** — hoy es cache-first puro. Tras un deploy, el usuario ve la versión vieja hasta el segundo reload. Network-first con fallback a cache para navegación y assets versionados, cache-first para el resto.
- [x] **Cache offline de documentos abiertos (UX)** — permite tocar sin internet. Guardar en `caches` (o IndexedDB) los docs/txt/pdf ya vistos y usarlos como fallback cuando la red falla.
- [x] **`access_token` en URL de imágenes (seguridad)** — `resolveAuthImages` (app.js:655) mete el token como query param. Se filtra a Referer, historial y logs. Reemplazar por `fetch` con `Authorization` header + `URL.createObjectURL(blob)`.
- [x] **Soporte del botón Atrás del navegador/Android (UX)** — hoy cierra la app en vez de volver a la lista. Usar `history.pushState` al cambiar de pantalla y escuchar `popstate`.
- [x] **CSP vía `<meta http-equiv>` (seguridad)** — defensa en profundidad contra XSS. Restringir `script-src`, `connect-src`, `img-src` a los orígenes reales (Google, cdnjs). _(Nota: sigue usando `'unsafe-inline'` en `script-src` porque el bloque de `window.GRUNGETAB_CONFIG` está inline en `index.html`. Mover a `config.js` separado permitiría endurecerlo — TODO aparte.)_
- [x] **Eliminar `'unsafe-inline'` del CSP (seguridad)** — mover el bloque `window.GRUNGETAB_CONFIG` de `index.html:17-23` a un `config.js` externo (generado por `dev.sh` y por el workflow de deploy). Permite quitar `'unsafe-inline'` de `script-src` y cerrar el hueco de XSS que queda hoy.
- [x] **Imágenes de Google Docs offline (UX)** — en modo offline los `contentUri` de Google (`<img>` en docs) fallan por red y `resolveAuthImages` no puede recuperarlas porque tampoco hay acceso a la Drive API. Opción: al cachear el doc, fetchear sus imágenes y guardarlas en `OFFLINE_CACHE` como blobs, reemplazando `src` al renderizar offline.
- [x] **Re-render del PDF al rotar/resize (UX)** — `renderPdfPages` usa `tabContent.clientWidth` una vez, pero al rotar el dispositivo o cambiar el tamaño de la ventana los canvas quedan con el ancho viejo (se ven pequeños o cortados). Escuchar `resize`/`orientationchange` con debounce y re-renderizar si `state.pdfDoc`.

### Media prioridad

- [x] **Atajos de teclado (UX)** — Espacio = play/pausa, ↑/↓ = velocidad, +/− = fuente, Esc = volver. Útil en tablet/laptop con teclado Bluetooth.
- [x] **Render lazy del PDF (perf)** — `renderPdfPages` renderiza todas las páginas de forma secuencial con `await` (app.js:576). Para PDFs largos bloquea segundos. Renderizar solo páginas visibles con `IntersectionObserver`.
- [x] **Actualizar PDF.js (seguridad)** — versión 3.11.174 (2023). Subir a la última 4.x y regenerar SRI.
- [x] **Retry en errores de carga (UX)** — hoy el mensaje de error es un callejón sin salida. Agregar botón "Reintentar" en el mensaje de `loadFolder`, `openDoc`, etc.
- [x] **Pinch-to-zoom en PDFs (UX)** — hoy solo +/− con botones. Agregar gesto con `touchstart`/`touchmove` o CSS `touch-action: pinch-zoom`.
- [x] **Notificar updates del SW (UX)** — cuando se active un SW nuevo, mostrar un toast "Nueva versión disponible · Recargar" en vez de esperar a que el usuario descubra que hay cambios.
- [x] **Escape del `src` de imágenes (seguridad)** — en `renderParagraph` (app.js:447) se inyecta `src` sin escapar. Riesgo bajo (viene de la API de Google) pero fácil de cerrar con `escapeHtml`.
- [x] **`reloadCurrentFile()` duplica el historial (UX)** — al pulsar ↺ se vuelve a llamar a `openDoc/openTxt/openPdf`, que hacen `history.pushState` de nuevo. Cada reload agrega una entrada extra y el botón Atrás termina recorriendo reloads viejos. Saltar el `pushState` cuando el id/type ya coincide con la entrada actual del history.
- [x] **Liberar `state.currentDoc` y `state.pdfDoc` al salir del reader (perf)** — hoy quedan retenidos entre aperturas (un JSON grande de Docs o un `PDFDocumentProxy` de varios MB). Limpiarlos al entrar a `screen-list` o al abrir un archivo de otro tipo.
- [x] **Límite al cache offline (perf/quota)** — `OFFLINE_CACHE` crece sin bound. PDFs de varios MB se acumulan hasta hitar la cuota del origen y romper el resto del cache. Implementar LRU simple (e.g. guardar timestamps en IndexedDB y purgar más allá de N archivos o X MB).
- [x] **Botón "Limpiar caché offline" en ajustes (UX)** — complemento del límite automático: permitir al usuario purgar manualmente desde el panel de ajustes sin tener que ir a DevTools.
- [x] **Indicador global de modo offline (UX)** — hoy solo se ve `· OFFLINE` en el badge del reader si abrís un archivo cacheado. Si el usuario está en la lista sin red, ve "Error cargando" sin saber que es por estar offline. Escuchar `online`/`offline` y mostrar un pill persistente.
- [x] **Badge `OFFLINE` queda stale al volver la red (UX)** — si abriste un archivo desde cache y luego recuperás conexión, el badge sigue diciendo `DOC · OFFLINE`. Volver a `DOC` cuando `navigator.onLine` pasa a true (o actualizar al recargar con ↺).
- [x] **Persistir `state.pdfScale` (UX)** — `fontSize`, `theme` y `noWrap` persisten en localStorage; el zoom de PDF no. Abrir un PDF siempre lo resetea a 100%. Guardar en `grungetab-pdfscale` y restaurarlo en `openPdf`.
- [x] **Búsqueda accent-insensitive (UX)** — `applySearch` hace `includes()` case-insensitive pero no normaliza diacríticos: buscar "cancion" no matchea "Canción". Usar `String.prototype.normalize('NFD').replace(/\p{Diacritic}/gu, '')` en ambos lados.
- [x] **No repetir en recientes y fijados**: filtro en `renderQuickAccess` descarta items ya fijados.
- [x] **Recordar posición de scroll por archivo (UX)** — al reabrir una tablatura vuelve a la posición donde la dejaste. `grungetab-scrollpos` con TTL 30 días y cap 50 archivos.
- [x] **MediaSession API para pedales BT y media keys (UX)** — play/pause y next/prev responden a pedales Bluetooth, airpods, teclas multimedia del SO.
- [x] **Count-in metrónomo — descartado**: se probó y se removió completamente (código, UI, estado y persistencia). **No volver a agregarlo.** Para contar los tiempos el usuario prefiere su propia cadencia — el count-in forzado antes del scroll no sumaba al caso de uso real.
- [x] **Botón "Instalar app" (UX)** — captura `beforeinstallprompt`, muestra 📲 en el header de la lista.
- [x] **Tap directo para pausar (UX)** — durante playback un tap pausa; antes requería dos.
- [x] **Setlists / cola de práctica (UX)** — botón 🎼 en cada archivo, panel con reorden/quitar/vaciar, nav 🎵◀ 🎵▶ en el reader.
- [x] **Hotkeys de zoom en PDF (UX)** — `+`/`-` zoomea el PDF cuando hay uno abierto.
- [x] **Revisar nuevamente login** — `initOAuthClient` ahora intenta `prompt:''` con `hint` primero (sin picker si el consentimiento ya existe) y cae a interactivo si falla.

### Baja prioridad

- [x] **Fijar carpetas (UX)** — hoy `btn-pin` solo aparece en archivos (app.js:362). Para carpetas muy usadas, tendría sentido.
- [x] **Esc limpia el buscador (UX)** — quick-win de accesibilidad.
- [x] **`preconnect` a cdnjs (perf)** — agregar `<link rel="preconnect" href="https://cdnjs.cloudflare.com">` para que el primer PDF cargue más rápido.
- [x] **Cachear `loadPins()`/`loadRecents()` en memoria (perf)** — hoy se parsean desde localStorage en cada `renderItems`. Mantener una copia en `state` e invalidar en `togglePin`/`addRecent`.
- [x] **Mover `doc_current` a `state` (calidad)** — variable module-level mutable (app.js:487), inconsistente con el resto del estado.
- [x] **Búsqueda recursiva entre carpetas (UX)** — hoy el buscador solo filtra la carpeta actual.
- [x] **Race condition en `refreshToken()` (calidad)** — si dos `authFetch` reciben 401 en paralelo, ambos disparan `refreshToken()` y se inician dos flujos OAuth simultáneos (`app.js:802`). Compartir un `refreshPromise` mientras haya uno en curso.
- [x] **Limpieza del `.gitignore` (calidad)** — el `.gitignore` incluye `dev.sh`, pero `dev.sh` está tracked en el repo (y referenciado por `README.md` y `CLAUDE.md`). La línea no tiene efecto porque git no ignora archivos ya rastreados, pero es confuso. Removerla.
- [x] **Toggle para `filter: invert(1)` en imágenes dark (UX)** — botón "🖼 Invertir imágenes: ON/OFF" en el panel de ajustes (solo visible en docs). Persiste en localStorage. La regla CSS usa `body.dark:not(.no-invert-imgs)`.
- [x] **Saltar entre secciones del doc (UX)** — botones ⏮/⏭ en la barra superior (solo en docs), atajos PgUp/PgDn. `jumpToSection(dir)` busca `h1/h2/h3` dentro de `.doc-rendered` y hace `scrollTo`.
- [x] **Indicación visual de "Fin del documento" (UX)** — al llegar al final del scroll, `flashEndOfDoc()` dispara la animación CSS `badge-flash` sobre el badge del tipo de archivo antes de pausar.
- [x] **Detectar home con el "Atrás"/"Escape"** Cuando ya esté en la raíz/home no hacer más atrás para que nos se salga de la aplicación
- [x] **Quitar elementos de "Recientes" + límite a pins (UX)** — botón ✕ en cada item de Recientes; `removeRecent(id)` lo filtra del estado. `PINS_MAX = 20` en `togglePin` evita que Fijados crezca sin control.
- [x] **Revisar lo de limpiar caché e invertir imágenes**: para qué sirven?
  - `🧹 Limpiar caché offline` → borra los docs/txt/pdf que quedaron guardados para abrir sin internet. Útil si el espacio se acumula o algo quedó corrupto.
  - `🖼 Invertir imágenes` → solo en modo oscuro, invierte los colores de las imágenes embebidas en Docs (útil cuando son capturas con fondo blanco que molesta).
- [x] **Mejorar pin y recientes (acordeón) (UX)** — los headers "Fijados" y "Recientes" son botones ▾/▸ que colapsan/expanden la sección. El estado persiste por sección (`grungetab-pins-collapsed`, `grungetab-recents-collapsed`). El header muestra el count al costado.
- [x] **Cómo funcionan los setlists**:
  - Setlist: desde la lista, tocá 🎼 al lado de una canción para agregarla. Arriba en el header aparece 🎼N (N = cantidad) — clic abre el panel con reorden ▲▼, quitar ✕ y "🚮 Vaciar". En el reader, si la canción abierta está en el setlist, aparecen 🎵◀ 🎵▶ en la barra superior para saltar. 