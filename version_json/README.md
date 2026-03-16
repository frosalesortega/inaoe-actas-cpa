# Buscador CPA — INAOE

Plataforma de búsqueda de acuerdos y temas del Colegio del Personal Académico (CPA) del INAOE.

## Cómo funciona

**Para los miembros del CPA:** Entran al sitio web y buscan por palabras clave (nombres, temas, áreas, votaciones). Pueden filtrar por tipo y rango de fechas.

**Para el administrador:** Después de cada sesión, usa cualquier IA para convertir el acta (PDF o Word) a JSON y lo sube desde el panel admin.

---

## Despliegue paso a paso

### 1. Subir a GitHub

1. Crea un repositorio en [github.com](https://github.com) (ej: `cpa-buscador-inaoe`)
2. Sube todos los archivos de este proyecto

### 2. Crear un token de GitHub

1. Ve a [github.com/settings/tokens](https://github.com/settings/tokens?type=beta)
2. **Generate new token** (Fine-grained)
3. Configura:
   - **Token name:** `CPA Buscador`
   - **Expiration:** 1 año
   - **Repository access:** Solo el repo `cpa-buscador-inaoe`
   - **Permissions → Contents:** `Read and write`
4. Copia el token (`github_pat_...`)

### 3. Desplegar en Netlify

1. [netlify.com](https://netlify.com) → **Add new site** → **Import from GitHub**
2. Selecciona el repositorio
3. Publish directory: `public`, Functions directory: `netlify/functions`
4. **Deploy**

### 4. Variables de entorno en Netlify

En **Site configuration → Environment variables**, agrega:

| Variable | Valor |
|----------|-------|
| `GITHUB_TOKEN` | El token del paso 2 |
| `GITHUB_REPO` | `tu-usuario/cpa-buscador-inaoe` |
| `ADMIN_PASSWORD` | `CPA2026!` (o la que prefieras) |

Haz un redeploy después de agregarlas.

---

## Flujo del administrador

1. Abrir cualquier IA (ChatGPT, Gemini, Claude, Grok)
2. Copiar el prompt del panel admin (botón "Copiar prompt")
3. Pegar el prompt + texto del acta
4. Copiar el JSON generado
5. Panel admin → Pegar → Validar → Confirmar
6. El sitio se actualiza para todos en ~1 minuto

### Nota sobre PDFs escaneados

Si el PDF es una imagen escaneada (no tiene texto seleccionable), hay dos opciones:
- Usar el archivo Word (.docx) si está disponible
- Subir el PDF directamente a Claude o ChatGPT, que pueden leer imágenes con OCR

---

## Estructura

```
cpa-buscador/
├── public/
│   ├── index.html
│   ├── logo_CPA.jpg
│   └── data/
│       └── actas.json
├── netlify/
│   └── functions/
│       └── save-actas.js
├── netlify.toml
└── README.md
```

## Contraseña admin por defecto

`CPA2026!` — Cambiar en la variable de entorno `ADMIN_PASSWORD` de Netlify y en `index.html`.

## Costos

Todo gratuito: Netlify (free tier), GitHub (free), IA (uso manual).
