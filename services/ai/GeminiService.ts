import type { AIProviderConfig, AIModel, GeminiModel } from '../../types';
import type { AIService, StreamingResponse, ToolCall } from './AIService';

interface GeminiMessage {
	role: 'user' | 'model';
	parts: Array<{
		text?: string;
	}>;
}

interface GeminiFunctionDeclaration {
	name: string;
	description: string;
	parameters: {
		type: string;
		properties: Record<string, any>;
		required?: string[];
	};
}

interface GeminiTool {
	function_declarations: GeminiFunctionDeclaration[];
}

interface GeminiFunctionCall {
	name: string;
	args: Record<string, any>;
}

interface GeminiRequest {
	contents: GeminiMessage[];
	tools?: GeminiTool[];
	generationConfig?: {
		temperature?: number;
		topK?: number;
		topP?: number;
		maxOutputTokens?: number;
	};
	systemInstruction?: {
		parts: {
			text: string;
		};
	};
}

interface GeminiResponse {
	candidates: Array<{
		content: {
			parts: Array<{
				text?: string;
				functionCall?: GeminiFunctionCall;
			}>;
		};
		finishReason: string;
	}>;
	usageMetadata: {
		promptTokenCount: number;
		candidatesTokenCount: number;
		totalTokenCount: number;
	};
}

export class GeminiService implements AIService {
	private config!: AIProviderConfig;
	private apiKey: string;
	private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
	private availableTools: GeminiFunctionDeclaration[] = [];
	private conversationHistory: GeminiMessage[] = [];
	private serverDescriptions: Map<string, string> = new Map(); // Store server descriptions

	constructor() {
		this.apiKey = '';
	}

	/**
	 * Set MCP tools as function declarations for Gemini
	 * Also accepts server descriptions to provide context about when to use each server
	 */
	setMCPTools(
		tools: Array<{ name: string; description: string; inputSchema: any; serverName?: string }>,
		serverDescriptions?: Map<string, string>
	): void {
		this.availableTools = tools.map(tool => {
			const cleanedParams = this.cleanSchemaForGemini(tool.inputSchema);
			return {
				name: tool.name,
				description: tool.description,
				parameters: cleanedParams
			};
		});

		// Store server descriptions for system instruction
		if (serverDescriptions) {
			this.serverDescriptions = serverDescriptions;
		}
		
		console.log(`Gemini: Configured ${this.availableTools.length} tools from MCP servers`);
	}

	/**
	 * Clean JSON Schema for Gemini API
	 * Removes fields that Gemini doesn't accept like $schema, additionalProperties, etc.
	 */
	private cleanSchemaForGemini(schema: any): any {
		if (!schema || typeof schema !== 'object') {
			return schema;
		}

		// Create a clean copy
		const cleaned: any = {};

		// Only copy allowed fields
		const allowedFields = ['type', 'properties', 'required', 'items', 'description', 'enum'];
		
		for (const key of Object.keys(schema)) {
			if (allowedFields.includes(key)) {
				if (key === 'properties' && typeof schema[key] === 'object') {
					// Recursively clean nested properties
					cleaned[key] = {};
					for (const propKey of Object.keys(schema[key])) {
						cleaned[key][propKey] = this.cleanSchemaForGemini(schema[key][propKey]);
					}
				} else if (key === 'items' && typeof schema[key] === 'object') {
					// Recursively clean array items
					cleaned[key] = this.cleanSchemaForGemini(schema[key]);
				} else {
					cleaned[key] = schema[key];
				}
			}
		}

		// Ensure we have at least a type
		if (!cleaned.type) {
			cleaned.type = 'object';
		}

		return cleaned;
	}

	async initialize(config: AIProviderConfig): Promise<void> {
		this.config = config;
		if (config.provider !== 'gemini') {
			throw new Error('GeminiService can only be used with Gemini provider');
		}
		this.apiKey = config.apiKey || '';
		if (!this.apiKey) {
			throw new Error('API key is required for Gemini service');
		}
	}

	private getModelEndpoint(model: string): string {
		// Map our model names to Gemini API model names
		const modelMap: Record<string, string> = {
			'gemini-2.5-pro-latest': 'gemini-2.0-flash-exp', // 2.5 not yet in API, use 2.0 for now
			'gemini-2.5-flash-latest': 'gemini-2.0-flash-exp',
			'gemini-2.0-flash-exp': 'gemini-2.0-flash-exp',
			'gemini-1.5-pro-latest': 'gemini-1.5-pro-latest',
			'gemini-1.5-flash-latest': 'gemini-1.5-flash-latest'
		};
		return modelMap[model] || 'gemini-2.0-flash-exp';
	}

