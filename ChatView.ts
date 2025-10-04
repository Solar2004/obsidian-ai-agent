import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type { AIChatSettings } from './types';
import { spawn, ChildProcess } from 'child_process';
import { CommandDetector } from './commandDetector';
import type { AIService } from './services/ai/AIService';
import { MCPManager } from './services/mcp/MCPManager';

export const VIEW_TYPE_AI_CHAT = 'ai-chat-view';

interface TextBlock {
	type: "text";
	text: string;
}

interface ToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, any>;
}

interface ToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	content?: string;
	is_error?: boolean;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: ContentBlock[];
	model?: string;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		service_tier?: string;
	};
}

interface ChatMessage {
	type: "assistant" | "user" | "result" | "system" | "error";
	message?: Message;
	subtype?: "success" | "error" | "init";
	duration_ms?: number;
	duration_api_ms?: number;
	is_error?: boolean;
	num_turns?: number;
	result?: string;
	session_id: string;
	total_cost_usd?: number;
	uuid: string;
	timestamp?: Date;
	isUserInput?: boolean;
	errorDetails?: {
		title: string;
		message: string;
		stack?: string;
		fullError?: any;
	};
}

export class AIChatView extends ItemView {
	settings: AIChatSettings;
	aiService: AIService;
	mcpManager: MCPManager;
	messages: ChatMessage[] = [];
	chatContainer: HTMLElement;
	messagesContainer: HTMLElement;
	inputContainer: HTMLElement;
	inputField: HTMLTextAreaElement;
	currentSessionId: string | null = null;
	includeFileContext: boolean = true;
	fileContextHeader: HTMLElement;
	isProcessing: boolean = false;
	sendButton: HTMLButtonElement;
	loadingIndicator: HTMLElement;

	constructor(leaf: WorkspaceLeaf, settings: AIChatSettings, aiService: AIService, mcpManager: MCPManager) {
		super(leaf);
		this.settings = settings;
		this.aiService = aiService;
		this.mcpManager = mcpManager;
	}

	getViewType() {
		return VIEW_TYPE_AI_CHAT;
	}

	getDisplayText() {
		return 'AI Chat';
	}

	getIcon() {
		return 'sparkles';
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('ai-chat-container');

		this.createChatInterface(container);
	}

