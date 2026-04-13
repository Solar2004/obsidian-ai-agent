/**
 * KanbanView.ts
 *
 * Renders an array of NoteBlocks into a kanban board grouped by contentType.
 * Uses NoteCard for individual card rendering.
 */

import { NoteCard, type NoteBlock, type ContentType } from './NoteCard';

export interface KanbanViewCallbacks {
	onDeleteNote?: (id: string) => void;
	onTogglePin?: (id: string) => void;
	onRetryNote?: (id: string) => void;
}

interface ColumnConfig {
	type: ContentType;
	label: string;
	color: string;
}

// Content type display names and colors
const COLUMN_CONFIGS: ColumnConfig[] = [
	{ type: 'thesis', label: 'Thesis', color: '#fbbf24' },
	{ type: 'claim', label: 'Claim', color: '#f59e0b' },
	{ type: 'idea', label: 'Idea', color: '#f97316' },
	{ type: 'question', label: 'Question', color: '#8b5cf6' },
	{ type: 'task', label: 'Task', color: '#10b981' },
	{ type: 'entity', label: 'Entity', color: '#6366f1' },
	{ type: 'reference', label: 'Reference', color: '#3b82f6' },
	{ type: 'quote', label: 'Quote', color: '#ec4899' },
	{ type: 'definition', label: 'Definition', color: '#14b8a6' },
	{ type: 'opinion', label: 'Opinion', color: '#a855f7' },
	{ type: 'reflection', label: 'Reflection', color: '#06b6d4' },
	{ type: 'narrative', label: 'Narrative', color: '#84cc16' },
	{ type: 'comparison', label: 'Comparison', color: '#eab308' },
	{ type: 'general', label: 'Note', color: '#6b7280' },
];

export class KanbanView {
	private blocks: NoteBlock[];
	private callbacks: KanbanViewCallbacks;
	private element: HTMLElement | null = null;

	constructor(blocks: NoteBlock[], callbacks: KanbanViewCallbacks = {}) {
		this.blocks = blocks;
		this.callbacks = callbacks;
	}

	/**
	 * Renders the kanban board into an HTMLElement.
	 * Columns are created for each contentType that has at least one note.
	 */
	render(): HTMLElement {
		this.element = document.createElement('div');
		this.element.className = 'nodepad-kanban';
		this.element.style.display = 'flex';
		this.element.style.flexDirection = 'row';
		this.element.style.gap = '16px';
		this.element.style.padding = '16px';
		this.element.style.overflowX = 'auto';
		this.element.style.minHeight = '100%';
		this.element.style.boxSizing = 'border-box';

		// Group blocks by content type
		const groupedBlocks = this.groupByContentType(this.blocks);

		// Get configs for types that have blocks
		const activeColumns = COLUMN_CONFIGS.filter(
			(col) => groupedBlocks[col.type] && groupedBlocks[col.type].length > 0,
		);

		// Sort columns to show thesis first, then by some priority order
		activeColumns.sort((a, b) => {
			// Thesis always first
			if (a.type === 'thesis') return -1;
			if (b.type === 'thesis') return 1;
			// Then by count (descending) for visual balance
			return (groupedBlocks[b.type]?.length || 0) - (groupedBlocks[a.type]?.length || 0);
		});

		// Create a column for each content type
		for (const colConfig of activeColumns) {
			const column = this.createColumn(colConfig, groupedBlocks[colConfig.type] || []);
			this.element.appendChild(column);
		}

		// Add empty state if no blocks
		if (activeColumns.length === 0) {
			const emptyState = this.createEmptyState();
			this.element.appendChild(emptyState);
		}

		return this.element;
	}

	private groupByContentType(blocks: NoteBlock[]): Record<ContentType, NoteBlock[]> {
		const grouped: Partial<Record<ContentType, NoteBlock[]>> = {};

		for (const block of blocks) {
			if (!grouped[block.contentType]) {
				grouped[block.contentType] = [];
			}
			grouped[block.contentType]!.push(block);
		}

		return grouped as Record<ContentType, NoteBlock[]>;
	}

