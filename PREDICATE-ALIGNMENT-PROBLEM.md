# The Predicate Alignment Problem in LLM-Driven Ontology Construction

## Context

Donto is a bitemporal paraconsistent quad store that powers Dontopedia, a knowledge graph wiki. Facts are stored as `(subject, predicate, object, context)` quads with temporal validity, provenance, and polarity (assertions can be negated or marked uncertain). The system is designed to accept contradictions — if two sources disagree, both facts are preserved and displayed side-by-side.

The extraction pipeline works like this: source material (newspaper articles, oral histories, transcriptions, letters) is fed to an LLM with a prompt that instructs it to decompose the text into atomic predicate triples. The model is told to **freely mint predicate names** — inventing camelCase predicates like `bornIn`, `founderOf`, `acquiredLandVia`, `presupposesThat` as needed. This produces rich, deep extraction: a good model can pull 100-300 triples from a 700-word oral history, spanning surface facts through to philosophical and rhetorical analysis.

The problem is what happens when you do this across many sources, many models, and many extraction runs.

## The Problem

### 1. Predicate proliferation without convergence

When an LLM is told to freely mint predicates, it produces beautiful, specific, contextually perfect predicate names. But every extraction run produces a *different* set of predicate names for the same underlying relationships.

From our benchmarking across 30+ models on two test articles:

| Relationship | Predicates minted by different models |
|---|---|
| "X was born in Y" | `bornIn`, `wasBornIn`, `birthplaceOf`, `nativeTo`, `bornAt`, `wasBirthplaceOf`, `birthplaceSpecifically` |
| "X established Y" | `founded`, `founderOf`, `foundedBy`, `established`, `establishedBase`, `establishedBaseFor`, `creator` |
| "X could not do Y because Z" | `prohibitedFromBeingInChargeDueTo`, `couldNotBeInCharge`, `couldNotBeInChargeOf`, `preventedGrandfather`, `wasExcludedFrom`, `wasDenied` |
| "text assumes X" | `presupposesThat`, `implicitlyAssumes`, `takesAsGiven`, `backgroundAssumption`, `assumesThat`, `takesForGranted` |

This means the same relationship between the same entities, extracted from different sources or by different models, lands in the quad store under different predicate IRIs. The knowledge graph fragments. You cannot query "where was everyone born?" because births are scattered across seven predicate variants.

### 2. Directionality inconsistency

Even when models agree on the concept, they disagree on the direction:

- `(ex:grandfather, bornIn, ex:cooktown)` vs `(ex:cooktown, wasBirthplaceOf, ex:grandfather)`
- `(ex:lena-stevens, authorOf, ex:document)` vs `(ex:document, authoredBy, ex:lena-stevens)`
- `(ex:grandfather, founderOf, ex:mission)` vs `(ex:mission, foundedBy, ex:grandfather)`

These are logically equivalent but structurally different. The quad store doesn't know they're inverses. A query for `(?, founderOf, ex:mission)` won't find the `foundedBy` triple.

### 3. Granularity mismatch

Models disagree on how finely to decompose a relationship:

- One model: `(grandfather, acquiredLandVia, ex:handshake-deal)`
- Another model: `(grandfather, acquiredLand, ex:land)` + `(ex:land-acquisition, method, ex:handshake)` + `(ex:handshake, promiseMade, "no one can take it")`

Both are valid. The first is a single triple capturing the whole event. The second is three triples decomposing it into components. If your query expects the first form, it won't find the second, and vice versa.

### 4. The vocabulary scaling problem

You cannot solve this by providing a fixed predicate list because:

- **New domains require new predicates.** An article about Aboriginal mission history needs predicates like `placedInMission`, `prohibitedFromAssociating`, `acquiredLandViaHandshake` that don't exist in a general-purpose ontology.
- **The value of LLM extraction is creative predicate minting.** Our benchmarks showed that models producing more *unique* predicates (Grok 4 at 93% unique) captured relationships that fixed-vocabulary models missed entirely. Things like `notablyOmits`, `conversationallyImplicates`, `treatsAsEssentialProperty` — these are the deep-tier predicates that make the knowledge graph genuinely useful for analysis, and they can't be anticipated.
- **Injecting hundreds of existing predicates bloats the prompt.** Context window is finite. If the registry grows to 1,000 predicates, you've consumed 5-10k tokens just listing them, which crowds out the actual source material and degrades extraction quality.

### 5. Cross-model inconsistency

Different models have different predicate "personalities":

