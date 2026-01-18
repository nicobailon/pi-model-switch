import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type AliasConfig = Record<string, string | string[]>;

function loadAliases(extensionDir: string): { aliases: AliasConfig; error?: string } {
	const aliasPath = join(extensionDir, "aliases.json");
	if (!existsSync(aliasPath)) {
		return { aliases: {} };
	}
	try {
		const content = readFileSync(aliasPath, "utf-8");
		return { aliases: JSON.parse(content) };
	} catch (e) {
		return { aliases: {}, error: `Failed to load aliases.json: ${e instanceof Error ? e.message : e}` };
	}
}

const extension: ExtensionFactory = (pi) => {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const { aliases, error: aliasLoadError } = loadAliases(__dirname);

	pi.registerTool({
		name: "switch_model",
		label: "Switch Model",
		description:
			"List, search, or switch models. Supports aliases defined in aliases.json (e.g. 'cheap', 'coding'). Use when the user asks to change models or when you need a model with different capabilities (reasoning, vision, cost, context window).",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("list"), Type.Literal("search"), Type.Literal("switch")], {
				description: "list: show all available models. search: filter models by query. switch: change to a different model.",
			}),
			search: Type.Optional(
				Type.String({
					description:
						"For search/switch actions: search term to match model by provider, id, or name (e.g. 'sonnet', 'opus', 'gpt-5.2', 'anthropic/claude')",
				}),
			),
			provider: Type.Optional(
				Type.String({
					description:
						"Filter to a specific provider (e.g. 'anthropic', 'openai', 'google', 'openrouter')",
				}),
			),
		}),

		async execute(toolCallId, params, onUpdate, ctx) {
			let models = ctx.modelRegistry.getAvailable();
			const currentModel = ctx.model;

			// Filter by provider if specified
			if (params.provider) {
				const providerFilter = params.provider.toLowerCase();
				models = models.filter((m) => m.provider.toLowerCase() === providerFilter);
				if (models.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `No models available for provider "${params.provider}". Available providers: ${[...new Set(ctx.modelRegistry.getAvailable().map((m) => m.provider))].join(", ")}`,
							},
						],
						isError: true,
					};
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
					};
				}

				const aliasInfo = aliasLoadError
					? `\n\nWarning: ${aliasLoadError}`
					: Object.keys(aliases).length > 0
						? `\n\nAliases: ${Object.keys(aliases).join(", ")}`
						: "";

				const lines = models.map((m) => {
					const current = currentModel && m.provider === currentModel.provider && m.id === currentModel.id;
					const marker = current ? " (current)" : "";
					const capabilities = [
						m.reasoning ? "reasoning" : null,
						m.input.includes("image") ? "vision" : null,
					]
						.filter(Boolean)
						.join(", ");
					const capStr = capabilities ? ` [${capabilities}]` : "";
					const costStr = `$${m.cost.input.toFixed(2)}/$${m.cost.output.toFixed(2)} per 1M tokens (in/out)`;
					return `${m.provider}/${m.id}${marker}${capStr}\n  ${m.name} | ctx: ${m.contextWindow.toLocaleString()} | max: ${m.maxTokens.toLocaleString()}\n  ${costStr}`;
				});

				return {
					content: [
						{
							type: "text",
							text: `Available models (${models.length}):${aliasInfo}\n\n${lines.join("\n\n")}`,
						},
					],
				};
			}

			if (params.action === "search") {
				if (!params.search) {
					return {
						content: [{ type: "text", text: "search parameter required for search action" }],
						isError: true,
					};
				}

				const search = params.search.toLowerCase();
				const matches = models.filter(
					(m) =>
						m.id.toLowerCase().includes(search) ||
						m.name.toLowerCase().includes(search) ||
						m.provider.toLowerCase().includes(search),
				);

				if (matches.length === 0) {
					return {
						content: [{ type: "text", text: `No models found matching "${params.search}"` }],
					};
				}

				const lines = matches.map((m) => {
					const current = currentModel && m.provider === currentModel.provider && m.id === currentModel.id;
					const marker = current ? " (current)" : "";
					const capabilities = [
						m.reasoning ? "reasoning" : null,
						m.input.includes("image") ? "vision" : null,
					]
						.filter(Boolean)
						.join(", ");
					const capStr = capabilities ? ` [${capabilities}]` : "";
					const costStr = `$${m.cost.input.toFixed(2)}/$${m.cost.output.toFixed(2)} per 1M tokens (in/out)`;
					return `${m.provider}/${m.id}${marker}${capStr}\n  ${m.name} | ctx: ${m.contextWindow.toLocaleString()} | max: ${m.maxTokens.toLocaleString()}\n  ${costStr}`;
				});

				return {
					content: [
						{
							type: "text",
							text: `Models matching "${params.search}" (${matches.length}):\n\n${lines.join("\n\n")}`,
						},
					],
				};
			}

			if (params.action === "switch") {
				if (!params.search) {
					return {
						content: [{ type: "text", text: "search parameter required for switch action" }],
						isError: true,
					};
				}

				const search = params.search.toLowerCase();

				// Check for alias first
				const aliasKey = Object.keys(aliases).find((k) => k.toLowerCase() === search);
				if (aliasKey) {
					const aliasValue = aliases[aliasKey];
					const candidates = Array.isArray(aliasValue) ? aliasValue : [aliasValue];
					
					// Find first available model in the alias chain
					for (const candidate of candidates) {
						const [provider, ...idParts] = candidate.split("/");
						const id = idParts.join("/");
						const aliasMatch = models.find(
							(m) => m.provider.toLowerCase() === provider.toLowerCase() && m.id.toLowerCase() === id.toLowerCase()
						);
						if (aliasMatch) {
							if (currentModel && aliasMatch.provider === currentModel.provider && aliasMatch.id === currentModel.id) {
								return {
									content: [{ type: "text", text: `Already using ${aliasMatch.provider}/${aliasMatch.id}` }],
								};
							}
							const success = await pi.setModel(aliasMatch);
							if (success) {
								return {
									content: [
										{
											type: "text",
											text: `Switched to ${aliasMatch.provider}/${aliasMatch.id} (${aliasMatch.name}) via alias "${aliasKey}"`,
										},
									],
								};
							}
						}
					}
					
					// None of the alias targets are available
					return {
						content: [
							{
								type: "text",
								text: `No models available for alias "${aliasKey}". Tried: ${candidates.join(", ")}`,
							},
						],
						isError: true,
					};
				}

				// Try exact match first (provider/id)
				let match = models.find((m) => `${m.provider}/${m.id}`.toLowerCase() === search);

				// Then try id exact match
				if (!match) {
					match = models.find((m) => m.id.toLowerCase() === search);
				}

				// Then try partial matches
				if (!match) {
					const candidates = models.filter(
						(m) =>
							m.id.toLowerCase().includes(search) ||
							m.name.toLowerCase().includes(search) ||
							m.provider.toLowerCase().includes(search),
					);

					if (candidates.length === 1) {
						match = candidates[0];
					} else if (candidates.length > 1) {
						const list = candidates.map((m) => `  ${m.provider}/${m.id}`).join("\n");
						return {
							content: [
								{
									type: "text",
									text: `Multiple models match "${params.search}":\n${list}\n\nBe more specific.`,
								},
							],
							isError: true,
						};
					}
				}

				if (!match) {
					return {
						content: [{ type: "text", text: `No model found matching "${params.search}"` }],
						isError: true,
					};
				}

				if (currentModel && match.provider === currentModel.provider && match.id === currentModel.id) {
					return {
						content: [{ type: "text", text: `Already using ${match.provider}/${match.id}` }],
					};
				}

				const success = await pi.setModel(match);

				if (success) {
					return {
						content: [
							{
								type: "text",
								text: `Switched to ${match.provider}/${match.id} (${match.name})`,
							},
						],
					};
				} else {
					return {
						content: [
							{
								type: "text",
								text: `Failed to switch to ${match.provider}/${match.id} - no API key configured`,
							},
						],
						isError: true,
					};
				}
			}

			return {
				content: [{ type: "text", text: 'Invalid action. Use "list", "search", or "switch".' }],
				isError: true,
			};
		},
	});
};

export default extension;
