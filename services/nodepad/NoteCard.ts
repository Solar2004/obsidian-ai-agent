/**
 * NoteCard.ts
 *
 * Renders a NoteBlock as an HTML element for Obsidian (native DOM, no React).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContentType =
	| 'entity'
	| 'claim'
	| 'question'
	| 'task'
	| 'idea'
	| 'reference'
	| 'quote'
	| 'definition'
	| 'opinion'
	| 'reflection'
	| 'narrative'
	| 'comparison'
	| 'thesis'
	| 'general';

export interface NoteBlock {
	id: string;
	text: string;
	timestamp: number;
	contentType: ContentType;
	category?: string;
	annotation?: string;
	confidence?: number | null;
	influencedBy?: string[];
	isEnriching?: boolean;
	isError?: boolean;
	statusText?: string;
	isPinned?: boolean;
	sources?: { url: string; title: string; siteName: string }[];
	subTasks?: { id: string; text: string; isDone: boolean; timestamp: number }[];
}

// ── Content Type Configuration ───────────────────────────────────────────────

interface ContentTypeConfig {
	label: string;
	accentVar: string;
	bodyStyle?: 'blockquote' | 'italic' | 'checkbox' | 'confidence' | 'muted-italic';
}

const CONTENT_TYPE_CONFIG: Record<ContentType, ContentTypeConfig> = {
	entity: { label: 'Entity', accentVar: 'var(--type-entity)' },
	claim: { label: 'Claim', accentVar: 'var(--type-claim)', bodyStyle: 'confidence' },
	question: { label: 'Question', accentVar: 'var(--type-question)' },
	task: { label: 'Task', accentVar: 'var(--type-task)', bodyStyle: 'checkbox' },
	idea: { label: 'Idea', accentVar: 'var(--type-idea)' },
	reference: { label: 'Reference', accentVar: 'var(--type-reference)' },
	quote: { label: 'Quote', accentVar: 'var(--type-quote)', bodyStyle: 'blockquote' },
	definition: { label: 'Definition', accentVar: 'var(--type-definition)', bodyStyle: 'blockquote' },
	opinion: { label: 'Opinion', accentVar: 'var(--type-opinion)', bodyStyle: 'italic' },
	reflection: { label: 'Reflection', accentVar: 'var(--type-reflection)', bodyStyle: 'muted-italic' },
	narrative: { label: 'Narrative', accentVar: 'var(--type-narrative)' },
	comparison: { label: 'Comparison', accentVar: 'var(--type-comparison)' },
	general: { label: 'Note', accentVar: 'var(--type-general)' },
	thesis: { label: 'Thesis', accentVar: 'var(--thesis-accent)' },
};

// Type colors for inline styling (fallback when CSS vars not available)
const TYPE_COLORS: Record<ContentType, string> = {
	entity: '#6366f1',
	claim: '#f59e0b',
	question: '#8b5cf6',
	task: '#10b981',
	idea: '#f97316',
	reference: '#3b82f6',
	quote: '#ec4899',
	definition: '#14b8a6',
	opinion: '#a855f7',
	reflection: '#06b6d4',
	narrative: '#84cc16',
	comparison: '#eab308',
	general: '#6b7280',
	thesis: '#fbbf24',
};

// ── NoteCard Class ────────────────────────────────────────────────────────────

export interface NoteCardCallbacks {
	onDelete?: (id: string) => void;
	onTogglePin?: (id: string) => void;
	onRetry?: (id: string) => void;
}

export class NoteCard {
	private block: NoteBlock;
	private callbacks: NoteCardCallbacks;
	private element: HTMLElement | null = null;

	constructor(block: NoteBlock, callbacks: NoteCardCallbacks = {}) {
		this.block = block;
		this.callbacks = callbacks;
	}

	/**
	 * Renders the NoteBlock as an HTMLElement.
	 */
	render(): HTMLElement {
		const config = CONTENT_TYPE_CONFIG[this.block.contentType];
		const accentColor = TYPE_COLORS[this.block.contentType];
		const isTask = this.block.contentType === 'task';

		// Create card container
		this.element = document.createElement('div');
		this.element.className = 'nodepad-note-card';
		this.element.dataset.noteId = this.block.id;
		this.element.dataset.contentType = this.block.contentType;

		// Apply styles based on type
		const borderLeftWidth = isTask ? '3px' : this.block.contentType === 'thesis' ? '3px' : '2px';
		this.element.style.borderLeft = `${borderLeftWidth} solid ${accentColor}`;
		this.element.style.borderRadius = isTask ? '4px' : '0';
		this.element.style.backgroundColor = 'rgba(var(--card-bg-rgb, 30, 30, 40), 0.3)';
		this.element.style.border = '1px solid rgba(255, 255, 255, 0.1)';
		this.element.style.borderLeft = `${borderLeftWidth} solid ${accentColor}`;
		this.element.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.03)';
		this.element.style.transition = 'all 0.2s ease';
		this.element.style.overflow = 'hidden';

		// Create header
		const header = this.createHeader(accentColor, config.label);
		this.element.appendChild(header);

		// Create body
		const body = this.createBody(accentColor, config.bodyStyle);
		this.element.appendChild(body);

		// Create footer
		const footer = this.createFooter(accentColor);
		this.element.appendChild(footer);

		return this.element;
	}

	private createHeader(accentColor: string, label: string): HTMLElement {
		const header = document.createElement('div');
		header.className = 'nodepad-card-header';
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.justifyContent = 'space-between';
		header.style.padding = '8px 12px';
		header.style.background = `linear-gradient(to right, ${accentColor}, ${accentColor}dd)`;
		header.style.color = 'black';
		header.style.flexShrink = '0';

		// Left side: type label
		const leftSide = document.createElement('div');
		leftSide.style.display = 'flex';
		leftSide.style.alignItems = 'center';
		leftSide.style.gap = '8px';
		leftSide.style.overflow = 'hidden';

		const typeLabel = document.createElement('span');
		typeLabel.className = 'nodepad-type-label';
		typeLabel.textContent = label;
		typeLabel.style.fontFamily = 'monospace';
		typeLabel.style.fontSize = '10px';
		typeLabel.style.fontWeight = 'bold';
		typeLabel.style.textTransform = 'uppercase';
		typeLabel.style.letterSpacing = '0.05em';
		typeLabel.style.whiteSpace = 'nowrap';
		typeLabel.style.overflow = 'hidden';
		typeLabel.style.textOverflow = 'ellipsis';
		leftSide.appendChild(typeLabel);

		// Time
		const time = document.createElement('span');
		time.className = 'nodepad-time';
		time.textContent = this.formatTime(this.block.timestamp);
		time.style.fontFamily = 'monospace';
		time.style.fontSize = '10px';
		time.style.opacity = '0.7';
		leftSide.appendChild(time);

		header.appendChild(leftSide);

		// Right side: buttons
		const rightSide = document.createElement('div');
		rightSide.style.display = 'flex';
		rightSide.style.alignItems = 'center';
		rightSide.style.gap = '8px';
		rightSide.style.flexShrink = '0';

		// Pin button
		if (this.callbacks.onTogglePin) {
			const pinBtn = document.createElement('button');
			pinBtn.className = 'nodepad-btn nodepad-pin-btn';
			pinBtn.innerHTML = this.block.isPinned ? '📌' : '📍';
			pinBtn.title = this.block.isPinned ? 'Unpin note' : 'Pin note';
			pinBtn.style.background = 'transparent';
			pinBtn.style.border = 'none';
			pinBtn.style.cursor = 'pointer';
			pinBtn.style.fontSize = '12px';
			pinBtn.style.padding = '2px';
			pinBtn.style.opacity = this.block.isPinned ? '1' : '0.5';
			pinBtn.style.transition = 'opacity 0.2s';
			pinBtn.addEventListener('click', () => {
				this.callbacks.onTogglePin?.(this.block.id);
			});
			rightSide.appendChild(pinBtn);
		}

		// Retry button (when enriching or error)
		if ((this.block.isEnriching || this.block.isError) && this.callbacks.onRetry) {
			const retryBtn = document.createElement('button');
			retryBtn.className = 'nodepad-btn nodepad-retry-btn';
			retryBtn.innerHTML = '↻';
			retryBtn.title = 'Retry enrichment';
			retryBtn.style.background = 'transparent';
			retryBtn.style.border = 'none';
			retryBtn.style.cursor = 'pointer';
			retryBtn.style.fontSize = '14px';
			retryBtn.style.padding = '2px';
			retryBtn.style.opacity = '0.7';
			if (this.block.isEnriching) {
				retryBtn.style.animation = 'spin 1s linear infinite';
			}
			retryBtn.addEventListener('click', () => {
				this.callbacks.onRetry?.(this.block.id);
			});
			rightSide.appendChild(retryBtn);
		}

		// Delete button
		if (this.callbacks.onDelete) {
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'nodepad-btn nodepad-delete-btn';
			deleteBtn.innerHTML = '✕';
			deleteBtn.title = 'Delete note';
			deleteBtn.style.background = 'transparent';
			deleteBtn.style.border = 'none';
			deleteBtn.style.cursor = 'pointer';
			deleteBtn.style.fontSize = '12px';
			deleteBtn.style.padding = '2px';
			deleteBtn.style.opacity = '0.5';
			deleteBtn.style.transition = 'opacity 0.2s';
			deleteBtn.addEventListener('mouseenter', () => {
				deleteBtn.style.opacity = '1';
			});
			deleteBtn.addEventListener('mouseleave', () => {
				deleteBtn.style.opacity = '0.5';
			});
			deleteBtn.addEventListener('click', () => {
				this.callbacks.onDelete?.(this.block.id);
			});
			rightSide.appendChild(deleteBtn);
		}

		header.appendChild(rightSide);

		return header;
	}

	private createBody(accentColor: string, bodyStyle?: string): HTMLElement {
		const body = document.createElement('div');
		body.className = 'nodepad-card-body';
		body.style.flex = '1';
		body.style.overflow = 'auto';
		body.style.padding = '12px';

		// Error state
		if (this.block.isError) {
			const errorDiv = document.createElement('div');
			errorDiv.className = 'nodepad-error';
			errorDiv.style.display = 'flex';
			errorDiv.style.alignItems = 'start';
			errorDiv.style.gap = '8px';
			errorDiv.style.padding = '10px';
			errorDiv.style.marginBottom = '12px';
			errorDiv.style.borderRadius = '4px';
			errorDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
			errorDiv.style.border = '1px solid rgba(239, 68, 68, 0.3)';

			const errorIcon = document.createElement('span');
			errorIcon.textContent = '⚠';
			errorIcon.style.fontSize = '14px';
			errorDiv.appendChild(errorIcon);

			const errorText = document.createElement('div');
			errorText.className = 'nodepad-error-text';
			errorText.style.fontSize = '11px';
			errorText.style.lineHeight = '1.4';
			if (this.block.statusText === 'no-api-key') {
				errorText.innerHTML =
					'AI enrichment failed — no API key. Open <strong>Settings</strong> to add your API key.';
			} else if (this.block.statusText) {
				errorText.innerHTML = `${this.block.statusText} <span style="opacity:0.6">Double-click to retry.</span>`;
			} else {
				errorText.innerHTML = 'Enrichment failed. Double-click to retry.';
			}
			errorText.style.color = '#fca5a5';
			errorDiv.appendChild(errorText);

			body.appendChild(errorDiv);
		}

		// Loading state
		if (this.block.isEnriching) {
			const loadingDiv = document.createElement('div');
			loadingDiv.className = 'nodepad-loading';
			loadingDiv.style.display = 'flex';
			loadingDiv.style.alignItems = 'center';
			loadingDiv.style.gap = '8px';
			loadingDiv.style.padding = '8px 0';
			loadingDiv.style.color = '#9ca3af';
			loadingDiv.style.fontSize = '12px';

			const spinner = document.createElement('span');
			spinner.className = 'nodepad-spinner';
			spinner.innerHTML = '◌';
			spinner.style.animation = 'spin 1s linear infinite';
			spinner.style.display = 'inline-block';
			loadingDiv.appendChild(spinner);

			const loadingText = document.createElement('span');
			loadingText.textContent = 'Enriching...';
			loadingDiv.appendChild(loadingText);

			body.appendChild(loadingDiv);
		}

		// Note text
		const textDiv = document.createElement('div');
		textDiv.className = 'nodepad-note-text';
		textDiv.style.marginBottom = '12px';

		if (bodyStyle === 'blockquote') {
			const blockquote = document.createElement('blockquote');
			blockquote.style.borderLeft = `3px solid ${accentColor}`;
			blockquote.style.paddingLeft = '12px';
			blockquote.style.margin = '0';
			blockquote.style.opacity = '0.9';
			blockquote.style.fontStyle = 'italic';
			blockquote.innerHTML = this.escapeHtml(this.block.text);
			textDiv.appendChild(blockquote);
		} else if (bodyStyle === 'italic') {
			const italicP = document.createElement('p');
			italicP.style.fontStyle = 'italic';
			italicP.style.fontWeight = 'bold';
			italicP.style.margin = '0';
			italicP.innerHTML = this.escapeHtml(this.block.text);
			textDiv.appendChild(italicP);
		} else if (bodyStyle === 'muted-italic') {
			const mutedP = document.createElement('p');
			mutedP.style.fontStyle = 'italic';
			mutedP.style.fontWeight = 'bold';
			mutedP.style.margin = '0';
			mutedP.style.color = '#9ca3af';
			mutedP.innerHTML = this.escapeHtml(this.block.text);
			textDiv.appendChild(mutedP);
		} else if (bodyStyle === 'checkbox' && this.block.subTasks) {
			// Task with subtasks
			const taskContainer = document.createElement('div');
			taskContainer.style.display = 'flex';
			taskContainer.style.flexDirection = 'column';
			taskContainer.style.gap = '8px';

			for (const subTask of this.block.subTasks) {
				const subTaskDiv = document.createElement('div');
				subTaskDiv.style.display = 'flex';
				subTaskDiv.style.alignItems = 'start';
				subTaskDiv.style.gap = '8px';

				const checkbox = document.createElement('span');
				checkbox.textContent = subTask.isDone ? '☑' : '☐';
				checkbox.style.color = subTask.isDone ? '#10b981' : '#6b7280';
				subTaskDiv.appendChild(checkbox);

				const subTaskText = document.createElement('span');
				subTaskText.textContent = subTask.text;
				subTaskText.style.textDecoration = subTask.isDone ? 'line-through' : 'none';
				subTaskText.style.opacity = subTask.isDone ? '0.6' : '1';
				subTaskDiv.appendChild(subTaskText);

				taskContainer.appendChild(subTaskDiv);
			}
			textDiv.appendChild(taskContainer);
		} else if (bodyStyle === 'checkbox') {
			// Simple checkbox task
			const isDone = this.block.text.toLowerCase().startsWith('[x]');
			const displayText = this.block.text.replace(/^\[[\sx]?\]\s*/i, '');

			const taskDiv = document.createElement('div');
			taskDiv.style.display = 'flex';
			taskDiv.style.alignItems = 'start';
			taskDiv.style.gap = '8px';

			const checkbox = document.createElement('span');
			checkbox.textContent = isDone ? '☑' : '☐';
			checkbox.style.color = isDone ? '#10b981' : '#6b7280';
			taskDiv.appendChild(checkbox);

			const taskText = document.createElement('span');
			taskText.textContent = displayText;
			taskText.style.textDecoration = isDone ? 'line-through' : 'none';
			taskText.style.opacity = isDone ? '0.6' : '1';
			taskDiv.appendChild(taskText);

			textDiv.appendChild(taskDiv);
		} else {
			// Default paragraph
			const p = document.createElement('p');
			p.style.margin = '0';
			p.style.fontWeight = 'bold';
			p.innerHTML = this.escapeHtml(this.block.text);
			textDiv.appendChild(p);
		}

		body.appendChild(textDiv);

		// AI Annotation
		if (this.block.annotation) {
			const annotationDiv = document.createElement('div');
			annotationDiv.className = 'nodepad-annotation';
			annotationDiv.style.marginTop = '12px';
			annotationDiv.style.paddingTop = '12px';
			annotationDiv.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';

			const annotationLabel = document.createElement('div');
			annotationLabel.className = 'nodepad-annotation-label';
			annotationLabel.textContent = 'AI Insight';
			annotationLabel.style.fontFamily = 'monospace';
			annotationLabel.style.fontSize = '9px';
			annotationLabel.style.textTransform = 'uppercase';
			annotationLabel.style.letterSpacing = '0.1em';
			annotationLabel.style.color = '#9ca3af';
			annotationLabel.style.marginBottom = '6px';
			annotationDiv.appendChild(annotationLabel);

			const annotationText = document.createElement('div');
			annotationText.className = 'nodepad-annotation-text';
			annotationText.style.fontSize = '13px';
			annotationText.style.lineHeight = '1.6';
			annotationText.style.color = '#d1d5db';
			annotationText.style.fontStyle = 'italic';
			annotationText.innerHTML = this.block.annotation;
			annotationDiv.appendChild(annotationText);

			body.appendChild(annotationDiv);
		}

		// Confidence indicator (for claims)
		if (this.block.confidence !== undefined && this.block.confidence !== null) {
			const confidenceDiv = document.createElement('div');
			confidenceDiv.className = 'nodepad-confidence';
			confidenceDiv.style.marginTop = '12px';

			const confidenceLabel = document.createElement('div');
			confidenceLabel.style.display = 'flex';
			confidenceLabel.style.justifyContent = 'space-between';
			confidenceLabel.style.marginBottom = '4px';

			const labelText = document.createElement('span');
			labelText.textContent = 'Confidence';
			labelText.style.fontFamily = 'monospace';
			labelText.style.fontSize = '9px';
			labelText.style.color = '#9ca3af';
			confidenceLabel.appendChild(labelText);

			const valueText = document.createElement('span');
			valueText.textContent = `${Math.round(this.block.confidence)}%`;
			valueText.style.fontFamily = 'monospace';
			valueText.style.fontSize = '9px';
			valueText.style.color = '#9ca3af';
			confidenceLabel.appendChild(valueText);

			confidenceDiv.appendChild(confidenceLabel);

			const barBg = document.createElement('div');
			barBg.style.height = '2px';
			barBg.style.width = '100%';
			barBg.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
			barBg.style.borderRadius = '1px';
			barBg.style.overflow = 'hidden';

			const barFill = document.createElement('div');
			barFill.style.height = '100%';
			barFill.style.width = `${Math.max(5, this.block.confidence)}%`;
			barFill.style.backgroundColor = accentColor;
			barFill.style.opacity = '0.6';
			barFill.style.borderRadius = '1px';
			barFill.style.transition = 'width 0.3s ease';
			barBg.appendChild(barFill);

			confidenceDiv.appendChild(barBg);
			body.appendChild(confidenceDiv);
		}

		return body;
	}

	private createFooter(accentColor: string): HTMLElement {
		const footer = document.createElement('div');
		footer.className = 'nodepad-card-footer';
		footer.style.display = 'flex';
		footer.style.alignItems = 'center';
		footer.style.justifyContent = 'space-between';
		footer.style.padding = '8px 12px';
		footer.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
		footer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
		footer.style.flexShrink = '0';

		// Category tag
		if (this.block.category) {
			const categoryTag = document.createElement('span');
			categoryTag.className = 'nodepad-category-tag';
			categoryTag.textContent = `#${this.block.category}`;
			categoryTag.style.display = 'inline-flex';
			categoryTag.style.alignItems = 'center';
			categoryTag.style.gap = '4px';
			categoryTag.style.padding = '2px 8px';
			categoryTag.style.borderRadius = '3px';
			categoryTag.style.fontFamily = 'monospace';
			categoryTag.style.fontSize = '10px';
			categoryTag.style.fontWeight = 'bold';
			categoryTag.style.backgroundColor = `${accentColor}35`;
			categoryTag.style.color = 'white';
			categoryTag.style.border = `1px solid ${accentColor}80`;
			footer.appendChild(categoryTag);
		}

		// Node ID
		const nodeId = document.createElement('span');
		nodeId.className = 'nodepad-node-id';
		nodeId.textContent = `#${this.block.id.slice(0, 6)}`;
		nodeId.style.fontFamily = 'monospace';
		nodeId.style.fontSize = '9px';
		nodeId.style.color = '#6b7280';
		nodeId.style.marginLeft = 'auto';
		footer.appendChild(nodeId);

		return footer;
	}

	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}
