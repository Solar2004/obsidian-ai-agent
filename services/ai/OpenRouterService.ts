import type { AIProviderConfig, OpenRouterModel } from '../../types';
import type { AIService, StreamingResponse, ToolCall } from './AIService';

interface OpenAIMessage {
	role: 'user' | 'assistant' | 'system';
	content: string | Array<{
		type: 'text' | 'image_url';
		text?: string;
		image_url?: { url: string };
	}>;
	name?: string;
}

interface OpenAIFunction {
	name: string;
	description?: string;
	parameters: any;
}

interface OpenAITool {
	type: 'function';
	function: OpenAIFunction;
}

interface OpenAIStreamChunk {
	choices: Array<{
		delta: {
			role?: string;
			content?: string;
			function_call?: {
				name?: string;
				arguments?: string;
			};
		};
		index?: number;
		finish_reason?: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

interface OpenAIResponse {
	id: string;
	model: string;
	choices: Array<{
		message: {
			role: string;
			content: string | null;
			function_call?: {
				name: string;
				arguments: string;
			};
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export class OpenRouterService implements AIService {
	private config!: AIProviderConfig;
	private apiKey: string = '';
	private baseUrl: string = 'https://openrouter.ai/api/v1';
	private model: string = 'openrouter/anthropic/claude-3.5-sonnet';
	private conversationHistory: OpenAIMessage[] = [];
	private availableTools: OpenAIFunction[] = [];
	private serverDescriptions: Map<string, string> = new Map();

	constructor() {}

	setMCPTools(
		tools: Array<{ name: string; description: string; inputSchema: any; serverName?: string }>,
		serverDescriptions?: Map<string, string>
	): void {
		this.availableTools = tools.map(tool => ({
			name: tool.name,
			description: tool.description,
			parameters: this.cleanSchemaForOpenAI(tool.inputSchema)
		}));

		if (serverDescriptions) {
			this.serverDescriptions = serverDescriptions;
		}

		console.log(`OpenRouter: Configured ${this.availableTools.length} tools from MCP servers`);
	}

	private cleanSchemaForOpenAI(schema: any): any {
		if (!schema || typeof schema !== 'object') {
			return schema;
		}

		const cleaned: any = {};
		const allowedFields = ['type', 'properties', 'required', 'items', 'description', 'enum'];

		for (const key of Object.keys(schema)) {
			if (allowedFields.includes(key)) {
				if (key === 'properties' && typeof schema[key] === 'object') {
					cleaned[key] = {};
					for (const propKey of Object.keys(schema[key])) {
						cleaned[key][propKey] = this.cleanSchemaForOpenAI(schema[key][propKey]);
					}
				} else if (key === 'items' && typeof schema[key] === 'object') {
					cleaned[key] = this.cleanSchemaForOpenAI(schema[key]);
				} else {
					cleaned[key] = schema[key];
				}
			}
		}

		if (!cleaned.type) {
			cleaned.type = 'object';
		}

		return cleaned;
	}

	async initialize(config: AIProviderConfig): Promise<void> {
		this.config = config;
		if (config.provider !== 'openrouter') {
			throw new Error('OpenRouterService can only be used with OpenRouter provider');
		}
		this.apiKey = config.apiKey || '';
		this.baseUrl = this.normalizeBaseUrl(config.baseUrl) || 'https://openrouter.ai/api/v1';
		this.model = this.normalizeModelName(config.model as string) || 'anthropic/claude-3.5-sonnet';

		if (!this.apiKey) {
			throw new Error('API key is required for OpenRouter service');
		}
	}

	/**
	 * Normalize base URL - remove trailing /chat/completions if present
	 * since we append it programmatically
	 */
	private normalizeBaseUrl(baseUrl: string | undefined): string {
		if (!baseUrl) return '';
		// Remove /chat/completions from end if present (user may have added it)
		if (baseUrl.endsWith('/chat/completions')) {
			return baseUrl.substring(0, baseUrl.length - '/chat/completions'.length);
		}
		return baseUrl;
	}

	/**
	 * Normalize model name for OpenRouter API
	 * OpenRouter expects model names like 'anthropic/claude-3.5-sonnet', not 'openrouter/anthropic/claude-3.5-sonnet'
	 */
	private normalizeModelName(model: string): string {
		if (!model) return '';

		// Don't pass through __custom__ marker
		if (model === '__custom__') {
			return '';
		}

		// Remove openrouter/ prefix if present since it's for internal use
		if (model.startsWith('openrouter/')) {
			return model.substring('openrouter/'.length);
		}

		return model;
	}

	private getHeaders(): HeadersInit {
		return {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.apiKey}`,
			'HTTP-Referer': 'obsidian-ai-agent',
			'X-Title': 'Obsidian AI Agent'
		};
	}

	async sendMessage(message: string, conversationId?: string): Promise<AsyncIterable<StreamingResponse>> {
		return this.sendMessageInternal(message, conversationId);
	}

	private async *sendMessageInternal(message: string, conversationId?: string): AsyncIterable<StreamingResponse> {
		try {
			// Add user message to conversation history
			if (message) {
				this.conversationHistory.push({
					role: 'user',
					content: message
				});
			}

			// Build request body
			const requestBody: any = {
				model: this.model,
				messages: [...this.conversationHistory],
				stream: true
			};

			// Add tools if function calling is enabled
			if (this.config.enableFunctionCalling && this.availableTools.length > 0) {
				requestBody.tools = this.availableTools.map(f => ({
					type: 'function',
					function: f
				}));

				// Add system instruction with server descriptions
				let systemPrompt = `You are a helpful AI assistant with access to ${this.availableTools.length} tools through MCP (Model Context Protocol) servers.\n\n`;

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

				// Add system message at the beginning
				requestBody.messages.unshift({
					role: 'system',
					content: systemPrompt
				});

				console.log(`OpenRouter: Using ${this.availableTools.length} MCP tools with enhanced system instruction`);
			}

			// Make the request
			const response = await fetch(`${this.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: this.getHeaders(),
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;
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

			// Handle streaming response
			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No response body');
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') {
							return;
						}

						try {
							const chunk: OpenAIStreamChunk = JSON.parse(data);
							const delta = chunk.choices[0]?.delta;

							if (delta?.function_call) {
								// Function call response
								yield {
									type: 'tool_use',
									tool_call: {
										id: `call_${Date.now()}`,
										name: delta.function_call.name || '',
										input: delta.function_call.arguments ? JSON.parse(delta.function_call.arguments) : {}
									}
								};
							} else if (delta?.content) {
								// Text content
								yield {
									type: 'text',
									content: delta.content
								};
							}
						} catch (e) {
							// Skip malformed JSON
						}
					}
				}
			}

			// For non-streaming or to get final response, make a non-streaming request
			// This handles cases where we need to process function results
		} catch (error) {
			throw error;
		}
	}

	async sendFunctionResult(functionName: string, result: any): Promise<AsyncIterable<StreamingResponse>> {
		// Add function result to conversation history
		this.conversationHistory.push({
			role: 'user',
			content: `Function ${functionName} returned: ${JSON.stringify(result)}`
		});

		// Continue the conversation
		return this.sendMessageInternal('', undefined);
	}

	async resumeConversation(sessionId: string): Promise<void> {
		// OpenRouter doesn't use session IDs, but we can maintain conversation history
		// For now, this is a no-op
	}

	cancel(): void {
		// For HTTP requests, cancellation is handled by aborting the fetch
	}

	getAvailableModels(): OpenRouterModel[] {
		return [
			'openrouter/auto',
			'openrouter/anthropic/claude-3.5-sonnet',
			'openrouter/anthropic/claude-3-haiku',
			'openrouter/openai/gpt-4o',
			'openrouter/google/gemini-2.0-flash',
			'openrouter/mistral/mistral-large',
			'openrouter/deepseek/deepseek-chat'
		];
	}

	async testConnection(): Promise<boolean> {
		try {
			if (!this.apiKey) {
				return false;
			}

			const response = await fetch(`${this.baseUrl}/models`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`
				}
			});

			return response.ok;
		} catch {
			return false;
		}
	}

	getProvider(): string {
		return 'openrouter';
	}
}