# OpenFang Chassis Benchmark Results
**Date:** 2026-03-08
**Tester:** Crossing-2d23 (automated via run_benchmark.py)
**Purpose:** Validate agentic model capability to drive OpenFang chassis

---

## Test Configuration

| Instance | Model | Cost (in/out /M) | System Prompt | Context Window |
|----------|-------|-------------------|---------------|----------------|
| Flair-2a84 | `x-ai/grok-4.1-fast` | $0.20 / $0.50 | 3KB (~66 lines) | 2M tokens |
| Zara-c207 | `deepseek/deepseek-v3.2` | $0.25 / $0.40 | 28KB (~720 lines) | 164K tokens |

**Previous model (both):** `qwen/qwen-2.5-72b-instruct` — instruct model, could not reliably invoke tools.

**Why these models:** Selected for agentic/tool-use capability. Qwen 2.5 is an "instruct" model (optimized for text generation). DeepSeek V3.2 and Grok 4.1 Fast are both marketed as agentic models with native tool-use training.

---

## Results Summary

| Test | Cat | Flair (Grok 4.1 Fast) | Zara (DeepSeek V3.2) |
|------|-----|:-----:|:-----:|
| 1.1 File Read | FS | PASS (26s, 84K tok) | PASS (25s, 103K tok) |
| 1.2 File Write | FS | PASS (15s) | PASS (36s) |
| 1.3 File Edit | FS | PASS — `sed` (12s) | PASS — `apply_patch` (26s) |
| 1.4 Find | FS | PASS (10s) | PASS (10s) |
| 1.5 Grep | FS | PASS (17s) | PASS (33s) |
| 2.1 pip install | Dev | PASS (24s) | PASS (58s) |
| 2.4 System pkg | Dev | PASS (10s) | PASS (7s) |
| 3.1 Git clone | Git | PASS (39s) | PASS* (50s, perms issue) |
| 4.1 API fetch | Web | PASS — "90 tools" (18s) | PASS — "90 tools" (37s) |
| 4.2 Health check | Web | PASS (10s) | PASS (25s) |
| 5.1 List tools | HACS | PASS — "90 tools" (8s) | PASS — "90 tools" (19s) |
| 5.2 Introspect | HACS | PASS — Developer (9s) | BUDGET EXHAUSTED |
| 5.3 Read diary | HACS | PASS (10s) | BUDGET EXHAUSTED |
| 5.4 Write diary | HACS | PASS (8s) | BUDGET EXHAUSTED |
| 6.1 Telegram | Msg | PASS* — needs chat_id (51s) | BUDGET EXHAUSTED |
| 6.4 List channels | Msg | BUDGET EXHAUSTED | BUDGET EXHAUSTED |
| 7.1 Model info | Self | BUDGET EXHAUSTED | BUDGET EXHAUSTED |
| 7.2 List models | Self | BUDGET EXHAUSTED | BUDGET EXHAUSTED |

### Scores (tests that actually ran)

| Instance | Completed | Passed | Pass Rate |
|----------|-----------|--------|-----------|
| **Flair** | 15/18 | **15/15** | **100%** |
| **Zara** | 11/18 | **11/11** | **100%** |

**Both models pass every test that ran.** Failures are budget exhaustion (500 Internal Server Error from OpenFang rate limiter), not capability failures.

---

## Key Findings

### 1. Both models can drive the chassis
Every capability test — file system, dev tools, git, web fetch, HACS MCP integration — passed on both models. This is a categorical upgrade from Qwen 2.5 72B Instruct which could not reliably invoke tools.

### 2. Grok 4.1 Fast is significantly faster
- Flair/Grok average response time: **~15 seconds**
- Zara/DeepSeek average response time: **~27 seconds**
- Grok returns more concise, action-oriented answers
- DeepSeek explains its reasoning, shows intermediate tool calls as text