	private async makeRequest(endpoint: string, body: any): Promise<Response> {
		const response = await fetch(`${this.baseUrl}${endpoint}?key=${this.apiKey}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			// Get error details from response
			let errorMessage = `Gemini API error: ${response.status} ${response.statusText}`;
			try {
				const errorData = await response.json();
				if (errorData.error?.message) {
					errorMessage += ` - ${errorData.error.message}`;
				}
			} catch {
				// Ignore JSON parse errors
			}
			throw new Error(errorMessage);
		}

		return response;
	}

	async sendMessage(message: string, conversationId?: string): Promise<AsyncIterable<StreamingResponse>> {
		return this.sendMessageInternal(message, conversationId);
	}

	private async *sendMessageInternal(message: string, conversationId?: string): AsyncIterable<StreamingResponse> {
		try {
			const model = this.getModelEndpoint(this.config.model);

			// Add user message to conversation history (skip if empty continuation)
			if (message) {
				this.conversationHistory.push({
					role: 'user',
					parts: [{ text: message }]
				});
			}

			// Build request
			const requestBody: any = {
				contents: this.conversationHistory
			};

			// Add tools ONLY if function calling is enabled AND we have valid tools
			if (this.config.enableFunctionCalling && 
			    this.availableTools.length > 0 && 
			    this.availableTools.every(tool => tool.name && tool.parameters)) {
				
				requestBody.tools = [{
					function_declarations: this.availableTools
				}];

				// Build system instruction with server descriptions
				let systemPrompt = `You are a helpful AI assistant with access to ${this.availableTools.length} tools through MCP (Model Context Protocol) servers.\n\n`;

				// Add server descriptions if available
				if (this.serverDescriptions.size > 0) {
					systemPrompt += `**Available MCP Servers:**\n`;
					this.serverDescriptions.forEach((description, serverName) => {
						if (description) {
							systemPrompt += `\n• **${serverName}**: ${description}`;
						}
					});
					systemPrompt += `\n\n`;
				}

				systemPrompt += `**IMPORTANT INSTRUCTIONS:**
1. You MUST use the available tools to complete user requests
2. Never say "I cannot" do something if you have a tool that can do it
3. Always attempt to use the appropriate tool first before declining
4. The tools are your actual capabilities - use them actively!

**Common Use Cases:**
- File operations (create, read, write, modify, list) → use filesystem tools
- Web searches and research → use search/research tools
- Storing information between conversations → use memory tools
- Any other task → check if you have a relevant tool

When in doubt, try using a tool rather than saying you can't help!`;

				requestBody.system_instruction = {
					parts: [{
						text: systemPrompt
					}]
				};
				
				console.log(`Gemini: Using ${this.availableTools.length} MCP tools with enhanced system instruction`);
			} else {
				console.log('Gemini: No function calling (disabled or no tools available)');
			}

			const response = await this.makeRequest(`/models/${model}:generateContent`, requestBody);
			const data: GeminiResponse = await response.json();

			// Process response
			if (data.candidates && data.candidates[0]) {
				const candidate = data.candidates[0];
				const parts = candidate.content.parts;

				// Add assistant response to history
				this.conversationHistory.push({
					role: 'model',
					parts: parts
				});

				// Process each part (text or function calls)
				for (const part of parts) {
					if (part.functionCall) {
						// Gemini wants to call a function
						console.log(`Gemini requested tool: ${part.functionCall.name}`, part.functionCall.args);
						yield {
							type: 'tool_use',
							tool_call: {
								id: `call_${Date.now()}`,
								name: part.functionCall.name,
								input: part.functionCall.args
							}
						};
					} else if (part.text) {
						// Regular text response
						yield {
							type: 'text',
							content: part.text
						};
					}
				}
			}

		} catch (error) {
			throw error;
		}
	}

	/**
	 * Send function result back to Gemini to continue the conversation
	 */
	async sendFunctionResult(functionName: string, result: any): Promise<AsyncIterable<StreamingResponse>> {
		// Add function result to conversation history
		this.conversationHistory.push({
			role: 'user',
			parts: [{
				text: `Function ${functionName} returned: ${JSON.stringify(result)}`
			}]
		});

		// Continue the conversation
		return this.sendMessageInternal('', undefined);
	}


	async resumeConversation(sessionId: string): Promise<void> {
		// Gemini doesn't use session IDs like Claude, but we can store conversation history
		// For now, this is a no-op
	}

	cancel(): void {
		// For HTTP requests, we can't easily cancel, but we can implement this for future streaming support
	}

	getAvailableModels(): GeminiModel[] {
		return [
			'gemini-2.5-pro-latest',
			'gemini-2.5-flash-latest',
			'gemini-2.0-flash-exp',
			'gemini-1.5-pro-latest',
			'gemini-1.5-flash-latest'
		];
	}

	async testConnection(): Promise<boolean> {
		try {
			if (!this.apiKey) {
				return false;
			}

			const model = this.getModelEndpoint(this.config.model);
			const response = await fetch(`${this.baseUrl}/models/${model}?key=${this.apiKey}`);

			return response.ok;
		} catch {
			return false;
		}
	}

	getProvider(): string {
		return 'gemini';
	}
}
