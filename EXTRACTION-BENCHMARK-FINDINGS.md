# Extraction Benchmark Findings

## Summary

We benchmarked 30+ LLMs on predicate extraction from two source articles using an 8-tier extraction prompt. The goal: find the best model for Dontopedia's extraction pipeline — maximum predicates, deep analytical tiers, clean graph structure, minimal cost.

**Winner for production: Grok 4.1 Fast** — $0.006/article, 93% unique predicates, 8/8 tiers, quality score 8.6/10. Use Sonnet 4.6 ($0.43/article, quality 9.4/10) for historically significant sources.

## The Extraction Prompt (v2)

The prompt (`packages/extraction/src/prompt-benchmark-v2.ts`) instructs models to extract across 8 tiers:

| Tier | What | Example predicates |
|------|------|--------------------|
| T1 | Surface facts | bornIn, founderOf, marriedTo |
| T2 | Relational/structural | causedBy, partOf, precedes |
| T3 | Opinions/stances | holdsOpinion, criticizes, advocatesFor |
| T4 | Epistemic/modal | assertsAsFact, speculatesAbout, believesThat |
| T5 | Pragmatic/rhetorical | framesAs, emphasizes, hedgesClaim |
| T6 | Presuppositions | presupposesThat, impliesThat, notablyOmits |
| T7 | Philosophical | reifiesAs, treatsAsEssentialProperty, counterfactuallyAssumes |
| T8 | Intertextual | drawsOnTradition, employsGenreConvention, situatesInDiscourse |

### Critical formatting rules (v2 additions)

These were added after the first benchmark round to fix common model failures:

1. **Never use boolean objects.** `(ex:cooktown, wasMunicipality, true)` is banned. Use `(ex:cooktown, wasA, ex:municipality)` instead. Booleans destroy information.
2. **Prefer IRIs over string literals.** Entities (people, places, concepts) get IRIs. Strings are only for actual data values (names, dates, quotes, numbers).
3. **No string blobs.** Literal values must be short. Not sentences. Create an IRI for complex concepts.
4. **Confidence calibration.** 1.0 = explicitly stated. 0.9 = minor inference. 0.7 = significant inference. 0.5 = speculative.
5. **Tier honesty.** Article metadata is T1, not T8. Fancy predicate names don't make a T1 fact into T7.
6. **Subject diversity.** Create many distinct subjects (15-30+ per 500-word article). Separate the person from the inscription, the event from the report.
7. **kebab-lower-case IRIs.** `ex:mrs-watson`, not `ex:MrsWatson` or `ex:mrs_watson`.

## Test Articles

1. **Cooktown Mayors in the Eighties** — 1954 newspaper article, 159 words. Small, factual, historical.
2. **Mossman Gorge Mission founding** — Oral history transcription (Document D1052), 745 words. Rich narrative, unnamed characters, layered family relationships, colonial history.

## Model Rankings

### Cooktown Mayors (159 words, v1 prompt → v2 for second round)

| Model | Facts | Uniq Preds | Tiers | $/Fact | Avg Quality |
|-------|-------|-----------|-------|--------|-------------|
| Grok 4 | 128 | 118 (92%) | 8/8 | $0.0012 | **9.4** |
| Grok 4.1 Fast | 76 | 68 (89%) | 8/8 | $0.00006 | **8.8** |
| Opus 4.5 | 170 | 114 (67%) | 8/8 | $0.0023 | 8.8 |
| GPT-5.4-mini | 65 | 48 (74%) | 7/8 | $0.00027 | 8.2 |
| Mistral Large | 78 | 57 (73%) | 8/8 | $0.00014 | 8.0 |
| Sonnet 4.6 | 122 | 94 (77%) | 8/8 | $0.0015 | 7.8 |
| Gemini 2.5 Pro | 93 | 80 (86%) | 8/8 | $0.0017 | 8.4 |
| Haiku 4.5 | 152 | 116 (76%) | 8/8 | $0.00051 | 5.8 |
| GPT-4.1-mini | 24 | 18 (75%) | **1/8** | $0.00017 | 4.6 |

