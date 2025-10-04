# 🎯 Environment Variables + MCP Stats Display

## 📋 Nuevas Características

### **1. Soporte para Environment Variables**

Ahora puedes configurar variables de entorno para cada servidor MCP directamente desde la UI.

#### **Antes**:
```
❌ No se podían configurar env vars en la UI
❌ Solo se podía editar manualmente el JSON
```

#### **Ahora**:
```
✅ Campo dedicado para env vars en Settings
✅ Formato simple: KEY=value (una por línea)
✅ Se guarda automáticamente
```

### **2. Contador de Tools por Servidor**

Cada servidor MCP ahora muestra cuántas herramientas tiene.

#### **Antes**:
```
Server 1: filesystem
Server 2: DeepResearch
Server 3: memory
```

#### **Ahora**:
```
Server 1: filesystem (7 tools)
Server 2: DeepResearch (1 tool)
Server 3: memory (3 tools)
```

### **3. Badge MCP Mejorado**

El badge ahora muestra estadísticas completas.

#### **Antes**:
```
MCP: 33 tools
```

#### **Ahora**:
```
MCP: 3 servers, 33 tools
```

**Tooltip al hacer hover**:
```
3 server(s) running:

• filesystem: 7 tools
• DeepResearch: 1 tool
• memory: 3 tools
• Playwright: 15 tools
• discord: 7 tools

Total: 33 tools available
```

## 🎨 UI Mejorado en Settings

### **Configuración Completa de Servidor MCP**

```
┌─────────────────────────────────────────────────────────────┐
│ Server 1: discord (7 tools)                        [Remove] │
├─────────────────────────────────────────────────────────────┤
│ Name                                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ discord                                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Description                                                  │
│ Helps the AI understand when to use this server             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Use for Discord bot operations like sending messages,   │ │
│ │ reading channels, managing servers                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Command                                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ uv                                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Arguments                                                    │
│ Comma-separated arguments                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ --directory, C:\Users\...\mcp-discord, run, mcp-discord │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Environment Variables                                        │
│ One per line, format: KEY=value (e.g., DISCORD_TOKEN=...)   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ DISCORD_TOKEN=MTIwMjc2NjM2OTk3Njc0NTk4NA.Gc-GMK.tE...   │ │
│ │                                                          │ │
│ │                                                          │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📝 Ejemplos de Configuración

### **Discord Server**
```
Name: discord
Description: Use for Discord bot operations like sending messages, reading channels, managing servers
Command: uv
Arguments: --directory, C:\Users\the_l\Documents\Github\mcp-discord, run, mcp-discord
Environment Variables:
DISCORD_TOKEN=MTIwMjc2NjMSfjo9mI
```

### **Obsidian MCP Tools**
```
Name: obsidian-mcp-tools
Description: Use for Obsidian operations like creating notes, searching vault, managing tags
Command: C:\Users\the_l\Documents\Personal\.obsidian\plugins\mcp-tools\bin\mcp-server.exe
Arguments: (empty)
Environment Variables:
OBSIDIAN_API_KEY=0cfbbe483ab56518e34943944f
```

### **Filesystem with Multiple Paths**
```
Name: filesystem
Description: Use for file operations like reading, writing, creating, deleting files
Command: npx
Arguments: -y, @modelcontextprotocol/server-filesystem, C:\Users\the_l\Desktop, C:\Users\the_l\Downloads
Environment Variables: (empty)
```

### **Context7 (Upstash)**
```
Name: Context7
Description: Use for vector database operations and semantic search
Command: npx
Arguments: -y, @upstash/context7-mcp
Environment Variables: (empty)
```

### **Brave Search with API Key**
```
Name: brave-search
Description: Use for searching the web to find current information
Command: npx
Arguments: -y, @modelcontextprotocol/server-brave-search
Environment Variables:
BRAVE_API_KEY=your_brave_api_key_here
```

## 🔧 Formato de Environment Variables

### **Sintaxis**
```
KEY=value
```

- Una variable por línea
- Sin espacios alrededor del `=`
- Sin comillas (se agregan automáticamente si es necesario)

### **Ejemplos Válidos**
```
DISCORD_TOKEN=abc123xyz
OBSIDIAN_API_KEY=1234567890abcdef
BRAVE_API_KEY=BSA_xyz123
DATABASE_URL=postgresql://user:pass@localhost/db
API_ENDPOINT=https://api.example.com
DEBUG=true
PORT=3000
```

### **Ejemplos Inválidos**
```
❌ KEY = value          (espacios alrededor de =)
❌ KEY="value"          (comillas innecesarias)
❌ KEY:value            (usa = no :)
❌ export KEY=value     (no uses export)
```

## 🎯 Badge MCP - Visual

### **Estado: Inactivo**
```
┌──────────────────────────────────┐
│ AI AGENT  [MCP: Off] ⚫          │
└──────────────────────────────────┘
```
**Hover**: "No MCP servers configured. Go to Settings → MCP Servers"

### **Estado: Activo (1 servidor)**
```
┌──────────────────────────────────┐
│ AI AGENT  [MCP: 1 server, 7 tools] 🟢 │
└──────────────────────────────────┘
```
**Hover**: 
```
1 server(s) running:

