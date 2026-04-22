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

### Media prioridad

- [x] **Atajos de teclado (UX)** — Espacio = play/pausa, ↑/↓ = velocidad, +/− = fuente, Esc = volver. Útil en tablet/laptop con teclado Bluetooth.
- [x] **Render lazy del PDF (perf)** — `renderPdfPages` renderiza todas las páginas de forma secuencial con `await` (app.js:576). Para PDFs largos bloquea segundos. Renderizar solo páginas visibles con `IntersectionObserver`.
- [x] **Actualizar PDF.js (seguridad)** — versión 3.11.174 (2023). Subir a la última 4.x y regenerar SRI.
- [x] **Retry en errores de carga (UX)** — hoy el mensaje de error es un callejón sin salida. Agregar botón "Reintentar" en el mensaje de `loadFolder`, `openDoc`, etc.
- [x] **Pinch-to-zoom en PDFs (UX)** — hoy solo +/− con botones. Agregar gesto con `touchstart`/`touchmove` o CSS `touch-action: pinch-zoom`.
- [x] **Notificar updates del SW (UX)** — cuando se active un SW nuevo, mostrar un toast "Nueva versión disponible · Recargar" en vez de esperar a que el usuario descubra que hay cambios.
- [x] **Escape del `src` de imágenes (seguridad)** — en `renderParagraph` (app.js:447) se inyecta `src` sin escapar. Riesgo bajo (viene de la API de Google) pero fácil de cerrar con `escapeHtml`.

### Baja prioridad

- [x] **Fijar carpetas (UX)** — hoy `btn-pin` solo aparece en archivos (app.js:362). Para carpetas muy usadas, tendría sentido.
- [x] **Esc limpia el buscador (UX)** — quick-win de accesibilidad.
- [x] **`preconnect` a cdnjs (perf)** — agregar `<link rel="preconnect" href="https://cdnjs.cloudflare.com">` para que el primer PDF cargue más rápido.
- [x] **Cachear `loadPins()`/`loadRecents()` en memoria (perf)** — hoy se parsean desde localStorage en cada `renderItems`. Mantener una copia en `state` e invalidar en `togglePin`/`addRecent`.
- [x] **Mover `doc_current` a `state` (calidad)** — variable module-level mutable (app.js:487), inconsistente con el resto del estado.
- [x] **Búsqueda recursiva entre carpetas (UX)** — hoy el buscador solo filtra la carpeta actual.

