# 🚀 Guía Rápida: Configurar MCP y Ver los Tools en Acción

## 📋 Problema Actual

Tu chat muestra:
```
Gemini: No function calling (disabled or no tools available)
```

Esto significa que **NO hay servidores MCP configurados**.

## ✅ Solución en 3 Pasos

### **Paso 1: Configura un Servidor MCP**

#### **Opción A: Filesystem (Recomendado para empezar)**

1. Abre **Settings** en Obsidian
2. Ve a **Obsidian AI Agent**
3. Scroll hasta **MCP Servers**
4. Click **Add Server**
5. Configura:

```
Name: filesystem
Command: npx
Arguments: -y, @modelcontextprotocol/server-filesystem, C:\Users\the_l\Documents
```

6. Click fuera para guardar

#### **Opción B: Brave Search (Para búsquedas web)**

1. Obtén API key gratis: https://brave.com/search/api/
2. **Add Server:**

```
Name: brave-search
Command: npx  
Arguments: -y, @modelcontextprotocol/server-brave-search
Env: (click en campo) BRAVE_API_KEY=tu_api_key_aqui
```

### **Paso 2: Activa Function Calling**

1. En **Settings → Obsidian AI Agent**
2. **Active AI Provider**: Gemini
3. **Enable Function Calling for MCP**: ✅ ON
4. Guarda

### **Paso 3: Recarga el Plugin**

1. **Ctrl+P** → "Reload app without saving"
2. O cierra y abre Obsidian

## 🎨 Indicador Visual

Ahora verás en el header del chat:

```
┌────────────────────────────────┐
│ AI AGENT  [MCP: 7 tools] 🟢   │ ← Verde = Activo
└────────────────────────────────┘
```

O si no está configurado:

```
┌────────────────────────────────┐
│ AI AGENT  [MCP: Off] ⚫         │ ← Gris = Inactivo
└────────────────────────────────┘
```

**Hover sobre el badge** para ver qué servidores están corriendo.

## 🔍 Lo Que Verás en Consola

### **Al Iniciar el Plugin:**

```javascript
"MCP Server filesystem started with 7 tools"
"Gemini: Configured 7 tools from MCP servers"
```

### **Al Enviar un Mensaje:**

```javascript
"=== DEBUG CONTEXT START ==="
"Active provider: gemini"
"Current model: gemini-2.5-flash-latest"
"=== DEBUG CONTEXT END ==="

"Gemini: Using 7 MCP tools"  // ← Ahora verás esto
```

### **Cuando Gemini Usa una Herramienta:**

```javascript
"Executing tool read_file on filesystem with params:"
{
  path: "C:\\Users\\the_l\\Documents\\ejemplo.txt"
}
```

## 💬 Ejemplo de Conversación

**Antes (Sin MCP):**
```
Tú: "Lee el archivo ejemplo.txt"
Gemini: "Lo siento, no puedo acceder a archivos en tu sistema."
```

**Después (Con MCP):**
```
Tú: "Lee el archivo ejemplo.txt de mi carpeta Documents"
Gemini: [Thinking...]
       [Using tool: read_file]
       "He leído el archivo. Contiene: [contenido del archivo]"
```

## 🎯 Herramientas Disponibles

### **Filesystem Server** (7 tools):
- `read_file` - Leer archivos
- `write_file` - Escribir archivos
- `list_directory` - Listar directorios
- `create_directory` - Crear directorios
- `move_file` - Mover archivos
- `search_files` - Buscar archivos
- `get_file_info` - Info de archivo

### **Brave Search Server** (1 tool):
- `brave_web_search` - Buscar en la web

### **Memory Server** (3 tools):
- `store_memory` - Guardar información
- `recall_memory` - Recuperar información
- `list_memories` - Listar memorias

## 🐛 Troubleshooting

### **"MCP: Off" permanece gris**

