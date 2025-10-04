// AI Provider Types
export type AIProvider = 'claude' | 'gemini';

export type ClaudeModel = 'claude-sonnet-4-20250514' | 'claude-sonnet-4-20241022' | 'claude-opus-4-20250514' | 'claude-haiku-3.5-20241022';
export type GeminiModel = 
	| 'gemini-2.5-pro-latest'      // Most advanced, supports function calling
	| 'gemini-2.5-flash-latest'    // Fast and efficient, supports function calling
	| 'gemini-2.0-flash-exp'       // Experimental 2.0 version
	| 'gemini-1.5-pro-latest'      // Stable 1.5 pro
	| 'gemini-1.5-flash-latest';   // Stable 1.5 flash

export type AIModel = ClaudeModel | GeminiModel;

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
	apiKey?: string; // For API-based providers like Gemini
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
		}
	},
	activeProvider: 'claude',
	debugContext: false
}