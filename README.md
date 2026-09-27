# pi-model-switch

A [Pi coding agent](https://github.com/earendil-works/pi) extension for direct model switching.

It provides one tool, `switch_model`, for identifying, listing, searching, and directly switching models, and warns in the footer when any model switch would re-bill a warm prompt cache.

Foreground orchestration now lives in `pi-orchestrate`.

## Installation

```bash
pi install npm:pi-model-switch
```

Restart Pi to load the extension.

## Tool

### `switch_model`

Parameters:

- `action`: `current | list | search | switch`
- `search?`: query for `search` and `switch`
- `provider?`: provider filter
- `thinkingLevel?`: `minimal | low | medium | high | xhigh | max`

Behavior:

- `current`: shows the active model without listing every model
- `list`: shows available authenticated models
- `search`: filters by provider, id, or name
- `switch`: resolves aliases first, then does exact or partial model matching, and optionally applies a thinking level

## Prompt cache warning

Switching models is free, but the next request re-bills the whole conversation on the new model because its prompt cache is cold. When the current model's cache is still warm and the re-bill is significant (at least 20k tokens or $0.10), the extension shows a footer status such as:

```text
⚠ next request re-bills ~120k cached tokens (~$0.54) on anthropic/claude-haiku-4-5
```

This covers `/model`, Ctrl+P cycling, and `switch_model`, and clears once the next request starts. After `/model` or Ctrl+P, switch back before sending to avoid the cost. When the agent calls `switch_model` mid-run, the next request goes out right away, so the cost is already paid; the tool result includes the same note so the agent can tell you.

A model's cache counts as warm when its last request on the current branch used the prompt cache (or pi refreshed it) within the model's cache lifetime. The lifetime comes from the model's `promptCache` metadata, using the long tier when `PI_CACHE_RETENTION=long`, and defaults to 5 minutes. Compaction resets it. Returning to a model whose cache is still warm does not warn.

The cost is an estimate: the current context size priced at the new model's cache-write (or input) rate minus its cache-read rate.

## Aliases

Aliases can be defined in the first existing file from these locations, in priority order:

1. `{project}/.pi/aliases.json`
2. `~/.pi/agent/aliases.json`
3. `~/.pi/agent/extensions/model-switch/aliases.json`

The extension loads aliases when the tool runs, so project aliases use the current working directory. `list` reports the selected alias file path.

For example, define aliases in the extension-level file:

```text
~/.pi/agent/extensions/model-switch/aliases.json
```

```json
{
  "cheap": "google/gemini-2.5-flash",
  "coding": {
    "model": "anthropic/claude-opus-4-5",
    "thinkingLevel": "high"
  },
  "budget": [
    { "model": "openai/gpt-5-mini", "thinkingLevel": "low" },
    "google/gemini-2.5-flash"
  ]
}
```

Rules:

- top-level value must be an object
- alias names must be non-empty strings
- each target must be a `provider/modelId` string or an object containing `model` and optional `thinkingLevel`
- string alias: one exact model target (backward compatible)
- object alias: `{ "model": "provider/modelId", "thinkingLevel": "high" }`
- array alias: fallback chain; first available authenticated target wins
- explicit `thinkingLevel` on `switch_model` overrides the alias setting
- omit `thinkingLevel` to preserve Pi's existing model-switch behavior; Pi clamps unsupported levels per model and the tool reports the effective level

## License

MIT
