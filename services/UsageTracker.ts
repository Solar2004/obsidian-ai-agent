import { App } from 'obsidian';

/**
 * UsageRecord represents a single API call's token and cost metrics.
 */
export interface UsageRecord {
	timestamp: string;       // ISO 8601
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsd: number;
	conversationId?: string;
	responseTimeMs?: number;
}

/**
 * Aggregated usage statistics
 */
export interface UsageStats {
	totalInputTokens: number;
	totalOutputTokens: number;
	totalTokens: number;
	totalCostUsd: number;
	totalMessages: number;
	byProvider: Record<string, {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		costUsd: number;
		messages: number;
	}>;
	byModel: Record<string, {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		costUsd: number;
		messages: number;
	}>;
}

/**
 * Pricing entry for a specific model
 */
export interface ModelPricing {
	provider: string;
	model: string;
	inputCostPerMillion: number;  // USD per 1M input tokens
	outputCostPerMillion: number; // USD per 1M output tokens
	lastUpdated: string;           // ISO 8601
}

/**
 * Usage alert threshold configuration
 */
export interface AlertThreshold {
	type: 'daily' | 'monthly';
	amount: number;       // USD
	enabled: boolean;
	triggeredAt?: string; // ISO 8601, when last triggered
}

/**
 * UsageTracker records API usage, aggregates statistics, and provides
 * cost estimation and alerting capabilities.
 *
 * Storage: .obsidian-ai-agent/usage.jsonl (JSON Lines format)
 * One JSON object per line, one line per API call
 */
export class UsageTracker {
	private app: App;
	private storagePath: string;
	private usageRecords: UsageRecord[] = [];
	private modelPricing: Map<string, ModelPricing> = new Map();
	private dailyAlert: AlertThreshold = { type: 'daily', amount: 5, enabled: false };
	private monthlyAlert: AlertThreshold = { type: 'monthly', amount: 50, enabled: false };
	private alertCallback: ((alert: { type: string; amount: number; triggeredAt: string }) => void) | null = null;

	// Default pricing (can be updated via settings)
	private defaultPricing: ModelPricing[] = [
		// Anthropic Claude models (via OpenRouter or direct)
		{ provider: 'claude', model: 'claude-sonnet-4-20250514', inputCostPerMillion: 3, outputCostPerMillion: 15, lastUpdated: '2026-04-01' },
		{ provider: 'claude', model: 'claude-opus-4-20250514', inputCostPerMillion: 15, outputCostPerMillion: 75, lastUpdated: '2026-04-01' },
		{ provider: 'claude', model: 'claude-haiku-3.5-20241022', inputCostPerMillion: 0.8, outputCostPerMillion: 4, lastUpdated: '2026-04-01' },

		// Google Gemini models
		{ provider: 'gemini', model: 'gemini-2.5-pro-latest', inputCostPerMillion: 1.25, outputCostPerMillion: 5, lastUpdated: '2026-04-01' },
		{ provider: 'gemini', model: 'gemini-2.5-flash-latest', inputCostPerMillion: 0.075, outputCostPerMillion: 0.30, lastUpdated: '2026-04-01' },
		{ provider: 'gemini', model: 'gemini-2.0-flash-exp', inputCostPerMillion: 0.075, outputCostPerMillion: 0.30, lastUpdated: '2026-04-01' },
		{ provider: 'gemini', model: 'gemini-1.5-pro-latest', inputCostPerMillion: 1.25, outputCostPerMillion: 5, lastUpdated: '2026-04-01' },
		{ provider: 'gemini', model: 'gemini-1.5-flash-latest', inputCostPerMillion: 0.075, outputCostPerMillion: 0.30, lastUpdated: '2026-04-01' },

		// OpenRouter models
		{ provider: 'openrouter', model: 'openrouter/anthropic/claude-3.5-sonnet', inputCostPerMillion: 3, outputCostPerMillion: 15, lastUpdated: '2026-04-01' },
		{ provider: 'openrouter', model: 'openrouter/anthropic/claude-3-haiku', inputCostPerMillion: 0.8, outputCostPerMillion: 4, lastUpdated: '2026-04-01' },
		{ provider: 'openrouter', model: 'openrouter/openai/gpt-4o', inputCostPerMillion: 2.5, outputCostPerMillion: 10, lastUpdated: '2026-04-01' },
		{ provider: 'openrouter', model: 'openrouter/google/gemini-2.0-flash', inputCostPerMillion: 0.075, outputCostPerMillion: 0.30, lastUpdated: '2026-04-01' },
		{ provider: 'openrouter', model: 'openrouter/mistral/mistral-large', inputCostPerMillion: 2, outputCostPerMillion: 8, lastUpdated: '2026-04-01' },
		{ provider: 'openrouter', model: 'openrouter/deepseek/deepseek-chat', inputCostPerMillion: 0.1, outputCostPerMillion: 0.3, lastUpdated: '2026-04-01' },
		{ provider: 'openrouter', model: 'openrouter/auto', inputCostPerMillion: 0, outputCostPerMillion: 0, lastUpdated: '2026-04-01' },
	];

