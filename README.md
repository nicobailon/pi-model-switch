# pi-model-switch

A [Pi coding agent](https://github.com/badlogic/pi-mono) extension that gives the agent the ability to list, search, and switch models on its own.

With this extension, you can tell the agent things like "switch to a cheaper model" or "use Claude for this task" and it will handle the model change itself, without you needing to use `/model` or keyboard shortcuts.

## Installation

Copy the extension to your Pi extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions/model-switch
curl -o ~/.pi/agent/extensions/model-switch/index.ts \
  https://raw.githubusercontent.com/nicobailon/pi-model-switch/main/index.ts
```

Or clone the repo:

```bash
git clone https://github.com/nicobailon/pi-model-switch ~/.pi/agent/extensions/model-switch
```

Restart Pi to load the extension.

### Verify Installation

After restarting Pi, the `switch_model` tool should be available. Ask the agent to "list available models" to confirm.

### Updating

If you used curl:
```bash
curl -o ~/.pi/agent/extensions/model-switch/index.ts \
  https://raw.githubusercontent.com/nicobailon/pi-model-switch/main/index.ts
```

If you cloned:
```bash
cd ~/.pi/agent/extensions/model-switch && git pull
```

Restart Pi after updating.

## Configuration

### Model Aliases

Create `aliases.json` in the extension directory to define shortcuts:

```bash
~/.pi/agent/extensions/model-switch/aliases.json
```

```json
{
  "cheap": "google/gemini-2.5-flash",
  "fast": "google/gemini-2.5-flash",
  "coding": "anthropic/claude-opus-4-5",
  "budget": ["openai/gpt-5-mini", "google/gemini-2.5-flash", "anthropic/claude-3-5-haiku-latest"]
}
```

- **String value**: Must be an available model or returns an error
- **Array value**: Uses first available model in the list (fallback chain)

Then just say "switch to cheap" or "use coding model".

### AGENTS.md

Add model switching preferences to your `AGENTS.md` for contextual decisions:

```markdown
## Model preferences
- Simple file ops / quick questions: switch to "cheap"
- Complex refactoring / architecture: switch to "coding"
- Default to budget-friendly models unless quality is needed
```

The agent will use aliases when appropriate based on your guidance.

## Usage

Once installed, the agent gains a `switch_model` tool. Just ask naturally:

- "List available models"
- "Switch to GPT-5.2"
- "Use Opus 4.5"
- "Change to a model with vision capabilities"
- "Use a cheaper model for this task"

The agent will list models or switch as appropriate.

## Tool Reference

The extension registers a single tool:

**switch_model**

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `"list"` \| `"search"` \| `"switch"` | List all models, search/filter models, or switch to one |
| `search` | string (optional) | For search/switch: term to match model by provider, id, or name |
| `provider` | string (optional) | Filter to a specific provider (e.g. 'anthropic', 'openai', 'google') |

### List action

Returns all models you have API keys configured for, showing:
- Provider and model ID
- Model name
- Context window and max output tokens
- Capabilities (reasoning, vision)
- Cost per 1M tokens (input/output)
- Which model is currently active

### Search action

Filters models by partial match on provider, id, or name. Returns all matching models with full details.

### Switch action

Matches models by:
1. Alias lookup (if defined in `aliases.json`)
2. Exact `provider/id` match
3. Exact `id` match
4. Partial match on id, name, or provider

If multiple models match, it asks you to be more specific.

## Requirements

- [Pi coding agent](https://github.com/badlogic/pi-mono)
- API keys configured for the models you want to use

## License

MIT
