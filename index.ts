import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const extension: ExtensionFactory = (pi) => {
	pi.registerTool({
		name: "switch_model",
		label: "Switch Model",
		description:
			"List, search, or switch models. Use when the user asks to change models or when you need a model with different capabilities (reasoning, vision, cost, context window).",
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
							text: `Available models (${models.length}):\n\n${lines.join("\n\n")}`,
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
