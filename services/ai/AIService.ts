import type { AIProviderConfig, AIModel } from '../../types';

export interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	model?: AIModel;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		service_tier?: string;
	};
}

export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, any>;
}

export interface ToolResult {
	tool_use_id: string;
	content?: string;
	is_error?: boolean;
}

export interface StreamingResponse {
	type: 'text' | 'tool_use' | 'tool_result' | 'system';
	content?: string;
	tool_call?: ToolCall;
	tool_result?: ToolResult;
	session_id?: string;
	duration_ms?: number;
	duration_api_ms?: number;
	is_error?: boolean;
	total_cost_usd?: number;
}

export interface AIService {
	/**
	 * Initialize the AI service with configuration
	 */
	initialize(config: AIProviderConfig): Promise<void>;

	/**
	 * Send a message and get a streaming response
	 */
	sendMessage(message: string, conversationId?: string): Promise<AsyncIterable<StreamingResponse>>;

	/**
	 * Resume a conversation with a specific session ID
	 */
	resumeConversation(sessionId: string): Promise<void>;

	/**
	 * Cancel the current operation
	 */
	cancel(): void;

	/**
	 * Get available models for this provider
	 */
	getAvailableModels(): AIModel[];

	/**
	 * Test if the service is properly configured
	 */
	testConnection(): Promise<boolean>;

	/**
	 * Get the current provider type
	 */
	getProvider(): string;
}
