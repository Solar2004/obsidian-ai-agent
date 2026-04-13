# Obsidian AI Agent - Feature Roadmap

## Overview

This document outlines the planned improvements for the Obsidian AI Agent plugin, focusing on reliability, user experience, and conversation management.

---

## 1. Better Error Handling

### Problem
Currently, when API calls fail or credentials are invalid, error messages are often cryptic or generic, making debugging difficult for users.

### Goals
- Display clear, actionable error messages
- Provide troubleshooting steps when possible
- Implement automatic retry with exponential backoff
- Show connection status indicators

### Implementation Details

#### Retry Logic
```typescript
interface RetryConfig {
  maxRetries: number;      // Default: 3
  initialDelay: number;    // Default: 1000ms
  maxDelay: number;        // Default: 30000ms
  backoffMultiplier: number; // Default: 2
  retryableStatuses: number[]; // [500, 502, 503, 504]
}
```

- Automatic retry for network failures and 5xx errors
- Exponential backoff between retries: `delay = min(initialDelay * (backoffMultiplier ^ attempt), maxDelay)`
- User notification before retry attempts with countdown
- Option to cancel retry in progress
- Jitter added to prevent thundering herd: `delay = delay * (0.5 + Math.random() * 0.5)`

#### Error Categories
| Category | User Message | Troubleshooting |
|----------|---------------|-----------------|
| `INVALID_API_KEY` | "Invalid API key. Please check your settings." | Link to settings, steps to verify key |
| `RATE_LIMIT` | "Rate limit exceeded. Retrying in X seconds..." | Show retry countdown, suggest upgrade |
| `NETWORK_ERROR` | "Connection failed. Check your internet." | Retry button, network diagnostics |
| `SERVER_ERROR` | "Provider server error. Retrying..." | Auto-retry with backoff, status page link |
| `TIMEOUT` | "Request timed out. Try again?" | Manual retry button, timeout setting |
| `MODEL_UNAVAILABLE` | "Model not available. Try a different model." | List available alternatives |
| `CONTEXT_LENGTH` | "Conversation too long. Start a new chat." | Button to start new chat |
| `AUTH_TOKEN_EXPIRED` | "Session expired. Re-authenticate." | Re-auth flow trigger |

#### Error Service Implementation
```typescript
// services/ErrorHandler.ts
export class ErrorHandler {
  private retryConfig: RetryConfig;

  async handleError(error: Error, context: RequestContext): Promise<ErrorAction> {
    const category = this.categorizeError(error);
    const action = this.getRecommendedAction(category);

    if (this.isRetryable(error) && this.hasRetriesRemaining()) {
      return this.scheduleRetry(error, context);
    }

    return { category, ...action, error };
  }

  private categorizeError(error: Error): ErrorCategory {
    // Map error messages/codes to categories
  }

  private isRetryable(error: Error): boolean {
    // Check if error type qualifies for retry
  }
}
```

#### UI Indicators
- **Status bar**: Shows current connection status (connected/disconnected/error/waiting)
  - Green dot: Connected
  - Yellow dot + spinner: Processing
  - Red dot: Error (click for details)
- **Inline errors**: Non-intrusive error messages within chat
- **Toast notifications**: For temporary errors that auto-resolve
- **Settings link**: Direct link to relevant settings section

#### Settings Options
```
Error Handling
├── Show detailed errors (for debugging) [toggle]
├── Auto-retry failed requests [toggle]
├── Retry count: [dropdown: 1, 2, 3, 5]
├── Initial retry delay (ms): [dropdown: 500, 1000, 2000]
├── Show connection status indicator [toggle]
└── Timeout (seconds): [dropdown: 30, 60, 120]
```

---

## 2. Better Chat UI

### Problem
The current chat interface is functional but lacks features that improve the conversational experience, especially for iterative workflows.

### Goals
- Enable message editing after sending
- Allow regeneration of responses
- Improve streaming UX
- Add conversation branching

### Features

#### 2.1 Message Editing
- **Trigger**: Hover over message → click edit icon (or double-click)
- **Behavior**:
  - Replaces input field with message content
  - Shows "Editing" indicator with original timestamp
  - Cancel (Escape) / Save (Enter or button)
  - Visual diff of changes before saving