**Causa**: Servidores no se iniciaron
**Solución**:
1. Abre **Developer Tools** (Ctrl+Shift+I)
2. Ve a **Console**
3. Busca errores tipo:
   ```
   Failed to start MCP server filesystem: Error: ...
   ```
4. Verifica que `npx` esté instalado: `npx --version`

### **"Gemini: No function calling"**

**Causa**: Function calling desactivado
**Solución**:
1. Settings → Gemini Settings
2. ✅ Enable Function Calling for MCP
3. Recarga plugin

### **Tools no se ejecutan**

**Causa**: Permisos o path incorrecto
**Solución**:
1. Verifica que el path existe: `C:\Users\the_l\Documents`
2. Verifica permisos de lectura/escritura
3. Prueba con un path más simple primero: `C:\temp`

## 📊 Logs Completos del Flujo

```javascript
// 1. Inicio
"MCP Server filesystem started with 7 tools"
"Gemini: Configured 7 tools from MCP servers"

// 2. Usuario envía mensaje
"=== DEBUG CONTEXT START ==="
"Active provider: gemini"
"New message context: { originalMessage: '...', ... }"
"=== DEBUG CONTEXT END ==="

// 3. Gemini decide usar tool
"Gemini: Using 7 MCP tools"
"Received streaming message: { type: 'tool_use', ... }"

// 4. Ejecuta tool
"Executing tool read_file on filesystem with params: {path: '...'}"

// 5. Resultado
"Tool execution result: { content: '...', success: true }"

// 6. Gemini responde
"Received streaming message: { type: 'text', content: '...' }"
```

## 🎬 Demostración Visual

### **En el Chat Verás:**

```
┌─────────────────────────────────────┐
│ You                        00:15:23 │
│ Lee ejemplo.txt                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Thinking...                         │
│ [Click para expandir] ▼             │
│   Using tool: read_file             │
│   { path: "C:\\...\\ejemplo.txt" } │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Gemini                     00:15:25 │
│ He leído el archivo ejemplo.txt.    │
│ Contiene el siguiente texto: ...    │
└─────────────────────────────────────┘
```

## 🚀 Servidores MCP Populares

### **Para Desarrollo:**
```bash
# Git operations
npx @modelcontextprotocol/server-git /path/to/repo

# PostgreSQL
npx @modelcontextprotocol/server-postgres postgresql://user:pass@localhost/db

# GitHub
npx @modelcontextprotocol/server-github
# Env: GITHUB_PERSONAL_ACCESS_TOKEN=...
```

### **Para Productividad:**
```bash
# Google Drive
npx @modelcontextprotocol/server-gdrive
# Env: GDRIVE_CLIENT_ID=..., GDRIVE_CLIENT_SECRET=...

# Slack
npx @modelcontextprotocol/server-slack
# Env: SLACK_BOT_TOKEN=...
```

### **Para Investigación:**
```bash
# Puppeteer (web scraping)
npx @modelcontextprotocol/server-puppeteer

# Fetch (HTTP requests)
npx @modelcontextprotocol/server-fetch
```

## ✅ Checklist Final

Antes de probar, verifica:

- [ ] ✅ Servidor MCP agregado en Settings
- [ ] ✅ Command es `npx`
- [ ] ✅ Arguments correctos (separados por comas)
- [ ] ✅ Path existe y tiene permisos
- [ ] ✅ Function Calling activado (Gemini)
- [ ] ✅ Plugin recargado
- [ ] ✅ Badge muestra "MCP: X tools" (verde)
- [ ] ✅ Console muestra "MCP Server ... started"

## 🎉 Resultado Esperado

Una vez todo configurado:

✅ **Badge verde**: "MCP: 7 tools"  
✅ **Console**: "Gemini: Using 7 MCP tools"  
✅ **Chat**: Tools se ejecutan y muestran resultados  
✅ **Gemini**: Usa las herramientas automáticamente  

¡Ahora tienes un asistente de IA con superpoderes! 🚀

