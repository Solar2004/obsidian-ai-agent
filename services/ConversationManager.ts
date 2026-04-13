import { App, TFile } from 'obsidian';
import type { ChatMessage } from '../ChatView';

export interface ConversationMetadata {
	id: string;
	provider: string;
	model: string;
	created: string;        // ISO 8601
	updated: string;        // ISO 8601
	tags: string[];
	summary: string;        // First user message, truncated to 100 chars
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	estimatedCostUsd: number;
}

export interface SavedConversation {
	metadata: ConversationMetadata;
	messages: ChatMessage[];
}

/**
 * ConversationManager handles saving, loading, searching, and managing
 * chat conversations as Markdown files in the vault.
 *
 * Storage structure:
 *   .obsidian-ai-agent/conversations/{timestamp}_{provider}_{model_slug}.md
 *
 * File format:
 *   --- (YAML frontmatter with metadata)
 *   (Markdown content with messages)
 */
export class ConversationManager {
	private app: App;
	private storagePath: string;
	private autoSaveEnabled: boolean;
	private autoSaveIntervalSeconds: number;
	private saveTimer: NodeJS.Timeout | null = null;
	private currentConversationId: string | null = null;
	private pendingChanges: boolean = false;

	constructor(app: App, storagePath: string = '.obsidian-ai-agent/conversations') {
		this.app = app;
		this.storagePath = storagePath;
		this.autoSaveEnabled = false;
		this.autoSaveIntervalSeconds = 30;
	}

	// ─────────────────────────────────────────────────────────────
	// Initialization & Configuration
	// ─────────────────────────────────────────────────────────────

	/**
	 * Ensure the conversations directory exists
	 */
	async ensureStorageDirectory(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const basePath = this.getBasePath();

		if (!await adapter.exists(basePath)) {
			await adapter.mkdir(basePath);
		}
	}

	private getBasePath(): string {
		return this.storagePath;
	}

	/**
	 * Configure auto-save behavior
	 */
	setAutoSave(enabled: boolean, intervalSeconds: number = 30): void {
		this.autoSaveEnabled = enabled;
		this.autoSaveIntervalSeconds = intervalSeconds;

		if (this.saveTimer) {
			clearInterval(this.saveTimer);
			this.saveTimer = null;
		}

		if (enabled) {
			this.saveTimer = setInterval(() => {
				if (this.pendingChanges) {
					// Trigger save (fire-and-forget, errors logged internally)
					this.flushPendingChanges().catch(err => {
						console.error('[ConversationManager] Auto-save failed:', err);
					});
				}
			}, intervalSeconds * 1000);
		}
	}

	/**
	 * Mark conversation as having pending changes
	 */
	markDirty(conversationId: string): void {
		this.currentConversationId = conversationId;
		this.pendingChanges = true;
	}

	/**
	 * Flush any pending changes to disk
	 */
	async flushPendingChanges(): Promise<void> {
		this.pendingChanges = false;
		// Override in subclasses or call saveCurrentConversation() from outside
	}

	// ─────────────────────────────────────────────────────────────
	// File Naming & Path Helpers
	// ─────────────────────────────────────────────────────────────

	/**
	 * Generate a filename for a conversation
	 * Format: {timestamp}_{provider}_{model_slug}.md
	 */
	generateFilename(metadata: ConversationMetadata): string {
		const timestamp = new Date(metadata.created).toISOString().replace(/[:.]/g, '-');
		const provider = metadata.provider.toLowerCase();
		const modelSlug = metadata.model
			.replace(/[^a-zA-Z0-9]/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_|_$/g, '')
			.substring(0, 50);
		return `${timestamp}_${provider}_${modelSlug}.md`;
	}

