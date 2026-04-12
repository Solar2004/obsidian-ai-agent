/**
 * Error Handler Service
 *
 * Provides centralized error handling with:
 * - Error categorization for actionable user messages
 * - Exponential backoff retry logic
 * - Connection status tracking
 */

import type { AIProviderConfig } from '../types';

// Error categories with user-facing messages and troubleshooting
export enum ErrorCategory {
	INVALID_API_KEY = 'INVALID_API_KEY',
	RATE_LIMIT = 'RATE_LIMIT',
	NETWORK_ERROR = 'NETWORK_ERROR',
	SERVER_ERROR = 'SERVER_ERROR',
	TIMEOUT = 'TIMEOUT',
	MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
	CONTEXT_LENGTH = 'CONTEXT_LENGTH',
	AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
	UNKNOWN = 'UNKNOWN'
}

export interface RetryConfig {
	maxRetries: number; // Default: 3
	initialDelayMs: number; // Default: 1000ms
	maxDelayMs: number; // Default: 30000ms
	backoffMultiplier: number; // Default: 2
}

export interface ErrorInfo {
	category: ErrorCategory;
	title: string;
	message: string;
	troubleshooting: string;
	retryable: boolean;
	statusCode?: number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export interface RetryState {
	attempts: number;
	nextRetryMs: number;
	isRetrying: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2
};

export class ErrorHandler {
	private retryConfig: RetryConfig;
	private connectionStatus: ConnectionStatus = 'disconnected';
	private retryState: RetryState = {
		attempts: 0,
		nextRetryMs: 0,
		isRetrying: false
	};
	private statusListeners: Array<(status: ConnectionStatus) => void> = [];

	constructor(config?: Partial<RetryConfig>) {
		this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
	}

	/**
	 * Categorize an error and return structured error info
	 */
	categorizeError(error: Error | string, statusCode?: number): ErrorInfo {
		const message = error instanceof Error ? error.message : error;
		const code = statusCode || this.extractStatusCode(message);

		// Check for specific error patterns
		if (this.isInvalidApiKey(message, code)) {
			return {
				category: ErrorCategory.INVALID_API_KEY,
				title: 'Authentication Error',
				message: 'Invalid API key. Please check your settings.',
				troubleshooting: 'Go to Settings → Provider and verify your API key is correct.',
				retryable: false,
				statusCode: code
			};
		}

		if (this.isRateLimit(message, code)) {
			return {
				category: ErrorCategory.RATE_LIMIT,
				title: 'Rate Limit Exceeded',
				message: `Rate limit exceeded. Retrying in {seconds} seconds...`,
				troubleshooting: 'Please wait and try again. Consider reducing request frequency.',
				retryable: true,
				statusCode: code
			};
		}

		if (this.isNetworkError(message, code)) {
			return {
				category: ErrorCategory.NETWORK_ERROR,
				title: 'Network Error',
				message: 'Connection failed. Check your internet connection.',
				troubleshooting: 'Verify your internet connection and try again.',
				retryable: true,
				statusCode: code
			};
		}

		if (this.isServerError(message, code)) {
			return {
				category: ErrorCategory.SERVER_ERROR,
				title: 'Service Unavailable',
				message: 'Provider server error. Retrying...',
				troubleshooting: 'The AI service is temporarily unavailable. Will automatically retry.',
				retryable: true,
				statusCode: code
			};
		}

		if (this.isTimeout(message, code)) {
			return {
				category: ErrorCategory.TIMEOUT,
				title: 'Request Timeout',
				message: 'Request timed out. Try again?',
				troubleshooting: 'The request took too long. Try again or use a faster model.',
				retryable: true,
				statusCode: code
			};
		}

		if (this.isModelUnavailable(message, code)) {
			return {
				category: ErrorCategory.MODEL_UNAVAILABLE,
				title: 'Model Not Available',
				message: 'Model not available. Try a different model.',
				troubleshooting: 'Go to Settings → Model and select an available alternative.',
				retryable: false,
				statusCode: code
			};
		}

		if (this.isContextLength(message, code)) {
			return {
				category: ErrorCategory.CONTEXT_LENGTH,
				title: 'Conversation Too Long',
				message: 'Conversation too long. Start a new chat.',
				troubleshooting: 'Start a new chat to continue the conversation.',
				retryable: false,
				statusCode: code
			};
		}

		if (this.isAuthTokenExpired(message, code)) {
			return {
				category: ErrorCategory.AUTH_TOKEN_EXPIRED,
				title: 'Session Expired',
				message: 'Session expired. Re-authenticate.',
				troubleshooting: 'Please re-authenticate to continue using the service.',
				retryable: false,
				statusCode: code
			};
		}

		// Default unknown error
		return {
			category: ErrorCategory.UNKNOWN,
			title: 'Error',
			message: message || 'An unexpected error occurred.',
			troubleshooting: 'Check the detailed error message or try again.',
			retryable: false,
			statusCode: code
		};
	}

	/**
	 * Extract status code from error message
	 */
	private extractStatusCode(message: string): number {
		const match = message.match(/\b(\d{3})\b/);
		return match ? parseInt(match[1], 10) : 0;
	}

