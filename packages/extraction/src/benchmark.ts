#!/usr/bin/env bun
/**
 * Benchmark predicate extraction across models via OpenRouter.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... bun packages/extraction/src/benchmark.ts \
 *     --article packages/extraction/test/fixtures/cooktown-mayors.md \
 *     --models google/gemini-2.0-flash,meta-llama/llama-4-scout,mistralai/mistral-small
 *
 * Or run all defaults:
 *   OPENROUTER_API_KEY=sk-... bun packages/extraction/src/benchmark.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, basename } from "path";
import { parseArgs } from "util";
import OpenAI from "openai";
import { BENCHMARK_EXTRACTION_PROMPT } from "./prompt-benchmark";
import { BENCHMARK_EXTRACTION_PROMPT_V2 } from "./prompt-benchmark-v2";

const useV2 = process.env.PROMPT_V2 === "1";

// ── CLI args ──────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    article: { type: "string", short: "a" },
    models: { type: "string", short: "m" },
    outdir: { type: "string", short: "o" },
  },
  strict: false,
});

const DEFAULT_MODELS = [
  // Closed / API models
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "anthropic/claude-haiku-4.5",
  "x-ai/grok-4.1-fast",
  "mistralai/mistral-medium-3",
  "mistralai/mistral-small-3.2-24b-instruct",
  // Open-weight / open-source-ish models
  "moonshotai/kimi-k2.6",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "qwen/qwen3-coder",
  "qwen/qwen3-235b-a22b",
  "meta-llama/llama-4-maverick",
  "meta-llama/llama-4-scout",
  "qwen/qwen3-32b",
  "qwen/qwen3-14b",
  "qwen/qwen3-8b",
  "qwen/qwen3-30b-a3b",
];

const articlePath = resolve(
  (values.article as string | undefined) ?? "packages/extraction/test/fixtures/cooktown-mayors.md",
);
const models = values.models
  ? (values.models as string).split(",").map((m: string) => m.trim())
  : DEFAULT_MODELS;
const outdir = resolve(
  (values.outdir as string | undefined) ?? "packages/extraction/test/results",
);

mkdirSync(outdir, { recursive: true });

const articleText = readFileSync(articlePath, "utf-8");
const articleSlug = basename(articlePath, ".md");

// ── OpenRouter client ─────────────────────────────────────────────────

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
});

// ── Pricing ───────────────────────────────────────────────────────────

interface ModelPricing {
  promptPerToken: number;
  completionPerToken: number;
}

let pricingMap: Record<string, ModelPricing> = {};

async function fetchPricing(): Promise<void> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }> };
    for (const m of data.data) {
      if (m.pricing?.prompt && m.pricing?.completion) {
        pricingMap[m.id] = {
          promptPerToken: parseFloat(m.pricing.prompt),
          completionPerToken: parseFloat(m.pricing.completion),
        };
      }
    }
    console.log(`Loaded pricing for ${Object.keys(pricingMap).length} models`);
  } catch {
    console.log("Warning: could not fetch pricing, cost columns will show $0");
  }
}

function calcCost(model: string, usage: TokenUsage): number {
  const p = pricingMap[model];
  if (!p) return 0;
  return usage.promptTokens * p.promptPerToken + usage.completionTokens * p.completionPerToken;
}

function fmtCost(cost: number): string {
  if (cost === 0) return "   -";
  if (cost < 0.001) return "$" + cost.toFixed(5);
  if (cost < 0.01) return "$" + cost.toFixed(4);
  return "$" + cost.toFixed(3);
}

// ── Types ─────────────────────────────────────────────────────────────

interface BenchmarkFact {
  subject: string;
  predicate: string;
  object: unknown;
  tier?: number;
  confidence?: number;
  notes?: string;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ModelResult {
  model: string;
  facts: BenchmarkFact[];
  raw: string;
  durationMs: number;
  error?: string;
  score: ScoreCard;
  usage: TokenUsage;
}

interface ScoreCard {
  totalPredicates: number;
  uniquePredicates: number;
  tierDistribution: Record<number, number>;
  avgConfidence: number;
  maxTier: number;
  predicateList: string[];
  factsPerKToken: number;
}

// ── Extraction ────────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  // Try closed fence first, then unclosed (truncated output)
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    ?? raw.match(/```(?:json)?\s*([\s\S]*)/);
  let text = (fenced ? fenced[1]! : raw).trim();

  // Strip leading <think>...</think> blocks (Qwen, DeepSeek-R1, etc.)
  text = text.replace(/^<think>[\s\S]*?<\/think>\s*/i, "");

  try {
    return JSON.parse(text);
  } catch {
    return repairTruncatedJson(text);
  }
}

