import { App, PluginSettingTab, Setting } from 'obsidian';
import type AIChatPlugin from './main';
import type { AIProvider, AIModel, AIProviderConfig, MCPServer } from './types';

export class AIChatSettingTab extends PluginSettingTab {
	plugin: AIChatPlugin;

	constructor(app: App, plugin: AIChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Active Provider Selection
		new Setting(containerEl)
			.setName('Active AI Provider')
			.setDesc('Select which AI provider to use for chat')
			.addDropdown(dropdown => {
				dropdown.addOption('claude', 'Claude');
				dropdown.addOption('gemini', 'Gemini');
				dropdown.addOption('openrouter', 'OpenRouter / Custom OpenAI');
				dropdown.setValue(this.plugin.settings.activeProvider);
				dropdown.onChange(async (value: AIProvider) => {
					this.plugin.settings.activeProvider = value;
					await this.plugin.saveSettings();
					await this.plugin.updateAIService();
					this.display(); // Refresh the settings UI
				});
			});

		// Provider-specific settings
		const activeProvider = this.plugin.settings.activeProvider;
		const activeConfig = this.plugin.settings.providers[activeProvider];

		// Claude Settings
		if (activeProvider === 'claude') {
			containerEl.createEl('h3', { text: 'Claude Settings' });

			new Setting(containerEl)
				.setName('Node.js Location')
				.setDesc('Path to Node.js executable. Leave empty to auto-detect.')
				.addText(text => text
					.setPlaceholder('Auto-detect (e.g., /usr/local/bin/node)')
					.setValue(activeConfig.nodeLocation || '')
					.onChange(async (value) => {
						activeConfig.nodeLocation = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIService();
					}));

			new Setting(containerEl)
				.setName('Claude Code Location')
				.setDesc('Path to Claude Code executable. Leave empty to auto-detect.')
				.addText(text => text
					.setPlaceholder('Auto-detect (e.g., ~/.claude/local/node_modules/.bin/claude)')
					.setValue(activeConfig.claudeLocation || '')
					.onChange(async (value) => {
						activeConfig.claudeLocation = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIService();
					}));
		}

		// Gemini Settings
		if (activeProvider === 'gemini') {
			containerEl.createEl('h3', { text: 'Gemini Settings' });

			new Setting(containerEl)
				.setName('Gemini API Key')
				.setDesc('Your Gemini API key from Google AI Studio')
				.addText(text => text
					.setPlaceholder('Enter your Gemini API key')
					.setValue(activeConfig.apiKey || '')
					.onChange(async (value) => {
						activeConfig.apiKey = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIService();
					}));
		}

		// OpenRouter / Custom API Settings
		if (activeProvider === 'openrouter') {
			containerEl.createEl('h3', { text: 'OpenRouter / Custom API Settings' });

			new Setting(containerEl)
				.setName('API Key')
				.setDesc('Your API key for OpenRouter or other OpenAI-compatible API')
				.addText(text => text
					.setPlaceholder('sk-or-v1...')
					.setValue(activeConfig.apiKey || '')
					.onChange(async (value) => {
						activeConfig.apiKey = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIService();
					}));

			new Setting(containerEl)
				.setName('Base URL')
				.setDesc('API base URL (defaults to OpenRouter). For custom OpenAI-compatible APIs.')
				.addText(text => text
					.setPlaceholder('https://openrouter.ai/api/v1')
					.setValue(activeConfig.baseUrl || '')
					.onChange(async (value) => {
						activeConfig.baseUrl = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIService();
					}));
		}

		// Model Selection
		containerEl.createEl('h3', { text: 'Model Settings' });

		new Setting(containerEl)
			.setName('AI Model')
			.setDesc('Select which model to use')
			.addDropdown(dropdown => {
				let availableModels: string[] = [];

				if (activeProvider === 'claude') {
					availableModels = [
						'claude-sonnet-4-20250514',
						'claude-sonnet-4-20241022',
						'claude-opus-4-20250514',
						'claude-haiku-3.5-20241022'
					];
				} else if (activeProvider === 'gemini') {
					availableModels = [
						'gemini-2.5-pro-latest',
						'gemini-2.5-flash-latest',
						'gemini-2.0-flash-exp',
						'gemini-1.5-pro-latest',
						'gemini-1.5-flash-latest'
					];
				} else if (activeProvider === 'openrouter') {
					availableModels = [
						'openrouter/auto',
						'openrouter/anthropic/claude-3.5-sonnet',
						'openrouter/anthropic/claude-3-haiku',
						'openrouter/openai/gpt-4o',
						'openrouter/google/gemini-2.0-flash',
						'openrouter/mistral/mistral-large',
						'openrouter/deepseek/deepseek-chat'
					];
				}

				availableModels.forEach(model => {
					dropdown.addOption(model, model);
				});

				dropdown.setValue(activeConfig.model);
				dropdown.onChange(async (value: AIModel) => {
					activeConfig.model = value;
					await this.plugin.saveSettings();
					await this.plugin.updateAIService();
				});
			});

		// Function Calling Toggle for API providers
		if (activeProvider === 'gemini' || activeProvider === 'openrouter') {
			new Setting(containerEl)
				.setName('Enable Function Calling for MCP')
				.setDesc('Allow the AI to use MCP tools via function calling. Only works when MCP servers are configured below.')
				.addToggle(toggle => toggle
					.setValue(activeConfig.enableFunctionCalling || false)
					.onChange(async (value) => {
						activeConfig.enableFunctionCalling = value;
						await this.plugin.saveSettings();
						await this.plugin.updateAIService();
					}));
		}

		// MCP Servers Configuration
		containerEl.createEl('h3', { text: 'MCP Servers' });

		const mcpContainer = containerEl.createEl('div', { cls: 'mcp-servers-container' });

		// Display existing MCP servers
		if (activeConfig.mcpServers && activeConfig.mcpServers.length > 0) {
			activeConfig.mcpServers.forEach((server, index) => {
				this.createMCPServerSetting(mcpContainer, server, index);
			});
		}

		// Add new MCP server button
		new Setting(containerEl)
			.setName('Add MCP Server')
			.setDesc('Add a new MCP server configuration')
			.addButton(button => button
				.setButtonText('Add Server')
				.setCta()
				.onClick(async () => {
					if (!activeConfig.mcpServers) {
						activeConfig.mcpServers = [];
					}
					activeConfig.mcpServers.push({
						name: `server-${Date.now()}`,
						command: '',
						args: [],
						env: {}
					});
					await this.plugin.saveSettings();
					this.display(); // Refresh the settings UI
				}));

		// Debug Settings
			containerEl.createEl('h3', { text: 'Debug' });

			new Setting(containerEl)
				.setName('Debug Context')
				.setDesc('Enable debug logging for troubleshooting (logs to console).')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.debugContext || false)
					.onChange(async (value) => {
						this.plugin.settings.debugContext = value;
						await this.plugin.saveSettings();
					}));

			// Error Handling Settings
			containerEl.createEl('h3', { text: 'Error Handling' });

			const errorHandling = this.plugin.settings.errorHandling || {
				showDetailedErrors: false,
				autoRetry: true,
				maxRetries: 3,
				initialRetryDelayMs: 1000,
				showConnectionStatus: true,
				timeoutSeconds: 60
			};

			new Setting(containerEl)
				.setName('Show Detailed Errors')
				.setDesc('Show full error details and stack traces for debugging.')
				.addToggle(toggle => toggle
					.setValue(errorHandling.showDetailedErrors || false)
					.onChange(async (value) => {
						errorHandling.showDetailedErrors = value;
						this.plugin.settings.errorHandling = errorHandling;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Auto-Retry Failed Requests')
				.setDesc('Automatically retry failed requests with exponential backoff.')
				.addToggle(toggle => toggle
					.setValue(errorHandling.autoRetry !== false)
					.onChange(async (value) => {
						errorHandling.autoRetry = value;
						this.plugin.settings.errorHandling = errorHandling;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Retry Count')
				.setDesc('Number of retry attempts for failed requests.')
				.addDropdown(dropdown => {
					dropdown.addOption('1', '1');
					dropdown.addOption('2', '2');
					dropdown.addOption('3', '3');
					dropdown.addOption('5', '5');
					dropdown.setValue(String(errorHandling.maxRetries || 3));
					dropdown.onChange(async (value) => {
						errorHandling.maxRetries = parseInt(value, 10);
						this.plugin.settings.errorHandling = errorHandling;
						await this.plugin.saveSettings();
					});
				});

			new Setting(containerEl)
				.setName('Show Connection Status')
				.setDesc('Display connection status indicator in the chat header.')
				.addToggle(toggle => toggle
					.setValue(errorHandling.showConnectionStatus !== false)
					.onChange(async (value) => {
						errorHandling.showConnectionStatus = value;
						this.plugin.settings.errorHandling = errorHandling;
						await this.plugin.saveSettings();
					}));

			// Chat UI Settings
			containerEl.createEl('h3', { text: 'Chat UI' });

			const chatUi = this.plugin.settings.chatUi || {
				enableMessageEditing: true,
				enableRegeneration: true,
				maxRegenerations: 5
			};

			new Setting(containerEl)
				.setName('Enable Message Editing')
				.setDesc('Allow editing sent messages and resending.')
				.addToggle(toggle => toggle
					.setValue(chatUi.enableMessageEditing !== false)
					.onChange(async (value) => {
						chatUi.enableMessageEditing = value;
						this.plugin.settings.chatUi = chatUi;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Enable Response Regeneration')
				.setDesc('Allow regenerating AI responses (max 5 per message).')
				.addToggle(toggle => toggle
					.setValue(chatUi.enableRegeneration !== false)
					.onChange(async (value) => {
						chatUi.enableRegeneration = value;
						this.plugin.settings.chatUi = chatUi;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Max Regenerations')
				.setDesc('Maximum number of regeneration attempts per message.')
				.addDropdown(dropdown => {
					dropdown.addOption('3', '3');
					dropdown.addOption('5', '5');
					dropdown.addOption('10', '10');
					dropdown.setValue(String(chatUi.maxRegenerations || 5));
					dropdown.onChange(async (value) => {
						chatUi.maxRegenerations = parseInt(value, 10);
						this.plugin.settings.chatUi = chatUi;
						await this.plugin.saveSettings();
					});
				});
		}

	private createMCPServerSetting(container: HTMLElement, server: MCPServer, index: number): void {
		const serverContainer = container.createEl('div', { cls: 'mcp-server-setting' });

		// Get tool count for this server
		const serverTools = this.plugin.mcpManager.getServerTools(server.name);
		const toolCount = serverTools.length;
		const toolCountText = toolCount > 0 ? ` (${toolCount} tools)` : '';

		// Server header with remove button
		new Setting(serverContainer)
			.setName(`Server ${index + 1}: ${server.name || 'Unnamed'}${toolCountText}`)
			.setDesc('MCP server configuration')
			.addButton(button => button
				.setButtonText('Remove')
				.setWarning()
				.onClick(async () => {
					const activeConfig = this.plugin.settings.providers[this.plugin.settings.activeProvider];
					if (activeConfig.mcpServers) {
						activeConfig.mcpServers.splice(index, 1);
						await this.plugin.saveSettings();
						await this.plugin.updateAIService();
						this.display(); // Refresh the settings UI
					}
				}));

		// Server name
		new Setting(serverContainer)
			.setName('Name')
			.addText(text => text
				.setPlaceholder('e.g., filesystem, brave-search, memory')
				.setValue(server.name)
				.onChange(async (value) => {
					server.name = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to update header
				}));

		// Server description
		new Setting(serverContainer)
			.setName('Description')
			.setDesc('Helps the AI understand when to use this server')
			.addTextArea(text => {
				text
					.setPlaceholder('e.g., "Use for web research and finding information online" or "Use for file operations like reading, writing, and listing files"')
					.setValue(server.description || '')
					.onChange(async (value) => {
						server.description = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 2;
				text.inputEl.style.width = '100%';
				return text;
			});

		// Command
		new Setting(serverContainer)
			.setName('Command')
			.addText(text => text
				.setPlaceholder('e.g., npx, node, python')
				.setValue(server.command)
				.onChange(async (value) => {
					server.command = value;
					await this.plugin.saveSettings();
				}));

		// Arguments
		new Setting(serverContainer)
			.setName('Arguments')
			.setDesc('Comma-separated arguments')
			.addTextArea(text => {
				text
					.setPlaceholder('e.g., -y, @modelcontextprotocol/server-filesystem, C:\\path\\to\\dir')
					.setValue(server.args?.join(', ') || '')
					.onChange(async (value) => {
						server.args = value.split(',').map(arg => arg.trim()).filter(arg => arg.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 2;
				text.inputEl.style.width = '100%';
				return text;
			});

		// Environment Variables
		new Setting(serverContainer)
			.setName('Environment Variables')
			.setDesc('One per line, format: KEY=value (e.g., DISCORD_TOKEN=abc123)')
			.addTextArea(text => {
				// Convert env object to string
				const envString = server.env 
					? Object.entries(server.env).map(([key, val]) => `${key}=${val}`).join('\n')
					: '';
				
				text
					.setPlaceholder('DISCORD_TOKEN=your_token_here\nOBSIDIAN_API_KEY=your_key_here\nBRAVE_API_KEY=your_key_here')
					.setValue(envString)
					.onChange(async (value) => {
						// Parse env string to object
						const envObj: Record<string, string> = {};
						const lines = value.split('\n').filter(line => line.trim().length > 0);
						
						for (const line of lines) {
							const equalIndex = line.indexOf('=');
							if (equalIndex > 0) {
								const key = line.substring(0, equalIndex).trim();
								const val = line.substring(equalIndex + 1).trim();
								if (key && val) {
									envObj[key] = val;
								}
							}
						}
						
						server.env = Object.keys(envObj).length > 0 ? envObj : undefined;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				text.inputEl.style.width = '100%';
				text.inputEl.style.fontFamily = 'monospace';
				return text;
			});
	}
}