### Mossman Gorge Mission (745 words, v2 prompt)

| Model | Facts | Uniq Preds | Tiers | Cost | $/Fact | Avg Quality |
|-------|-------|-----------|-------|------|--------|-------------|
| **Sonnet 4.6** | **298** | **231 (78%)** | 8/8 | $0.431 | $0.0014 | **9.4** |
| Opus 4.5 | 293 | 195 (67%) | 8/8 | $0.678 | $0.0023 | 8.6 |
| Mistral Medium 3 | 257 | 205 (80%) | 8/8 | $0.043 | $0.00017 | 8.4 |
| Mistral Large | 169 | 123 (73%) | 8/8 | $0.023 | $0.00013 | 8.4 |
| GPT-5.4-mini | 165 | 119 (72%) | 7/8 | $0.039 | $0.00024 | 7.8 |
| Gemini 2.5 Flash | 148 | 112 (76%) | 8/8 | $0.037 | $0.00025 | 7.4 |
| o4-mini | 130 | 108 (83%) | 5/8 | $0.057 | $0.00044 | 7.6 |
| **Grok 4.1 Fast** | **122** | **114 (93%)** | 8/8 | **$0.006** | **$0.00005** | **8.6** |
| Qwen3 Coder | 104 | 87 (84%) | 3/8 | $0.017 | $0.00016 | 6.0 |
| GPT-4.1-mini | 66 | 61 (92%) | 1/8 | $0.010 | $0.00015 | 4.6 |

## Quality Scoring (5 Dimensions, 1-10 each)

| Dimension | What it measures | How Grok 4.1 Fast scored |
|-----------|-----------------|-------------------------|
| **Ontological Precision** | Entity modelling quality. Separates inscriptions from people, events from reports. | 9 — 49 subjects from 122 facts on 745 words |
| **Triple Hygiene** | No booleans, no string blobs, proper typed literals. | 9 — zero booleans, 1 blob, 92% IRI objects |
| **Grounding Fidelity** | Facts actually in the text. Confidence calibrated. | 8 — well-calibrated, one self-correcting error |
| **Tier Authenticity** | Higher tiers genuinely earned, not fake labels. | 8 — real presuppositions, real rhetorical analysis |
| **Graph Connectivity** | IRI-to-IRI edges creating a traversable graph. | 9 — 112 IRIs from 122 facts |

## Recommended Extraction Pipeline

### Model selection

| Use case | Model | Cost/article | Why |
|----------|-------|-------------|-----|
| **Bulk extraction** | Grok 4.1 Fast | ~$0.006 | 93% unique predicates, 8/8 tiers, $0.00005/fact. Best value by 10x. |
| **Important sources** | Sonnet 4.6 | ~$0.43 | Most facts (298), best tier spread, quality 9.4. For historically significant documents. |
| **Budget ceiling** | Mistral Large | ~$0.02 | 8/8 tiers, zero booleans, quality 8.4. When Grok is unavailable. |

### API configuration

Use **OpenRouter** (`https://openrouter.ai/api/v1`) with model IDs:
- `x-ai/grok-4.1-fast` — bulk
- `anthropic/claude-sonnet-4.6` — premium
- `mistralai/mistral-large-2512` — fallback

Settings: `temperature: 0.1`, `max_tokens: 32768`

### Prompt selection

Use the **v2 prompt** (`prompt-benchmark-v2.ts`). The v2 additions eliminated boolean objects and string blobs in most models:

