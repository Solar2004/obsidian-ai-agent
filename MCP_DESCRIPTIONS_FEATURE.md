# 🎯 MCP Server Descriptions - Help AI Know When to Use Tools

## 📋 El Problema

Antes, Gemini tenía las herramientas pero no sabía **cuándo** usarlas:

```
Usuario: "busca en internet usando el DeepResearch que tienes como herramienta, ejecutalo"
Gemini: "Por supuesto, necesito saber qué tema quieres investigar con Deep Research."
```

Gemini no entendía que **deep_research** era para buscar en internet.

## ✅ La Solución: Descripciones de Servidores MCP

Ahora cada servidor MCP puede tener una **descripción** que explica para qué sirve. Esta descripción se incluye en el `system_instruction` de Gemini.

### **Cambios Realizados**

#### **1. Campo `description` en MCPServer (types.ts)**

```typescript
export interface MCPServer {
	name: string;
	description?: string; // ← NUEVO: Descripción de lo que hace este servidor
	command: string;
	args?: string[];
	env?: Record<string, string>;
}
```

#### **2. UI Mejorado (SettingsTab.ts)**

Ahora cada servidor MCP tiene su propio **textarea** para la descripción:

```
┌─────────────────────────────────────┐
│ Server 1: DeepResearch              │
│ ┌─ Name ──────────────────────────┐ │
│ │ DeepResearch                     │ │
│ └──────────────────────────────────┘ │
│ ┌─ Description ───────────────────┐ │
│ │ Use for web research and finding│ │
│ │ information online              │ │
│ └──────────────────────────────────┘ │
│ ┌─ Command ───────────────────────┐ │
│ │ mcp-deepwebresearch             │ │
│ └──────────────────────────────────┘ │
│ ┌─ Arguments ─────────────────────┐ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### **3. System Instruction Dinámico (GeminiService.ts)**

El system instruction ahora se genera dinámicamente:

**Antes**:
```
You are a helpful AI assistant with access to 33 tools...
```

**Ahora**:
```
You are a helpful AI assistant with access to 33 tools through MCP servers.

**Available MCP Servers:**

• **Playwright**: Use for browser automation, web page interaction, taking screenshots, and testing web applications

• **DeepResearch**: Use for web research and finding information online

• **memory**: Use for storing and recalling information between conversations

**IMPORTANT INSTRUCTIONS:**
1. You MUST use the available tools to complete user requests
2. Never say "I cannot" do something if you have a tool that can do it
3. Always attempt to use the appropriate tool first before declining
4. The tools are your actual capabilities - use them actively!

**Common Use Cases:**
- File operations → use filesystem tools
- Web searches and research → use search/research tools
- Storing information → use memory tools
...
```

## 🎨 Ejemplos de Descripciones

### **Filesystem Server**
```
Use for file operations like reading, writing, creating, deleting, and listing files and directories in the local filesystem.
```

### **Brave Search**
```
Use for searching the web to find current information, news, articles, and general knowledge not in your training data.
```

### **DeepResearch**
```
Use for in-depth web research, finding information about specific topics, events, or questions that require searching multiple sources.
```

### **Memory Server**
```
Use for storing information that should be remembered between conversations, like user preferences, important facts, or context that needs to persist.
```

### **Playwright**
```
Use for browser automation tasks like navigating websites, clicking buttons, filling forms, taking screenshots, and testing web applications.
```

### **Git Server**
```
Use for git operations like checking status, committing changes, creating branches, and managing version control in repositories.
```

### **PostgreSQL**
```
Use for database operations like running SQL queries, creating tables, inserting data, and managing PostgreSQL databases.
```

## 📊 Cómo Funciona

### **Paso 1: Usuario Configura Descripción**
```
Settings → MCP Servers → Server 2: DeepResearch
Description: "Use for web research and finding information online"
```

### **Paso 2: Plugin Inicia Servidor**
```javascript
await this.mcpManager.startServer({
  name: 'DeepResearch',
  description: 'Use for web research...',
  command: 'mcp-deepwebresearch',
  args: []
});
```

### **Paso 3: Se Crea Map de Descripciones**
```javascript
const serverDescriptions = new Map();
serverDescriptions.set('DeepResearch', 'Use for web research...');
serverDescriptions.set('Playwright', 'Use for browser automation...');
```

### **Paso 4: Se Pasa a GeminiService**
```javascript
aiService.setMCPTools(mcpTools, serverDescriptions);
```

### **Paso 5: System Instruction Incluye Descripciones**
```javascript
let systemPrompt = `You are a helpful AI assistant...

**Available MCP Servers:**

• **DeepResearch**: Use for web research and finding information online
• **Playwright**: Use for browser automation...

**IMPORTANT INSTRUCTIONS:**
...`;

requestBody.system_instruction = { parts: [{ text: systemPrompt }] };
```

### **Paso 6: Gemini Entiende Cuándo Usar Cada Tool**
```
Usuario: "busca información sobre Obsidian plugins"
Gemini piensa: "DeepResearch es para web research, debo usarlo"
Gemini llama: deep_research({ query: "Obsidian plugins" })
```

## 🔍 Logs Mejorados

Ahora verás en console:

```javascript
"MCP Server DeepResearch started with 1 tool"
"MCP Server Playwright started with 15 tools"
"MCP Server memory started with 3 tools"
"Gemini: Configured 19 tools from MCP servers"