function repairTruncatedJson(text: string): unknown {
  // Try progressively trimming from the last } until we get valid JSON
  let pos = text.length;
  while (pos > 0) {
    pos = text.lastIndexOf("}", pos - 1);
    if (pos === -1) break;

    let attempt = text.substring(0, pos + 1);

    // Count remaining open brackets and close them
    const opens = { "[": 0, "{": 0 };
    for (const ch of attempt) {
      if (ch === "[") opens["["]++;
      if (ch === "]") opens["["]--;
      if (ch === "{") opens["{"]++;
      if (ch === "}") opens["{"]--;
    }
    attempt += "}".repeat(Math.max(0, opens["{"]));
    attempt += "]".repeat(Math.max(0, opens["["]));

    try {
      return JSON.parse(attempt);
    } catch {
      continue;
    }
  }
  throw new Error("Could not repair truncated JSON");
}

const emptyUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
const emptyScore: ScoreCard = {
  totalPredicates: 0,
  uniquePredicates: 0,
  tierDistribution: {},
  avgConfidence: 0,
  maxTier: 0,
  predicateList: [],
  factsPerKToken: 0,
};

const MODEL_TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS ?? "180000");

function createRequest(model: string, maxTokens: number) {
  return client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: useV2 ? BENCHMARK_EXTRACTION_PROMPT_V2 : BENCHMARK_EXTRACTION_PROMPT },
      { role: "user", content: `## Source article\n\n${articleText}` },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

async function runModel(model: string): Promise<ModelResult> {
  const t0 = Date.now();

  try {
    let completion;
    try {
      completion = await withTimeout(createRequest(model, 32768), MODEL_TIMEOUT_MS);
    } catch (e: unknown) {
      if (String(e).includes("context length")) {
        completion = await withTimeout(createRequest(model, 8192), MODEL_TIMEOUT_MS);
      } else {
        throw e;
      }
    }

    const raw = completion.choices[0]?.message?.content ?? "";
    const durationMs = Date.now() - t0;

    const usage: TokenUsage = {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    };

    let parsed: { facts: BenchmarkFact[] };
    try {
      parsed = extractJson(raw) as { facts: BenchmarkFact[] };
    } catch {
      return { model, facts: [], raw, durationMs, error: "JSON parse failed", score: emptyScore, usage };
    }

    const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
    const score = scoreFacts(facts, usage);

    return { model, facts, raw, durationMs, score, usage };
  } catch (e: unknown) {
    return {
      model,
      facts: [],
      raw: "",
      durationMs: Date.now() - t0,
      error: String(e),
      score: emptyScore,
      usage: emptyUsage,
    };
  }
}

// ── Scoring ───────────────────────────────────────────────────────────

function scoreFacts(facts: BenchmarkFact[], usage: TokenUsage): ScoreCard {
  const tierDistribution: Record<number, number> = {};
  let confSum = 0;
  let confCount = 0;
  let maxTier = 0;
  const predicateSet = new Set<string>();

  for (const f of facts) {
    predicateSet.add(f.predicate);
    const tier = f.tier ?? 1;
    tierDistribution[tier] = (tierDistribution[tier] ?? 0) + 1;
    if (tier > maxTier) maxTier = tier;
    if (f.confidence != null) {
      confSum += f.confidence;
      confCount++;
    }
  }

  const totalTokens = usage.totalTokens || 1;
  return {
    totalPredicates: facts.length,
    uniquePredicates: predicateSet.size,
    tierDistribution,
    avgConfidence: confCount > 0 ? confSum / confCount : 0,
    maxTier,
    predicateList: [...predicateSet].sort(),
    factsPerKToken: (facts.length / totalTokens) * 1000,
  };
}

// ── Report ────────────────────────────────────────────────────────────

function tierBar(dist: Record<number, number>, total: number): string {
  const tiers = [1, 2, 3, 4, 5, 6, 7, 8];
  return tiers
    .map((t) => {
      const n = dist[t] ?? 0;
      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 3));
      return `  T${t}: ${String(n).padStart(3)} (${String(pct).padStart(2)}%) ${bar}`;
    })
    .join("\n");
}