- **Effect**: Edits the conversation for context resend
- **Implementation**:
```typescript
interface EditableMessage {
  messageId: string;
  originalContent: string;
  editedContent: string;
  editedAt: Date;
  editCount: number;
}

// State management
private editingMessage: { messageId: string; originalContent: string } | null = null;

// Key methods
startEditing(messageId: string, content: string): void;
saveEdit(messageId: string, newContent: string): void;
cancelEdit(): void;
```

#### 2.2 Response Regeneration
- **Trigger**: Button next to assistant response
- **Behavior**:
  - Shows "Regenerating..." state with spinner
  - Re-sends last user message with full context
  - Displays new response (replaces old)
  - Increment `regeneration_count` metadata
- **Limit**: Max 5 regenerations per message
- **Edge cases**:
  - If at limit, button is disabled with tooltip explaining why
  - Regeneration inherits all context (file context, MCP tools)
- **UI**:
  - Regeneration count badge (↻ 2) shown if regenerated
  - Click count badge to see regeneration history

#### 2.3 Conversation Branching
- **Trigger**: Button to "Branch conversation"
- **Behavior**:
  - Creates a copy of current conversation with new ID
  - Opens in new view/tab (or replaces current with confirmation)
  - Original conversation unchanged
  - Branch indicator shows relationship: "Branched from: [original summary]"
- **Use case**: Explore alternative responses without losing current conversation
- **Metadata**: Branched conversations tagged with `branch` and reference to parent ID

#### 2.4 Streaming UX Improvements
- **Typing indicator**: "Thinking..." while waiting for first token
  - Shows after 500ms of no response
  - Animated dots: "Thinking..."
- **Token counter**: Live count of tokens received
  - Shows below assistant message during streaming
  - Format: "📊 1,234 tokens"
- **Smooth rendering**: Markdown renders progressively, not after completion
  - Each chunk is appended, not full re-render
  - Code blocks render as soon as complete
- **Interruption**: Stop button to cancel streaming response
  - Button changes from Send to Stop during streaming
  - Partial response is kept (not discarded)

#### 2.5 Copy Functionality
- **Copy button** on code blocks (single click, shows "Copied!" tooltip for 2s)
- **Copy message** button on hover (copies full message as Markdown)
- **Copy reasoning** for models that support it (e.g., Claude extended thinking)
- **Copy link** to jump to specific message in conversation history

#### 2.6 Message Actions Menu
```
┌─────────────────────────────────────────────────────────┐
│ [Branch] [Regenerate] [Delete]              [Copy] 📋   │
│ "What is the capital of France?"                       │
│                                               12:30 PM  │
└─────────────────────────────────────────────────────────┘
```

Dropdown menu on ⋯ button:
- Copy message
- Copy as Markdown
- Edit message
- Regenerate response
- Branch conversation
- Delete message

### UI Mockup - Enhanced Message

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ You                                          12:30 PM   ⋯ │ │
│ │ "What is the capital of France?"                         │ │
│ │                                          [Edit] [Branch]   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AI                                            12:30 PM   ⋯ │ │
│ │ The capital of France is **Paris**.                       │ │
│ │                                                     ↻ 2    │ │
│ │                                   📊 234 tok  💰 $0.0021   │ │
│ │                                          [Regenerate]      │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Conversation Management

### Problem
Conversations are ephemeral. Users cannot save, search, or reuse past conversations, losing valuable context and AI interactions.

### Goals
- Save conversations as structured Markdown notes
- Browse and search conversation history
- Export and import conversations
- Auto-save with configurable frequency

### Implementation - ConversationManager Service

See: `services/ConversationManager.ts`

#### Core Types
```typescript
interface ConversationMetadata {
  id: string;
  provider: string;
  model: string;
  created: string;        // ISO 8601
  updated: string;         // ISO 8601
  tags: string[];
  summary: string;         // First user message, truncated to 100 chars
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface SavedConversation {
  metadata: ConversationMetadata;
  messages: ChatMessage[];
}
```

