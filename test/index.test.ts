import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import extension from "../index.ts";

const primaryModel = {
	provider: "provider-a",
	id: "model-a",
	name: "Model A",
	reasoning: false,
	input: ["text"] as const,
	contextWindow: 128_000,
	maxTokens: 8_192,
	cost: { input: 1, output: 2 },
};

function setupTool(setModel: ExtensionAPI["setModel"] = async () => true): ToolDefinition {
	let registered: ToolDefinition | undefined;
	extension({
		registerTool(tool: ToolDefinition) {
			registered = tool;
		},
		setModel,
	} as unknown as ExtensionAPI);
	assert.ok(registered);
	return registered;
}

function context(currentModel: typeof primaryModel | null = primaryModel): ExtensionContext {
	return {
		cwd: process.cwd(),
		model: currentModel,
		modelRegistry: { getAvailable: () => [primaryModel] },
	} as unknown as ExtensionContext;
}

test("publishes a provider-compatible action enum", () => {
	const tool = setupTool();
	const action = (tool.parameters as unknown as { properties: { action: { enum?: string[]; anyOf?: unknown } } }).properties.action;

	assert.deepEqual(action.enum, ["current", "list", "search", "switch"]);
	assert.equal(action.anyOf, undefined);
});

test("returns the current model with the current result contract", async () => {
	const tool = setupTool();
	const result = await tool.execute("call-1", { action: "current" }, undefined, undefined, context());

	assert.equal(result.content[0]?.type, "text");
	assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /provider-a\/model-a/);
	assert.equal(result.details, undefined);
});

test("throws when a required switch argument is missing", async () => {
	const tool = setupTool();

	await assert.rejects(
		tool.execute("call-2", { action: "switch" }, undefined, undefined, context()),
		/search parameter required for switch action/,
	);
});

test("switches an exact model and returns structured details", async () => {
	let selected: unknown;
	const tool = setupTool(async (model) => {
		selected = model;
		return true;
	});
	const result = await tool.execute(
		"call-3",
		{ action: "switch", search: "provider-a/model-a" },
		undefined,
		undefined,
		context(null),
	);

	assert.equal(selected, primaryModel);
	assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /Switched to provider-a\/model-a/);
	assert.equal(result.details, undefined);
});
