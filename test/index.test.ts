import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const secondaryModel = {
	...primaryModel,
	provider: "provider-b",
	id: "model-b",
	name: "Model B",
};

type ThinkingLevel = Parameters<ExtensionAPI["setThinkingLevel"]>[0];
type SetupOptions = {
	setModel?: ExtensionAPI["setModel"];
	setThinkingLevel?: (level: ThinkingLevel) => void;
	getThinkingLevel?: () => ThinkingLevel;
};

function setupTool(options: SetupOptions = {}): ToolDefinition {
	let registered: ToolDefinition | undefined;
	extension({
		registerTool(tool: ToolDefinition) {
			registered = tool;
		},
		setModel: options.setModel ?? (async () => true),
		setThinkingLevel: options.setThinkingLevel ?? (() => {}),
		getThinkingLevel: options.getThinkingLevel ?? (() => "medium"),
	} as unknown as ExtensionAPI);
	assert.ok(registered);
	return registered;
}

function context({
	currentModel = primaryModel as typeof primaryModel | null,
	models = [primaryModel, secondaryModel],
	cwd = process.cwd(),
}: {
	currentModel?: typeof primaryModel | null;
	models?: typeof primaryModel[];
	cwd?: string;
} = {}): ExtensionContext {
	return {
		cwd,
		model: currentModel,
		modelRegistry: { getAvailable: () => models },
	} as unknown as ExtensionContext;
}

async function aliasCwd(t: test.TestContext, aliases: unknown): Promise<string> {
	const cwd = join(tmpdir(), `pi-model-switch-${process.pid}-${Date.now()}-${Math.random()}`);
	await mkdir(join(cwd, ".pi"), { recursive: true });
	await writeFile(join(cwd, ".pi", "aliases.json"), JSON.stringify(aliases));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	return cwd;
}

function text(result: Awaited<ReturnType<ToolDefinition["execute"]>>): string {
	const content = result.content[0];
	assert.equal(content?.type, "text");
	return content.text;
}

test("publishes provider-compatible action and thinking-level enums", () => {
	const tool = setupTool();
	const properties = (tool.parameters as unknown as {
		properties: Record<string, { enum?: string[]; anyOf?: unknown }>;
	}).properties;

	assert.deepEqual(properties.action.enum, ["current", "list", "search", "switch"]);
	assert.equal(properties.action.anyOf, undefined);
	assert.deepEqual(properties.thinkingLevel.enum, ["minimal", "low", "medium", "high", "xhigh", "max"]);
	assert.equal(properties.thinkingLevel.anyOf, undefined);
});

test("current reports the model and effective thinking level, or throws without a model", async () => {
	const tool = setupTool({ getThinkingLevel: () => "high" });
	const result = await tool.execute("call-current", { action: "current" }, undefined, undefined, context());

	assert.match(text(result), /Current model: provider-a\/model-a \(Model A\), thinking: high/);
	assert.equal(result.details, undefined);
	await assert.rejects(
		tool.execute("call-no-current", { action: "current" }, undefined, undefined, context({ currentModel: null })),
		/No model is currently active/,
	);
});

test("requires a search argument for switching", async () => {
	const tool = setupTool();
	await assert.rejects(
		tool.execute("call-missing", { action: "switch" }, undefined, undefined, context()),
		/search parameter required for switch action/,
	);
});

test("direct switching preserves omitted-level behavior and applies an explicit level after setModel", async () => {
	const calls: string[] = [];
	const tool = setupTool({
		setModel: async (model) => {
			calls.push(`model:${model.id}`);
			return true;
		},
		setThinkingLevel: (level) => calls.push(`thinking:${level}`),
		getThinkingLevel: () => "high",
	});
	const omitted = await tool.execute(
		"call-omitted",
		{ action: "switch", search: "provider-b/model-b" },
		undefined,
		undefined,
		context(),
	);
	assert.deepEqual(calls, ["model:model-b"]);
	assert.match(text(omitted), /^Switched to provider-b\/model-b \(Model B\)$/);
	assert.equal(omitted.details, undefined);

	calls.length = 0;
	const explicit = await tool.execute(
		"call-explicit",
		{ action: "switch", search: "provider-b/model-b", thinkingLevel: "high" },
		undefined,
		undefined,
		context(),
	);
	assert.deepEqual(calls, ["model:model-b", "thinking:high"]);
	assert.match(text(explicit), /Switched to provider-b\/model-b .*thinking: high$/);
	assert.doesNotMatch(text(explicit), /requested/);
	assert.equal(explicit.details, undefined);
});

test("same-model requests skip setModel and only set thinking when requested", async () => {
	let modelCalls = 0;
	const levels: ThinkingLevel[] = [];
	const tool = setupTool({
		setModel: async () => {
			modelCalls += 1;
			return true;
		},
		setThinkingLevel: (level) => levels.push(level),
		getThinkingLevel: () => "low",
	});
	const omitted = await tool.execute(
		"call-same-omitted",
		{ action: "switch", search: "provider-a/model-a" },
		undefined,
		undefined,
		context(),
	);
	const changed = await tool.execute(
		"call-same-level",
		{ action: "switch", search: "provider-a/model-a", thinkingLevel: "low" },
		undefined,
		undefined,
		context(),
	);

	assert.equal(modelCalls, 0);
	assert.deepEqual(levels, ["low"]);
	assert.equal(text(omitted), "Already using provider-a/model-a");
	assert.match(text(changed), /^Already using provider-a\/model-a, thinking: low$/);
	assert.equal(omitted.details, undefined);
	assert.equal(changed.details, undefined);
});