#### Storage Format

**File location**: `.obsidian-ai-agent/conversations/`

**Filename format**: `{timestamp}_{provider}_{model_slug}.md`

Example: `2026-04-12T10-30-00-000Z_openrouter_claude-3-5-sonnet.md`

**File structure**:
```markdown
---
id: conv-1234567890-abc123
provider: openrouter
model: openrouter/anthropic/claude-3.5-sonnet
created: 2026-04-12T10:30:00Z
updated: 2026-04-12T10:45:00Z
tags: [research, coding]
summary: "Explain the capital of France..."
input_tokens: 45
output_tokens: 234
total_tokens: 279
estimated_cost_usd: 0.002340
---

### [USER] 2026-04-12T10:30:00.000Z

What is the capital of France?

### [ASSISTANT] 2026-04-12T10:30:01.000Z

The capital of France is **Paris**.

### [TOOL: Bash]
```json
{
  "command": "date",
  "description": "Get current date"
}
```

[TOOL RESULT]
```
Wed 12 Apr 2026 10:30:01 UTC
```
```

#### Features

##### 3.1 Auto-Save
- **Location**: `vault/.obsidian-ai-agent/conversations/`
- **Format**: `{timestamp}_{provider}_{model}.md`
- **Frequency**: Every N seconds during active conversation (configurable: 5, 10, 30, 60)
- **Trigger**: Auto-save fires on each new message exchange
- **Data stored**: Full message history + metadata in YAML frontmatter

##### 3.2 Conversation History Sidebar
- **Location**: Left sidebar (collapsible via icon in header)
- **Contents**:
  - List of saved conversations (sorted by date, newest first)
  - Search filter input (searches summary, provider, model)
  - Provider/model filter chips
  - Quick preview on hover (shows first 3 messages)
- **Actions**:
  - Click to load conversation (replaces current chat)
  - Right-click context menu: Rename, Delete, Export, Tag, Branch
  - Multi-select for bulk operations (Shift+click to select range)

##### 3.3 Conversation Metadata
- **Tags**: User-assignable tags for categorization (editable via right-click)
- **Summary**: Auto-generated from first user message (first 100 chars)
- **Provider/Model**: Always visible in list view with icons
- **Token usage**: Estimated cost per conversation (from UsageTracker)
- **Created/Updated**: Timestamps shown in relative format ("2 hours ago")

##### 3.4 Export
- **Formats**: Markdown (default), JSON, HTML
- **Scope**: Single conversation or bulk export (multi-select)
- **Output**:
  - Markdown: Human-readable, imports back cleanly
  - JSON: Full metadata + message preservation
  - HTML: Styled for sharing/readability with CSS

##### 3.5 Import
- Drag-and-drop `.md` files into conversation sidebar
- Auto-detect conversation format via frontmatter or message structure
- Merge into existing (append messages) or create new
- Preview before import with conflict detection

##### 3.6 Conversation Search
- Full-text search across all conversations
- Filter by: date range, provider, model, tags
- Results show conversation with matching text highlighted
- Click result to jump to that conversation

### File Structure

```
.vault/
└── .obsidian-ai-agent/
    ├── conversations/
    │   ├── 2026-04-10_research_claude.md
    │   ├── 2026-04-11_coding_openrouter.md
    │   └── 2026-04-12_general_gemini.md
    └── usage.jsonl
```

### Settings

```
Conversation Management
├── Auto-save conversations: [toggle] (default: on)
├── Save interval (seconds): [dropdown: 5, 10, 30, 60] (default: 30)
├── Storage location: [.obsidian-ai-agent/conversations]
├── Show history sidebar: [toggle] (default: on)
├── Default export format: [Markdown, JSON, HTML] (default: Markdown)
└── Max conversations to keep: [dropdown: 100, 500, 1000, unlimited]
    └── When limit reached: [Auto-delete oldest | Prompt]
```

---

## 4. Usage Analytics

### Problem
Users have no visibility into token usage, API costs, or consumption patterns. This makes it difficult to control spending or optimize model usage.

### Implementation - UsageTracker Service