// Cuando envías mensaje:
"Gemini: Using 19 MCP tools with enhanced system instruction" // ← "enhanced"!
```

## ✏️ Cómo Configurar Tus Servidores

1. **Abre Settings** → Obsidian AI Agent → MCP Servers
2. **Para cada servidor**, agrega una descripción clara:

```
Name: filesystem
Description: Use for file operations like reading, writing, creating, deleting, and listing files and directories

Name: brave-search  
Description: Use for searching the web to find current information, news, and articles

Name: memory
Description: Use for storing information between conversations that needs to be remembered

Name: DeepResearch
Description: Use for in-depth web research and finding information about specific topics
```

3. **Recarga el plugin**
4. **Prueba con un mensaje específico**:
   - "busca en internet información sobre..."
   - "recuerda que mi nombre es..."
   - "lee el archivo..."

## 🎯 Mejores Prácticas para Descripciones

### **✅ BUENO**
```
"Use for searching the web to find current information and news"
```
- Claro
- Específico
- Dice CUÁNDO usarlo

### **❌ MALO**
```
"A search server"
```
- Vago
- No dice cuándo usarlo
- No ayuda a la IA

### **✅ MEJOR**
```
"Use for deep web research when you need to investigate topics in detail, 
find multiple sources, or answer complex questions requiring current information"
```
- Muy específico
- Casos de uso claros
- Contexto completo

## 📈 Antes vs Ahora

### **❌ ANTES (Sin Descripciones)**

```
System Instruction:
"You have access to 33 tools... use them when appropriate"

Usuario: "busca información sobre X"
Gemini: "Lo siento, necesito más contexto"
❌ No sabe qué tool usar
```

### **✅ AHORA (Con Descripciones)**

```
System Instruction:
"**Available MCP Servers:**
• **DeepResearch**: Use for web research and finding information online
• **Playwright**: Use for browser automation...
• **memory**: Use for storing information between conversations..."

Usuario: "busca información sobre X"
Gemini: "Voy a usar DeepResearch para buscar"
✅ Sabe exactamente qué tool usar
```

## 🧪 Pruebas Sugeridas

### **Test 1: DeepResearch**
```
Usuario: "busca en internet los eventos más importantes de octubre 2025"

Esperado:
✅ Gemini usa deep_research
✅ Console: "Gemini requested tool: deep_research"
✅ Console: "🔧 Executing MCP tool: deep_research"
```

### **Test 2: Memory**
```
Usuario: "recuerda que mi nombre es Juan y me gusta el café"

Esperado:
✅ Gemini usa store_memory
✅ Console: "Gemini requested tool: store_memory"
```

### **Test 3: Filesystem**
```
Usuario: "crea un archivo test.txt con el texto 'hola'"

Esperado:
✅ Gemini usa write_file
✅ Console: "Gemini requested tool: write_file"
```

## 🎉 Beneficios

1. **Mejor Comprensión**: Gemini sabe exactamente para qué sirve cada servidor
2. **Más Proactivo**: Usa tools sin que el usuario lo pida explícitamente
3. **Menos Errores**: No intenta usar el tool equivocado
4. **Más Natural**: Las conversaciones fluyen mejor
5. **Documentación Integrada**: Las descripciones sirven como documentación

## 📝 Ejemplo Completo de Configuración

```json
{
  "mcpServers": [
    {
      "name": "filesystem",
      "description": "Use for all file operations including reading, writing, creating, deleting, moving files and listing directories in the local filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]
    },
    {
      "name": "brave-search",
      "description": "Use for searching the web to find current information, news, articles, and any information not in your training data",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key-here"
      }
    },
    {
      "name": "memory",
      "description": "Use for storing information that should be remembered between conversations, such as user preferences, important facts, or context that needs to persist across sessions",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    {
      "name": "DeepResearch",
      "description": "Use for in-depth web research when you need to investigate topics thoroughly, find information from multiple sources, or answer complex questions requiring current online information",
      "command": "mcp-deepwebresearch",
      "args": []
    },
    {
      "name": "Playwright",
      "description": "Use for browser automation tasks including navigating websites, clicking elements, filling forms, taking screenshots, scraping web content, and testing web applications",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  ]
}
```

## 🚀 Resultado Final

Con las descripciones configuradas:

✅ **Gemini entiende** para qué sirve cada servidor  
✅ **Usa las herramientas** proactivamente  
✅ **Menos "I cannot"** y más ejecución  
✅ **Conversaciones más naturales**  
✅ **System instruction personalizado** para tu setup  
✅ **Mejor experiencia** para el usuario  

---

**Archivos modificados**:
- `types.ts` - Agregado campo `description` a `MCPServer`
- `SettingsTab.ts` - UI mejorado con textarea para descripciones
- `GeminiService.ts` - System instruction dinámico con descripciones
- `main.ts` - Pasa descripciones a GeminiService

**Fecha**: 2025-10-03  
**Status**: ✅ Implemented & Ready to Test

