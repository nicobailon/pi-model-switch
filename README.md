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
1. Exact `provider/id` match
2. Exact `id` match
3. Partial match on id, name, or provider

If multiple models match, it asks you to be more specific.

## Requirements

- [Pi coding agent](https://github.com/badlogic/pi-mono)
- API keys configured for the models you want to use

## License

MIT