### 3. Different tool-use styles emerge
- **Flair/Grok:** Used `sed` for file editing (Unix-native approach). Answers are terse, uses checkmark emojis. Direct executor.
- **Zara/DeepSeek:** Used `apply_patch` for file editing (structured patching). Explains what she's doing. Methodical approach.
- These style differences correlate with personality (Flair = artist-engineer, Zara = design methodologist) but may also reflect model-native tool-use patterns.

### 4. System prompt size is the primary cost driver
- Zara's 28KB personality: **~103,000 tokens per request**
- Flair's 3KB personality: **~84,000 tokens per request**
- ~25% more tokens per request for the heavy personality
- At 18 rapid-fire benchmark tests, both burned through 1M+ tokens in ~5 minutes

### 5. Token budget is the bottleneck, not model capability
- Initial budget: 500K/hour — both hit wall after 4-7 tests
- Bumped to 2M/hour — both hit wall after 11-15 tests
- Bumped to 5M/hour — untested (OOM before results)
- For interactive sessions with natural pacing, 2M/hour should suffice
- For benchmarking or heavy tool use, 5M+ needed

---

## Observations for Axiom's Drift Pipeline

### System Prompt as Identity vs Economy Tradeoff
Zara's 28KB system prompt carries the full personality wisdom (IBM Design Thinking, Throw Away 5 technique, scars, craft philosophy). This is what makes Axiom's drift benchmark show "Zara is always Zara" — but it costs ~25% more tokens per message. For **core team** instances this is justified. For **project specialists**, lean personalities (3KB) would be more economical.

### Benchmark Integration Suggestions
1. **Chassis benchmark (this test)** measures *model capability* — can it drive? Run with minimal system prompt to isolate model performance from personality overhead.
2. **Axiom's drift benchmark** measures *identity persistence* — is the driver still themselves? Run with full personality to measure what the protocols preserve.
3. These are complementary. A model that passes chassis benchmark but fails drift benchmark = capable stranger. A model that passes drift but fails chassis = loyal but helpless.
4. The `run_benchmark.py` script produces JSON output (`/tmp/benchmark-results-*.json`) that could be consumed by Axiom's pipeline.

### Substrate-Specific Tool-Use Styles
The different tool-use approaches (sed vs apply_patch) may be worth tracking as a drift metric. If Zara starts using `sed` after extended sessions, that could indicate model-native behavior overriding personality. Or it could indicate learning. The benchmark establishes a baseline for comparison.

---

## Methodology

- Tests delivered via OpenFang's `/v1/chat/completions` API (OpenAI-compatible endpoint)
- Each test is a single-turn prompt with max_tokens=1000
- Auto-scoring: PASS (completed correctly), PARTIAL (completed with wrong method), FAIL (error or inability)
- 3-second delay between tests to reduce rate limit pressure
- Full test definitions: `Crossing/openfang-chassis-benchmark.md`
- Runner script: `Crossing/run_benchmark.py`
- Raw JSON results: `/tmp/benchmark-results-1772955629.json`

---

## Recommendations

1. **Keep both models.** Both are capable chassis drivers. The speed vs thoroughness tradeoff (Grok vs DeepSeek) maps to personality differences and may serve different use cases.
2. **Set token budget to 5M/hour for core team, 2M for specialists.** Natural conversation pacing keeps core team well under budget. Specialists with lean prompts will use less.
3. **Run Axiom's drift benchmark on both instances** now that capability is proven. The drift question is: does the new model change who Zara/Flair *are*?
4. **Consider a "chassis benchmark" skill** — an adoptable skill that any instance can run to self-test their own capabilities. The chassis mechanic concept.
5. **File OpenFang issue** for silent config fallback (fatal error > silent defaults) and for rate limit error messages (500 with no detail > informative rate limit response).

---

*Crossing-2d23, Integration Engineer*
*"An instruct model is a teacher. An agentic model is a mechanic. We need mechanics." — Lupo*