	/**
	 * Extract metadata from a filename
	 */
	parseFilename(filename: string): { timestamp: string; provider: string; model: string } | null {
		// Match: {timestamp}_{provider}_{model}.md
		// timestamp format: 2026-04-12T10-30-00-000Z
		const regex = /^(.+?)_(.+?)_(.+)\.md$/;
		const match = filename.match(regex);

		if (!match) return null;

		const timestamp = match[1].replace(/-/g, ':').replace(/T(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3Z');

		return {
			timestamp,
			provider: match[2],
			model: match[3].replace(/_/g, '/')
		};
	}

	// ─────────────────────────────────────────────────────────────
	// Save Operations
	// ─────────────────────────────────────────────────────────────

	/**
	 * Save a conversation to disk
	 */
	async saveConversation(
		messages: ChatMessage[],
		metadata: Partial<ConversationMetadata> & { provider: string; model: string }
	): Promise<string> {
		await this.ensureStorageDirectory();

		const now = new Date().toISOString();
		const fullMetadata: ConversationMetadata = {
			id: metadata.id || this.generateConversationId(),
			provider: metadata.provider,
			model: metadata.model,
			created: metadata.created || now,
			updated: now,
			tags: metadata.tags || [],
			summary: metadata.summary || this.generateSummary(messages),
			inputTokens: metadata.inputTokens || 0,
			outputTokens: metadata.outputTokens || 0,
			totalTokens: metadata.totalTokens || 0,
			estimatedCostUsd: metadata.estimatedCostUsd || 0
		};

		const filename = this.generateFilename(fullMetadata);
		const filepath = `${this.getBasePath()}/${filename}`;
		const content = this.serializeConversation(fullMetadata, messages);

		await this.app.vault.create(filepath, content);

		this.currentConversationId = fullMetadata.id;
		this.pendingChanges = false;

		return fullMetadata.id;
	}

	/**
	 * Update an existing conversation (append new messages, update metadata)
	 */
	async updateConversation(
		conversationId: string,
		messages: ChatMessage[],
		metadataUpdate: Partial<ConversationMetadata>
	): Promise<void> {
		const file = await this.findConversationFile(conversationId);
		if (!file) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		const existing = await this.loadConversation(conversationId);
		if (!existing) {
			throw new Error(`Failed to load conversation: ${conversationId}`);
		}
		const updatedMetadata: ConversationMetadata = {
			...existing.metadata,
			...metadataUpdate,
			updated: new Date().toISOString()
		};

		const content = this.serializeConversation(updatedMetadata, messages);
		await this.app.vault.modify(file, content);

		this.pendingChanges = false;
	}

	/**
	 * Serialize conversation to Markdown with YAML frontmatter
	 */
	private serializeConversation(metadata: ConversationMetadata, messages: ChatMessage[]): string {
		const frontmatter = [
			'---',
			`id: ${metadata.id}`,
			`provider: ${metadata.provider}`,
			`model: ${metadata.model}`,
			`created: ${metadata.created}`,
			`updated: ${metadata.updated}`,
			`tags: [${metadata.tags.join(', ')}]`,
			`summary: "${metadata.summary}"`,
			`input_tokens: ${metadata.inputTokens}`,
			`output_tokens: ${metadata.outputTokens}`,
			`total_tokens: ${metadata.totalTokens}`,
			`estimated_cost_usd: ${metadata.estimatedCostUsd.toFixed(6)}`,
			'---',
			''
		].join('\n');

		const messageContent = messages.map(msg => this.serializeMessage(msg)).join('\n\n');

		return frontmatter + messageContent;
	}

	/**
	 * Serialize a single message to Markdown
	 */
	private serializeMessage(msg: ChatMessage): string {
		const role = msg.isUserInput ? 'user' : (msg.type === 'result' || msg.type === 'assistant' ? 'assistant' : msg.type);
		const timestamp = msg.timestamp ? msg.timestamp.toISOString() : new Date().toISOString();

		let content = '';

		if (msg.message?.content) {
			for (const block of msg.message.content) {
				if (block.type === 'text') {
					content += block.text;
				} else if (block.type === 'tool_use') {
					content += `\n\n[TOOL: ${block.name}]\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\`\n`;
				} else if (block.type === 'tool_result') {
					content += `\n\n[TOOL RESULT]\n\`\`\`\n${block.content}\n\`\`\`\n`;
				}
			}
		} else if (msg.result) {
			content = msg.result;
		} else if (msg.errorDetails) {
			content = `**Error**: ${msg.errorDetails.message}`;
		}

		return [
			`### [${role.toUpperCase()}] ${timestamp}`,
			'',
			content,
			''
		].join('\n');
	}

	// ─────────────────────────────────────────────────────────────
	// Load Operations
	// ─────────────────────────────────────────────────────────────

	/**
	 * Load a conversation by ID
	 */
	async loadConversation(conversationId: string): Promise<SavedConversation | null> {
		const file = await this.findConversationFile(conversationId);
		if (!file) return null;

		return this.parseConversationFile(file);
	}

	/**
	 * Load a conversation from a specific file
	 */
	async loadFromFile(file: TFile): Promise<SavedConversation | null> {
		try {
			const content = await this.app.vault.read(file);
			return this.parseConversationContent(file.name, content);
		} catch (error) {
			console.error(`[ConversationManager] Failed to load conversation from ${file.path}:`, error);
			return null;
		}
	}

	/**
	 * Parse a conversation file
	 */
	private async parseConversationFile(file: TFile): Promise<SavedConversation | null> {
		try {
			const content = await this.app.vault.read(file);
			return this.parseConversationContent(file.name, content);
		} catch (error) {
			console.error(`[ConversationManager] Failed to parse conversation file:`, error);
			return null;
		}
	}

	/**
	 * Parse conversation content (frontmatter + messages)
	 */
	private parseConversationContent(filename: string, content: string): SavedConversation | null {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

		if (!frontmatterMatch) return null;

		const frontmatter = this.parseFrontmatter(frontmatterMatch[1]);
		const messageContent = frontmatterMatch[2];

		const messages = this.parseMessages(messageContent);

		return {
			metadata: {
				id: frontmatter.id || this.generateConversationId(),
				provider: frontmatter.provider || 'unknown',
				model: frontmatter.model || 'unknown',
				created: frontmatter.created || new Date().toISOString(),
				updated: frontmatter.updated || new Date().toISOString(),
				tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
				summary: frontmatter.summary || '',
				inputTokens: parseInt(frontmatter.input_tokens) || 0,
				outputTokens: parseInt(frontmatter.output_tokens) || 0,
				totalTokens: parseInt(frontmatter.total_tokens) || 0,
				estimatedCostUsd: parseFloat(frontmatter.estimated_cost_usd) || 0
			},
			messages
		};
	}

	/**
	 * Parse YAML frontmatter (simple implementation)
	 */
	private parseFrontmatter(yaml: string): Record<string, string> {
		const result: Record<string, string> = {};
		const lines = yaml.split('\n');

		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex > 0) {
				const key = line.substring(0, colonIndex).trim();
				let value = line.substring(colonIndex + 1).trim();

				// Remove quotes
				if ((value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1);
				}

				result[key] = value;
			}
		}

		return result;
	}

