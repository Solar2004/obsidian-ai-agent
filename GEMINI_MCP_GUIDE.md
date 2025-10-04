# Guía de Integración Gemini con MCP

## 📋 Resumen

Esta implementación integra **Gemini AI** con soporte completo para **MCP (Model Context Protocol)** usando **Function Calling nativo** de Gemini. Es una solución profesional que permite a Gemini usar herramientas externas de forma similar a Claude.

## 🎯 Arquitectura

### **Enfoque Profesional: Function Calling**

En lugar de implementar MCP de forma separada, usamos la capacidad nativa de **Function Calling** de Gemini:

1. **MCP Tools → Gemini Functions**: Los tools de MCP se convierten en declaraciones de funciones para Gemini
2. **Gemini decide qué función llamar**: El modelo elige cuándo y cómo usar las herramientas
3. **Ejecución y respuesta**: Los resultados se envían de vuelta a Gemini para continuar la conversación

### **Ventajas de este Enfoque**

✅ **Nativo**: Usa capacidades oficiales de Gemini API  
✅ **Profesional**: No requiere hacks o workarounds  
✅ **Extensible**: Fácil agregar nuevas herramientas  
✅ **Compatible**: Funciona con todos los modelos Gemini que soporten function calling  

## 🚀 Modelos Soportados

### **Gemini 2.5 (Recomendado)**
- `gemini-2.5-pro-latest` - Modelo más avanzado con razonamiento complejo
- `gemini-2.5-flash-latest` - Rápido y eficiente ⭐ **Recomendado**

### **Gemini 2.0 (Experimental)**
- `gemini-2.0-flash-exp` - Versión experimental 2.0

### **Gemini 1.5 (Estable)**
- `gemini-1.5-pro-latest` - Versión estable Pro
- `gemini-1.5-flash-latest` - Versión estable Flash

## ⚙️ Configuración

### **1. Obtener API Key**

1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crea una nueva API key
3. Cópiala

### **2. Configurar en Obsidian**

1. **Settings → Obsidian AI Agent**
2. **Active AI Provider**: Selecciona `Gemini`
3. **Gemini API Key**: Pega tu API key
4. **AI Model**: Selecciona `gemini-2.5-flash-latest` (recomendado)
5. **Enable Function Calling**: ✅ Activado (para MCP)

### **3. Agregar Servidores MCP (Opcional)**

Si quieres que Gemini use herramientas personalizadas:

1. **Settings → MCP Servers → Add Server**
2. Configura tu servidor MCP:
   - **Name**: nombre descriptivo
   - **Command**: comando para ejecutar el servidor
   - **Arguments**: argumentos separados por comas

## 🔧 Cómo Funciona

### **Flujo de Conversación con Tools**

```
Usuario: "¿Qué hora es?"
    ↓
Gemini decide usar tool "get_current_time"
    ↓
Plugin ejecuta la función MCP
    ↓
Resultado: "14:30:00 GMT-5"
    ↓
Gemini responde: "Son las 2:30 PM"
```

### **Código de Integración**

El servicio `GeminiService` implementa:

```typescript
// Configurar tools disponibles
setMCPTools(tools: Array<{
    name: string;
    description: string;
    inputSchema: any;
}>): void

// Gemini responde con function calls
interface GeminiFunctionCall {
    name: string;
    args: Record<string, any>;
}

// Enviar resultados de vuelta
sendFunctionResult(functionName: string, result: any)
```

## 🔄 Diferencias con Claude

| Aspecto | Claude | Gemini |
|---------|---------|--------|
| **Integración MCP** | CLI nativo | Function Calling API |
| **Configuración** | Node.js + Claude CLI | Solo API Key |
| **Ejecución** | Proceso child | HTTP requests |
| **Tools** | MCP built-in | MCP vía functions |
| **Streaming** | Soporte nativo | Por implementar |

## 📝 Ejemplo de Uso

### **Sin MCP Tools**
```
Usuario: "Explica la fotosíntesis"
Gemini: [Respuesta directa sin usar tools]
```

### **Con MCP Tools (Function Calling activo)**
```
Usuario: "Busca información sobre fotosíntesis"
Gemini: [Decide usar tool "web_search"]
    → Ejecuta web_search("fotosíntesis")
    → Recibe resultados
    → Responde con información actualizada
```

## 🎛️ Configuración Avanzada

### **Desactivar Function Calling**

Si solo quieres respuestas de texto sin herramientas:

1. **Settings → Enable Function Calling**: ❌ Desactivado
2. Gemini funcionará como chatbot tradicional

### **Configurar Tools Personalizados**

Para agregar tus propias herramientas:

```typescript
// En tu MCP server, define tools con este formato:
{
    name: "mi_tool",
    description: "Descripción de qué hace",
    inputSchema: {
        type: "object",
        properties: {
            param1: { type: "string" },
            param2: { type: "number" }
        },
        required: ["param1"]
    }
}
```

## 🐛 Troubleshooting

### **"API key is required"**
→ Verifica que ingresaste tu API key correctamente

### **"Function calling not working"**
→ Asegúrate de:
  - Usar un modelo compatible (2.5+ recomendado)
  - Tener "Enable Function Calling" activado
  - Tener al menos un MCP server configurado

### **"Model not found"**
→ Algunos modelos pueden no estar disponibles en tu región. Prueba con `gemini-2.0-flash-exp`

## 🔐 Seguridad

- ✅ La API key se guarda localmente en Obsidian
- ✅ No se comparte con terceros
- ✅ Las conversaciones van directo a Google AI
- ⚠️ Ten cuidado con qué tools permites que Gemini ejecute

## 📚 Referencias

- [Gemini Function Calling Docs](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling)
- [Google AI Studio](https://aistudio.google.com/)
- [MCP Protocol](https://modelcontextprotocol.io/)

## 🎉 Resultado Final

Ahora tienes:

✅ **Gemini integrado** con modelos actualizados  
✅ **Function Calling** para MCP tools  
✅ **Arquitectura profesional** y extensible  
✅ **Configuración flexible** por proveedor  
✅ **Código modular** y mantenible  

¡Disfruta usando tanto Claude como Gemini con MCP en tu Obsidian! 🚀