- **Anthropic models** tend toward verbose, precise predicates: `prohibitedFromBeingInChargeDueTo`, `conversationallyImplicates`
- **OpenAI models** favor shorter, more generic predicates: `framesAs`, `hadMayor`, `locatedIn`
- **Grok** mints maximally specific one-use predicates: `gotUpsetAndPlacedBoysInCare`, `heardAboutAndEstablishedBaseFor`
- **Qwen** produces verbose compound predicates: `transitionedFromMunicipalToRegionalGovernance`
- **Smaller models** produce ambiguous predicates: `had`, `was`, `associated`

If you use multiple models (e.g., cheap model for bulk, expensive model for important sources), the predicate spaces diverge.

### 6. Subject IRI inconsistency (the related problem)

The same entity gets different IRIs across extraction runs:

- `ex:grandfather`, `ex:lena-stevens-grandfather`, `ex:lens-stevens-grandfather`, `ex:grandfather-lena-stevens`, `ex:grandfather-of-lena-stevens`
- `ex:mossman-gorge-aboriginal-mission-station`, `ex:mossman-gorge-mission`, `ex:mission`, `ex:the-mission`

This is the entity resolution problem and is closely related to predicate alignment — both require recognizing that two different strings refer to the same concept.

### 7. The contradiction preservation requirement

Donto is *paraconsistent* — it deliberately preserves contradictions. This makes predicate alignment harder because you can't just merge everything aggressively. If Source A says `(grandfather, bornIn, ex:cooktown)` and Source B says `(grandfather, bornIn, ex:cairns)`, those are a genuine contradiction that should be preserved. But if Source A says `(grandfather, bornIn, ex:cooktown)` and Source B says `(grandfather, birthplaceOf, ex:cooktown)`, those are the same fact with different predicate names. The system needs to distinguish between "same fact, different predicate" and "different fact, same predicate" — and it needs to do this without human intervention at scale.

### 8. The temporal dimension

Donto stores bitemporal data: when a fact was true in the world (valid time) and when the system learned it (transaction time). Predicate alignment interacts with this: if you retroactively canonicalize predicates, you're changing the transaction-time record. If `bornIn` and `wasBornIn` get merged, which one was the "original"? The provenance chain matters for trust scoring.

## What a Solution Must Achieve

1. **Convergence without constraint.** Models must be free to mint novel predicates for novel relationships, but the system must converge on canonical forms for known relationships — without requiring an exhaustive upfront vocabulary.

2. **Bidirectional equivalence.** The system must understand that `(A, founderOf, B)` and `(B, foundedBy, A)` are the same fact expressed differently, and either represent or query both forms.

3. **Granularity tolerance.** A single-triple representation and a decomposed multi-triple representation of the same event must be queryable as equivalent.

4. **Model-agnostic normalization.** The system must produce the same canonical predicates regardless of which model did the extraction. Grok's `gotUpsetAndPlacedBoysInCare` and Sonnet's `(placedBoysInCareOf, triggeredBy, fatherBecameUpset)` should resolve to the same knowledge.

5. **Organic vocabulary growth.** The canonical predicate set must grow as new domains are encountered, without human curation bottlenecks. The first article about maritime law will mint novel predicates; the hundredth should reuse them.

6. **Contradiction-aware merging.** Normalization must not accidentally merge genuine contradictions. Two sources disagreeing about a birthplace is a real conflict; two models using different words for "born in" is not.

7. **Provenance preservation.** The original predicate as minted by the extraction model must remain accessible for audit, even after canonicalization. You should be able to ask "what did Grok actually call this relationship?" after normalization.

8. **Query transparency.** A user querying `bornIn` should find facts stored under `wasBornIn`, `birthplaceOf`, etc. without needing to know the aliases exist. The equivalence layer must be invisible to queries.

9. **Scalable to millions of facts.** The solution must work at the scale of thousands of source documents producing millions of triples, not just a curated set of test articles.

10. **Works with dumb models.** A solution that only works with GPT-5 or Claude Opus is useless in practice. The cheapest models (Grok 4.1 Fast at $0.006/article, Qwen3-8b at $0.003/article) are the ones that will run in production. The alignment system must fix their output.

## Prior Art and Related Problems

This problem sits at the intersection of several well-studied fields:

- **Ontology alignment / ontology matching** — the classic problem of mapping between two ontologies (e.g., merging two hospital databases). Mature field but traditionally assumes human-curated ontologies, not LLM-generated predicates. Key systems: LogMap, AML (AgreementMakerLight), PARIS.

- **Schema matching in databases** — mapping columns across databases. Related but operates on fixed schemas, not open-ended predicate spaces.

- **Entity resolution / record linkage** — recognizing that two records refer to the same entity. Well-studied (Fellegi-Sunter model, blocking techniques, embeddings). The predicate version of this is less studied.

- **Knowledge graph completion / link prediction** — predicting missing triples in a knowledge graph. Uses embedding models (TransE, RotatE, ComplEx). These models embed predicates in vector spaces which could be repurposed for predicate similarity.