	private isInvalidApiKey(message: string, code?: number): boolean {
		return message.includes('401') ||
			message.includes('403') ||
			message.includes('invalid') ||
			message.includes('unauthorized') ||
			message.includes('api key') ||
			code === 401 ||
			code === 403;
	}

	private isRateLimit(message: string, code?: number): boolean {
		return message.includes('429') ||
			message.includes('rate limit') ||
			message.includes('too many requests') ||
			code === 429;
	}

	private isNetworkError(message: string, code?: number): boolean {
		return message.includes('Network') ||
			message.includes('network') ||
			message.includes('ENOTFOUND') ||
			message.includes('ECONNREFUSED') ||
			message.includes('fetch') ||
			message.includes('connection');
	}

	private isServerError(message: string, code?: number): boolean {
		return message.includes('500') ||
			message.includes('502') ||
			message.includes('503') ||
			message.includes('504') ||
			message.includes('server error') ||
			message.includes('internal error') ||
			(code !== undefined && code >= 500);
	}

	private isTimeout(message: string, code?: number): boolean {
		return message.includes('timeout') ||
			message.includes('timed out') ||
			message.includes('ETIMEDOUT') ||
			code === 408;
	}

	private isModelUnavailable(message: string, code?: number): boolean {
		return message.includes('404') ||
			message.includes('model not found') ||
			message.includes('not available') ||
			code === 404;
	}

	private isContextLength(message: string, code?: number): boolean {
		return message.includes('context length') ||
			message.includes('too many tokens') ||
			message.includes('maximum context') ||
			message.includes('token limit') ||
			code === 422; // Some APIs return 422 for context length issues
	}

	private isAuthTokenExpired(message: string, code?: number): boolean {
		return message.includes('token') ||
			message.includes('expired') ||
			message.includes('session') ||
			message.includes('unauthorized') && code === 401;
	}

	/**
	 * Calculate delay for next retry using exponential backoff with jitter
	 */
	calculateRetryDelay(attempt: number): number {
		const delay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
		const cappedDelay = Math.min(delay, this.retryConfig.maxDelayMs);
		// Add jitter to prevent thundering herd: 50-100% of calculated delay
		const jitter = 0.5 + Math.random() * 0.5;
		return Math.floor(cappedDelay * jitter);
	}

	/**
	 * Execute a function with retry logic
	 */
	async withRetry<T>(
		fn: () => Promise<T>,
		onRetry?: (attempt: number, delayMs: number, error: Error) => void,
		onFinalError?: (error: Error, errorInfo: ErrorInfo) => void
	): Promise<T> {
		let lastError: Error;

		for (let attempt = 1; attempt <= this.retryConfig.maxRetries + 1; attempt++) {
			try {
				const result = await fn();
				this.retryState = { attempts: 0, nextRetryMs: 0, isRetrying: false };
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				const errorInfo = this.categorizeError(lastError);

				if (!errorInfo.retryable || attempt > this.retryConfig.maxRetries) {
					this.retryState = { attempts: attempt - 1, nextRetryMs: 0, isRetrying: false };
					if (onFinalError) {
						onFinalError(lastError, errorInfo);
					}
					throw lastError;
				}

				this.retryState = {
					attempts: attempt,
					nextRetryMs: this.calculateRetryDelay(attempt),
					isRetrying: true
				};

				if (onRetry) {
					onRetry(attempt, this.retryState.nextRetryMs, lastError);
				}

				await this.delay(this.retryState.nextRetryMs);
			}
		}

		throw lastError!;
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Get current connection status
	 */
	getConnectionStatus(): ConnectionStatus {
		return this.connectionStatus;
	}

	/**
	 * Set connection status
	 */
	setConnectionStatus(status: ConnectionStatus): void {
		if (this.connectionStatus !== status) {
			this.connectionStatus = status;
			this.notifyStatusListeners(status);
		}
	}

	/**
	 * Update connection status based on API response
	 */
	updateFromResponse(response: Response | null, error?: Error): void {
		if (error || !response) {
			this.setConnectionStatus('error');
			return;
		}

		if (response.ok) {
			this.setConnectionStatus('connected');
		} else if (response.status === 401 || response.status === 403) {
			this.setConnectionStatus('error');
		} else {
			// Could be rate limit or server error - still "connected" but with issues
			this.setConnectionStatus(response.ok ? 'connected' : 'error');
		}
	}

	/**
	 * Subscribe to connection status changes
	 */
	onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
		this.statusListeners.push(listener);
		return () => {
			this.statusListeners = this.statusListeners.filter(l => l !== listener);
		};
	}

	private notifyStatusListeners(status: ConnectionStatus): void {
		for (const listener of this.statusListeners) {
			try {
				listener(status);
			} catch (e) {
				console.error('Error in status listener:', e);
			}
		}
	}

	/**
	 * Get current retry state
	 */
	getRetryState(): Readonly<RetryState> {
		return { ...this.retryState };
	}

	/**
	 * Update retry configuration
	 */
	updateConfig(config: Partial<RetryConfig>): void {
		this.retryConfig = { ...this.retryConfig, ...config };
	}

	/**
	 * Get formatted retry countdown message
	 */
	static formatRetryCountdown(delayMs: number): string {
		const seconds = Math.ceil(delayMs / 1000);
		return `Retrying in ${seconds} second${seconds !== 1 ? 's' : ''}...`;
	}
}