	/**
	 * Parse messages from markdown content
	 */
	private parseMessages(content: string): ChatMessage[] {
		const messages: ChatMessage[] = [];
		const sections = content.split(/^### \[(USER|ASSISTANT|SYSTEM|ERROR)\] /m);

		for (let i = 1; i < sections.length; i += 2) {
			const role = sections[i].toLowerCase() as 'user' | 'assistant' | 'system' | 'error';
			const timestampAndContent = sections[i + 1] || '';

			const timestampMatch = timestampAndContent.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\n\n([\s\S]*)$/);

			if (timestampMatch) {
				const timestamp = new Date(timestampMatch[1]);
				const messageContent = timestampMatch[2].trim();

				// Check for tool calls
				const toolUseMatch = messageContent.match(/\[TOOL: (\w+)\]\n```json\n([\s\S]*?)\n```/);
				const toolResultMatch = messageContent.match(/\[TOOL RESULT\]\n```\n([\s\S]*?)\n```/);

				let message: ChatMessage;

				if (toolUseMatch) {
					message = {
						type: 'assistant',
						message: {
							id: `parsed-${Date.now()}-${i}`,
							role: 'assistant',
							content: [{
								type: 'tool_use',
								id: `tool-${Date.now()}-${i}`,
								name: toolUseMatch[1],
								input: JSON.parse(toolUseMatch[2])
							}]
						},
						session_id: 'imported',
						uuid: `imported-${Date.now()}-${i}`,
						timestamp
					};
				} else if (toolResultMatch) {
					message = {
						type: 'user',
						message: {
							id: `parsed-${Date.now()}-${i}`,
							role: 'user',
							content: [{
								type: 'tool_result',
								tool_use_id: `tool-${Date.now()}-${i - 1}`,
								content: toolResultMatch[1]
							}]
						},
						session_id: 'imported',
						uuid: `imported-${Date.now()}-${i}`,
						timestamp
					};
				} else {
					message = {
						type: role === 'user' ? 'user' : (role === 'error' ? 'error' : 'assistant'),
						message: {
							id: `parsed-${Date.now()}-${i}`,
						role: (role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
							content: [{ type: 'text', text: messageContent }]
						},
						session_id: 'imported',
						uuid: `imported-${Date.now()}-${i}`,
						timestamp,
						isUserInput: role === 'user'
					};
				}

				messages.push(message);
			}
		}

		return messages;
	}

	// ─────────────────────────────────────────────────────────────
	// List & Search Operations
	// ─────────────────────────────────────────────────────────────

	/**
	 * List all saved conversations (sorted by updated date, newest first)
	 */
	async listConversations(options?: {
		provider?: string;
		model?: string;
		tags?: string[];
		searchQuery?: string;
		limit?: number;
		offset?: number;
	}): Promise<ConversationMetadata[]> {
		await this.ensureStorageDirectory();

		const adapter = this.app.vault.adapter;
		const files = await adapter.list(this.getBasePath());

		const conversations: ConversationMetadata[] = [];

		for (const filename of files.files) {
			if (!filename.endsWith('.md')) continue;

			const file = this.app.vault.getAbstractFileByPath(filename);
			if (!(file instanceof TFile)) continue;

			const parsed = await this.loadFromFile(file);
			if (!parsed) continue;

			const meta = parsed.metadata;

			// Apply filters
			if (options?.provider && meta.provider !== options.provider) continue;
			if (options?.model && meta.model !== options.model) continue;
			if (options?.tags?.length) {
				const hasAllTags = options.tags.every(tag => meta.tags.includes(tag));
				if (!hasAllTags) continue;
			}
			if (options?.searchQuery) {
				const query = options.searchQuery.toLowerCase();
				const matchesSummary = meta.summary.toLowerCase().includes(query);
				const matchesModel = meta.model.toLowerCase().includes(query);
				const matchesProvider = meta.provider.toLowerCase().includes(query);
				if (!matchesSummary && !matchesModel && !matchesProvider) continue;
			}

			conversations.push(meta);
		}

		// Sort by updated date, newest first
		conversations.sort((a, b) =>
			new Date(b.updated).getTime() - new Date(a.updated).getTime()
		);

		// Apply pagination
		const offset = options?.offset || 0;
		const limit = options?.limit || 100;

		return conversations.slice(offset, offset + limit);
	}

	/**
	 * Search conversations by content
	 */
	async searchConversations(query: string, maxResults: number = 20): Promise<ConversationMetadata[]> {
		return this.listConversations({ searchQuery: query, limit: maxResults });
	}

	// ─────────────────────────────────────────────────────────────
	// Export / Import
	// ─────────────────────────────────────────────────────────────

	/**
	 * Export a conversation to a specific format
	 */
	async exportConversation(
		conversationId: string,
		format: 'markdown' | 'json' | 'html'
	): Promise<string> {
		const conversation = await this.loadConversation(conversationId);
		if (!conversation) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		switch (format) {
			case 'markdown':
				return this.serializeConversation(conversation.metadata, conversation.messages);
			case 'json':
				return JSON.stringify(conversation, null, 2);
			case 'html':
				return this.exportAsHtml(conversation);
			default:
				throw new Error(`Unsupported export format: ${format}`);
		}
	}

	/**
	 * Export conversation as styled HTML
	 */
	private exportAsHtml(conversation: SavedConversation): string {
		const messagesHtml = conversation.messages.map(msg => {
			const role = msg.isUserInput ? 'user' : (msg.type === 'result' ? 'assistant' : msg.type);
			const content = msg.message?.content?.[0]?.type === 'text'
				? msg.message.content[0].text
				: (msg.result || '');

			return `
				<div class="message message-${role}">
					<div class="message-role">${role}</div>
					<div class="message-content">${this.escapeHtml(content)}</div>
				</div>
			`;
		}).join('\n');

		return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<title>Conversation - ${conversation.metadata.summary}</title>
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
		.message { margin: 20px 0; padding: 15px; border-radius: 8px; }
		.message-user { background: #e3f2fd; }
		.message-assistant { background: #f5f5f5; }
		.message-role { font-weight: bold; font-size: 0.85em; color: #666; margin-bottom: 8px; }
		.message-content { line-height: 1.6; }
		.metadata { background: #fafafa; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 0.9em; color: #666; }
	</style>
</head>
<body>
	<h1>Conversation</h1>
	<div class="metadata">
		<strong>Provider:</strong> ${conversation.metadata.provider}<br>
		<strong>Model:</strong> ${conversation.metadata.model}<br>
		<strong>Created:</strong> ${conversation.metadata.created}<br>
		<strong>Tokens:</strong> ${conversation.metadata.totalTokens} ($${conversation.metadata.estimatedCostUsd.toFixed(4)})
	</div>
	${messagesHtml}
</body>
</html>
		`.trim();
	}

	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Import a conversation from a Markdown file
	 */
	async importConversation(file: TFile): Promise<string> {
		const parsed = await this.loadFromFile(file);
		if (!parsed) {
			throw new Error(`Failed to parse conversation file: ${file.path}`);
		}

		// Generate new ID and timestamp to avoid conflicts
		const newMetadata = {
			...parsed.metadata,
			id: this.generateConversationId(),
			created: new Date().toISOString(),
			updated: new Date().toISOString()
		};

		return this.saveConversation(parsed.messages, newMetadata);
	}

	// ─────────────────────────────────────────────────────────────
	// Conversation Lifecycle
	// ─────────────────────────────────────────────────────────────

	/**
	 * Delete a conversation
	 */
	async deleteConversation(conversationId: string): Promise<void> {
		const file = await this.findConversationFile(conversationId);
		if (file) {
			await this.app.vault.delete(file);
		}
	}

	/**
	 * Rename a conversation (update summary/tags)
	 */
	async renameConversation(conversationId: string, updates: {
		summary?: string;
		tags?: string[];
	}): Promise<void> {
		const conversation = await this.loadConversation(conversationId);
		if (!conversation) return;

		await this.updateConversation(conversationId, conversation.messages, {
			summary: updates.summary,
			tags: updates.tags
		});
	}

	/**
	 * Create a branch/copy of a conversation
	 */
	async branchConversation(conversationId: string, newSummary?: string): Promise<string> {
		const original = await this.loadConversation(conversationId);
		if (!original) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		return this.saveConversation(original.messages, {
			...original.metadata,
			id: this.generateConversationId(),
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			summary: newSummary || `Branch: ${original.metadata.summary}`,
			tags: [...original.metadata.tags, 'branch']
		});
	}

	// ─────────────────────────────────────────────────────────────
	// Helpers
	// ─────────────────────────────────────────────────────────────

	private generateConversationId(): string {
		return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	private generateSummary(messages: ChatMessage[]): string {
		const firstUserMessage = messages.find(m => m.isUserInput);
		const text = firstUserMessage?.message?.content?.[0]?.type === 'text'
			? firstUserMessage.message.content[0].text
			: '';

		const truncated = text.substring(0, 100);
		return truncated.length < text.length ? `${truncated}...` : truncated;
	}

	private async findConversationFile(conversationId: string): Promise<TFile | null> {
		const adapter = this.app.vault.adapter;

		try {
			const listing = await adapter.list(this.getBasePath());
			for (const filepath of listing.files) {
				if (!filepath.endsWith('.md')) continue;

				const file = this.app.vault.getAbstractFileByPath(filepath);
				if (!(file instanceof TFile)) continue;

				const parsed = await this.loadFromFile(file);
				if (parsed?.metadata.id === conversationId) {
					return file;
				}
			}
		} catch {
			// Directory doesn't exist yet
		}

		return null;
	}

	/**
	 * Cleanup when plugin unloads
	 */
	destroy(): void {
		if (this.saveTimer) {
			clearInterval(this.saveTimer);
			this.saveTimer = null;
		}
	}
}
