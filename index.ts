import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { StringEnum, type ThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type AliasTarget = {
	model: string;
	thinkingLevel?: ThinkingLevel;
};

type AliasConfig = Record<string, AliasTarget | AliasTarget[]>;

const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;

function parseModelSpec(spec: string): { provider: string; modelId: string } | null {
	const normalized = spec.trim();
	const slashIndex = normalized.indexOf("/");
	if (slashIndex <= 0 || slashIndex >= normalized.length - 1) {
		return null;
	}

	const provider = normalized.slice(0, slashIndex).trim();
	const modelId = normalized.slice(slashIndex + 1).trim();
	if (!provider || !modelId) {
		return null;
	}

	return { provider, modelId };
}

function parseAliasTarget(rawTarget: unknown): AliasTarget | null {
	if (typeof rawTarget === "string") {
		const model = rawTarget.trim();
		return model && parseModelSpec(model) ? { model } : null;
	}
	if (typeof rawTarget !== "object" || rawTarget === null || Array.isArray(rawTarget)) {
		return null;
	}

	if (!("model" in rawTarget) || typeof rawTarget.model !== "string") {
		return null;
	}
	const model = rawTarget.model.trim();
	if (!model || !parseModelSpec(model)) {
		return null;
	}
	const rawThinkingLevel = "thinkingLevel" in rawTarget ? rawTarget.thinkingLevel : undefined;
	const thinkingLevel = THINKING_LEVELS.find((level) => level === rawThinkingLevel);
	if (rawThinkingLevel !== undefined && thinkingLevel === undefined) {
		return null;
	}

	return {
		model,
		...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
	};
}

function loadAliases(cwd: string, extensionDir: string): { aliases: AliasConfig; source?: string; error?: string } {
	const aliasPaths = [
		join(cwd, ".pi", "aliases.json"),
		join(homedir(), ".pi", "agent", "aliases.json"),
		join(extensionDir, "aliases.json"),
	];

	for (const aliasPath of aliasPaths) {
		if (!existsSync(aliasPath)) {
			continue;
		}

		try {
			const content = readFileSync(aliasPath, "utf-8");
			const parsed = JSON.parse(content);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				return { aliases: {}, error: `Failed to load ${aliasPath}: expected a top-level object of alias -> target|target[]` };
			}

			const aliases: AliasConfig = {};
			for (const [rawKey, rawValue] of Object.entries(parsed)) {
				const key = rawKey.trim();
				if (!key) {
					return { aliases: {}, error: `Failed to load ${aliasPath}: alias names must be non-empty strings` };
				}

				if (!Array.isArray(rawValue)) {
					const target = parseAliasTarget(rawValue);
					if (!target) {
						return { aliases: {}, error: `Failed to load ${aliasPath}: alias "${key}" has an invalid target or thinkingLevel` };
					}
					aliases[key] = target;
					continue;
				}

				if (rawValue.length === 0) {
					return { aliases: {}, error: `Failed to load ${aliasPath}: alias "${key}" must have at least one target` };
				}

				const values: AliasTarget[] = [];
				for (const candidate of rawValue) {
					const target = parseAliasTarget(candidate);
					if (!target) {
						return { aliases: {}, error: `Failed to load ${aliasPath}: alias "${key}" contains an invalid target or thinkingLevel` };
					}
					if (!values.some((value) => value.model === target.model && value.thinkingLevel === target.thinkingLevel)) {
						values.push(target);
					}
				}

				aliases[key] = values;
			}

			return { aliases, source: aliasPath };
		} catch (error) {
			return { aliases: {}, error: `Failed to load ${aliasPath}: ${error instanceof Error ? error.message : String(error)}` };
		}
	}

	return { aliases: {} };
}

function formatModelLine(
	model: {
		provider: string;
		id: string;
		name: string;
		reasoning: boolean;
		input: readonly string[];
		contextWindow: number;
		maxTokens: number;
		cost: { input: number; output: number };
	},
	currentModel: { provider?: string; id?: string } | null | undefined,
): string {
	const current = currentModel && model.provider === currentModel.provider && model.id === currentModel.id;
	const marker = current ? " (current)" : "";
	const capabilities = [model.reasoning ? "reasoning" : null, model.input.includes("image") ? "vision" : null]
		.filter(Boolean)
		.join(", ");
	const capabilityText = capabilities ? ` [${capabilities}]` : "";
	const costText = `$${model.cost.input.toFixed(2)}/$${model.cost.output.toFixed(2)} per 1M tokens (in/out)`;
	return `${model.provider}/${model.id}${marker}${capabilityText}\n  ${model.name} | ctx: ${model.contextWindow.toLocaleString()} | max: ${model.maxTokens.toLocaleString()}\n  ${costText}`;
}

