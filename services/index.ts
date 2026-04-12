// AI Services
export type { AIService, Message, StreamingResponse, ToolCall, ToolResult } from './ai/AIService';
export { ClaudeService } from './ai/ClaudeService';
export { GeminiService } from './ai/GeminiService';
export { OpenRouterService } from './ai/OpenRouterService';

// MCP Services
export { MCPManager } from './mcp/MCPManager';
export type { MCPTool, MCPResource } from './mcp/MCPManager';

// Error Handling
export { ErrorHandler } from './ErrorHandler';
export type { RetryConfig, ErrorInfo, RetryState, ConnectionStatus } from './ErrorHandler';
export { ErrorCategory } from './ErrorHandler';

// Conversation Management
export { ConversationManager } from './ConversationManager';
export type { ConversationMetadata, SavedConversation } from './ConversationManager';

// Usage Tracking
export { UsageTracker } from './UsageTracker';
export type { UsageRecord, UsageStats, ModelPricing, AlertThreshold } from './UsageTracker';

// Service Factory
import type { AIProviderConfig } from '../types';
import { ClaudeService } from './ai/ClaudeService';
import { GeminiService } from './ai/GeminiService';
import { OpenRouterService } from './ai/OpenRouterService';

export class AIServiceFactory {
	static createService(config: AIProviderConfig) {
		switch (config.provider) {
			case 'claude':
				return new ClaudeService();
			case 'gemini':
				return new GeminiService();
			case 'openrouter':
				return new OpenRouterService();
			default:
				throw new Error(`Unsupported AI provider: ${config.provider}`);
		}
	}
}