| Model | v1 booleans | v2 booleans |
|-------|------------|------------|
| Sonnet 4.6 | 3 | **0** |
| Opus 4.5 | 3 | **0** |
| Grok 4.1 Fast | 0 | 0 |
| GPT-5.4-mini | 0 | 0 |
| Qwen3 Coder | 20 | 21 (didn't fix) |

### Post-extraction

1. **Predicate alignment** — After extraction, run predicates through donto's new alignment layer (migrations 0048-0056). The `donto_suggest_alignments()` function uses lexical normalization + embedding similarity to propose canonical mappings.
2. **Predicate closure rebuild** — Call `donto_rebuild_predicate_closure()` after registering new alignments. This updates the materialized index that makes `donto_match()` expand predicates transparently.
3. **Extraction-time guidance** — For recurring domains, use `donto_extraction_predicate_candidates()` to retrieve top-k relevant predicates from the registry and inject them into the extraction prompt as soft suggestions.

## Key Findings

### 1. Predicate uniqueness ratio is the best single metric

Models with high unique-predicate ratios (Grok at 93%) produce richer, more queryable graphs than models with high raw fact counts but low uniqueness (Haiku at 76%). Predicate reuse means the model is saying the same thing multiple ways.

### 2. GPT-4.1-mini cannot do deep extraction

Across both articles, both prompt versions, GPT-4.1-mini never went beyond Tier 1. It extracted 24-66 surface facts with zero presuppositions, zero rhetorical analysis, zero philosophical depth. This is dontopedia's current extraction model — it's leaving 7 tiers of knowledge on the table.

### 3. Haiku 4.5 has a string blob problem

152 facts sounds impressive until you see that 42 of them have string blobs as objects ("continuity of Cooktown's governance" instead of `ex:cooktown-governance-continuity`). These create dead-end nodes in the graph. Its quality score (5.8) is the lowest among expensive models.

### 4. The v2 prompt fixes most hygiene issues

Adding explicit "NEVER use booleans" and "prefer IRIs" rules eliminated the boolean antipattern in Sonnet (3→0), Opus (3→0), GPT-5.4-mini (stayed at 0), and most other models. Only Qwen3 Coder ignored the rules (21 booleans on v2).

### 5. Thinking models are too slow for extraction

DeepSeek V4 Flash/Pro, Kimi K2.6, Qwen3-14B/32B, and Nemotron Super 120B all timed out at 3 minutes. They burn tokens on chain-of-thought reasoning before producing output. Extraction is better served by fast, direct models.

### 6. Inverse direction is a real problem

Different models disagree on directionality: `(grandfather, bornIn, cooktown)` vs `(cooktown, birthplaceOf, grandfather)`. The predicate alignment layer handles this with `inverse_equivalent` relations and automatic subject/object swapping in queries.

### 7. Cost varies 1000x for similar quality

| Model | $/1k facts | Quality |
|-------|-----------|---------|
| Grok 4.1 Fast | $0.05 | 8.6 |
| Opus 4.5 | $2.30 | 8.8 |

Opus is 46x more expensive per fact for 0.2 quality points. At scale (thousands of articles), Grok saves thousands of dollars with negligible quality loss.

## Benchmark Infrastructure

All benchmark code is in `packages/extraction/`:
- `src/prompt-benchmark-v2.ts` — the v2 extraction prompt
- `src/benchmark.ts` — the benchmark harness (parallel execution, caching, pricing, JSON repair)
- `test/fixtures/` — test articles (.md files)
- `test/results/` — per-model JSON results + HTML dashboards
- `test/results/index.html` — interactive dashboard for cooktown-mayors
- `test/results/mossman-gorge.html` — interactive dashboard for mossman-gorge

Run a benchmark:
```bash
OPENROUTER_API_KEY=... PROMPT_V2=1 bun packages/extraction/src/benchmark.ts \
  --article packages/extraction/test/fixtures/mossman-gorge-mission.md \
  --models "x-ai/grok-4.1-fast,anthropic/claude-sonnet-4.6"
```

## Files

| File | Purpose |
|------|---------|
| `EXTRACTION-BENCHMARK-FINDINGS.md` | This document |
| `PREDICATE-ALIGNMENT-PROBLEM.md` | Problem statement for the alignment layer |
| `packages/extraction/src/prompt-benchmark-v2.ts` | Production extraction prompt |
| `packages/extraction/src/benchmark.ts` | Benchmark harness |
| `packages/extraction/test/results/*.json` | Raw model outputs |
| `packages/extraction/test/results/*.html` | Interactive dashboards |
