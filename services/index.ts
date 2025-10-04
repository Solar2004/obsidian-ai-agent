// AI Services
export type { AIService, Message, StreamingResponse, ToolCall, ToolResult } from './ai/AIService';
export { ClaudeService } from './ai/ClaudeService';
export { GeminiService } from './ai/GeminiService';

// MCP Services
export { MCPManager } from './mcp/MCPManager';
export type { MCPTool, MCPResource } from './mcp/MCPManager';

// Service Factory
import type { AIProviderConfig } from '../types';
import { ClaudeService } from './ai/ClaudeService';
import { GeminiService } from './ai/GeminiService';

export class AIServiceFactory {
	static createService(config: AIProviderConfig) {
		switch (config.provider) {
			case 'claude':
				return new ClaudeService();
			case 'gemini':
				return new GeminiService();
			default:
				throw new Error(`Unsupported AI provider: ${config.provider}`);
		}
	}
}