const extension: ExtensionFactory = (pi) => {
	const extensionDir = dirname(fileURLToPath(import.meta.url));

	pi.registerTool({
		name: "switch_model",
		label: "Switch Model",
		description:
			"Show the current model, list/search models, or switch models. Supports aliases defined in aliases.json (e.g. 'cheap', 'coding'). Use when the user mentions a model by name, asks to identify or change the model, or when you need a model with different capabilities (reasoning, vision, cost, context window).",
		promptSnippet:
			"Use this tool when the user asks to identify, list, search, or switch models, requests a specific model/provider, or asks for cheaper/faster/vision/reasoning-capable models. Prefer action='search' before action='switch' when intent is ambiguous.",
		parameters: Type.Object({
			action: StringEnum(["current", "list", "search", "switch"] as const, {
				description: "Action to perform: 'current' (show the active model), 'list' (show all models), 'search' (filter by query), or 'switch' (change model)",
			}),
			search: Type.Optional(
				Type.String({
					description:
						"For search/switch actions: search term to match model by provider, id, or name (e.g. 'sonnet', 'opus', 'gpt-5.2', 'anthropic/claude')",
				}),
			),
			provider: Type.Optional(
				Type.String({
					description: "Filter to a specific provider (e.g. 'anthropic', 'openai', 'google', 'openrouter')",
				}),
			),
			thinkingLevel: Type.Optional(
				StringEnum(THINKING_LEVELS, {
					description: "Thinking level to apply after switching. Pi clamps unsupported levels to the model's capabilities.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			let models = ctx.modelRegistry.getAvailable();
			const currentModel = ctx.model;
			const provider = params.provider?.trim() ?? "";
			const normalizedProvider = provider.toLowerCase();
			const search = params.search?.trim() ?? "";
			const normalizedSearch = search.toLowerCase();

			if (params.action === "current") {
				if (!currentModel) {
					throw new Error("No model is currently active");
				}

				return {
					content: [
						{
							type: "text",
							text: `Current model: ${currentModel.provider}/${currentModel.id} (${currentModel.name}), thinking: ${pi.getThinkingLevel()}`,
						},
					],
					details: undefined,
				};
			}

			const { aliases, source: aliasSource, error: aliasLoadError } = loadAliases(ctx.cwd, extensionDir);
			const aliasWarning = aliasLoadError ? `\n\nWarning: ${aliasLoadError}` : "";

			if (normalizedProvider) {
				models = models.filter((model) => model.provider.toLowerCase() === normalizedProvider);
				if (models.length === 0) {
					throw new Error(
						`No models available for provider "${provider}". Available providers: ${[...new Set(ctx.modelRegistry.getAvailable().map((model) => model.provider))].join(", ")}`,
					);
				}
			}

			if (params.action === "list") {
				if (models.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No models available. Configure API keys for providers you want to use (see `pi --help` or check ~/.pi/agent/auth.json).",
							},
						],
						details: undefined,
					};
				}

				const aliasInfo = aliasLoadError
					? `\n\nWarning: ${aliasLoadError}`
					: Object.keys(aliases).length > 0
						? `\n\nAliases: ${Object.keys(aliases).join(", ")}${aliasSource ? ` (from ${aliasSource})` : ""}`
						: aliasSource
							? `\n\nAliases: (none) (from ${aliasSource})`
							: "";
				const lines = models.map((model) => formatModelLine(model, currentModel));
				return {
					content: [{ type: "text", text: `Available models (${models.length}):${aliasInfo}\n\n${lines.join("\n\n")}` }],
					details: undefined,
				};
			}

			if (params.action === "search") {
				if (!search) {
					throw new Error("search parameter required for search action");
				}

				const matches = models.filter(
					(model) =>
						model.id.toLowerCase().includes(normalizedSearch)
						|| model.name.toLowerCase().includes(normalizedSearch)
						|| model.provider.toLowerCase().includes(normalizedSearch),
				);
				if (matches.length === 0) {
					return {
						content: [{ type: "text", text: `No models found matching "${search}"` }],
						details: undefined,
					};
				}

				const lines = matches.map((model) => formatModelLine(model, currentModel));
				return {
					content: [{ type: "text", text: `Models matching "${search}" (${matches.length}):\n\n${lines.join("\n\n")}` }],
					details: undefined,
				};
			}

			if (!search) {
				throw new Error("search parameter required for switch action");
			}

			const activateModel = async (
				model: (typeof models)[number],
				requestedThinking: ThinkingLevel | undefined,
			): Promise<{ changedModel: boolean; thinkingText: string } | null> => {
				const changedModel = !currentModel || model.provider !== currentModel.provider || model.id !== currentModel.id;
				if (changedModel && !(await pi.setModel(model))) {
					return null;
				}

				if (requestedThinking === undefined) {
					return { changedModel, thinkingText: "" };
				}

				pi.setThinkingLevel(requestedThinking);
				const effectiveThinking = pi.getThinkingLevel();
				const requestedText = effectiveThinking === requestedThinking ? "" : ` (requested ${requestedThinking})`;
				return { changedModel, thinkingText: `, thinking: ${effectiveThinking}${requestedText}` };
			};

			const aliasKey = Object.keys(aliases).find((key) => key.toLowerCase() === normalizedSearch);
			if (aliasKey) {
				const aliasValue = aliases[aliasKey];
				const candidates = Array.isArray(aliasValue) ? aliasValue : [aliasValue];

				for (const candidate of candidates) {
					const [provider, ...idParts] = candidate.model.split("/");
					const id = idParts.join("/");
					const aliasMatch = models.find(
						(model) => model.provider.toLowerCase() === provider.toLowerCase() && model.id.toLowerCase() === id.toLowerCase(),
					);
					if (!aliasMatch) {
						continue;
					}

					const requestedThinking = params.thinkingLevel ?? candidate.thinkingLevel;
					const activation = await activateModel(aliasMatch, requestedThinking);
					if (!activation) {
						continue;
					}
					const actionText = activation.changedModel
						? `Switched to ${aliasMatch.provider}/${aliasMatch.id} (${aliasMatch.name}) via alias "${aliasKey}"`
						: `Already using ${aliasMatch.provider}/${aliasMatch.id}${requestedThinking === undefined ? "" : ` via alias "${aliasKey}"`}`;

					return {
						content: [{ type: "text", text: `${actionText}${activation.thinkingText}` }],
						details: undefined,
					};
				}

				throw new Error(`No available models found for alias "${aliasKey}". Tried: ${candidates.map((candidate) => candidate.model).join(", ")}`);
			}

			let match = models.find((model) => `${model.provider}/${model.id}`.toLowerCase() === normalizedSearch);
			if (!match) {
				match = models.find((model) => model.id.toLowerCase() === normalizedSearch);
			}

			if (!match) {
				const candidateModels = models.filter(
					(model) =>
						model.id.toLowerCase().includes(normalizedSearch)
						|| model.name.toLowerCase().includes(normalizedSearch)
						|| model.provider.toLowerCase().includes(normalizedSearch),
				);
				if (candidateModels.length === 1) {
					match = candidateModels[0];
				} else if (candidateModels.length > 1) {
					const list = candidateModels.map((model) => `  ${model.provider}/${model.id}`).join("\n");
					throw new Error(`Multiple models match "${search}":\n${list}\n\nBe more specific.${aliasWarning}`);
				}
			}

			if (!match) {
				throw new Error(`No model found matching "${search}"${aliasWarning}`);
			}

			const activation = await activateModel(match, params.thinkingLevel);
			if (!activation) {
				throw new Error(`Failed to switch to ${match.provider}/${match.id}`);
			}
			const actionText = activation.changedModel
				? `Switched to ${match.provider}/${match.id} (${match.name})`
				: `Already using ${match.provider}/${match.id}`;

			return {
				content: [{ type: "text", text: `${actionText}${activation.thinkingText}` }],
				details: undefined,
			};
		},
	});
};

export default extension;