	constructor(app: App, storagePath: string = '.obsidian-ai-agent') {
		this.app = app;
		this.storagePath = storagePath;

		// Initialize pricing map from defaults
		for (const pricing of this.defaultPricing) {
			const key = this.pricingKey(pricing.provider, pricing.model);
			this.modelPricing.set(key, pricing);
		}
	}

	private pricingKey(provider: string, model: string): string {
		return `${provider}:${model}`;
	}

	// ─────────────────────────────────────────────────────────────
	// Configuration
	// ─────────────────────────────────────────────────────────────

	/**
	 * Set a custom price for a model
	 */
	setModelPricing(provider: string, model: string, inputCostPerMillion: number, outputCostPerMillion: number): void {
		const key = this.pricingKey(provider, model);
		this.modelPricing.set(key, {
			provider,
			model,
			inputCostPerMillion,
			outputCostPerMillion,
			lastUpdated: new Date().toISOString()
		});
	}

	/**
	 * Get pricing for a model
	 */
	getModelPricing(provider: string, model: string): ModelPricing | null {
		return this.modelPricing.get(this.pricingKey(provider, model)) || null;
	}

	/**
	 * Configure alert thresholds
	 */
	setAlertThreshold(type: 'daily' | 'monthly', amount: number, enabled: boolean): void {
		if (type === 'daily') {
			this.dailyAlert = { type: 'daily', amount, enabled };
		} else {
			this.monthlyAlert = { type: 'monthly', amount, enabled };
		}
	}

	/**
	 * Register callback for when alerts are triggered
	 */
	onAlertTriggered(callback: (alert: { type: string; amount: number; triggeredAt: string }) => void): void {
		this.alertCallback = callback;
	}

	// ─────────────────────────────────────────────────────────────
	// Recording
	// ─────────────────────────────────────────────────────────────

	/**
	 * Record a usage event from API response metadata
	 */
	async recordUsage(
		provider: string,
		model: string,
		inputTokens: number,
		outputTokens: number,
		options?: {
			conversationId?: string;
			responseTimeMs?: number;
			costUsd?: number; // If already calculated by provider
		}
	): Promise<UsageRecord> {
		const totalTokens = inputTokens + outputTokens;

		// Calculate cost if not provided
		let costUsd = options?.costUsd;
		if (costUsd === undefined) {
			costUsd = this.calculateCost(provider, model, inputTokens, outputTokens);
		}

		const record: UsageRecord = {
			timestamp: new Date().toISOString(),
			provider,
			model,
			inputTokens,
			outputTokens,
			totalTokens,
			costUsd,
			conversationId: options?.conversationId,
			responseTimeMs: options?.responseTimeMs
		};

		this.usageRecords.push(record);
		await this.persistRecord(record);

		// Check alerts
		await this.checkAlerts();

		return record;
	}

	/**
	 * Calculate cost based on token counts and model pricing
	 */
	calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
		const pricing = this.getModelPricing(provider, model);

		if (!pricing) {
			// Fallback: estimate based on average pricing
			const avgInputPerM = 0.5;
			const avgOutputPerM = 1.5;
			return (inputTokens / 1_000_000) * avgInputPerM + (outputTokens / 1_000_000) * avgOutputPerM;
		}

		const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPerMillion;
		const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPerMillion;

