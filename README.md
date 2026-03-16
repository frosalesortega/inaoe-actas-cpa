# Buscador CPA — INAOE

Plataforma de búsqueda de acuerdos y temas del Colegio del Personal Académico (CPA) del INAOE.

## Cómo funciona

**Para los miembros del CPA:** Entran al sitio web y buscan por palabras clave. Pueden filtrar por tipo y rango de fechas, y descargar las actas originales.

**Para el administrador:** Sube el PDF/Word del acta → la IA extrae los datos automáticamente → revisa → confirma. Todo queda visible para todos.

---

## Despliegue

### 1. Subir a GitHub
Crea un repo (ej: `cpa-buscador-inaoe`) y sube todos los archivos.

### 2. Token de GitHub
En [github.com/settings/tokens](https://github.com/settings/tokens?type=beta) → Fine-grained token → permisos Contents: Read and write → solo el repo del buscador.

### 3. Netlify
[netlify.com](https://netlify.com) → Import from GitHub → Publish: `public`, Functions: `netlify/functions`.

### 4. API key de Gemini
En [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key. Gratis, sin tarjeta de crédito.

### 5. Variables de entorno en Netlify

| Variable | Valor |
|----------|-------|
| `GITHUB_TOKEN` | Token de GitHub |
| `GITHUB_REPO` | `tu-usuario/cpa-buscador-inaoe` |
| `ADMIN_PASSWORD` | `CPA2026!` |
| `GEMINI_API_KEY` | Key de Google AI Studio |

Redeploy después de agregarlas.

---

## Flujo del administrador

### Automático (recomendado)
1. Panel admin → **Subir acta** → seleccionar PDF/Word
2. Clic en **Procesar con IA** (~10-15 seg)
3. Revisar previsualización → **Confirmar**
4. El archivo se renombra automáticamente (ej: `CPA-2025-08-28.pdf`)

### Manual (respaldo)
1. Panel admin → **Agregar manualmente** → adjuntar archivo
2. Generar JSON con cualquier IA (ChatGPT, Gemini, Claude, Grok)
3. Pegar JSON → Validar → Confirmar

---

## Estructura
```
cpa-buscador/
├── public/
│   ├── index.html
│   ├── logo_CPA.jpg
│   └── data/
│       ├── actas.json
│       └── archivos/          ← PDFs/Words originales
├── netlify/
│   └── functions/
│       ├── process-acta.js    ← Procesamiento con Gemini
│       └── save-actas.js      ← Guardado en GitHub
├── package.json
├── netlify.toml
└── README.md
```

## Costos
Todo gratuito: Netlify, GitHub, Gemini API (free tier: 1,000 req/día, solo usas ~1/mes).

## Contraseña admin
`CPA2026!` — cambiar en variable de entorno `ADMIN_PASSWORD`.