	private createColumn(config: ColumnConfig, blocks: NoteBlock[]): HTMLElement {
		const column = document.createElement('div');
		column.className = `nodepad-kanban-column nodepad-kanban-column-${config.type}`;
		column.style.display = 'flex';
		column.style.flexDirection = 'column';
		column.style.minWidth = '280px';
		column.style.maxWidth = '320px';
		column.style.backgroundColor = 'rgba(30, 30, 40, 0.5)';
		column.style.borderRadius = '8px';
		column.style.border = '1px solid rgba(255, 255, 255, 0.1)';
		column.style.overflow = 'hidden';

		// Column header
		const header = document.createElement('div');
		header.className = 'nodepad-kanban-header';
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.justifyContent = 'space-between';
		header.style.padding = '12px 16px';
		header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
		header.style.backgroundColor = `${config.color}15`;

		// Left side: color dot and title
		const headerLeft = document.createElement('div');
		headerLeft.style.display = 'flex';
		headerLeft.style.alignItems = 'center';
		headerLeft.style.gap = '8px';

		const colorDot = document.createElement('span');
		colorDot.className = 'nodepad-color-dot';
		colorDot.style.display = 'inline-block';
		colorDot.style.width = '8px';
		colorDot.style.height = '8px';
		colorDot.style.borderRadius = '50%';
		colorDot.style.backgroundColor = config.color;
		colorDot.style.boxShadow = `0 0 4px ${config.color}`;
		headerLeft.appendChild(colorDot);

		const title = document.createElement('span');
		title.className = 'nodepad-column-title';
		title.textContent = config.label;
		title.style.fontFamily = 'monospace';
		title.style.fontSize = '11px';
		title.style.fontWeight = 'bold';
		title.style.textTransform = 'uppercase';
		title.style.letterSpacing = '0.05em';
		title.style.color = '#e5e7eb';
		headerLeft.appendChild(title);

		header.appendChild(headerLeft);

		// Right side: count badge
		const countBadge = document.createElement('span');
		countBadge.className = 'nodepad-count-badge';
		countBadge.textContent = String(blocks.length);
		countBadge.style.display = 'inline-flex';
		countBadge.style.alignItems = 'center';
		countBadge.style.justifyContent = 'center';
		countBadge.style.minWidth = '20px';
		countBadge.style.height = '20px';
		countBadge.style.padding = '0 6px';
		countBadge.style.borderRadius = '10px';
		countBadge.style.backgroundColor = config.color;
		countBadge.style.color = 'black';
		countBadge.style.fontFamily = 'monospace';
		countBadge.style.fontSize = '10px';
		countBadge.style.fontWeight = 'bold';
		header.appendChild(countBadge);

		column.appendChild(header);

		// Cards container
		const cardsContainer = document.createElement('div');
		cardsContainer.className = 'nodepad-kanban-cards';
		cardsContainer.style.display = 'flex';
		cardsContainer.style.flexDirection = 'column';
		cardsContainer.style.gap = '12px';
		cardsContainer.style.padding = '12px';
		cardsContainer.style.overflowY = 'auto';
		cardsContainer.style.maxHeight = 'calc(100vh - 200px)';
		cardsContainer.style.flex = '1';

		// Sort blocks by timestamp (newest first within each column)
		const sortedBlocks = [...blocks].sort((a, b) => b.timestamp - a.timestamp);

		// Create a NoteCard for each block
		for (const block of sortedBlocks) {
			const card = new NoteCard(block, {
				onDelete: this.callbacks.onDeleteNote,
				onTogglePin: this.callbacks.onTogglePin,
				onRetry: this.callbacks.onRetryNote,
			});
			const cardElement = card.render();
			cardElement.style.flexShrink = '0';
			cardsContainer.appendChild(cardElement);
		}

		column.appendChild(cardsContainer);

		return column;
	}

	private createEmptyState(): HTMLElement {
		const emptyState = document.createElement('div');
		emptyState.className = 'nodepad-kanban-empty';
		emptyState.style.display = 'flex';
		emptyState.style.flexDirection = 'column';
		emptyState.style.alignItems = 'center';
		emptyState.style.justifyContent = 'center';
		emptyState.style.flex = '1';
		emptyState.style.padding = '48px 24px';
		emptyState.style.textAlign = 'center';

		const icon = document.createElement('div');
		icon.className = 'nodepad-empty-icon';
		icon.textContent = '📝';
		icon.style.fontSize = '48px';
		icon.style.marginBottom = '16px';
		icon.style.opacity = '0.5';
		emptyState.appendChild(icon);

		const title = document.createElement('h3');
		title.className = 'nodepad-empty-title';
		title.textContent = 'No notes yet';
		title.style.margin = '0 0 8px 0';
		title.style.fontSize = '16px';
		title.style.fontWeight = 'bold';
		title.style.color = '#9ca3af';
		emptyState.appendChild(title);

		const subtitle = document.createElement('p');
		subtitle.className = 'nodepad-empty-subtitle';
		subtitle.textContent = 'Start typing notes in the input bar above';
		subtitle.style.margin = '0';
		subtitle.style.fontSize = '13px';
		subtitle.style.color = '#6b7280';
		emptyState.appendChild(subtitle);

		return emptyState;
	}

	/**
	 * Updates the blocks and re-renders the view.
	 */
	updateBlocks(blocks: NoteBlock[]): void {
		this.blocks = blocks;
		if (this.element && this.element.parentNode) {
			const newElement = this.render();
			this.element.parentNode.replaceChild(newElement, this.element);
			this.element = newElement;
		}
	}
}