test("reports requested thinking only when Pi clamps it", async () => {
	const tool = setupTool({ getThinkingLevel: () => "high" });
	const result = await tool.execute(
		"call-clamped",
		{ action: "switch", search: "provider-b/model-b", thinkingLevel: "max" },
		undefined,
		undefined,
		context(),
	);

	assert.match(text(result), /thinking: high \(requested max\)$/);
	assert.equal(result.details, undefined);
});

test("propagates model and thinking setter failures", async () => {
	const rejectedModel = setupTool({ setModel: async () => false });
	await assert.rejects(
		rejectedModel.execute(
			"call-model-failure",
			{ action: "switch", search: "provider-b/model-b" },
			undefined,
			undefined,
			context(),
		),
		/Failed to switch to provider-b\/model-b/,
	);

	const rejectedThinking = setupTool({
		setThinkingLevel: () => {
			throw new Error("thinking setter failed");
		},
	});
	await assert.rejects(
		rejectedThinking.execute(
			"call-thinking-failure",
			{ action: "switch", search: "provider-a/model-a", thinkingLevel: "high" },
			undefined,
			undefined,
			context(),
		),
		/thinking setter failed/,
	);
});

test("supports legacy string aliases", async (t) => {
	const cwd = await aliasCwd(t, { legacy: "provider-b/model-b" });
	const tool = setupTool();
	const result = await tool.execute(
		"call-legacy",
		{ action: "switch", search: "legacy" },
		undefined,
		undefined,
		context({ cwd }),
	);

	assert.match(text(result), /Switched to provider-b\/model-b .*via alias "legacy"$/);
	assert.equal(result.details, undefined);
});

test("uses object alias thinking and lets an explicit level override it", async (t) => {
	const cwd = await aliasCwd(t, { coding: { model: "provider-b/model-b", thinkingLevel: "low" } });
	const levels: ThinkingLevel[] = [];
	let modelCalls = 0;
	const tool = setupTool({
		setModel: async () => {
			modelCalls += 1;
			return true;
		},
		setThinkingLevel: (level) => levels.push(level),
		getThinkingLevel: () => levels.at(-1) ?? "medium",
	});
	const configured = await tool.execute(
		"call-configured",
		{ action: "switch", search: "coding" },
		undefined,
		undefined,
		context({ cwd }),
	);
	const overridden = await tool.execute(
		"call-overridden",
		{ action: "switch", search: "coding", thinkingLevel: "max" },
		undefined,
		undefined,
		context({ currentModel: secondaryModel, cwd }),
	);

	assert.equal(modelCalls, 1);
	assert.deepEqual(levels, ["low", "max"]);
	assert.match(text(configured), /thinking: low$/);
	assert.match(text(overridden), /^Already using provider-b\/model-b via alias "coding", thinking: max$/);
	assert.equal(configured.details, undefined);
	assert.equal(overridden.details, undefined);
});

test("mixed alias fallbacks skip unavailable and setModel(false) candidates", async (t) => {
	const cwd = await aliasCwd(t, {
		fallback: [
			"missing/model",
			{ model: "provider-a/model-a", thinkingLevel: "low" },
			"provider-b/model-b",
		],
	});
	const attempted: string[] = [];
	const tool = setupTool({
		setModel: async (model) => {
			attempted.push(model.id);
			return model.id === "model-b";
		},
	});
	const result = await tool.execute(
		"call-fallback",
		{ action: "switch", search: "fallback" },
		undefined,
		undefined,
		context({ currentModel: null, cwd }),
	);

	assert.deepEqual(attempted, ["model-a", "model-b"]);
	assert.match(text(result), /Switched to provider-b\/model-b/);
	assert.equal(result.details, undefined);
});

test("invalid alias config follows the warning/error flow", async (t) => {
	const cwd = await aliasCwd(t, { broken: { model: "provider-b/model-b", thinkingLevel: "turbo" } });
	const tool = setupTool();

	await assert.rejects(
		tool.execute(
			"call-invalid-alias",
			{ action: "switch", search: "broken" },
			undefined,
			undefined,
			context({ cwd }),
		),
		/Warning: Failed to load .*alias "broken" has an invalid target or thinkingLevel/,
	);
});

test("exhausted alias fallback throws and lists every attempted spec", async (t) => {
	const cwd = await aliasCwd(t, {
		fallback: ["missing/model", { model: "provider-b/model-b", thinkingLevel: "high" }],
	});
	const tool = setupTool({ setModel: async () => false });

	await assert.rejects(
		tool.execute(
			"call-exhausted",
			{ action: "switch", search: "fallback" },
			undefined,
			undefined,
			context({ cwd }),
		),
		/No available models found for alias "fallback"\. Tried: missing\/model, provider-b\/model-b/,
	);
});