See: `services/UsageTracker.ts`

#### Core Types
```typescript
interface UsageRecord {
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

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalMessages: number;
  byProvider: Record<string, ProviderStats>;
  byModel: Record<string, ModelStats>;
}

interface ModelPricing {
  provider: string;
  model: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  lastUpdated: string;
}
```

#### Features

##### 4.1 Real-Time Tracking
- **Per-message metrics** (shown below assistant message, collapsible):
  - Input tokens
  - Output tokens
  - Total tokens
  - Estimated cost (USD)
- **Display format**:
  ```
  ┌─────────────────────────────────────────────────┐
  │ Response content...                             │
  │                                   💰 $0.0023    │
  │                                   📊 1.2K tok   │
  └─────────────────────────────────────────────────┘
  ```

##### 4.2 Conversation Summary
- **End-of-conversation summary** (shown after 5s of inactivity following last message):
  ```
  Conversation Summary
  ├── Total messages: 24
  ├── Input tokens: 8,450
  ├── Output tokens: 12,320
  ├── Total tokens: 20,770
  └── Estimated cost: $0.087
  ```

##### 4.3 Usage Dashboard
- **Accessible via**: Toolbar icon or sidebar tab
- **Metrics displayed**:
  - **Today**: Messages, tokens, cost
  - **This week**: Daily breakdown chart (bar chart)
  - **This month**: Cumulative totals with trend indicator
  - **All time**: Grand totals
- **Provider breakdown**: Cost per provider with percentage

##### 4.4 Pricing Table (User-Configurable)
Pre-filled with accurate provider pricing (as of 2026-04-01):

```
┌─────────────────────────────────────┐
│ Model                    Cost/1M    │
├─────────────────────────────────────┤
│ Claude Sonnet 4        $3.00 / $15.00│
│ Claude Opus 4          $15.00/$75.00│
│ Claude Haiku 3.5        $0.80/ $4.00│
│ Gemini 2.5 Pro         $1.25/ $5.00 │
│ Gemini 2.5 Flash        $0.075/$0.30│
│ GPT-4o (OpenRouter)    $2.50/$10.00 │
│ DeepSeek Chat          $0.10/ $0.30│
└─────────────────────────────────────┘
```

- User can adjust for custom APIs or rate changes
- "Last updated" timestamp for reference
- "Update to latest" button to fetch current pricing

##### 4.5 Alerts & Limits
- **Budget alerts**: Notice when estimated daily/monthly cost exceeds threshold
- **Token limits**: Warn when approaching provider limits (per-request context length)
- **Settings**:
  ```
  Usage Alerts
  ├── Enable daily budget alert: [toggle]
  │   └── Daily budget: $[amount] (default: $5.00)
  ├── Enable monthly budget alert: [toggle]
  │   └── Monthly budget: $[amount] (default: $50.00)
  ├── Show cost per message: [toggle] (default: on)
  └── Alert threshold: [dropdown: 50%, 75%, 90%, 100%]
  ```

### Data Storage

**File**: `.obsidian-ai-agent/usage.jsonl`

**Format**: JSON Lines (one JSON object per line)

```jsonl
{"timestamp":"2026-04-12T10:30:00Z","provider":"openrouter","model":"openrouter/anthropic/claude-3.5-sonnet","inputTokens":45,"outputTokens":234,"totalTokens":279,"costUsd":0.00234,"conversationId":"conv-123"}
{"timestamp":"2026-04-12T10:31:00Z","provider":"openrouter","model":"openrouter/anthropic/claude-3.5-sonnet","inputTokens":279,"outputTokens":512,"totalTokens":791,"costUsd":0.00657,"conversationId":"conv-123"}
```

### Dashboard Mockup