	createChatInterface(container: HTMLElement) {
		// Add header with new chat button
		const headerEl = container.createEl('div', { cls: 'ai-chat-header' });
		
		// Add MCP status indicator
		const titleContainer = headerEl.createEl('div', { cls: 'ai-title-container' });
		titleContainer.createEl('div', { 
			text: 'AI Agent',
			cls: 'ai-chat-title'
		});
		
		// MCP status badge
		const mcpBadge = titleContainer.createEl('div', { cls: 'ai-mcp-badge' });
		this.updateMCPBadge(mcpBadge);
		
		const buttonGroupEl = headerEl.createEl('div', { cls: 'ai-header-buttons' });
		
		const examplesButton = buttonGroupEl.createEl('button', {
			text: 'Examples',
			cls: 'ai-examples-button'
		});

		const settingsButton = buttonGroupEl.createEl('button', {
			cls: 'ai-settings-button',
			attr: { 'aria-label': 'Plugin settings' }
		});
		setIcon(settingsButton, 'settings');

		const newChatButton = buttonGroupEl.createEl('button', {
			cls: 'ai-new-chat-button',
			attr: { 'aria-label': 'New chat' }
		});
		setIcon(newChatButton, 'plus');
				
		newChatButton.addEventListener('click', () => this.startNewChat());
		settingsButton.addEventListener('click', () => this.openSettings());
		examplesButton.addEventListener('click', () => {
			this.startNewChat(); // Clear existing messages first
			this.addExampleMessages(); // Add example messages
		});

		this.chatContainer = container.createEl('div', { cls: 'ai-chat-body' });

		this.messagesContainer = this.chatContainer.createEl('div', { cls: 'ai-chat-messages' });

		this.inputContainer = container.createEl('div', { cls: 'ai-chat-input-container' });
		
		// Add file context header above the input field
		this.fileContextHeader = this.inputContainer.createEl('div', { cls: 'ai-file-context-header' });
		const fileContextToggle = this.fileContextHeader.createEl('div', { 
			cls: 'ai-file-context-toggle',
			attr: { 'aria-label': 'Add current page\'s context to message' }
		});
		
		const fileIcon = fileContextToggle.createEl('span', { cls: 'ai-file-context-icon' });
		setIcon(fileIcon, 'file-text');
		
		const fileContextText = fileContextToggle.createEl('span', { cls: 'ai-file-context-text' });
		this.updateFileContextDisplay(fileContextText);
		
		// Set initial active state based on includeFileContext
		fileContextToggle.toggleClass('active', this.includeFileContext);
		
		fileContextToggle.addEventListener('click', () => {
			this.includeFileContext = !this.includeFileContext;
			fileContextToggle.toggleClass('active', this.includeFileContext);
			this.updateFileContextDisplay(fileContextText);
		});
		
		this.inputField = this.inputContainer.createEl('textarea', {
			cls: 'ai-chat-input',
			attr: {
				placeholder: 'Type your message (press Enter to send and Shift+Enter for a new line)...',
				rows: '3'
			}
		}) as HTMLTextAreaElement;

		const buttonContainer = this.inputContainer.createEl('div', { cls: 'ai-chat-button-container' });
		
		// Create loading indicator (initially hidden)
		this.loadingIndicator = buttonContainer.createEl('div', { cls: 'ai-loading-indicator hidden' });
		this.loadingIndicator.createEl('div', { cls: 'ai-loading-spinner' });
		
		this.sendButton = buttonContainer.createEl('button', {
			cls: 'ai-chat-send-button',
			attr: { 'aria-label': 'Send message' }
		}) as HTMLButtonElement;
		setIcon(this.sendButton, 'corner-down-right');

		this.sendButton.addEventListener('click', () => this.handleButtonClick());
		this.inputField.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.handleButtonClick();
			}
			// Shift+Enter allows normal newline behavior
		});

		// Auto-resize functionality
		this.inputField.addEventListener('input', () => {
			this.autoResizeTextarea();
		});

		// Set initial height
		this.autoResizeTextarea();
	}

	autoResizeTextarea() {
		// Reset height to auto to get the natural height
		this.inputField.style.height = 'auto';
		
		// Get the CSS min-height value (2.5rem)
		const computedStyle = getComputedStyle(this.inputField);
		const minHeight = parseFloat(computedStyle.minHeight);
		
		// Use the larger of scroll height or min-height
		const newHeight = Math.max(this.inputField.scrollHeight, minHeight);
		this.inputField.style.height = newHeight + 'px';
		
		// Ensure it doesn't exceed the CSS max-height (50vh)
		const maxHeight = window.innerHeight * 0.5; // 50vh
		if (newHeight > maxHeight) {
			this.inputField.style.height = maxHeight + 'px';
		}
	}

	addMessage(message: ChatMessage) {
		this.messages.push(message);
		this.renderMessage(message);
	}

	renderMessage(chatMessage: ChatMessage) {
		try {
			// Handle error messages with special rendering
			if (chatMessage.type === 'error') {
				this.renderErrorMessage(chatMessage);
				return;
			}

			// Determine the CSS class based on message type and origin
			let cssClass = 'ai-chat-message';
			if (chatMessage.isUserInput) {
				cssClass += ' ai-chat-message-user';
			} else if (chatMessage.type === 'result') {
				// Final response gets special styling
				cssClass += ' ai-chat-message-final-response';
			} else {
				// All other Claude messages (assistant, user from stream, system) get assistant styling
				cssClass += ' ai-chat-message-assistant';
			}
			
			const messageEl = this.messagesContainer.createEl('div', { cls: cssClass });
			
			// Handle different message types with special treatments
			if (chatMessage.type === 'user' && !chatMessage.isUserInput) {
				// Claude's self-thought presented as "Thinking..."
				this.renderThinkingMessage(messageEl, chatMessage);
			} else if (chatMessage.type === 'assistant') {
				// Claude's self-thought - show without collapse
				this.renderAssistantThought(messageEl, chatMessage);
			} else if (chatMessage.type === 'result') {
				// Final assistant response
				this.renderFinalResponse(messageEl, chatMessage);
			} else {			
				const contentEl = messageEl.createEl('div', { cls: 'ai-message-content' });
				this.renderMessageContent(contentEl, chatMessage);
			}
			
			// Only show timestamps for user input messages and final result messages
			if (chatMessage.timestamp && (chatMessage.isUserInput || chatMessage.type === 'result')) {
				const timestampEl = messageEl.createEl('div', { cls: 'ai-message-timestamp' });
				timestampEl.setText(chatMessage.timestamp.toLocaleTimeString());
			}
			
			// Use requestAnimationFrame for smoother scrolling
			requestAnimationFrame(() => {
				this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
			});
		} catch (error) {
			console.error('Error rendering message:', error, chatMessage);
		}
	}

	renderErrorMessage(chatMessage: ChatMessage) {
		const errorContainer = this.messagesContainer.createEl('div', { cls: 'ai-error-message-container' });

		// Error icon
		const errorIcon = errorContainer.createEl('div', { cls: 'ai-error-icon' });
		setIcon(errorIcon, 'alert-circle');

		// Error content
		const errorContent = errorContainer.createEl('div', { cls: 'ai-error-content' });

		// Error title
		const errorTitle = errorContent.createEl('div', { cls: 'ai-error-title' });
		errorTitle.setText(chatMessage.errorDetails?.title || 'Error');

		// Error message
		const errorMessage = errorContent.createEl('div', { cls: 'ai-error-message' });
		errorMessage.setText(chatMessage.errorDetails?.message || chatMessage.result || 'An error occurred');

		// Toggle for showing details
		if (chatMessage.errorDetails?.stack || chatMessage.errorDetails?.fullError) {
			const toggleLink = errorContent.createEl('div', { cls: 'ai-error-toggle' });
			toggleLink.setText('Show details');

			// Error details (initially hidden)
			const errorDetails = errorContent.createEl('div', { cls: 'ai-error-details collapsed' });
			
			let detailsText = '';
			if (chatMessage.errorDetails?.stack) {
				detailsText += `Stack trace:\n${chatMessage.errorDetails.stack}\n\n`;
			}
			if (chatMessage.errorDetails?.fullError) {
				detailsText += `Full error:\n${JSON.stringify(chatMessage.errorDetails.fullError, null, 2)}`;
			}
			errorDetails.setText(detailsText);

			// Toggle functionality
			let isExpanded = false;
			toggleLink.addEventListener('click', () => {
				isExpanded = !isExpanded;
				if (isExpanded) {
					errorDetails.removeClass('collapsed');
					toggleLink.setText('Hide details');
				} else {
					errorDetails.addClass('collapsed');
					toggleLink.setText('Show details');
				}
			});

			// Click on icon also toggles
			errorIcon.addEventListener('click', () => {
				toggleLink.click();
			});
		}

		// Timestamp
		if (chatMessage.timestamp) {
			const timestampEl = errorContent.createEl('div', { cls: 'ai-message-timestamp' });
			timestampEl.setText(chatMessage.timestamp.toLocaleTimeString());
		}

		// Auto scroll
		requestAnimationFrame(() => {
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		});
	}

	getDisplayName(type: string, isUserInput = false): string {
		switch (type) {
			case 'user': return isUserInput ? 'You' : 'Claude';
			case 'assistant': return 'Claude';
			case 'system': return 'System';
			case 'result': return 'Claude';
			default: return type;
		}
	}

	renderMessageContent(container: HTMLElement, chatMessage: ChatMessage) {
		try {
			if (chatMessage.message?.content) {
				chatMessage.message.content.forEach((content: ContentBlock) => {
					if (content.type === 'text') {
						const textEl = container.createEl('div', { cls: 'ai-message-text' });
						textEl.innerHTML = this.formatText(content.text);
					} else if (content.type === 'tool_use') {
						if (content.name === 'TodoWrite') {
							this.renderTodoCard(container, content);
						} else {
							this.renderCollapsibleTool(container, content);
						}
					} else if (content.type === 'tool_result') {
						const resultEl = container.createEl('div', { cls: 'ai-tool-result' });
						const pre = resultEl.createEl('pre');
						const resultText = content.content || 'No content';
						pre.createEl('code', { text: typeof resultText === 'string' ? resultText : JSON.stringify(resultText, null, 2) });
					}
				});
			} else if (chatMessage.result) {
				const resultEl = container.createEl('div', { cls: 'ai-final-result' });
				resultEl.innerHTML = this.formatText(chatMessage.result);
			} else if (chatMessage.subtype === 'init') {
				container.createEl('div', { 
					text: 'Cooking...', 
					cls: 'ai-system-init' 
				});
			} else if (chatMessage.subtype) {
				container.createEl('div', { text: `System: ${chatMessage.subtype}` });
			}
		} catch (error) {
			console.warn('Error rendering message content:', error, chatMessage);
			container.createEl('div', { 
				text: 'Error rendering message content', 
				cls: 'ai-error-message' 
			});
		}
	}

	renderTodoCard(container: HTMLElement, content: ToolUseBlock) {
		const cardEl = container.createEl('div', { cls: 'ai-todo-card' });
		const headerEl = cardEl.createEl('div', { cls: 'ai-todo-header' });
		headerEl.createEl('span', { text: 'Tasks', cls: 'ai-todo-title' });
		
		if (content.input?.todos) {
			const todosEl = cardEl.createEl('div', { cls: 'ai-todos-list' });
			content.input.todos.forEach((todo: any) => {
				const todoEl = todosEl.createEl('div', { cls: 'ai-todo-item' });
				
				const iconEl = todoEl.createEl('span', { cls: 'ai-todo-status' });
				if (todo.status === 'completed') {
					setIcon(iconEl, 'circle-check');
				} else if (todo.status === 'in_progress') {
					setIcon(iconEl, 'circle-ellipsis');
				} else {
					setIcon(iconEl, 'circle');
				}
				
				todoEl.createEl('span', { text: todo.content, cls: 'ai-todo-content' });
			});
		}
	}

	renderCollapsibleTool(container: HTMLElement, content: ToolUseBlock) {
		const toolEl = container.createEl('div', { cls: 'ai-tool-collapsible' });
		const headerEl = toolEl.createEl('div', { cls: 'ai-tool-header clickable' });
		
		headerEl.createEl('span', { text: `Using tool: ${content.name || 'Unknown'}`, cls: 'ai-tool-name' });
		
		const contentEl = toolEl.createEl('div', { cls: 'ai-tool-content collapsed' });
		if (content.input) {
			const pre = contentEl.createEl('pre');
			pre.createEl('code', { text: JSON.stringify(content.input, null, 2) });
		}
		
		headerEl.addEventListener('click', () => {
			if (contentEl.hasClass('collapsed')) {
				contentEl.removeClass('collapsed');
			} else {
				contentEl.addClass('collapsed');
			}
		});
	}

	renderThinkingMessage(messageEl: HTMLElement, chatMessage: ChatMessage) {
		// Check if this message contains tool results to use appropriate title
		const hasToolResults = chatMessage.message?.content?.some(content => content.type === 'tool_result');
		const headerText = hasToolResults ? 'Tool result' : 'Thinking...';
		
		const headerEl = messageEl.createEl('div', { cls: 'ai-thinking-header clickable' });
		headerEl.createEl('span', { text: headerText, cls: 'ai-thinking-label' });
		
		const contentEl = messageEl.createEl('div', { cls: 'ai-thinking-content collapsed' });
		this.renderMessageContent(contentEl, chatMessage);
		
		headerEl.addEventListener('click', () => {
			if (contentEl.hasClass('collapsed')) {
				contentEl.removeClass('collapsed');
			} else {
				contentEl.addClass('collapsed');
			}
		});
	}

	renderAssistantThought(messageEl: HTMLElement, chatMessage: ChatMessage) {		
		const contentEl = messageEl.createEl('div', { cls: 'ai-message-content ai-self-thought' });
		this.renderMessageContent(contentEl, chatMessage);
	}

	renderFinalResponse(messageEl: HTMLElement, chatMessage: ChatMessage) {		
		const contentEl = messageEl.createEl('div', { cls: 'ai-message-content ai-final-response' });
		this.renderMessageContent(contentEl, chatMessage);
	}

	formatText(text: string): string {
		// Basic markdown-like formatting
		return text
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			.replace(/`(.*?)`/g, '<code>$1</code>')
			.replace(/\n/g, '<br>');
	}

	getCurrentFilePath(): string | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			const vaultPath = (this.app.vault.adapter as any).basePath;
			return `${vaultPath}/${activeFile.path}`;
		}
		return null;
	}

	updateFileContextDisplay(textElement: HTMLElement) {
		textElement.setText('Current page');
	}


	handleButtonClick() {
		if (this.isProcessing) {
			this.cancelExecution();
		} else {
			this.handleSendMessage();
		}
	}

	cancelExecution() {
		this.aiService.cancel();
		this.setProcessingState(false);

		const cancelMessage: ChatMessage = {
			type: 'system',
			result: 'Message execution cancelled',
			session_id: this.currentSessionId || `session-${Date.now()}`,
			uuid: `cancel-${Date.now()}`,
			timestamp: new Date()
		};
		this.addMessage(cancelMessage);
	}

	setProcessingState(processing: boolean) {
		this.isProcessing = processing;
		
		if (processing) {
			// Change to cancel button
			this.sendButton.empty();
			setIcon(this.sendButton, 'square');
			this.sendButton.setAttribute('aria-label', 'Cancel processing');
			this.sendButton.addClass('ai-cancel-button');
			
			// Show loading indicator
			this.loadingIndicator.removeClass('hidden');
			
			// Disable input field
			this.inputField.disabled = true;
		} else {
			// Change back to send button
			this.sendButton.empty();
			setIcon(this.sendButton, 'corner-down-right');
			this.sendButton.setAttribute('aria-label', 'Send message');
			this.sendButton.removeClass('ai-cancel-button');
			
			// Hide loading indicator
			this.loadingIndicator.addClass('hidden');
			
			// Enable input field
			this.inputField.disabled = false;
		}
	}

	async handleSendMessage() {
		const messageText = this.inputField.value.trim();
		if (messageText && !this.isProcessing) {
			// Prepare message with optional file context
			let finalMessage = messageText;
			if (this.includeFileContext) {
				const currentFile = this.getCurrentFilePath();
				if (currentFile) {
					finalMessage = `Current file context: ${currentFile}\n\n${messageText}`;
				}
			}
			
			// Debug logging if enabled
			if (this.settings.debugContext) {
				console.log('=== DEBUG CONTEXT START ===');
				console.log('Active provider:', this.settings.activeProvider);
				console.log('Current model:', this.settings.providers[this.settings.activeProvider].model);
				console.log('New message context:', {
					originalMessage: messageText,
					finalMessage: finalMessage,
					includeFileContext: this.includeFileContext,
					currentFile: this.includeFileContext ? this.getCurrentFilePath() : null,
					sessionId: this.currentSessionId
				});
				console.log('=== DEBUG CONTEXT END ===');
			}
			
			const userMessage: ChatMessage = {
				type: 'user',
				message: {
					id: `msg-${Date.now()}`,
					role: 'user',
					content: [{ type: 'text', text: messageText }] // Show original message in UI
				},
				session_id: `session-${Date.now()}`,
				uuid: `user-${Date.now()}`,
				timestamp: new Date(),
				isUserInput: true // Mark as actual user input
			};
			
			this.addMessage(userMessage);
			this.inputField.value = '';
			this.autoResizeTextarea(); // Reset height after clearing
			this.setProcessingState(true);
			await this.executeCommand(finalMessage); // Send message with context to Claude
			this.setProcessingState(false);
		}
	}

	async executeCommand(prompt: string) {
		return new Promise<void>(async (resolve, reject) => {
			try {
				// Use the AI service to send the message
				const stream = await this.aiService.sendMessage(prompt, this.currentSessionId || undefined);

				// Process the streaming response
				for await (const response of stream) {
					this.processStreamingMessage(response);
				}

				resolve();
			} catch (error) {
				console.error('Error executing command:', error);
				
				// Parse error details
				let errorTitle = 'AI Service Error';
				let errorMessage = 'An unexpected error occurred';
				let errorStack = '';
				let fullError = null;

				if (error instanceof Error) {
					errorMessage = error.message;
					errorStack = error.stack || '';
					fullError = {
						name: error.name,
						message: error.message,
						stack: error.stack
					};

					// Detect specific error types
					if (errorMessage.includes('403')) {
						errorTitle = 'Authentication Error';
						errorMessage = 'Invalid or expired API key. Please check your API key in settings.';
					} else if (errorMessage.includes('404')) {
						errorTitle = 'Model Not Found';
						errorMessage = 'The selected model is not available. Please choose a different model in settings.';
					} else if (errorMessage.includes('429')) {
						errorTitle = 'Rate Limit Exceeded';
						errorMessage = 'Too many requests. Please wait a moment and try again.';
					} else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
						errorTitle = 'Service Unavailable';
						errorMessage = 'The AI service is temporarily unavailable. Please try again later.';
					} else if (errorMessage.includes('Network') || errorMessage.includes('network')) {
						errorTitle = 'Network Error';
						errorMessage = 'Unable to connect to the AI service. Please check your internet connection.';
					}
				} else {
					errorMessage = String(error);
					fullError = error;
				}

				const errorChatMessage: ChatMessage = {
					type: 'error',
					result: errorMessage,
					session_id: this.currentSessionId || `session-${Date.now()}`,
					uuid: `error-${Date.now()}`,
					timestamp: new Date(),
					errorDetails: {
						title: errorTitle,
						message: errorMessage,
						stack: errorStack,
						fullError: fullError
					}
				};
				
				this.addMessage(errorChatMessage);
				resolve();
			}
		});
	}

	async processStreamingMessage(response: any) {
		// Debug logging if enabled
		if (this.settings.debugContext) {
			console.log('=== STREAMING MESSAGE DEBUG ===');
			console.log('Received streaming message:', response);
		}

		// Handle different types of streaming messages
		if (response.type === 'system' && !response.content) {
			// Store session_id for future resume
			if (response.session_id && !this.currentSessionId) {
				this.currentSessionId = response.session_id;
			}

			// System initialization message - can be displayed or ignored
			const systemMessage: ChatMessage = {
				type: 'system',
				subtype: 'init',
				session_id: response.session_id || `session-${Date.now()}`,
				uuid: `system-${Date.now()}`,
				timestamp: new Date()
			};
			this.addMessage(systemMessage);
		} else if (response.type === 'text' && response.content) {
			// Text content - either assistant message or final result
			if (response.is_error) {
				// Error message
				const errorMessage: ChatMessage = {
					type: 'system',
					result: `Error: ${response.content}`,
					session_id: response.session_id || `session-${Date.now()}`,
					uuid: `error-${Date.now()}`,
					timestamp: new Date()
				};
				this.addMessage(errorMessage);
			} else if (response.duration_ms) {
				// Final result message
				const resultMessage: ChatMessage = {
					type: 'result',
					subtype: 'success',
					duration_ms: response.duration_ms,
					duration_api_ms: response.duration_api_ms || 0,
					is_error: false,
					num_turns: 1,
					result: response.content,
					session_id: response.session_id || `session-${Date.now()}`,
					total_cost_usd: response.total_cost_usd,
					uuid: `result-${Date.now()}`,
					timestamp: new Date()
				};
				this.addMessage(resultMessage);
			} else {
				// Assistant message
				const assistantMessage: ChatMessage = {
					type: 'assistant',
					message: {
						id: `msg-${Date.now()}`,
						role: 'assistant',
						content: [{ type: 'text', text: response.content }]
					},
					session_id: response.session_id || `session-${Date.now()}`,
					uuid: `assistant-${Date.now()}`,
					timestamp: new Date()
				};
				this.addMessage(assistantMessage);
			}
		} else if (response.type === 'tool_use' && response.tool_call) {
			// Tool use message
			const toolMessage: ChatMessage = {
				type: 'assistant',
				message: {
					id: `msg-${Date.now()}`,
					role: 'assistant',
					content: [{
						type: 'tool_use',
						id: response.tool_call.id,
						name: response.tool_call.name,
						input: response.tool_call.input
					}]
				},
				session_id: response.session_id || `session-${Date.now()}`,
				uuid: `tool-${Date.now()}`,
				timestamp: new Date()
			};
			this.addMessage(toolMessage);

			// Execute the tool if it's from an MCP server
			await this.executeMCPTool(response.tool_call);
		} else if (response.type === 'tool_result' && response.tool_result) {
			// Tool result message
			const toolResultMessage: ChatMessage = {
				type: 'user',
				message: {
					id: `msg-${Date.now()}`,
					role: 'user',
					content: [{
						type: 'tool_result',
						tool_use_id: response.tool_result.tool_use_id,
						content: response.tool_result.content,
						is_error: response.tool_result.is_error
					}]
				},
				session_id: response.session_id || `session-${Date.now()}`,
				uuid: `tool-result-${Date.now()}`,
				timestamp: new Date()
			};
			this.addMessage(toolResultMessage);
		}
	}

	async executeMCPTool(toolCall: { id: string; name: string; input: Record<string, any> }): Promise<void> {
		try {
			console.log(`🔧 Executing MCP tool: ${toolCall.name}`, toolCall.input);
			
			// Find which server has this tool
			const serverName = this.mcpManager.findServerForTool(toolCall.name);
			
			if (!serverName) {
				console.error(`❌ No MCP server found for tool: ${toolCall.name}`);
				return;
			}

			console.log(`📡 Found server for tool ${toolCall.name}: ${serverName}`);

			// Execute the tool
			const result = await this.mcpManager.executeTool(serverName, toolCall.name, toolCall.input);
			console.log(`✅ Tool execution result:`, result);

			// Send the result back to Gemini if using Gemini service
			const activeProvider = this.settings.providers[this.settings.activeProvider];
			if (activeProvider.provider === 'gemini' && activeProvider.enableFunctionCalling) {
				console.log(`📤 Sending tool result back to Gemini...`);
				// For Gemini, we need to send the function result back
				if (typeof (this.aiService as any).sendFunctionResult === 'function') {
					const resultStream = await (this.aiService as any).sendFunctionResult(toolCall.name, result);
					
					// Process the continued conversation
					for await (const response of resultStream) {
						this.processStreamingMessage(response);
					}
				}
			} else {
				// For Claude or other providers, show the result as a tool result message
				const toolResultMessage: ChatMessage = {
					type: 'user',
					message: {
						id: `msg-${Date.now()}`,
						role: 'user',
						content: [{
							type: 'tool_result',
							tool_use_id: toolCall.id,
							content: JSON.stringify(result),
							is_error: false
						}]
					},
					session_id: this.currentSessionId || `session-${Date.now()}`,
					uuid: `tool-result-${Date.now()}`,
					timestamp: new Date()
				};
				this.addMessage(toolResultMessage);
			}

		} catch (error) {
			console.error('Error executing MCP tool:', error);
			
			// Show error message
			const errorMessage: ChatMessage = {
				type: 'error',
				result: `Failed to execute tool ${toolCall.name}`,
				session_id: this.currentSessionId || `session-${Date.now()}`,
				uuid: `error-${Date.now()}`,
				timestamp: new Date(),
				errorDetails: {
					title: 'Tool Execution Error',
					message: `Failed to execute tool: ${toolCall.name}`,
					stack: error instanceof Error ? error.stack : undefined,
					fullError: error
				}
			};
			this.addMessage(errorMessage);
		}
	}

	startNewChat() {
		// Cancel any ongoing execution
		if (this.isProcessing) {
			this.cancelExecution();
		}
		
		// Clear the current session and messages
		this.currentSessionId = null;
		this.messages = [];
		
		// Clear the messages container
		this.messagesContainer.empty();
	}

	addExampleMessages() {
		const exampleSessionId = "4e639301-8fe0-4d70-a47e-db0b0605effa";
		
		// 1. User input message
		const userMessage: ChatMessage = {
			type: 'user',
			message: {
				id: 'msg-user-001',
				role: 'user',
				content: [{ type: 'text', text: 'Could you make a plan for finding the date, execute the necessary steps, and then tell me the current datetime?' }]
			},
			session_id: exampleSessionId,
			uuid: 'user-example-001',
			timestamp: new Date(),
			isUserInput: true
		};
		this.addMessage(userMessage);

		// 2. System init message
		const systemInitMessage: ChatMessage = {
			type: 'system',
			subtype: 'init',
			session_id: exampleSessionId,
			uuid: 'system-init-001',
			timestamp: new Date()
		};
		this.addMessage(systemInitMessage);

		// 3. Assistant message with text
		const assistantTextMessage: ChatMessage = {
			type: 'assistant',
			message: {
				id: 'msg_01QKejYVNzKEvJiLdgsjDnX8',
				role: 'assistant',
				content: [{ type: 'text', text: "I'll help you find the current datetime. Let me create a plan and execute it." }],
				model: 'claude-sonnet-4-20250514',
				usage: {
					input_tokens: 4,
					output_tokens: 7,
					service_tier: 'standard'
				}
			},
			session_id: exampleSessionId,
			uuid: 'assistant-text-001',
			timestamp: new Date()
		};
		this.addMessage(assistantTextMessage);

		// 4. Assistant message with TodoWrite tool use
		const todoToolMessage: ChatMessage = {
			type: 'assistant',
			message: {
				id: 'msg_01TodoExample',
				role: 'assistant',
				content: [{
					type: 'tool_use',
					id: 'toolu_01XraaAU5TbdkpPhUq9Gepry',
					name: 'TodoWrite',
					input: {
						todos: [
							{content: 'Get current datetime using system command', status: 'pending', activeForm: 'Getting current datetime using system command'},
							{content: 'Format and display the result', status: 'pending', activeForm: 'Formatting and displaying the result'}
						]
					}
				}],
				model: 'claude-sonnet-4-20250514'
			},
			session_id: exampleSessionId,
			uuid: 'todo-tool-001',
			timestamp: new Date()
		};
		this.addMessage(todoToolMessage);

		// 5. Tool result message (appears as user in stream)
		const toolResultMessage: ChatMessage = {
			type: 'user',
			message: {
				id: 'msg-tool-result-001',
				role: 'user',
				content: [{
					tool_use_id: 'toolu_01XraaAU5TbdkpPhUq9Gepry',
					type: 'tool_result',
					content: 'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable'
				}]
			},
			session_id: exampleSessionId,
			uuid: 'tool-result-001',
			timestamp: new Date()
		};
		this.addMessage(toolResultMessage);

		// 6. Assistant message with other tool use (Bash)
		const bashToolMessage: ChatMessage = {
			type: 'assistant',
			message: {
				id: 'msg_01BashExample',
				role: 'assistant',
				content: [{
					type: 'tool_use',
					id: 'toolu_0145mNNv4HW3V7LUTNwitdwd',
					name: 'Bash',
					input: {
						command: 'date',
						description: 'Get current date and time'
					}
				}],
				model: 'claude-sonnet-4-20250514'
			},
			session_id: exampleSessionId,
			uuid: 'bash-tool-001',
			timestamp: new Date()
		};
		this.addMessage(bashToolMessage);

		// 7. Tool result for Bash command
		const bashResultMessage: ChatMessage = {
			type: 'user',
			message: {
				id: 'msg-bash-result-001',
				role: 'user',
				content: [{
					tool_use_id: 'toolu_0145mNNv4HW3V7LUTNwitdwd',
					type: 'tool_result',
					content: 'Wed 27 Aug 2025 09:54:15 EDT',
					is_error: false
				}]
			},
			session_id: exampleSessionId,
			uuid: 'bash-result-001',
			timestamp: new Date()
		};
		this.addMessage(bashResultMessage);

		// 8. Todo update showing completed status
		const todoUpdateMessage: ChatMessage = {
			type: 'assistant',
			message: {
				id: 'msg_01TodoUpdate',
				role: 'assistant',
				content: [{
					type: 'tool_use',
					id: 'toolu_01TodoComplete',
					name: 'TodoWrite',
					input: {
						todos: [
							{content: 'Get current datetime using system command', status: 'completed', activeForm: 'Getting current datetime using system command'},
							{content: 'Format and display the result', status: 'in_progress', activeForm: 'Formatting and displaying the result'}
						]
					}
				}],
				model: 'claude-sonnet-4-20250514'
			},
			session_id: exampleSessionId,
			uuid: 'todo-update-001',
			timestamp: new Date()
		};
		this.addMessage(todoUpdateMessage);

		// 9. Final result message
		const finalResultMessage: ChatMessage = {
			type: 'result',
			result: 'The current datetime is: **Wednesday, August 27, 2025 at 9:54:15 AM EDT**',
			session_id: exampleSessionId,
			uuid: 'final-result-001',
			timestamp: new Date()
		};
		this.addMessage(finalResultMessage);
	}

	openSettings() {
		// Open the plugin settings tab
		(this.app as any).setting.open();
		(this.app as any).setting.openTabById('obsidian-terminal-ai');
	}

	async onClose() {
		// Cleanup when view is closed
		this.aiService.cancel();
	}

	updateSettings(settings: AIChatSettings) {
		this.settings = settings;
	}

	updateMCPBadge(badge: HTMLElement) {
		const tools = this.mcpManager.getAllTools();
		const servers = this.mcpManager.getRunningServers();
		
		if (servers.length > 0 && tools.length > 0) {
			badge.setText(`MCP: ${servers.length} servers, ${tools.length} tools`);
			badge.addClass('mcp-active');
			
			// Build detailed tooltip
			let tooltip = `${servers.length} server(s) running:\n\n`;
			servers.forEach(serverName => {
				const serverTools = this.mcpManager.getServerTools(serverName);
				tooltip += `• ${serverName}: ${serverTools.length} tools\n`;
			});
			tooltip += `\nTotal: ${tools.length} tools available`;
			
			badge.title = tooltip;
		} else {
			badge.setText('MCP: Off');
			badge.addClass('mcp-inactive');
			badge.title = 'No MCP servers configured. Go to Settings → MCP Servers';
		}
	}
}