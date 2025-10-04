import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MCPServer } from '../../types';

export interface MCPTool {
	name: string;
	description: string;
	inputSchema: {
		type: string;
		properties: Record<string, any>;
		required?: string[];
	};
}

export interface MCPResource {
	uri: string;
	name?: string;
	description?: string;
	mimeType?: string;
}

interface MCPConnection {
	client: Client;
	transport: StdioClientTransport;
	tools: MCPTool[];
	resources: MCPResource[];
}

export class MCPManager {
	private connections: Map<string, MCPConnection> = new Map();

	/**
	 * Start an MCP server and connect to it
	 */
	async startServer(serverConfig: MCPServer): Promise<void> {
		try {
			// Create transport for stdio communication
			// Filter out undefined values from env
			const cleanEnv: Record<string, string> = {};
			const mergedEnv = { ...process.env, ...(serverConfig.env || {}) };
			for (const [key, value] of Object.entries(mergedEnv)) {
				if (value !== undefined) {
					cleanEnv[key] = value;
				}
			}

			const transport = new StdioClientTransport({
				command: serverConfig.command,
				args: serverConfig.args || [],
				env: cleanEnv
			});

			// Create MCP client
			const client = new Client({
				name: `obsidian-ai-agent`,
				version: '1.0.0',
			}, {
				capabilities: {
					tools: {},
					resources: {}
				}
			});

			// Connect to server
			await client.connect(transport);

			// List available tools
			const toolsResponse = await client.listTools();
			const tools: MCPTool[] = toolsResponse.tools.map((tool: any) => ({
				name: tool.name,
				description: tool.description || '',
				inputSchema: tool.inputSchema || {
					type: 'object',
					properties: {},
					required: []
				}
			}));

			// List available resources (optional)
			let resources: MCPResource[] = [];
			try {
				const resourcesResponse = await client.listResources();
				resources = resourcesResponse.resources.map((resource: any) => ({
					uri: resource.uri,
					name: resource.name,
					description: resource.description,
					mimeType: resource.mimeType
				}));
			} catch (error) {
				// Resources might not be supported by all servers
				console.log(`Server ${serverConfig.name} doesn't support resources`);
			}

			// Store connection
			this.connections.set(serverConfig.name, {
				client,
				transport,
				tools,
				resources
			});

			console.log(`MCP Server ${serverConfig.name} started with ${tools.length} tools`);
		} catch (error) {
			console.error(`Failed to start MCP server ${serverConfig.name}:`, error);
			throw error;
		}
	}

	/**
	 * Stop an MCP server
	 */
	async stopServer(serverName: string): Promise<void> {
		const connection = this.connections.get(serverName);
		if (connection) {
			try {
				await connection.client.close();
				this.connections.delete(serverName);
				console.log(`MCP Server ${serverName} stopped`);
			} catch (error) {
				console.error(`Error stopping server ${serverName}:`, error);
			}
		}
	}

	/**
	 * Stop all MCP servers
	 */
	async stopAllServers(): Promise<void> {
		const promises = Array.from(this.connections.keys()).map(name => this.stopServer(name));
		await Promise.all(promises);
	}

	/**
	 * Get all available tools from all servers
	 */
	getAllTools(): MCPTool[] {
		const allTools: MCPTool[] = [];
		for (const connection of this.connections.values()) {
			allTools.push(...connection.tools);
		}
		return allTools;
	}

	/**
	 * Get tools from a specific server
	 */
	getServerTools(serverName: string): MCPTool[] {
		const connection = this.connections.get(serverName);
		return connection?.tools || [];
	}

	/**
	 * Get all available resources from all servers
	 */
	getAllResources(): MCPResource[] {
		const allResources: MCPResource[] = [];
		for (const connection of this.connections.values()) {
			allResources.push(...connection.resources);
		}
		return allResources;
	}

	/**
	 * Check if a server is running
	 */
	isServerRunning(serverName: string): boolean {
		return this.connections.has(serverName);
	}

	/**
	 * Get list of running servers
	 */
	getRunningServers(): string[] {
		return Array.from(this.connections.keys());
	}

	/**
	 * Execute a tool call through MCP
	 */
	async executeTool(serverName: string, toolName: string, params: Record<string, any>): Promise<any> {
		const connection = this.connections.get(serverName);
		
		if (!connection) {
			throw new Error(`Server ${serverName} is not running`);
		}

		try {
			// Call the tool using the MCP client
			const result = await connection.client.callTool({
				name: toolName,
				arguments: params
			});

			return result;
		} catch (error) {
			console.error(`Error executing tool ${toolName} on ${serverName}:`, error);
			throw error;
		}
	}

	/**
	 * Find which server has a specific tool
	 */
	findServerForTool(toolName: string): string | null {
		for (const [serverName, connection] of this.connections.entries()) {
			if (connection.tools.some(tool => tool.name === toolName)) {
				return serverName;
			}
		}
		return null;
	}
}
