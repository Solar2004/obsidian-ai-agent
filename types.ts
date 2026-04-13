// AI Provider Types
export type AIProvider = 'claude' | 'gemini' | 'openrouter';

// Error handling types
export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export enum ErrorCategory {
	INVALID_API_KEY = 'INVALID_API_KEY',
	RATE_LIMIT = 'RATE_LIMIT',
	NETWORK_ERROR = 'NETWORK_ERROR',
	SERVER_ERROR = 'SERVER_ERROR',
	TIMEOUT = 'TIMEOUT',
	MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
	UNKNOWN = 'UNKNOWN'
}

export interface RetryConfig {
	maxRetries: number;
	initialRetryDelayMs: number;
	maxRetryDelayMs: number;
	backoffMultiplier: number;
}

export type ClaudeModel = 'claude-sonnet-4-20250514' | 'claude-sonnet-4-20241022' | 'claude-opus-4-20250514' | 'claude-haiku-3.5-20241022';
export type GeminiModel =
	| 'gemini-2.5-pro-latest'      // Most advanced, supports function calling
	| 'gemini-2.5-flash-latest'     // Fast and efficient, supports function calling
	| 'gemini-2.0-flash-exp'        // Experimental 2.0 version
	| 'gemini-1.5-pro-latest'       // Stable 1.5 pro
	| 'gemini-1.5-flash-latest';    // Stable 1.5 flash

export type OpenRouterModel =
	| 'openrouter/auto'             // Auto-select best model
	| 'openrouter/anthropic/claude-3.5-sonnet'
	| 'openrouter/anthropic/claude-3-haiku'
	| 'openrouter/openai/gpt-4o'
	| 'openrouter/google/gemini-2.0-flash'
	| 'openrouter/mistral/mistral-large'
	| 'openrouter/deepseek/deepseek-chat';

export type AIModel = ClaudeModel | GeminiModel | OpenRouterModel | string;

// MCP Server Configuration
export interface MCPServer {
	name: string;
	description?: string; // Description of what this server does (helps AI know when to use it)
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

// AI Provider Configuration
export interface AIProviderConfig {
	provider: AIProvider;
	apiKey?: string; // For API-based providers like Gemini and OpenRouter
	baseUrl?: string; // For OpenRouter and custom OpenAI-compatible APIs
	nodeLocation?: string; // For CLI-based providers like Claude
	claudeLocation?: string; // For Claude CLI
	model: AIModel;
	mcpServers?: MCPServer[];
	enableFunctionCalling?: boolean; // Enable/disable function calling for MCP tools
}

// Main Settings Interface
export interface AIChatSettings {
	providers: Record<AIProvider, AIProviderConfig>;
	activeProvider: AIProvider;
	debugContext?: boolean;

	// Error Handling
	errorHandling?: {
		showDetailedErrors: boolean;
		autoRetry: boolean;
		maxRetries: number;
		initialRetryDelayMs: number;
		showConnectionStatus: boolean;
		timeoutSeconds: number;
	};

	// Conversation Management
	conversationManagement?: {
		autoSave: boolean;
		saveIntervalSeconds: number;
		storagePath: string;
		showHistorySidebar: boolean;
		defaultExportFormat: 'markdown' | 'json' | 'html';
		maxConversations: number; // 0 = unlimited
	};

	// Usage Analytics
	usageAnalytics?: {
		enableDailyAlert: boolean;
		dailyBudgetAmount: number;
		enableMonthlyAlert: boolean;
		monthlyBudgetAmount: number;
		showCostPerMessage: boolean;
		alertThreshold: number; // 0.5, 0.75, 0.9, 1.0
		customPricing: Record<string, {
			inputCostPerMillion: number;
			outputCostPerMillion: number;
		}>;
	};

	// Chat UI
	chatUi?: {
		enableMessageEditing: boolean;
		enableRegeneration: boolean;
		maxRegenerations: number;
	};
}

export const DEFAULT_SETTINGS: AIChatSettings = {
	providers: {
		claude: {
			provider: 'claude',
			nodeLocation: '',
			claudeLocation: '',
			model: 'claude-sonnet-4-20250514',
			mcpServers: [],
			enableFunctionCalling: false // Claude uses built-in MCP
		},
		gemini: {
			provider: 'gemini',
			apiKey: '',
			model: 'gemini-2.5-flash-latest',
			mcpServers: [],
			enableFunctionCalling: false // Disabled by default, enable when using MCP servers
		},
		openrouter: {
			provider: 'openrouter',
			apiKey: '',
			baseUrl: 'https://openrouter.ai/api/v1',
			model: 'openrouter/anthropic/claude-3.5-sonnet',
			mcpServers: [],
			enableFunctionCalling: false
		}
	},
	activeProvider: 'openrouter',
	debugContext: false,
	errorHandling: {
		showDetailedErrors: false,
		autoRetry: true,
		maxRetries: 3,
		initialRetryDelayMs: 1000,
		showConnectionStatus: true,
		timeoutSeconds: 60
	},
	conversationManagement: {
		autoSave: true,
		saveIntervalSeconds: 30,
		storagePath: '.obsidian-ai-agent/conversations',
		showHistorySidebar: true,
		defaultExportFormat: 'markdown',
		maxConversations: 0 // 0 = unlimited
	},
	usageAnalytics: {
		enableDailyAlert: false,
		dailyBudgetAmount: 5.0,
		enableMonthlyAlert: false,
		monthlyBudgetAmount: 50.0,
		showCostPerMessage: true,
		alertThreshold: 0.9,
		customPricing: {}
	},
	chatUi: {
		enableMessageEditing: true,
		enableRegeneration: true,
		maxRegenerations: 5
	}
}