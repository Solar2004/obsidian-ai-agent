# Nodepad — Sistema de Pensamiento Espacial con IA Autónoma

## Índice

1. [¿Qué es Nodepad?](#qué-es-nodepad)
2. [Diferencia con el modo Chat](#diferencia-con-el-modo-chat)
3. [Arquitectura general](#arquitectura-general)
4. [Los 14 tipos de nota](#los-14-tipos-de-nota)
5. [Flujo completo de una nota](#flujo-completo-de-una-nota)
6. [NodepadEnrichService — Enriquecimiento automático](#nodepadEnrichservice--enriquecimiento-automático)
7. [NodepadGhostService — Síntesis emergente](#nodepadghostservice--síntesis-emergente)
8. [NoteCard — Renderizado de notas](#notecard--renderizado-de-notas)
9. [KanbanView — Vista por categorías](#kanbanview--vista-por-categorías)
10. [NodepadView — La vista principal](#nodepadview--la-vista-principal)
11. [Integración en el plugin (main.ts)](#integración-en-el-plugin-maints)
12. [Persistencia de datos](#persistencia-de-datos)
13. [Atajos y sintaxis especial](#atajos-y-sintaxis-especial)
14. [Archivos creados y modificados](#archivos-creados-y-modificados)

---

## ¿Qué es Nodepad?

Nodepad es un modo de pensamiento espacial donde **la IA trabaja sola en el fondo** mientras el usuario simplemente escribe notas. No hay chat, no hay preguntas, no hay conversación. El usuario escribe una idea y la IA:

1. La **clasifica** automáticamente en uno de 14 tipos
2. Le añade una **anotación** de 2–4 frases que aporta algo nuevo (no resume, sino que añade un contraargumento, tensión, concepto adyacente o implicación lógica)
3. **Detecta conexiones** con otras notas del canvas
4. Cuando hay suficientes notas diversas, **sintetiza una tesis emergente** que une tensiones entre categorías distintas

Está basado en el proyecto open-source [nodepad](https://github.com/mskayyali/nodepad) de Saleh Kayyali, adaptado para funcionar dentro de Obsidian como un plugin nativo.

---

## Diferencia con el modo Chat

| Modo Chat | Modo Nodepad |
|-----------|-------------|
| El usuario hace preguntas, la IA responde | El usuario escribe notas, la IA trabaja sola |
| Conversación secuencial | Canvas espacial |
| La IA está al centro de la atención | La IA gana su lugar siendo útil en silencio |
| Historial de mensajes | Bloques de notas con tipos y anotaciones |
| Una sola sesión lineal | Proyectos con múltiples espacios |

---

## Arquitectura general

```
obsidian-ai-agent/
├── NodepadView.ts                    ← Vista principal de Obsidian (nueva)
├── main.ts                           ← Registro del view + ribbon icon (modificado)
├── styles.css                        ← Variables CSS de colores por tipo (modificado)
└── services/
    └── nodepad/
        ├── NodepadEnrichService.ts   ← Servicio de enriquecimiento IA (nuevo)
        ├── NodepadGhostService.ts    ← Servicio de síntesis emergente (nuevo)
        ├── NoteCard.ts               ← Componente visual de nota (nuevo)
        └── KanbanView.ts             ← Vista kanban (nuevo)
```

El flujo de datos es unidireccional:

```
Usuario escribe nota
       ↓
NodepadView.addNote()
       ↓
NodepadEnrichService.enrich()  ←── llama a la API del proveedor activo
       ↓
Resultado: contentType + category + annotation + influencedBy
       ↓
NodepadView actualiza estado y re-renderiza
       ↓
(si hay ≥5 notas de ≥2 categorías)
       ↓
NodepadGhostService.generateGhost()  ←── llama a la API
       ↓
GhostPanel muestra la tesis emergente
```

---

## Los 14 tipos de nota

Cada nota se clasifica en uno de estos tipos. La clasificación la hace la IA, aunque hay un detector heurístico local que da un resultado provisional mientras la IA trabaja:

| Tipo | Color | Descripción | Estilo visual |
|------|-------|-------------|---------------|
| `entity` | Índigo | Concepto, persona, lugar, cosa (≤3 palabras) | Normal |
| `claim` | Ámbar | Afirmación directa (4–25 palabras) | Barra de confianza |
| `question` | Púrpura | Empieza con `?` o termina con `?` | Normal |
| `task` | Verde | Acción a realizar, TODO | Checkbox |
| `idea` | Naranja | "What if...", "Imagine...", especulación | Normal |
| `reference` | Azul | URLs, citas bibliográficas | Normal |
| `quote` | Rosa | Empieza con comillas | Blockquote |
| `definition` | Teal | "X is defined as...", "X means..." | Blockquote |
| `opinion` | Violeta | "I think...", "I believe..." | Itálica |
| `reflection` | Cian | "Looking back...", "In retrospect..." | Itálica muted |
| `narrative` | Lima | Bloques largos (>25 palabras) | Normal |
| `comparison` | Amarillo | "X vs Y", "compared to..." | Normal |
| `thesis` | Dorado | Solo para síntesis emergentes solidificadas | Acento especial |
| `general` | Gris | Fallback cuando nada más encaja | Normal |

### Detector heurístico local

Antes de llamar a la IA, `detectContentType()` en `NodepadEnrichService.ts` hace una clasificación rápida con regex para mostrar algo inmediatamente en la UI:

```typescript
// Ejemplos de detección heurística:
"¿Cuál es la diferencia?"     → question  (termina en ?)
"https://example.com"          → reference (es una URL)
"TODO: llamar al cliente"      → task      (empieza con TODO)
'"La vida es sueño" - Calderón' → quote    (empieza con comillas)
"X vs Y en términos de coste"  → comparison (contiene "vs")
"Recursividad"                 → entity    (≤3 palabras)
```

Para tipos ambiguos (`claim`, `idea`, `reflection`...) se muestra `general` mientras la IA decide, evitando un "salto de clasificación" visible en la UI.

---

## Flujo completo de una nota

### 1. El usuario escribe y pulsa Enter

```
> La atención es un recurso finito que el capitalismo monetiza
```

### 2. Se crea el bloque provisional

```typescript
const newBlock: NoteBlock = {
  id: "a3f7bc12",
  text: "La atención es un recurso finito...",
  timestamp: Date.now(),
  contentType: "general",  // provisional mientras enriquece
  isEnriching: true,
};
```

La tarjeta aparece inmediatamente en la UI con el spinner "Enriching...".

### 3. NodepadEnrichService llama a la API

Se construye este prompt de sistema:

```
You are a sharp research partner embedded in a thinking tool called nodepad.

Add a concise annotation that augments the note — not a summary.
Surface what the user likely doesn't know yet: a counter-argument,
a relevant framework, a key tension, an adjacent concept, or a
logical implication.

Types: claim · question · task · idea · entity · quote · reference ·
definition · opinion · reflection · narrative · comparison · general · thesis
```

Y el mensaje de usuario incluye:
- Directiva de idioma: `[RESPOND IN: Spanish]` (detectado automáticamente)
- La nota envuelta en tags: `<note_to_enrich>La atención es...</note_to_enrich>`
- Contexto de otras notas del canvas (hasta 15 notas recientes)

La API devuelve JSON estructurado:

```json
{
  "contentType": "claim",
  "category": "economía de la atención",
  "annotation": "El concepto lo sistematizó Herbert Simon en 1971, mucho antes de las redes sociales. La paradoja central: cuanta más información disponible, más escasa la atención — lo que convierte su captura en un negocio de suma cero entre plataformas.",
  "confidence": 82,
  "influencedByIndices": [2, 5],
  "isUnrelated": false,
  "mergeWithIndex": null
}
```

### 4. La nota se actualiza en la UI

La tarjeta ahora muestra:
- Badge: **CLAIM** (en ámbar)
- Texto original
- Anotación de la IA en cursiva debajo
- Barra de confianza al 82%
- Tag `#economía de la atención`

### 5. Se verifican condiciones para síntesis

Si hay ≥5 notas enriquecidas de ≥2 categorías distintas y no se generó una tesis en los últimos 5 minutos, se dispara `NodepadGhostService`.

---

## NodepadEnrichService — Enriquecimiento automático

**Archivo:** `services/nodepad/NodepadEnrichService.ts`

### Responsabilidades

- Construir el prompt correcto según el proveedor activo
- Detectar el idioma del texto (soporte para árabe, hebreo, chino/japonés/coreano, ruso, hindi, español, inglés)
- Manejar la respuesta JSON (con parseo robusto para respuestas truncadas o mal formadas)
- Resolver los `influencedByIndices` de vuelta a IDs estables de bloque

### Compatibilidad de proveedores

| Proveedor | JSON Schema estricto | Notas |
|-----------|---------------------|-------|
| OpenRouter | ✓ (`json_schema`) | Recomendado, acceso a todos los modelos |
| Gemini | ✓ (`json_schema`) | API compatible con OpenAI |
| Claude | ✗ (`json_object`) | Usa hint en el prompt |

### Parseo robusto de JSON

Los modelos a veces devuelven respuestas truncadas o con escapes incorrectos. El servicio tiene tres capas de parseo:

```typescript
// Capa 1: JSON.parse normal
JSON.parse(candidate)

// Capa 2: Buscar bloque de código o llaves externas
extractJsonCandidate(content)  // busca ```json...``` o { ... }

// Capa 3: Regex field-by-field como último recurso
coerceLooseEnrichResult(content)  // extrae campo a campo
```

### Fusión de notas duplicadas

Si la IA devuelve `mergeWithIndex !== null`, la nota nueva se fusiona con una existente en lugar de crearse como bloque separado. Esto evita duplicados en el canvas.

### Agrupación de tareas

Si la IA clasifica una nota como `task` y ya existe un bloque de tipo `task`, la nueva tarea se añade como **subtarea** del bloque existente en lugar de crear una tarjeta nueva.

---

## NodepadGhostService — Síntesis emergente

**Archivo:** `services/nodepad/NodepadGhostService.ts`

### ¿Cuándo se activa?

Se comprueban estas condiciones después de cada enriquecimiento exitoso:

```typescript
const conditions = [
  enrichedBlocks.length >= 5,          // al menos 5 notas enriquecidas
  ghostNotes.length < 5,               // máximo 5 tesis en el panel
  !generatingGhost.has(projectId),     // no hay otra generación en curso
  enrichedBlocks.length >= lastCount + 5,  // al menos 5 notas nuevas desde la última vez
  Date.now() - lastTime >= 5 * 60_000, // al menos 5 minutos entre síntesis
  categories.size >= 2,                // al menos 2 categorías distintas
];
```

### Selección de contexto (buildGhostContext)

No se mandan todas las notas a la IA — se construye una ventana de contexto sesgada hacia la recencia y la diversidad:

```
1. Las 4 notas más recientes (pensamiento más fresco)
2. La nota más reciente de cada categoría no representada aún
3. Relleno hasta 10 notas con las siguientes más recientes
```

Esto fuerza al modelo a ver material de distintas categorías en lugar de un muro del tema dominante.

### El prompt de síntesis

```
Find the unspoken bridge — an insight that arises from the tension
or intersection between different topic areas.

Rules:
1. Find a CROSS-CATEGORY connection (not the dominant theme)
2. Look for tensions, paradoxes, inversions
3. Be additive: say something the notes imply but do not state
4. 15–25 words maximum
5. Return: {"text": "...", "category": "..."}
```

### Deduplicación

Se pasan las últimas 5 tesis generadas al modelo con instrucción de evitar síntesis semánticamente similares. Esto evita que el panel se llene de variaciones del mismo insight.

### El panel de síntesis

Las tesis aparecen en el panel lateral derecho con dos opciones:
- **Solidify** — la convierte en una nota `thesis` real que se enriquece a su vez
- **Dismiss** — la descarta sin añadirla al canvas

---

## NoteCard — Renderizado de notas

**Archivo:** `services/nodepad/NoteCard.ts`

Renderiza un `NoteBlock` como un `HTMLElement` nativo (sin React, sin frameworks), compatible con el sistema de vistas de Obsidian.

### Estructura de una tarjeta

```
┌─────────────────────────────────────────────┐
│ CLAIM                    14:32  📍  ↻  ✕    │  ← Header (color del tipo)
├─────────────────────────────────────────────┤
│ La atención es un recurso finito que el     │
│ capitalismo monetiza                        │  ← Texto de la nota
│                                             │
│ AI Insight                                  │
│ El concepto lo sistematizó Herbert Simon    │
│ en 1971...                                  │  ← Anotación de la IA
│                                             │
│ Confianza  ████████████░░░  82%             │  ← Barra de confianza (solo claims)
├─────────────────────────────────────────────┤
│ #economía de la atención              #a3f7 │  ← Footer
└─────────────────────────────────────────────┘
```

### Estados visuales

| Estado | Visual |
|--------|--------|
| Enriqueciendo | Spinner rotando + texto "Enriching..." |
| Error sin API key | Banner rojo con enlace a Settings |
| Error de red/modelo | Banner rojo con mensaje del error + "Double-click to retry" |
| Nota normal | Tarjeta completa con anotación |
| Tarea con subtareas | Lista de checkboxes |

---

## KanbanView — Vista por categorías

**Archivo:** `services/nodepad/KanbanView.ts`

Agrupa las notas en columnas por `contentType`. Solo muestra columnas que tienen al menos una nota.

```
┌─── CLAIM (3) ───┬─── IDEA (2) ────┬─── QUESTION (1) ─┐
│                 │                 │                   │
│  [NoteCard]     │  [NoteCard]     │  [NoteCard]       │
│  [NoteCard]     │  [NoteCard]     │                   │
│  [NoteCard]     │                 │                   │
│                 │                 │                   │
└─────────────────┴─────────────────┴───────────────────┘
```

Las columnas se ordenan poniendo `thesis` primero (es el tipo más sintético), luego por cantidad de notas descendente. Se actualiza completo cuando cambia el estado.

---

## NodepadView — La vista principal

**Archivo:** `NodepadView.ts`

Es un `ItemView` de Obsidian que contiene todo el sistema. Se divide en estas zonas:

```
┌────────────────────────────────────────────────────────────┐
│  My Space  · 12 notes · 10 enriched    [⊞ Tiling] [✦ (2)] │  ← Status bar
├──────────────────────────────────────────────────┬─────────┤
│                                                  │ ✦ SYNTH │
│                                                  │         │
│        Área principal de notas                   │ "La     │
│        (Tiling o Kanban)                         │ atención │
│                                                  │ ..."    │
│                                                  │         │
│                                                  │ [+] [✕] │
├──────────────────────────────────────────────────┴─────────┤
│  >  [Escribe una nota aquí...                    ] [Add]   │  ← Input bar
└────────────────────────────────────────────────────────────┘
```

### Status bar

- Nombre del proyecto activo
- Contador: `N notes · M enriched`
- Botón de vista: alterna entre `⊞ Tiling` y `☰ Kanban`
- Botón de síntesis: `✦ Synthesis (N)` — se vuelve dorado cuando hay tesis disponibles

### Tiling (vista por defecto)

Disposición en columnas tipo masonry usando CSS `columns`. Las notas se ordenan:
1. Primero las notas **pinneadas**
2. Luego por **timestamp descendente** (las más recientes arriba)

### Input bar

Acepta texto libre. Al pulsar Enter o el botón Add:
1. Crea el bloque provisional inmediatamente
2. Lo renderiza con estado "Enriching..."
3. Lanza el enriquecimiento en background

**Sintaxis especial de tipo inline:**
```
#claim La tierra tiene 4.500 millones de años
#task Revisar la bibliografía antes del viernes
#idea ¿Y si el tiempo libre fuera una forma de producción?
```

### Ghost panel

Panel deslizante desde la derecha (260px de ancho). Se abre/cierra con el botón `✦ Synthesis`. Muestra las tesis emergentes con opciones de solidificar o descartar.

### Gestión de proyectos

El sistema soporta múltiples proyectos (espacios), cada uno con sus propias notas y tesis. Aunque actualmente la UI solo muestra el proyecto activo, el modelo de datos está preparado para un selector de proyectos.

---

## Integración en el plugin (main.ts)

### Cambios realizados

```typescript
// 1. Import del nuevo view
import { NodepadView, VIEW_TYPE_NODEPAD } from './NodepadView';

// 2. Registro del view type
this.registerView(
  VIEW_TYPE_NODEPAD,
  (leaf) => new NodepadView(leaf, this.settings)
);

// 3. Ribbon icon en la barra lateral de Obsidian
this.addRibbonIcon('layout-grid', 'Open Nodepad', () => {
  this.activateNodepadView();
});

// 4. Comando de paleta
this.addCommand({
  id: 'open-nodepad',
  name: 'Open Nodepad',
  callback: () => this.activateNodepadView(),
});

// 5. Nuevo método que abre en tab completo (no en sidebar)
async activateNodepadView() {
  // Busca un leaf existente o crea uno nuevo
  // Abre en tab completo (getLeaf(true)) para máximo espacio
}

// 6. Limpieza al descargar el plugin
this.app.workspace.detachLeavesOfType(VIEW_TYPE_NODEPAD);
```

### Por qué un tab completo y no el sidebar

El chat se abre en el sidebar derecho porque es una herramienta de acompañamiento. Nodepad necesita más espacio (canvas espacial), por eso se abre en un **tab completo** con `getLeaf(true)`.

---

## Persistencia de datos

Los datos se guardan en `localStorage` bajo la clave `nodepad-projects-v1`. Esto tiene varias consecuencias:

- **Persisten** entre sesiones de Obsidian
- **Son por navegador/dispositivo** (no se sincronizan con el vault)
- **No ocupan espacio en el vault** ni crean archivos markdown

### Estructura del dato guardado

```typescript
interface NodepadProject {
  id: string;                    // ID único del proyecto
  name: string;                  // Nombre del espacio
  blocks: NoteBlock[];           // Todas las notas
  ghostNotes: GhostNote[];       // Tesis emergentes pendientes
  lastGhostBlockCount?: number;  // Cuántas notas había en la última síntesis
  lastGhostTimestamp?: number;   // Cuándo fue la última síntesis
  lastGhostTexts?: string[];     // Textos de síntesis recientes (para deduplicar)
}
```

El guardado se hace en cada operación que modifica el estado (`updateActiveProject` llama a `saveProjects()` siempre).

---

## Atajos y sintaxis especial

### Tipos inline

Prefija la nota con `#tipo` para forzar una clasificación:

```
#claim  texto    → Fuerza tipo claim
#task   texto    → Fuerza tipo task
#idea   texto    → Fuerza tipo idea
#quote  texto    → Fuerza tipo quote
... (todos los 14 tipos son válidos)
```

### Botones de la tarjeta

| Botón | Acción |
|-------|--------|
| 📍 / 📌 | Pinear/despinear (las pinneadas van primero en Tiling) |
| ↻ | Reintentar enriquecimiento (aparece en estado error) |
| ✕ | Borrar la nota permanentemente |

### Panel de síntesis

| Botón | Acción |
|-------|--------|
| + Solidify | Convierte la tesis en una nota real de tipo `thesis` y la enriquece |
| Dismiss | Descarta la tesis sin añadirla al canvas |

---

## Archivos creados y modificados

### Archivos nuevos

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `NodepadView.ts` | ~430 | Vista principal — toda la UI y la lógica de estado |
| `services/nodepad/NodepadEnrichService.ts` | ~250 | Servicio de enriquecimiento IA |
| `services/nodepad/NodepadGhostService.ts` | ~120 | Servicio de síntesis emergente |
| `services/nodepad/NoteCard.ts` | ~560 | Componente visual de nota (DOM puro) |
| `services/nodepad/KanbanView.ts` | ~150 | Vista kanban agrupada por tipo |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `main.ts` | +registro del view, +ribbon icon, +comando, +método `activateNodepadView`, +detach en unload |
| `styles.css` | +variables CSS de colores por tipo, +animación spin, +estilos de `.nodepad-*` |
| `tsconfig.json` | +exclusión de `nodepad-main/` para evitar conflictos con Next.js |
| `services/ConversationManager.ts` | +fix de 3 errores TypeScript preexistentes (null check, array cast, role type) |

---

## Limitaciones actuales y próximos pasos

### Limitaciones

- **Sin selector de proyectos en UI** — el modelo de datos soporta múltiples proyectos pero la UI solo muestra el primero
- **Sin vista Graph** — la vista de grafo de nodos con D3.js no fue implementada (requeriría incluir D3 como dependencia)
- **Sin URL fetching** — el enriquecimiento de notas tipo `reference` (URLs) no hace fetch del contenido de la página (en nodepad original esto se hacía via un endpoint Next.js server-side para evitar CORS)
- **Sin edición inline** — las notas no son editables después de creadas
- **Sin exportación** — no implementado el export a `.md` ni el formato `.nodepad`

### Próximos pasos sugeridos

1. **Vista Graph** con D3.js — nodos conectados por `influencedBy`
2. **Selector de proyectos** en el status bar
3. **Edición de notas** con double-click
4. **Exportar a Obsidian notes** — convertir el canvas en notas `.md` en el vault
5. **Fetch de URLs** — usar el `requestUrl` de la API de Obsidian (que no tiene restricciones CORS) para enriquecer referencias