		return inputCost + outputCost;
	}

	/**
	 * Persist a single record to the JSONL file
	 */
	private async persistRecord(record: UsageRecord): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const usageFilePath = `${this.storagePath}/usage.jsonl`;

			// Ensure directory exists
			const dirPath = this.storagePath;
			if (!await adapter.exists(dirPath)) {
				await adapter.mkdir(dirPath);
			}

			// Append to file
			const line = JSON.stringify(record) + '\n';
			const existing = await adapter.exists(usageFilePath)
				? await adapter.read(usageFilePath)
				: '';
			await adapter.write(usageFilePath, existing + line);
		} catch (error) {
			console.error('[UsageTracker] Failed to persist usage record:', error);
		}
	}

	/**
	 * Load all usage records from disk
	 */
	async loadUsageHistory(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const usageFilePath = `${this.storagePath}/usage.jsonl`;

			if (!await adapter.exists(usageFilePath)) {
				this.usageRecords = [];
				return;
			}

			const content = await adapter.read(usageFilePath);
			const lines = content.split('\n').filter(line => line.trim());

			this.usageRecords = lines.map(line => {
				try {
					return JSON.parse(line) as UsageRecord;
				} catch {
					return null;
				}
			}).filter((r): r is UsageRecord => r !== null);
		} catch (error) {
			console.error('[UsageTracker] Failed to load usage history:', error);
			this.usageRecords = [];
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Analytics & Aggregation
	// ─────────────────────────────────────────────────────────────

	/**
	 * Get usage statistics for a time range
	 */
	getStats(options?: {
		startDate?: Date;
		endDate?: Date;
		provider?: string;
		model?: string;
		conversationId?: string;
	}): UsageStats {
		let filtered = this.usageRecords;

		// Apply filters
		if (options?.startDate) {
			filtered = filtered.filter(r => new Date(r.timestamp) >= options.startDate!);
		}
		if (options?.endDate) {
			filtered = filtered.filter(r => new Date(r.timestamp) <= options.endDate!);
		}
		if (options?.provider) {
			filtered = filtered.filter(r => r.provider === options.provider);
		}
		if (options?.model) {
			filtered = filtered.filter(r => r.model === options.model);
		}
		if (options?.conversationId) {
			filtered = filtered.filter(r => r.conversationId === options.conversationId);
		}

		// Aggregate
		const stats: UsageStats = {
			totalInputTokens: 0,
			totalOutputTokens: 0,
			totalTokens: 0,
			totalCostUsd: 0,
			totalMessages: filtered.length,
			byProvider: {},
			byModel: {}
		};

		for (const record of filtered) {
			stats.totalInputTokens += record.inputTokens;
			stats.totalOutputTokens += record.outputTokens;
			stats.totalTokens += record.totalTokens;
			stats.totalCostUsd += record.costUsd;

			// By provider
			if (!stats.byProvider[record.provider]) {
				stats.byProvider[record.provider] = {
					inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, messages: 0
				};
			}
			stats.byProvider[record.provider].inputTokens += record.inputTokens;
			stats.byProvider[record.provider].outputTokens += record.outputTokens;
			stats.byProvider[record.provider].totalTokens += record.totalTokens;
			stats.byProvider[record.provider].costUsd += record.costUsd;
			stats.byProvider[record.provider].messages++;

			// By model
			if (!stats.byModel[record.model]) {
				stats.byModel[record.model] = {
					inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, messages: 0
				};
			}
			stats.byModel[record.model].inputTokens += record.inputTokens;
			stats.byModel[record.model].outputTokens += record.outputTokens;
			stats.byModel[record.model].totalTokens += record.totalTokens;
			stats.byModel[record.model].costUsd += record.costUsd;
			stats.byModel[record.model].messages++;
		}

		return stats;
	}

	/**
	 * Get today's usage
	 */
	getTodayStats(): UsageStats {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		return this.getStats({ startDate: today });
	}

	/**
	 * Get this week's usage (last 7 days)
	 */
	getWeekStats(): UsageStats {
		const weekAgo = new Date();
		weekAgo.setDate(weekAgo.getDate() - 7);

		return this.getStats({ startDate: weekAgo });
	}

	/**
	 * Get this month's usage
	 */
	getMonthStats(): UsageStats {
		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);

		return this.getStats({ startDate: monthStart });
	}

	/**
	 * Get daily breakdown for the last N days
	 */
	getDailyBreakdown(days: number = 7): Array<{ date: string; costUsd: number; tokens: number; messages: number }> {
		const result: Array<{ date: string; costUsd: number; tokens: number; messages: number }> = [];

		for (let i = days - 1; i >= 0; i--) {
			const date = new Date();
			date.setDate(date.getDate() - i);
			date.setHours(0, 0, 0, 0);

			const nextDate = new Date(date);
			nextDate.setDate(nextDate.getDate() + 1);

			const dayStats = this.getStats({
				startDate: date,
				endDate: nextDate
			});

			result.push({
				date: date.toISOString().split('T')[0],
				costUsd: dayStats.totalCostUsd,
				tokens: dayStats.totalTokens,
				messages: dayStats.totalMessages
			});
		}

		return result;
	}

	/**
	 * Get usage for a specific conversation
	 */
	getConversationUsage(conversationId: string): UsageStats {
		return this.getStats({ conversationId });
	}

	// ─────────────────────────────────────────────────────────────
	// Alerts
	// ─────────────────────────────────────────────────────────────

	/**
	 * Check if any alert thresholds have been exceeded
	 */
	private async checkAlerts(): Promise<void> {
		const now = new Date().toISOString();

		// Check daily alert
		if (this.dailyAlert.enabled) {
			const todayStats = this.getTodayStats();
			if (todayStats.totalCostUsd >= this.dailyAlert.amount) {
				if (!this.dailyAlert.triggeredAt || !this.isSameDay(new Date(this.dailyAlert.triggeredAt), new Date())) {
					this.dailyAlert.triggeredAt = now;
					this.triggerAlert('daily', this.dailyAlert.amount, todayStats.totalCostUsd);
				}
			}
		}

		// Check monthly alert
		if (this.monthlyAlert.enabled) {
			const monthStats = this.getMonthStats();
			if (monthStats.totalCostUsd >= this.monthlyAlert.amount) {
				const currentMonth = new Date().getMonth();
				const lastTriggeredMonth = this.monthlyAlert.triggeredAt ? new Date(this.monthlyAlert.triggeredAt).getMonth() : -1;

				if (currentMonth !== lastTriggeredMonth) {
					this.monthlyAlert.triggeredAt = now;
					this.triggerAlert('monthly', this.monthlyAlert.amount, monthStats.totalCostUsd);
				}
			}
		}
	}

	private triggerAlert(type: string, threshold: number, currentAmount: number): void {
		if (this.alertCallback) {
			this.alertCallback({
				type,
				amount: currentAmount,
				triggeredAt: new Date().toISOString()
			});
		}

		// Also emit an Obsidian notice
		const noticeMsg = type === 'daily'
			? `Daily usage alert: $${currentAmount.toFixed(2)} exceeded $${threshold} budget`
			: `Monthly usage alert: $${currentAmount.toFixed(2)} exceeded $${threshold} budget`;

		// @ts-ignore - Notice is available in Obsidian
		if (this.app?.notifications) {
			// @ts-ignore
			this.app.notifications.showWarning(noticeMsg);
		}
	}

	private isSameDay(a: Date, b: Date): boolean {
		return a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
	}

	// ─────────────────────────────────────────────────────────────
	// Export
	// ─────────────────────────────────────────────────────────────

	/**
	 * Export usage data to JSON
	 */
	async exportUsageData(startDate?: Date, endDate?: Date): Promise<string> {
		const stats = this.getStats({ startDate, endDate });
		const records = this.usageRecords.filter(r => {
			const date = new Date(r.timestamp);
			if (startDate && date < startDate) return false;
			if (endDate && date > endDate) return false;
			return true;
		});

		return JSON.stringify({
			exportedAt: new Date().toISOString(),
			period: { start: startDate?.toISOString(), end: endDate?.toISOString() },
			stats,
			records
		}, null, 2);
	}

	/**
	 * Clear usage history
	 */
	async clearHistory(): Promise<void> {
		this.usageRecords = [];

		try {
			const adapter = this.app.vault.adapter;
			const usageFilePath = `${this.storagePath}/usage.jsonl`;

			if (await adapter.exists(usageFilePath)) {
				await adapter.write(usageFilePath, '');
			}
		} catch (error) {
			console.error('[UsageTracker] Failed to clear history:', error);
		}
	}
}
