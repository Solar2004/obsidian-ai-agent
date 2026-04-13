/**
 * NodepadView.ts
 *
 * Obsidian ItemView for Nodepad mode — a spatial AI-augmented thinking canvas.
 * The AI works autonomously: it classifies notes, adds insight annotations,
 * finds connections, and synthesizes emergent theses. No chat interface.
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type { AIChatSettings } from './types';
import { NodepadEnrichService, detectContentType, type ContentType, type EnrichContext, type EnrichResult } from './services/nodepad/NodepadEnrichService';
import { NodepadGhostService, type GhostContext } from './services/nodepad/NodepadGhostService';
import { NoteCard, type NoteBlock, type NoteCardCallbacks } from './services/nodepad/NoteCard';
import { KanbanView } from './services/nodepad/KanbanView';

export const VIEW_TYPE_NODEPAD = 'nodepad-view';

// ── Storage key ───────────────────────────────────────────────────────────────
const STORAGE_KEY = 'nodepad-projects-v1';

// ── Project / note types ──────────────────────────────────────────────────────

export interface GhostNote {
	id: string;
	text: string;
	category: string;
	isGenerating: boolean;
}

export interface NodepadProject {
	id: string;
	name: string;
	blocks: NoteBlock[];
	ghostNotes: GhostNote[];
	lastGhostBlockCount?: number;
	lastGhostTimestamp?: number;
	lastGhostTexts?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
	return Math.random().toString(36).substring(2, 10);
}

const HIGH_CONFIDENCE_TYPES = new Set<ContentType>(['question', 'reference', 'quote', 'task']);

// ── NodepadView ───────────────────────────────────────────────────────────────

export class NodepadView extends ItemView {
	private settings: AIChatSettings;
	private projects: NodepadProject[] = [];
	private activeProjectId = '';
	private viewMode: 'tiling' | 'kanban' = 'tiling';
	private ghostPanelOpen = false;
	private generatingGhost = new Set<string>();

	// DOM refs
	private contentEl2!: HTMLElement;
	private statusBarEl!: HTMLElement;
	private mainAreaEl!: HTMLElement;
	private ghostPanelEl!: HTMLElement;
	private inputEl!: HTMLInputElement;
	private viewModeBtn!: HTMLButtonElement;
	private ghostBtn!: HTMLButtonElement;
	private noteCountEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, settings: AIChatSettings) {
		super(leaf);
		this.settings = settings;
	}

	getViewType(): string { return VIEW_TYPE_NODEPAD; }
	getDisplayText(): string { return 'Nodepad'; }
	getIcon(): string { return 'layout-grid'; }

	async onOpen(): Promise<void> {
		this.loadProjects();
		this.buildUI();
		this.renderAll();
	}

	async onClose(): Promise<void> {
		this.saveProjects();
	}

	// ── Persistence ─────────────────────────────────────────────────────────

	private loadProjects(): void {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				this.projects = JSON.parse(raw);
				this.activeProjectId = this.projects[0]?.id || '';
				return;
			}
		} catch { /* ignore */ }
		// Default project
		const defaultProject: NodepadProject = {
			id: generateId(),
			name: 'My Space',
			blocks: [],
			ghostNotes: [],
		};
		this.projects = [defaultProject];
		this.activeProjectId = defaultProject.id;
	}

	private saveProjects(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.projects));
		} catch { /* quota */ }
	}

	// ── Active project accessors ─────────────────────────────────────────────

	private get activeProject(): NodepadProject {
		return this.projects.find(p => p.id === this.activeProjectId) || this.projects[0];
	}

	private updateActiveProject(updater: (p: NodepadProject) => NodepadProject): void {
		this.projects = this.projects.map(p =>
			p.id === this.activeProjectId ? updater(p) : p
		);
		this.saveProjects();
	}

	// ── Build UI ─────────────────────────────────────────────────────────────

	private buildUI(): void {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.style.display = 'flex';
		root.style.flexDirection = 'column';
		root.style.height = '100%';
		root.style.overflow = 'hidden';
		root.style.backgroundColor = 'var(--background-primary)';
		root.style.fontFamily = 'var(--font-interface)';

		// Status bar
		this.statusBarEl = root.createDiv({ cls: 'nodepad-status-bar' });
		this.buildStatusBar();

		// Main content area + ghost panel wrapper
		const bodyWrapper = root.createDiv();
		bodyWrapper.style.display = 'flex';
		bodyWrapper.style.flex = '1';
		bodyWrapper.style.overflow = 'hidden';
		bodyWrapper.style.position = 'relative';

		// Main notes area
		this.mainAreaEl = bodyWrapper.createDiv({ cls: 'nodepad-main-area' });
		this.mainAreaEl.style.flex = '1';
		this.mainAreaEl.style.overflow = 'auto';
		this.mainAreaEl.style.padding = '12px';

		// Ghost panel (slides in from right)
		this.ghostPanelEl = bodyWrapper.createDiv({ cls: 'nodepad-ghost-panel' });
		this.buildGhostPanel();

		// Input bar at the bottom
		const inputWrapper = root.createDiv({ cls: 'nodepad-input-wrapper' });
		this.buildInputBar(inputWrapper);

		this.contentEl2 = root;
	}

	private buildStatusBar(): void {
		this.statusBarEl.empty();
		this.statusBarEl.style.display = 'flex';
		this.statusBarEl.style.alignItems = 'center';
		this.statusBarEl.style.justifyContent = 'space-between';
		this.statusBarEl.style.padding = '6px 12px';
		this.statusBarEl.style.borderBottom = '1px solid var(--background-modifier-border)';
		this.statusBarEl.style.backgroundColor = 'var(--background-secondary)';
		this.statusBarEl.style.flexShrink = '0';
		this.statusBarEl.style.fontSize = '11px';
		this.statusBarEl.style.color = 'var(--text-muted)';

		const leftSide = this.statusBarEl.createDiv();
		leftSide.style.display = 'flex';
		leftSide.style.alignItems = 'center';
		leftSide.style.gap = '12px';

		// Project name
		const projectName = leftSide.createSpan();
		projectName.style.fontWeight = 'bold';
		projectName.style.color = 'var(--text-normal)';
		projectName.textContent = this.activeProject?.name || 'Nodepad';

		// Note count
		this.noteCountEl = leftSide.createSpan();
		this.noteCountEl.style.color = 'var(--text-muted)';
		this.updateNoteCount();

		const rightSide = this.statusBarEl.createDiv();
		rightSide.style.display = 'flex';
		rightSide.style.alignItems = 'center';
		rightSide.style.gap = '6px';

		// View mode toggle
		this.viewModeBtn = rightSide.createEl('button');
		this.viewModeBtn.style.cssText = `
			background: transparent; border: 1px solid var(--background-modifier-border);
			border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 10px;
			color: var(--text-muted); font-family: monospace;
		`;
		this.viewModeBtn.textContent = this.viewMode === 'tiling' ? '⊞ Tiling' : '☰ Kanban';
		this.viewModeBtn.addEventListener('click', () => {
			this.viewMode = this.viewMode === 'tiling' ? 'kanban' : 'tiling';
			this.viewModeBtn.textContent = this.viewMode === 'tiling' ? '⊞ Tiling' : '☰ Kanban';
			this.renderNotes();
		});

		// Ghost panel toggle
		this.ghostBtn = rightSide.createEl('button');
		this.ghostBtn.style.cssText = `
			background: transparent; border: 1px solid var(--background-modifier-border);
			border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 10px;
			color: var(--text-muted); font-family: monospace;
		`;
		this.updateGhostBtnLabel();
		this.ghostBtn.addEventListener('click', () => {
			this.ghostPanelOpen = !this.ghostPanelOpen;
			this.updateGhostBtnLabel();
			this.renderGhostPanel();
		});
	}

	private updateGhostBtnLabel(): void {
		const count = this.activeProject?.ghostNotes.filter(g => !g.isGenerating).length || 0;
		this.ghostBtn.textContent = count > 0 ? `✦ Synthesis (${count})` : '✦ Synthesis';
		this.ghostBtn.style.color = count > 0 ? '#fbbf24' : 'var(--text-muted)';
	}

	private updateNoteCount(): void {
		const blocks = this.activeProject?.blocks || [];
		const enriched = blocks.filter(b => !b.isEnriching && b.category).length;
		this.noteCountEl.textContent = `${blocks.length} notes · ${enriched} enriched`;
	}

	private buildGhostPanel(): void {
		this.ghostPanelEl.empty();
		this.ghostPanelEl.style.cssText = `
			width: ${this.ghostPanelOpen ? '260px' : '0'};
			overflow: hidden;
			transition: width 0.25s ease;
			border-left: ${this.ghostPanelOpen ? '1px solid var(--background-modifier-border)' : 'none'};
			background: var(--background-secondary);
			display: flex;
			flex-direction: column;
			flex-shrink: 0;
		`;

		if (!this.ghostPanelOpen) return;

		const header = this.ghostPanelEl.createDiv();
		header.style.cssText = 'padding: 12px; border-bottom: 1px solid var(--background-modifier-border); font-size: 11px; font-weight: bold; color: #fbbf24; font-family: monospace; letter-spacing: 0.05em;';
		header.textContent = '✦ EMERGENT SYNTHESIS';

		const body = this.ghostPanelEl.createDiv();
		body.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';

		const ghostNotes = this.activeProject?.ghostNotes || [];
		if (ghostNotes.length === 0) {
			const empty = body.createDiv();
			empty.style.cssText = 'padding: 16px 8px; text-align: center; color: var(--text-muted); font-size: 11px; line-height: 1.5;';
			empty.textContent = 'Add 5+ notes across 2+ categories and a synthesis will emerge here.';
			return;
		}

		for (const ghost of ghostNotes) {
			const card = body.createDiv();
			card.style.cssText = `
				margin-bottom: 10px; padding: 10px; border-radius: 4px;
				border: 1px solid rgba(251,191,36,0.3); background: rgba(251,191,36,0.05);
				border-left: 3px solid #fbbf24;
			`;

			if (ghost.isGenerating) {
				const spinner = card.createDiv();
				spinner.style.cssText = 'color: var(--text-muted); font-size: 11px; font-style: italic;';
				spinner.textContent = '◌ Synthesizing...';
				return;
			}

			const text = card.createDiv();
			text.style.cssText = 'font-size: 12px; color: var(--text-normal); line-height: 1.5; margin-bottom: 8px;';
			text.textContent = ghost.text;

			const catTag = card.createSpan();
			catTag.style.cssText = `
				font-family: monospace; font-size: 9px; font-weight: bold;
				text-transform: uppercase; letter-spacing: 0.05em;
				color: #fbbf24; opacity: 0.7;
			`;
			catTag.textContent = `#${ghost.category}`;

			const actions = card.createDiv();
			actions.style.cssText = 'display: flex; gap: 6px; margin-top: 8px;';

			const claimBtn = actions.createEl('button');
			claimBtn.textContent = '+ Solidify';
			claimBtn.style.cssText = `
				background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.4);
				border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 10px;
				color: #fbbf24; font-family: monospace;
			`;
			claimBtn.addEventListener('click', () => this.claimGhostNote(ghost.id));

			const dismissBtn = actions.createEl('button');
			dismissBtn.textContent = 'Dismiss';
			dismissBtn.style.cssText = `
				background: transparent; border: 1px solid var(--background-modifier-border);
				border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 10px;
				color: var(--text-muted); font-family: monospace;
			`;
			dismissBtn.addEventListener('click', () => this.dismissGhostNote(ghost.id));
		}
	}

	private buildInputBar(wrapper: HTMLElement): void {
		wrapper.style.cssText = `
			display: flex; align-items: center; gap: 8px;
			padding: 8px 12px; border-top: 1px solid var(--background-modifier-border);
			background: var(--background-secondary); flex-shrink: 0;
		`;

		const inputWrapper = wrapper.createDiv();
		inputWrapper.style.cssText = `
			flex: 1; display: flex; align-items: center; gap: 8px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px; padding: 6px 10px;
			background: var(--background-primary);
		`;

		const prefix = inputWrapper.createSpan();
		prefix.style.cssText = 'font-family: monospace; color: var(--text-muted); font-size: 13px; flex-shrink: 0;';
		prefix.textContent = '>';

		this.inputEl = inputWrapper.createEl('input');
		this.inputEl.type = 'text';
		this.inputEl.placeholder = 'Add a note — the AI will classify and annotate it…';
		this.inputEl.style.cssText = `
			flex: 1; background: transparent; border: none; outline: none;
			font-size: 13px; color: var(--text-normal); font-family: var(--font-text);
		`;
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this.inputEl.value.trim()) {
				this.addNote(this.inputEl.value.trim());
				this.inputEl.value = '';
			}
		});

		const addBtn = wrapper.createEl('button');
		addBtn.textContent = 'Add';
		addBtn.style.cssText = `
			background: var(--interactive-accent); color: var(--text-on-accent);
			border: none; border-radius: 4px; padding: 6px 14px;
			cursor: pointer; font-size: 12px; font-weight: bold; flex-shrink: 0;
		`;
		addBtn.addEventListener('click', () => {
			const text = this.inputEl.value.trim();
			if (text) {
				this.addNote(text);
				this.inputEl.value = '';
				this.inputEl.focus();
			}
		});
	}

	// ── Render ───────────────────────────────────────────────────────────────

	private renderAll(): void {
		this.buildStatusBar();
		this.renderNotes();
		this.renderGhostPanel();
	}

	private renderNotes(): void {
		this.mainAreaEl.empty();
		const blocks = this.activeProject?.blocks || [];

		if (blocks.length === 0) {
			const empty = this.mainAreaEl.createDiv();
			empty.style.cssText = `
				display: flex; flex-direction: column; align-items: center; justify-content: center;
				height: 100%; color: var(--text-muted); text-align: center; gap: 12px;
			`;
			const icon = empty.createDiv();
			icon.style.cssText = 'font-size: 32px; opacity: 0.3;';
			icon.textContent = '⊞';
			const msg = empty.createDiv();
			msg.style.cssText = 'font-size: 13px; line-height: 1.6; max-width: 280px;';
			msg.textContent = 'Type a note below. The AI will classify it and surface an insight — no questions asked.';
			return;
		}

		if (this.viewMode === 'kanban') {
			const callbacks = this.buildCallbacks();
			const kanban = new KanbanView(blocks, callbacks);
			this.mainAreaEl.appendChild(kanban.render());
		} else {
			// Tiling: masonry-style columns
			this.renderTiling(blocks);
		}

		this.updateNoteCount();
	}

	private renderTiling(blocks: NoteBlock[]): void {
		const container = this.mainAreaEl.createDiv();
		container.style.cssText = `
			columns: 2 240px; column-gap: 10px;
		`;

		const callbacks = this.buildCallbacks();

		// Pinned first, then by timestamp desc
		const sorted = [...blocks].sort((a, b) => {
			if (a.isPinned && !b.isPinned) return -1;
			if (!a.isPinned && b.isPinned) return 1;
			return b.timestamp - a.timestamp;
		});

		for (const block of sorted) {
			const cardWrapper = container.createDiv();
			cardWrapper.style.cssText = 'break-inside: avoid; margin-bottom: 10px;';

			const card = new NoteCard(block, callbacks);
			cardWrapper.appendChild(card.render());
		}
	}

	private buildCallbacks(): NoteCardCallbacks {
		return {
			onDelete: (id: string) => {
				this.updateActiveProject(p => ({ ...p, blocks: p.blocks.filter(b => b.id !== id) }));
				this.renderNotes();
			},
			onTogglePin: (id: string) => {
				this.updateActiveProject(p => ({
					...p,
					blocks: p.blocks.map(b => b.id === id ? { ...b, isPinned: !b.isPinned } : b),
				}));
				this.renderNotes();
			},
			onRetry: (id: string) => {
				const block = this.activeProject?.blocks.find(b => b.id === id);
				if (!block) return;
				this.updateActiveProject(p => ({
					...p,
					blocks: p.blocks.map(b => b.id === id ? { ...b, isEnriching: true, isError: false } : b),
				}));
				this.renderNotes();
				this.runEnrichment(id, block.text, block.category, block.contentType);
			},
		};
	}

	private renderGhostPanel(): void {
		this.buildGhostPanel();
		this.updateGhostBtnLabel();
	}

	// ── Add note ─────────────────────────────────────────────────────────────

	private addNote(rawText: string, forcedType?: ContentType): void {
		let text = rawText;
		let resolvedType = forcedType;

		// Parse inline #type tag e.g. "#claim The earth is 4.5 billion years old"
		if (!resolvedType) {
			const tagMatch = rawText.match(/^#([a-z]+)\s+(.+)/i);
			if (tagMatch) {
				const tag = tagMatch[1].toLowerCase() as ContentType;
				const ALL_TYPES: ContentType[] = [
					'entity','claim','question','task','idea','reference','quote',
					'definition','opinion','reflection','narrative','comparison','thesis','general',
				];
				if (ALL_TYPES.includes(tag)) {
					resolvedType = tag;
					text = tagMatch[2].trim();
				}
			}
		}

		const newId = generateId();
		const heuristicType = resolvedType ?? detectContentType(text);
		const enrichForcedType = resolvedType
			?? (HIGH_CONFIDENCE_TYPES.has(heuristicType) ? heuristicType : undefined);
		const initialDisplayType: ContentType = resolvedType
			?? (HIGH_CONFIDENCE_TYPES.has(heuristicType) ? heuristicType : 'general');

		const newBlock: NoteBlock = {
			id: newId,
			text,
			timestamp: Date.now(),
			contentType: initialDisplayType,
			isEnriching: true,
		};

		this.updateActiveProject(p => ({ ...p, blocks: [...p.blocks, newBlock] }));
		this.renderNotes();

		// Kick off enrichment asynchronously
		this.runEnrichment(newId, text, undefined, enrichForcedType);
	}

	// ── AI Enrichment ────────────────────────────────────────────────────────

	private async runEnrichment(
		blockId: string,
		text: string,
		category?: string,
		forcedType?: ContentType | string,
	): Promise<void> {
		const config = this.settings.providers[this.settings.activeProvider];
		if (!config.apiKey) {
			this.updateBlockAfterError(blockId, 'no-api-key');
			this.renderNotes();
			return;
		}

		const service = new NodepadEnrichService(config);

		// Build context from other enriched blocks
		const context: EnrichContext[] = (this.activeProject?.blocks || [])
			.filter(b => b.id !== blockId && !b.isEnriching && b.category)
			.map(b => ({ id: b.id, text: b.text, category: b.category, annotation: b.annotation }))
			.slice(-15);

		try {
			const result = await service.enrich(text, context, forcedType, category);

			// Map influenced indices back to block IDs
			const influencedBy = (result.influencedByIndices || [])
				.map((idx: number) => context[idx]?.id)
				.filter(Boolean) as string[];

			this.updateActiveProject(p => {
				// Handle merge
				if (result.mergeWithIndex !== null && context[result.mergeWithIndex]) {
					const mergeTargetId = context[result.mergeWithIndex].id;
					return {
						...p,
						blocks: p.blocks
							.filter(b => b.id !== blockId)
							.map(b => b.id === mergeTargetId ? {
								...b,
								text: b.text + '\n\n' + text,
								contentType: result.contentType,
								category: result.category,
								annotation: result.annotation,
								confidence: result.confidence,
								influencedBy,
								isUnrelated: result.isUnrelated,
								isEnriching: false,
								isError: false,
							} : b),
					};
				}

				// Handle task grouping
				if (result.contentType === 'task') {
					const existingTask = p.blocks.find(b => b.contentType === 'task' && b.id !== blockId);
					if (existingTask) {
						const newSubTask = { id: generateId(), text, isDone: false, timestamp: Date.now() };
						return {
							...p,
							blocks: p.blocks
								.filter(b => b.id !== blockId)
								.map(b => b.id === existingTask.id ? {
									...b,
									subTasks: [...(b.subTasks || []), newSubTask],
									isEnriching: false,
								} : b),
						};
					}
				}

				return {
					...p,
					blocks: p.blocks.map(b => b.id === blockId ? {
						...b,
						contentType: result.contentType,
						category: result.category,
						annotation: result.annotation,
						confidence: result.confidence,
						influencedBy,
						isUnrelated: result.isUnrelated,
						isEnriching: false,
						isError: false,
					} : b),
				};
			});

			this.renderNotes();

			// Trigger ghost synthesis after a short delay
			setTimeout(() => this.maybeGenerateGhost(), 2500);

		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : undefined;
			const isNoKey = message?.includes('No API key') || message?.includes('Invalid or missing API key');
			this.updateBlockAfterError(blockId, isNoKey ? 'no-api-key' : message);
			this.renderNotes();
		}
	}

	private updateBlockAfterError(blockId: string, statusText?: string): void {
		this.updateActiveProject(p => ({
			...p,
			blocks: p.blocks.map(b => b.id === blockId
				? { ...b, isEnriching: false, isError: true, statusText }
				: b),
		}));
	}

	// ── Ghost synthesis ──────────────────────────────────────────────────────

	private async maybeGenerateGhost(): Promise<void> {
		const project = this.activeProject;
		if (!project) return;

		const enrichedBlocks = project.blocks.filter(b => !b.isEnriching && b.category);
		if (enrichedBlocks.length < 5) return;
		if ((project.ghostNotes || []).length >= 5) return;
		if (this.generatingGhost.has(project.id)) return;

		const lastCount = project.lastGhostBlockCount || 0;
		if (enrichedBlocks.length < lastCount + 5) return;

		const lastTime = project.lastGhostTimestamp || 0;
		if (Date.now() - lastTime < 5 * 60 * 1000) return;

		const categories = new Set(enrichedBlocks.map(b => b.category).filter(Boolean));
		if (categories.size < 2) return;

		const config = this.settings.providers[this.settings.activeProvider];
		if (!config.apiKey) return;

		this.generatingGhost.add(project.id);
		const ghostId = 'ghost-' + generateId();

		this.updateActiveProject(p => ({
			...p,
			ghostNotes: [...(p.ghostNotes || []), { id: ghostId, text: '', category: 'thesis', isGenerating: true }],
			lastGhostBlockCount: enrichedBlocks.length,
			lastGhostTimestamp: Date.now(),
		}));
		this.renderGhostPanel();

		try {
			const curated = this.buildGhostContext(enrichedBlocks);
			const context: GhostContext[] = curated.map(b => ({
				text: b.text,
				category: b.category,
				contentType: b.contentType,
			}));

			const previousSyntheses = (project.lastGhostTexts || []).slice(-5);
			const service = new NodepadGhostService(config);
			const data = await service.generateGhost(context, previousSyntheses);

			this.updateActiveProject(p => ({
				...p,
				ghostNotes: (p.ghostNotes || []).map(n =>
					n.id === ghostId ? { ...n, text: data.text, category: data.category, isGenerating: false } : n
				),
				lastGhostTexts: [...(p.lastGhostTexts || []), data.text].slice(-10),
			}));
		} catch (e) {
			console.error('Ghost generation failed', e);
			this.updateActiveProject(p => ({
				...p,
				ghostNotes: (p.ghostNotes || []).filter(n => n.id !== ghostId),
			}));
		} finally {
			this.generatingGhost.delete(project.id);
			this.renderGhostPanel();
		}
	}

	private buildGhostContext(blocks: NoteBlock[]): NoteBlock[] {
		if (blocks.length <= 8) return blocks;

		const sorted = [...blocks].sort((a, b) => b.timestamp - a.timestamp);
		const selected = new Set<string>();
		const result: NoteBlock[] = [];

		sorted.slice(0, 4).forEach(b => { selected.add(b.id); result.push(b); });

		const representedCats = new Set(result.map(b => b.category));
		const byCat = new Map<string, NoteBlock>();
		sorted.forEach(b => { if (b.category && !byCat.has(b.category)) byCat.set(b.category, b); });

		for (const [cat, block] of byCat) {
			if (result.length >= 10) break;
			if (!representedCats.has(cat) && !selected.has(block.id)) {
				selected.add(block.id); result.push(block); representedCats.add(cat);
			}
		}

		for (const b of sorted) {
			if (result.length >= 10) break;
			if (!selected.has(b.id)) { selected.add(b.id); result.push(b); }
		}

		return result;
	}

	private claimGhostNote(id: string): void {
		const note = this.activeProject?.ghostNotes.find(n => n.id === id);
		if (!note || note.isGenerating) return;

		const newId = generateId();
		const newBlock: NoteBlock = {
			id: newId,
			text: note.text,
			timestamp: Date.now(),
			contentType: 'thesis',
			category: note.category,
			isEnriching: true,
		};

		this.updateActiveProject(p => ({
			...p,
			blocks: [...p.blocks, newBlock],
			ghostNotes: p.ghostNotes.filter(n => n.id !== id),
		}));

		this.renderAll();
		this.runEnrichment(newId, note.text, note.category, 'thesis');
	}

	private dismissGhostNote(id: string): void {
		this.updateActiveProject(p => ({
			...p,
			ghostNotes: p.ghostNotes.filter(n => n.id !== id),
		}));
		this.renderGhostPanel();
	}

	// ── Settings update ──────────────────────────────────────────────────────

	updateSettings(settings: AIChatSettings): void {
		this.settings = settings;
	}
}