• filesystem: 7 tools

Total: 7 tools available
```

### **Estado: Activo (múltiples servidores)**
```
┌──────────────────────────────────┐
│ AI AGENT  [MCP: 5 servers, 33 tools] 🟢 │
└──────────────────────────────────┘
```
**Hover**:
```
5 server(s) running:

• Playwright: 15 tools
• filesystem: 7 tools
• discord: 7 tools
• memory: 3 tools
• DeepResearch: 1 tool

Total: 33 tools available
```

## 📊 Conversión JSON → UI

Si tienes un JSON de Claude Desktop, aquí está cómo convertirlo:

### **JSON Original (Claude Desktop)**
```json
{
  "mcpServers": {
    "discord": {
      "command": "uv",
      "args": [
        "--directory",
        "C:\\Users\\the_l\\Documents\\Github\\mcp-discord",
        "run",
        "mcp-discord"
      ],
      "env": {
        "DISCORD_TOKEN": ""
      }
    }
  }
}
```

### **Configuración en UI**
```
Name: discord

Description: (agregar manualmente, ej:)
Use for Discord bot operations like sending messages, reading channels, managing servers

Command: uv

Arguments: (copiar del JSON, separado por comas)
--directory, C:\Users\the_l\Documents\Github\mcp-discord, run, mcp-discord

Environment Variables: (una por línea)
DISCORD_TOKEN=M0jS2Fc1ISfjo9mI
```

## 🧪 Testing

### **Test 1: Verificar Environment Variables**
1. Abre Settings → MCP Servers
2. Agrega un servidor con env vars (ej: Discord)
3. Agrega variables:
   ```
   DISCORD_TOKEN=test123
   ```
4. Guarda
5. Abre Developer Tools → Console
6. Busca: "MCP Server discord started"
7. ✅ Debe iniciar sin errores

### **Test 2: Verificar Tool Counts**
1. Configura 3+ servidores MCP
2. Abre Settings → MCP Servers
3. Verifica que cada servidor muestre "(X tools)"
4. Ej: "Server 1: filesystem (7 tools)"
5. ✅ El número debe coincidir con las tools del servidor

### **Test 3: Verificar Badge**
1. Con servidores MCP corriendo
2. Mira el badge en el header del chat
3. Debe decir: "MCP: X servers, Y tools"
4. Hover sobre el badge
5. ✅ Debe mostrar breakdown por servidor

## 💡 Tips

### **Variables de Entorno Sensibles**
- Los tokens/keys se guardan en el archivo de configuración de Obsidian
- **NO** compartas tu `data.json` si contiene API keys
- Considera usar variables de entorno del sistema para keys muy sensibles

### **Múltiples Paths en Arguments**
```
Correcto:
-y, @modelcontextprotocol/server-filesystem, C:\path1, C:\path2, C:\path3

Cada path es un argumento separado
```

### **Debugging**
Si un servidor no inicia:
1. Verifica el comando existe: `npx --version` o `uv --version`
2. Verifica los paths son absolutos
3. Mira console para errores específicos
4. Prueba el comando manualmente en terminal

## 📈 Mejoras vs Versión Anterior

| Característica | Antes | Ahora |
|----------------|-------|-------|
| **Env Vars** | ❌ No soportado | ✅ UI completo |
| **Tool Count por Server** | ❌ No visible | ✅ Muestra count |
| **Badge Stats** | Solo total | Servers + tools |
| **Tooltip** | Lista de servers | Breakdown completo |
| **Arguments** | Input pequeño | TextArea grande |
| **Visual Feedback** | Básico | Completo y detallado |

## 🎉 Resultado Final

### **Antes de estas mejoras**:
```
❌ No podías configurar env vars
❌ No sabías cuántas tools tiene cada servidor
❌ Badge solo mostraba total
❌ Difícil ver qué servidor contribuye qué
```

### **Ahora**:
```
✅ Env vars configurables desde UI
✅ Tool count visible por servidor
✅ Badge muestra servers + tools
✅ Tooltip con breakdown completo
✅ TextArea grande para args
✅ Formato monospace para env vars
✅ Validación automática
✅ Compatible con formato Claude Desktop
```

---

**Archivos modificados**:
- `SettingsTab.ts` - Agregado campo env vars y tool counts
- `ChatView.ts` - Badge mejorado con stats detalladas
- `main.ts` - mcpManager ahora público

**Fecha**: 2025-10-03  
**Status**: ✅ Implemented & Ready to Use