```
┌─────────────────────────────────────────────────────────┐
│  📊 Usage Analytics                          [Settings] │
├─────────────────────────────────────────────────────────┤
│  Today          This Week       This Month              │
│  $0.45          $3.82           $12.40                   │
│  156 msg        892 msg         3,241 msg               │
├─────────────────────────────────────────────────────────┤
│  Cost Over Time (Last 7 Days)                           │
│  ▁▂▃▅▆▄▃                                               │
│  M  T  W  T  F  S  S                                    │
├─────────────────────────────────────────────────────────┤
│  By Provider                                            │
│  OpenRouter ████████████████████  $8.20 (66%)          │
│  Gemini     ██████               $3.10 (25%)          │
│  Claude     ███                   $1.10 (9%)           │
├─────────────────────────────────────────────────────────┤
│  ⚠️ Monthly budget alert: $12.40 of $50.00 (25%)      │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Priorities

| Feature | Priority | Complexity | Impact | Status |
|---------|----------|------------|--------|--------|
| Better Error Handling | High | Low | High | ⚠️ In Progress |
| Better Chat UI (editing, regenerate) | High | Medium | High | Pending |
| Conversation Management | Medium | Medium | Medium | 🔧 Spec Complete |
| Usage Analytics | Medium | Medium | Medium | 🔧 Spec Complete |
| Chat UI (branching, copy) | Low | Low | Medium | Pending |

**Legend**:
- ⚠️ In Progress: Work has started
- 🔧 Spec Complete: Detailed spec ready for implementation
- Pending: High-level spec only

---

## 6. Technical Considerations

### 6.1 Data Persistence
- Use Obsidian's native file system for conversations (no external DB)
- JSONL format for usage data (append-only, efficient)
- Settings sync via Obsidian's built-in sync if enabled

### 6.2 Performance
- Lazy-load conversation history (only load metadata initially)
- Paginate if >100 conversations in list view
- Virtual scrolling for long conversation lists
- Debounce auto-save to avoid excessive disk writes

### 6.3 Privacy
- All data stays local in vault, no external telemetry
- Usage data never leaves the local vault
- Optional: encrypt conversation files at rest

### 6.4 Settings Sync
- ConversationManager and UsageTracker settings in AIChatSettings
- Sync automatically via Obsidian's built-in sync
- Conflict resolution: last-write-wins

### 6.5 Backwards Compatibility
- Graceful degradation if conversation file format changes
- Migration tool for old format conversations
- Version field in conversation metadata

---

## 7. Files to Modify / Create

### New Files
| File | Purpose | Status |
|------|---------|--------|
| `services/ConversationManager.ts` | Save/load/search/export conversations | ✅ Complete |
| `services/UsageTracker.ts` | Token/cost tracking and analytics | ✅ Complete |
| `ConversationSidebarView.ts` | Left sidebar for conversation history | Pending |
| `UsageAnalyticsView.ts` | Dashboard view for usage stats | Pending |

### Modified Files
| File | Changes | Status |
|------|---------|--------|
| `ChatView.ts` | Message editing, regeneration, copy buttons, streaming UX | Pending |
| `SettingsTab.ts` | New settings sections for all features | Pending |
| `main.ts` | Wire up ConversationManager auto-save, UsageTracker recording | Pending |
| `types.ts` | Extend AIChatSettings with new config options | Pending |
| `services/index.ts` | Export new services | ✅ Complete |

### Implementation Order
1. **Phase 1**: Error Handling (quick win, high impact)
2. **Phase 2**: Chat UI improvements (editing, regenerate, copy)
3. **Phase 3**: Conversation Management (auto-save + sidebar)
4. **Phase 4**: Usage Analytics (tracking + dashboard)
5. **Phase 5**: Polish (branching, advanced export, etc.)

---

## 8. Testing Strategy

### Unit Tests
- `ConversationManager`: Serialization/deserialization, search, filtering
- `UsageTracker`: Cost calculation, aggregation, alert triggers
- `ErrorHandler`: Error categorization, retry logic

### Integration Tests
- Save and load conversation round-trip
- Export formats produce valid output
- Usage records persist across plugin reload

### Manual Testing Checklist
- [ ] New chat creates session
- [ ] Messages stream smoothly
- [ ] Error states show appropriate UI
- [ ] Settings changes persist
- [ ] Conversation saves to disk
- [ ] Conversation loads from disk
- [ ] Usage tracking records accurately
- [ ] Dashboard displays correct totals
