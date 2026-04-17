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

- [ ] **Unit tests**: Se puede usar algún framework sencillo y gratis para hacer pruebas sencillas del funcionamiento?
- [ ] **Buscador avanzado**: buscar por nombre de archivo o abrir un Google Doc directamente por URL o ID, sin navegar la carpeta
- [ ] **Imágenes en Google Docs**: las `contentUri` de la Docs API no admiten fetch con CORS; investigar alternativa (proxy, export como imagen, etc.)