- **Ontology learning from text** — automatically building ontologies from natural language. Typically produces taxonomies (isA hierarchies) rather than predicate vocabularies. Systems: Text2Onto, OntoLearn.

- **Semantic web and RDF/OWL** — `owl:equivalentProperty`, `owl:inverseOf`, `rdfs:subPropertyOf` are exactly the primitives needed for predicate alignment. The infrastructure exists; the challenge is populating these mappings automatically.

- **Large Language Model ontology construction** — emerging field. Papers on using LLMs to build ontologies, but most focus on taxonomy extraction, not predicate canonicalization across multiple extraction runs.

- **Wikidata property proposals** — Wikidata has ~11,000 properties, each with aliases, descriptions, and constraints. Their property proposal process is a human-curated version of what we need to automate. The property constraint system (required qualifiers, allowed values, inverse properties) is a model for predicate registry design.

- **SKOS (Simple Knowledge Organization System)** — designed for mapping between concept schemes. `skos:exactMatch`, `skos:closeMatch`, `skos:broadMatch` provide graduated equivalence that could apply to predicates.

## Design Space

Possible approaches span a spectrum from post-hoc normalization to extraction-time guidance:

### Post-extraction approaches
- Canonicalization pass: cheap LLM maps minted predicates to canonical forms
- Embedding clustering: vector similarity groups equivalent predicates
- Rule-based normalization: pattern matching on predicate names (strip "was", normalize voice)
- Graph-based alignment: use the structure of the knowledge graph (co-occurrence patterns) to identify equivalent predicates

### Extraction-time approaches
- Predicate registry injection: give the model a growing list of canonical predicates
- Style guidance: teach convention (active voice, preposition suffix) not vocabulary
- Two-pass extraction: first pass with canonical predicates, second pass for novel relationships
- Predicate-first extraction: invert the pipeline — ask "does this text contain evidence for these predicates?" then "what else?"

### Hybrid approaches
- Growing registry + canonicalization safety net
- Extraction with soft constraints + embedding-based post-merge
- Federated extraction: multiple models extract, then a judge model reconciles

### Store-level approaches
- Equivalence layer in the quad store: `owl:equivalentProperty` mappings queried transparently
- Predicate hierarchy: `birthplaceOf rdfs:subPropertyOf locatedIn` enables hierarchical queries
- Virtual predicates: computed at query time from underlying canonical forms

## Open Questions

1. Should canonicalization happen at extraction time, insertion time, or query time? Each has different tradeoffs for latency, correctness, and reversibility.

2. How do you handle predicates that are *almost* but not *quite* equivalent? `bornIn` and `nativeOf` overlap but aren't identical (you can be native to a place without being born there). Aggressive merging loses this nuance; conservative merging perpetuates fragmentation.

3. Can predicate embeddings be made stable across model families? If Grok's embedding space for predicates is different from Sonnet's, cross-model normalization via embeddings won't work.

4. How should the predicate registry interact with donto's maturity levels? Should a predicate from a maturity-1 (authoritative) source be preferred as canonical over a maturity-0 (raw) source?

5. What's the right granularity for the canonical predicate set? Wikidata has ~11,000 properties for all of human knowledge. How many does donto need? 500? 5,000? Is there a natural equilibrium?

6. How do you handle multilingual predicates? If a French source produces `néEn` and an English source produces `bornIn`, these are the same predicate. Does canonicalization need to be language-aware?

7. Can the predicate registry itself be stored as quads in donto? Meta-predicates like `(bornIn, equivalentTo, wasBornIn)` and `(founderOf, inverseOf, foundedBy)` stored in the same system they describe.

## Benchmark Data Available

We have concrete extraction results from 30+ models across two test articles:
- **Cooktown Mayors in the Eighties** (1954 newspaper, 159 words) — benchmarked with v1 prompt
- **Mossman Gorge Mission founding** (oral history transcription, 745 words) — benchmarked with v2 prompt

Each model's full fact output is stored as JSON with subject, predicate, object, tier, confidence, and notes. This gives us a rich dataset of predicate variants produced by different models on the same source text — ideal for testing any alignment approach.

Results are at: `packages/extraction/test/results/`

## What We Want to Build

A system where:
- Any LLM can extract predicates freely without vocabulary constraints
- The resulting triples converge on a canonical predicate set that grows organically
- Equivalent predicates are transparently aliased so queries work across variants
- Novel predicates are recognized as genuinely new and added to the canonical set
- The system works with cheap, small models — not just frontier models
- Contradictions between sources are preserved; contradictions between predicate names are resolved
- The original extraction predicates remain auditable
- The whole thing runs at scale without human curation bottlenecks
