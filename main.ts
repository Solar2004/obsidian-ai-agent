import { Plugin, WorkspaceLeaf } from 'obsidian';
import { AIChatView, VIEW_TYPE_AI_CHAT } from './ChatView';
import { AIChatSettingTab } from './SettingsTab';
import { AIChatSettings, DEFAULT_SETTINGS } from './types';
import { AIServiceFactory, MCPManager, ErrorHandler } from './services';

export default class AIChatPlugin extends Plugin {
	settings: AIChatSettings;
	private aiService: any;
	mcpManager: MCPManager;
	errorHandler: ErrorHandler;

	async onload() {
		await this.loadSettings();

		// Initialize services
		this.mcpManager = new MCPManager();
		this.errorHandler = new ErrorHandler({
			maxRetries: this.settings.errorHandling?.maxRetries || 3,
			initialDelayMs: this.settings.errorHandling?.initialRetryDelayMs || 1000
		});

		// Create AI service based on active provider
		const activeConfig = this.settings.providers[this.settings.activeProvider];
		this.aiService = AIServiceFactory.createService(activeConfig);

		try {
			await this.aiService.initialize(activeConfig);
		} catch (error) {
			console.error('Failed to initialize AI service:', error);
		}

		// Start MCP servers if configured
		if (activeConfig.mcpServers && activeConfig.mcpServers.length > 0) {
			for (const serverConfig of activeConfig.mcpServers) {
				try {
					await this.mcpManager.startServer(serverConfig);
				} catch (error) {
					console.error(`Failed to start MCP server ${serverConfig.name}:`, error);
				}
			}

			// For API-based providers with function calling enabled, pass MCP tools and server descriptions
			if ((activeConfig.provider === 'gemini' || activeConfig.provider === 'openrouter') && activeConfig.enableFunctionCalling) {
				const mcpTools = this.mcpManager.getAllTools();
				
				// Build server descriptions map
				const serverDescriptions = new Map<string, string>();
				for (const serverConfig of activeConfig.mcpServers) {
					if (serverConfig.description) {
						serverDescriptions.set(serverConfig.name, serverConfig.description);
					}
				}
				
				if (this.aiService && typeof (this.aiService as any).setMCPTools === 'function') {
					(this.aiService as any).setMCPTools(mcpTools, serverDescriptions);
				}
			}
		}

		// Register the custom view
		this.registerView(
			VIEW_TYPE_AI_CHAT,
			(leaf) => new AIChatView(leaf, this.settings, this.aiService, this.mcpManager, this.errorHandler)
		);

		// Open the view in the right sidebar by default
		if (this.app.workspace.layoutReady) {
			await this.activateView();
		} else {
			this.app.workspace.onLayoutReady(async () => {
				await this.activateView();
			});
		}

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AIChatSettingTab(this.app, this));
	}

	onunload() {
		// Stop all MCP servers
		this.mcpManager.stopAllServers();

		// Detach leaves with our view type when unloading
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_CHAT);
	}

	/**
	 * Update the active AI service when settings change
	 */
	async updateAIService(): Promise<void> {
		const activeConfig = this.settings.providers[this.settings.activeProvider];

		// Cancel any ongoing operations in the current service
		if (this.aiService && typeof this.aiService.cancel === 'function') {
			this.aiService.cancel();
		}

		// Create new service
		this.aiService = AIServiceFactory.createService(activeConfig);

		try {
			await this.aiService.initialize(activeConfig);

			// Update MCP servers
			await this.updateMCPServers(activeConfig.mcpServers || []);

			// For API-based providers with function calling enabled, pass MCP tools
			if ((activeConfig.provider === 'gemini' || activeConfig.provider === 'openrouter') && activeConfig.enableFunctionCalling) {
				const mcpTools = this.mcpManager.getAllTools();
				if (this.aiService && typeof (this.aiService as any).setMCPTools === 'function') {
					(this.aiService as any).setMCPTools(mcpTools);
				}
			}

		} catch (error) {
			console.error('Failed to update AI service:', error);
		}
	}

	/**
	 * Update MCP servers for the current provider
	 */
	private async updateMCPServers(servers: any[]): Promise<void> {
		// Stop servers that are no longer needed
		const runningServers = this.mcpManager.getRunningServers();
		for (const serverName of runningServers) {
			const serverStillNeeded = servers.some(s => s.name === serverName);
			if (!serverStillNeeded) {
				await this.mcpManager.stopServer(serverName);
			}
		}

		// Start new servers
		for (const serverConfig of servers) {
			const serverRunning = this.mcpManager.isServerRunning(serverConfig.name);
			if (!serverRunning) {
				try {
					await this.mcpManager.startServer(serverConfig);
				} catch (error) {
					console.error(`Failed to start MCP server ${serverConfig.name}:`, error);
				}
			}
		}

		// Update MCP tools in API-based services if applicable
		const activeConfig = this.settings.providers[this.settings.activeProvider];
		if ((activeConfig.provider === 'gemini' || activeConfig.provider === 'openrouter') && activeConfig.enableFunctionCalling) {
			const mcpTools = this.mcpManager.getAllTools();
			
			// Build server descriptions map
			const serverDescriptions = new Map<string, string>();
			for (const serverConfig of servers) {
				if (serverConfig.description) {
					serverDescriptions.set(serverConfig.name, serverConfig.description);
				}
			}
			
			if (this.aiService && typeof (this.aiService as any).setMCPTools === 'function') {
				(this.aiService as any).setMCPTools(mcpTools, serverDescriptions);
			}
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use it
			leaf = leaves[0];
		} else {
			// Our view doesn't exist, create a new leaf in the right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_AI_CHAT, active: true });
			}
		}

		// Reveal the leaf in case it's hidden
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
