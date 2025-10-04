import { spawn, ChildProcess } from 'child_process';
import { CommandDetector } from '../../commandDetector';
import type { AIProviderConfig, AIModel, ClaudeModel } from '../../types';
import type { AIService, Message, StreamingResponse } from './AIService';

export class ClaudeService implements AIService {
	private config!: AIProviderConfig;
	private currentProcess: ChildProcess | null = null;
	private currentSessionId: string | null = null;
	private abortController: AbortController | null = null;

	async initialize(config: AIProviderConfig): Promise<void> {
		this.config = config;
		if (config.provider !== 'claude') {
			throw new Error('ClaudeService can only be used with Claude provider');
		}
	}

	async sendMessage(message: string, conversationId?: string): Promise<AsyncIterable<StreamingResponse>> {
		return this.sendMessageInternal(message, conversationId);
	}

	private async *sendMessageInternal(message: string, conversationId?: string): AsyncIterable<StreamingResponse> {
		this.abortController = new AbortController();
		const vaultPath = (require('obsidian').app.vault.adapter as any).basePath;

		// Create echo process for prompt
		const echoProcess = spawn('echo', [message], {
			cwd: vaultPath,
			env: { ...process.env, FORCE_COLOR: '0' }
		});

		// Detect command paths
		const commands = CommandDetector.detectCommands(
			this.config.nodeLocation,
			this.config.claudeLocation
		);

		let claudeProcess: ChildProcess;

		// Build claude command arguments
		const claudeArgs = [
			commands.claude,
			'--output-format', 'stream-json',
			'--permission-mode', 'bypassPermissions',
			'--dangerously-skip-permissions',
			'--verbose'
		];

		if (this.currentSessionId || conversationId) {
			claudeArgs.push('--resume', this.currentSessionId || conversationId || '');
		}

		if (commands.isWSL) {
			// For WSL, create the command array
			const fullArgs = [
				...commands.wslPrefix!,
				'--',
				commands.node,
				...claudeArgs
			];

			this.currentProcess = spawn(fullArgs[0], fullArgs.slice(1), {
				cwd: vaultPath,
				env: { ...process.env, FORCE_COLOR: '0' }
			});

			claudeProcess = this.currentProcess;

			// For WSL, we need to pipe the prompt directly to stdin
			if (this.currentProcess.stdin) {
				this.currentProcess.stdin.write(message);
				this.currentProcess.stdin.end();
			}
		} else {
			// Normal execution for macOS/Linux
			this.currentProcess = spawn(commands.node, claudeArgs, {
				cwd: vaultPath,
				env: { ...process.env, FORCE_COLOR: '0' }
			});

			// Pipe echo output to Claude
			if (echoProcess.stdout && this.currentProcess.stdin) {
				echoProcess.stdout.pipe(this.currentProcess.stdin);
			}

			claudeProcess = this.currentProcess;
		}

		let buffer = '';

		try {
			// Use a promise-based approach with a channel for responses
			const responses: StreamingResponse[] = [];
			let resolveResponses: (() => void) | null = null;

			const responsePromise = new Promise<void>((resolve) => {
				resolveResponses = resolve;
			});

			if (claudeProcess.stdout) {
				claudeProcess.stdout.on('data', (chunk: Buffer) => {
					if (this.abortController?.signal.aborted) {
						return;
					}

					buffer += chunk.toString();

					// Process complete JSON objects
					const lines = buffer.split('\n');
					buffer = lines.pop() || ''; // Keep incomplete line in buffer

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (trimmedLine) {
							try {
								const jsonObj = JSON.parse(trimmedLine);
								if (jsonObj && typeof jsonObj === 'object' && jsonObj.type) {
									const response = this.parseClaudeResponse(jsonObj);
									if (response) {
										responses.push(response);
									}
								}
							} catch (parseError) {
								console.warn('Failed to parse Claude JSON:', trimmedLine, parseError);
							}
						}
					}
				});
			}

			if (claudeProcess.stderr) {
				claudeProcess.stderr.on('data', (chunk: Buffer) => {
					console.error('Claude stderr:', chunk.toString());
				});
			}

			// Handle process completion
			claudeProcess.on('close', (code: number | null) => {
				if (code !== 0 && code !== null && !this.abortController?.signal.aborted) {
					console.error(`Claude process exited with code ${code}`);
				}
				if (resolveResponses) {
					resolveResponses();
				}
			});

			claudeProcess.on('error', (error: Error) => {
				if (!this.abortController?.signal.aborted) {
					console.error('Claude process error:', error);
				}
				if (resolveResponses) {
					resolveResponses();
				}
			});

			// Yield responses as they come in
			while (!this.abortController?.signal.aborted) {
				if (responses.length > 0) {
					yield responses.shift()!;
				} else {
					// Wait a bit before checking again
					await new Promise(resolve => setTimeout(resolve, 10));
				}
			}

		} catch (error) {
			throw error;
		} finally {
			this.currentProcess = null;
		}
	}

	private parseClaudeResponse(jsonObj: any): StreamingResponse | null {
		// Handle different types of streaming messages from Claude
		if (jsonObj.type === 'system' && jsonObj.subtype === 'init') {
			// Store session_id for future resume
			if (jsonObj.session_id && !this.currentSessionId) {
				this.currentSessionId = jsonObj.session_id;
			}

			return {
				type: 'system',
				session_id: jsonObj.session_id
			};
		} else if (jsonObj.type === 'assistant' && jsonObj.message) {
			// Assistant message with content or tool use
			return {
				type: jsonObj.message.content?.[0]?.type === 'tool_use' ? 'tool_use' : 'text',
				content: jsonObj.message.content?.[0]?.text,
				tool_call: jsonObj.message.content?.[0]?.type === 'tool_use' ? {
					id: jsonObj.message.content[0].id,
					name: jsonObj.message.content[0].name,
					input: jsonObj.message.content[0].input
				} : undefined,
				session_id: jsonObj.session_id
			};
		} else if (jsonObj.type === 'user' && jsonObj.message) {
			// Tool result messages
			return {
				type: 'tool_result',
				tool_result: {
					tool_use_id: jsonObj.message.content?.[0]?.tool_use_id,
					content: jsonObj.message.content?.[0]?.content,
					is_error: jsonObj.message.content?.[0]?.is_error
				},
				session_id: jsonObj.session_id
			};
		} else if (jsonObj.type === 'result') {
			// Final result message
			return {
				type: 'text',
				content: jsonObj.result,
				session_id: jsonObj.session_id,
				duration_ms: jsonObj.duration_ms,
				duration_api_ms: jsonObj.duration_api_ms,
				is_error: jsonObj.is_error,
				total_cost_usd: jsonObj.total_cost_usd
			};
		}

		return null;
	}

	async resumeConversation(sessionId: string): Promise<void> {
		this.currentSessionId = sessionId;
	}

	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
		if (this.currentProcess) {
			this.currentProcess.kill('SIGTERM');
			this.currentProcess = null;
		}
	}

	getAvailableModels(): ClaudeModel[] {
		return [
			'claude-sonnet-4-20250514',
			'claude-sonnet-4-20241022',
			'claude-opus-4-20250514',
			'claude-haiku-3.5-20241022'
		];
	}

	async testConnection(): Promise<boolean> {
		try {
			CommandDetector.detectCommands(
				this.config.nodeLocation,
				this.config.claudeLocation
			);
			return true;
		} catch {
			return false;
		}
	}

	getProvider(): string {
		return 'claude';
	}
}
