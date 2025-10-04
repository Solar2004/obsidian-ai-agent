# 🔧 Implementación MCP Real con SDK Oficial

## 📋 Resumen

Hemos implementado un **cliente MCP real** usando el [SDK oficial de @modelcontextprotocol](https://github.com/modelcontextprotocol/typescript-sdk) para conectarnos a servidores MCP y exponer sus herramientas a Gemini y Claude.

Basado en: [mcp-chat por Flux159](https://github.com/Flux159/mcp-chat)

## 🎯 ¿Qué es MCP?

**Model Context Protocol (MCP)** es un protocolo estandarizado que permite a los modelos de IA interactuar con herramientas externas y fuentes de datos de forma segura y estructurada.

### **Componentes**:
1. **MCP Server**: Expone herramientas y recursos
2. **MCP Client**: Se conecta al servidor y lista herramientas
3. **AI Model**: Usa las herramientas a través de function calling

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────┐
│         Obsidian AI Agent                   │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │       MCPManager                     │  │
│  │  (SDK @modelcontextprotocol/sdk)    │  │
│  └──────────────────────────────────────┘  │
│             ↓         ↓         ↓           │
│  ┌──────┐  ┌──────┐  ┌──────┐             │
│  │Server│  │Server│  │Server│             │
│  │  1   │  │  2   │  │  3   │             │
│  └──────┘  └──────┘  └──────┘             │
│   Tools     Tools     Tools                │
│     ↓         ↓         ↓                   │
│  ┌──────────────────────────────────────┐  │
│  │     GeminiService / ClaudeService    │  │
│  │     (Function Calling)               │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 🚀 Flujo de Trabajo

### **1. Inicio de Servidor MCP**
```typescript
// Usuario configura en Settings:
{
    name: "filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    env: { ... }
}

// MCPManager conecta:
const transport = new StdioClientTransport({ command, args, env });
const client = new Client({ name: "obsidian-ai-agent", version: "1.0.0" });
await client.connect(transport);

// Lista herramientas disponibles:
const tools = await client.listTools();
// Resultado: [{ name: "read_file", description: "...", inputSchema: {...} }]
```

### **2. Configuración de Gemini**
```typescript
// Las herramientas MCP se pasan a Gemini como funciones:
geminiService.setMCPTools(mcpManager.getAllTools());

// Gemini recibe:
{
    tools: [{
        function_declarations: [
            {
                name: "read_file",
                description: "Read contents of a file",
                parameters: {
                    type: "object",
                    properties: {
                        path: { type: "string" }
                    },
                    required: ["path"]
                }
            }
        ]
    }]
}
```

### **3. Ejecución de Herramienta**
```
Usuario: "Lee el contenido de ejemplo.txt"
    ↓
Gemini decide usar: read_file({ path: "ejemplo.txt" })
    ↓
ChatView detecta function call
    ↓
mcpManager.findServerForTool("read_file") → "filesystem"
    ↓
mcpManager.executeTool("filesystem", "read_file", { path: "..." })
    ↓
MCP Client llama al servidor
    ↓
Servidor ejecuta y devuelve resultado
    ↓
Resultado se envía de vuelta a Gemini
    ↓
Gemini: "El archivo contiene: [contenido]"
```

## 📦 Instalación

### **Dependencia Principal**
```bash
npm install @modelcontextprotocol/sdk
```

### **Servidores MCP Oficiales**
```bash
# Filesystem
npx @modelcontextprotocol/server-filesystem

# Kubernetes
npx mcp-server-kubernetes

# Postgres
npx @modelcontextprotocol/server-postgres

# Y muchos más en: https://github.com/modelcontextprotocol/servers
```

## ⚙️ Configuración

### **En Settings → MCP Servers**

#### **Ejemplo 1: Filesystem**
```
Name: filesystem
Command: npx
Arguments: -y, @modelcontextprotocol/server-filesystem, /Users/you/Documents
```

#### **Ejemplo 2: Kubernetes**
```
Name: kubernetes
Command: npx
Arguments: mcp-server-kubernetes
Env: KUBECONFIG=/path/to/kubeconfig
```

#### **Ejemplo 3: Git**
```
Name: git
Command: npx
Arguments: @modelcontextprotocol/server-git, /path/to/repo
```

## 🔧 API del MCPManager

```typescript
// Iniciar servidor
await mcpManager.startServer(serverConfig);

// Listar herramientas
const tools = mcpManager.getAllTools();
// [{name: "read_file", description: "...", inputSchema: {...}}]

// Ejecutar herramienta
const result = await mcpManager.executeTool(
    "filesystem", 
    "read_file",
    { path: "/path/to/file.txt" }
);

// Detener servidor
await mcpManager.stopServer("filesystem");

// Buscar servidor para herramienta
const serverName = mcpManager.findServerForTool("read_file");
```

## 🎨 Integración con Gemini

### **Function Calling Automático**
Cuando "Enable Function Calling" está activado en Gemini:

1. **Al iniciar**: MCP tools → Gemini functions
2. **Durante chat**: Gemini decide usar herramientas
3. **Ejecución**: MCPManager ejecuta la herramienta
4. **Continuación**: Resultado va de vuelta a Gemini
5. **Respuesta**: Gemini responde con el resultado procesado

### **Código**
```typescript
// GeminiService.ts
setMCPTools(tools) {
    this.availableTools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
    }));
}

// ChatView.ts
async executeMCPTool(toolCall) {
    const serverName = mcpManager.findServerForTool(toolCall.name);
    const result = await mcpManager.executeTool(
        serverName, 
        toolCall.name,
        toolCall.input
    );
    
    // Send result back to Gemini
    await geminiService.sendFunctionResult(toolCall.name, result);
}
```

## 🔐 Seguridad

### **Consideraciones**:
- ✅ Servidores MCP corren en procesos separados
- ✅ Comunicación via stdio (stdin/stdout)
- ✅ No hay acceso directo al filesystem del plugin
- ⚠️ Los servidores tienen permisos según su configuración
- ⚠️ Revisar qué herramientas expone cada servidor

### **Buenas Prácticas**:
1. Solo usar servidores MCP de fuentes confiables
2. Configurar paths específicos (no root `/`)
3. Usar variables de entorno para credenciales
4. Revisar logs de ejecución de herramientas

## 📊 Comparación: Antes vs Ahora

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **MCP Client** | Mock (no funcional) | SDK oficial |
| **Conexión** | Spawn manual | StdioClientTransport |
| **Descubrimiento** | Hardcoded | Dinámico via `listTools()` |
| **Ejecución** | Mock | Real via `callTool()` |
| **Protocolos** | N/A | JSON-RPC completo |

## 🐛 Troubleshooting

### **"Server failed to start"**
→ Verificar que el comando es correcto
→ Verificar que las dependencias están instaladas
→ Ver logs en Developer Tools (Ctrl+Shift+I)

### **"No tools found"**
→ El servidor puede no exponer herramientas
→ Verificar compatibilidad con SDK oficial
→ Ver documentación del servidor específico

### **"Tool execution failed"**
→ Parámetros incorrectos
→ Permisos insuficientes
→ Ver error details (click en icono 🔴)

## 📚 Referencias

- [MCP Official Docs](https://modelcontextprotocol.io/)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [mcp-chat reference](https://github.com/Flux159/mcp-chat)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)

## 🎉 Resultado

Ahora tienes:

✅ **Cliente MCP real** con SDK oficial  
✅ **Conexión a servidores MCP** via stdio  
✅ **Descubrimiento dinámico** de herramientas  
✅ **Ejecución real** de tools  
✅ **Integración con Gemini** via function calling  
✅ **Integración con Claude** via MCP nativo  
✅ **Manejo de errores** visual y útil  

¡Tu plugin ahora puede usar herramientas MCP reales! 🚀