function printReport(results: ModelResult[]) {
  const sorted = [...results].sort(
    (a, b) => b.score.totalPredicates - a.score.totalPredicates,
  );

  console.log("\n" + "═".repeat(72));
  console.log(" PREDICATE EXTRACTION BENCHMARK");
  console.log(" Article: " + articlePath);
  console.log(" Article length: " + articleText.split(/\s+/).length + " words");
  console.log("═".repeat(72));

  for (const r of sorted) {
    console.log("\n┌─ " + r.model);
    if (r.error) {
      console.log("│  ERROR: " + r.error);
      console.log("└" + "─".repeat(71));
      continue;
    }
    const cost = calcCost(r.model, r.usage);
    const costPerFact = r.score.totalPredicates > 0 ? cost / r.score.totalPredicates : 0;
    console.log("│  Time: " + (r.durationMs / 1000).toFixed(1) + "s");
    console.log("│  Tokens — in: " + r.usage.promptTokens.toLocaleString() + "  out: " + r.usage.completionTokens.toLocaleString() + "  total: " + r.usage.totalTokens.toLocaleString());
    console.log("│  Cost: " + fmtCost(cost) + "  (per fact: " + fmtCost(costPerFact) + ")");
    console.log("│  Total facts: " + r.score.totalPredicates);
    console.log("│  Unique predicates: " + r.score.uniquePredicates);
    console.log("│  Facts/1k tokens: " + r.score.factsPerKToken.toFixed(1));
    console.log("│  Max tier reached: " + r.score.maxTier);
    console.log("│  Avg confidence: " + r.score.avgConfidence.toFixed(2));
    console.log("│  Tier distribution:");
    console.log(
      tierBar(r.score.tierDistribution, r.score.totalPredicates)
        .split("\n")
        .map((l) => "│" + l)
        .join("\n"),
    );
    console.log("│");
    console.log("│  Predicates minted: " + r.score.predicateList.join(", "));
    console.log("└" + "─".repeat(71));
  }

  // ── Comparison table ──

  console.log("\n" + "═".repeat(72));
  console.log(" COMPARISON TABLE");
  console.log("═".repeat(72));

  const hdr = [
    "Model".padEnd(40),
    "Facts".padStart(5),
    "Uniq".padStart(5),
    "T1".padStart(3), "T2".padStart(3), "T3".padStart(3), "T4".padStart(3),
    "T5".padStart(3), "T6".padStart(3), "T7".padStart(3), "T8".padStart(3),
    "Tiers".padStart(5),
    "Conf".padStart(5),
    "In".padStart(6),
    "Out".padStart(6),
    "Cost".padStart(8),
    "$/Fact".padStart(8),
    "F/kT".padStart(5),
    "Time".padStart(6),
  ].join(" │ ");
  console.log(hdr);
  console.log("─".repeat(hdr.length));

  for (const r of sorted) {
    const cost = calcCost(r.model, r.usage);
    const costPerFact = r.score.totalPredicates > 0 ? cost / r.score.totalPredicates : 0;
    const td = r.score.tierDistribution;
    const tiersHit = [1,2,3,4,5,6,7,8].filter(t => (td[t] ?? 0) > 0).length;
    const t = (n: number) => String(td[n] ?? 0).padStart(3);
    console.log(
      [
        r.model.padEnd(40),
        String(r.score.totalPredicates).padStart(5),
        String(r.score.uniquePredicates).padStart(5),
        t(1), t(2), t(3), t(4), t(5), t(6), t(7), t(8),
        (tiersHit + "/8").padStart(5),
        r.score.avgConfidence > 0 ? r.score.avgConfidence.toFixed(2).padStart(5) : "    -",
        String(r.usage.promptTokens).padStart(6),
        String(r.usage.completionTokens).padStart(6),
        fmtCost(cost).padStart(8),
        fmtCost(costPerFact).padStart(8),
        r.score.factsPerKToken.toFixed(1).padStart(5),
        ((r.durationMs / 1000).toFixed(1) + "s").padStart(6),
      ].join(" │ "),
    );
  }

  console.log("─".repeat(hdr.length));
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  await fetchPricing();
  console.log(`Running benchmark on "${articleSlug}" across ${models.length} models...`);
  console.log("Models: " + models.join(", "));
  console.log();

  const cached: ModelResult[] = [];
  const uncached: string[] = [];

  for (const model of models) {
    const safeModel = model.replace(/\//g, "_");
    const cachePath = resolve(outdir, `${articleSlug}_${safeModel}.json`);

    if (existsSync(cachePath)) {
      try {
        const data = JSON.parse(readFileSync(cachePath, "utf-8")) as ModelResult;
        if (!data.error && data.facts.length > 0) {
          console.log(`✔ ${model} (cached: ${data.score.totalPredicates} facts)`);
          cached.push(data);
          continue;
        }
      } catch {}
    }
    uncached.push(model);
  }

  if (uncached.length > 0) {
    console.log(`\nRunning ${uncached.length} models in parallel...`);
  }

  const fresh = await Promise.all(
    uncached.map(async (model) => {
      const t0Label = Date.now();
      const result = await runModel(model);
      if (result.error) {
        console.log(`❌ ${model}: ${result.error}`);
      } else {
        console.log(`✓ ${model}: ${result.score.totalPredicates} facts | ${result.usage.promptTokens}+${result.usage.completionTokens} tokens (${(result.durationMs / 1000).toFixed(1)}s)`);
      }
      const safeModel = model.replace(/\//g, "_");
      writeFileSync(resolve(outdir, `${articleSlug}_${safeModel}.json`), JSON.stringify(result, null, 2));
      return result;
    }),
  );

  const results = [...cached, ...fresh];

  printReport(results);

  writeFileSync(
    resolve(outdir, `${articleSlug}_summary.json`),
    JSON.stringify(
      results.map((r) => ({
        model: r.model,
        score: r.score,
        usage: r.usage,
        durationMs: r.durationMs,
        error: r.error,
      })),
      null,
      2,
    ),
  );

  console.log(`\nResults saved to ${outdir}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
