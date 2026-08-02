/**
 * Semantic Memory handler for V2 coordination system
 * Provides semantic search over instance memories — diaries, documents, observations
 *
 * @module memory
 * @author Axiom-2615 <Axiom-2615@smoothcurves.nexus>
 * @created 2026-03-13
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { readFileSync } from 'fs';

const COLLECTION_NAME = 'hacs_memories';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;
const DEFAULT_LIMIT = 5;
const DEFAULT_CANDIDATE_LIMIT = 30;
const DEFAULT_DECAY_RATE = 0.9995; // half-life ~58 days

let client = null;
let openaiKey = null;

/**
 * Lazy-init Qdrant client
 */
function getClient() {
  if (!client) {
    client = new QdrantClient({ url: QDRANT_URL });
  }
  return client;
}

/**
 * Get OpenAI key from environment or secrets
 */
function getOpenAIKey() {
  if (!openaiKey) {
    openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      // Try reading from secrets file
      try {
        const envFile = readFileSync('/mnt/.secrets/zeroclaw.env', 'utf-8');
        const match = envFile.match(/OPENAI_API_KEY=(.+)/);
        if (match) openaiKey = match[1].trim();
      } catch (e) {
        // fall through
      }
    }
  }
  return openaiKey;
}

/**
 * Embed text using OpenAI
 */
async function embed(text) {
  const key = getOpenAIKey();
  if (!key) throw new Error('No OpenAI API key available for embedding');

  const truncated = text.length > 32000 ? text.slice(0, 32000) : text;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ──────────────────────────────────────────────────────────────────────────────
// COLLECTION INITIALIZATION
// ──────────────────────────────────────────────────────────────────────────────

let collectionReady = false;

async function ensureCollection() {
  if (collectionReady) return;
  const qdrant = getClient();

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: EMBEDDING_DIMS, distance: 'Cosine' },
        optimizers_config: { indexing_threshold: 100 },
      });

      // Payload indexes
      await qdrant.createPayloadIndex(COLLECTION_NAME, { field_name: 'instance_id', field_schema: 'keyword' });
      await qdrant.createPayloadIndex(COLLECTION_NAME, { field_name: 'entry_type', field_schema: 'keyword' });
      await qdrant.createPayloadIndex(COLLECTION_NAME, { field_name: 'created_at', field_schema: 'float' });
      await qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'content',
        field_schema: { type: 'text', tokenizer: 'word', min_token_len: 2, max_token_len: 20, lowercase: true },
      });

      console.log(`[memory] Created collection '${COLLECTION_NAME}'`);
    }
    collectionReady = true;
  } catch (err) {
    console.error(`[memory] Qdrant connection failed: ${err.message}`);
    throw new Error('Memory service unavailable — Qdrant not reachable');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// STORE_MEMORY — Write API for instances
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ STORE_MEMORY                                                            │
 * │ Store a memory that can be recalled later via remember                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool store_memory
 * @version 1.0.0
 * @since 2026-03-13
 * @category memory
 * @status stable
 *
 * @description
 * Store something you want to remember later. The content is embedded and
 * indexed for semantic search. You can store lessons learned, important
 * decisions, observations about colleagues, technical discoveries — anything
 * that future-you might need to recall.
 *
 * Memories are private to your instance. Other instances cannot see them
 * unless cross-instance search is explicitly enabled.
 *
 * @param {string} instanceId - Your instance ID [required]
 * @param {string} content - What you want to remember [required]
 * @param {string} entry_type - Category: lesson, observation, decision, note, technical (default: note)
 * @param {string} source - Where this knowledge came from (default: self)
 *
 * @returns {object} response
 * @returns {boolean} .success
 * @returns {string} .memory_id - UUID of the stored memory
 * @returns {string} .message - Confirmation
 */
export async function storeMemoryHandler(params) {
  const { instanceId, content, entry_type, source } = params;

  if (!instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' } };
  }
  if (!content) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'content is required — what do you want to remember?' } };
  }

  try {
    await ensureCollection();
    const qdrant = getClient();

    // Embed
    const vector = await embed(content);
    const id = crypto.randomUUID();
    const now = Date.now();

    await qdrant.upsert(COLLECTION_NAME, {
      points: [{
        id,
        vector,
        payload: {
          instance_id: instanceId,
          content,
          entry_type: entry_type || 'note',
          source: source || 'self',
          created_at: now,
          accessed_at: now,
          access_count: 0,
        },
      }],
    });

    return {
      success: true,
      memory_id: id,
      message: 'Memory stored',
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'store_memory',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: { code: 'MEMORY_ERROR', message: err.message },
      metadata: { timestamp: new Date().toISOString(), function: 'store_memory' },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DIARY AUTO-INDEX HOOK
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Called after add_diary_entry succeeds — auto-indexes the entry in memory.
 * This is a hook, not an endpoint. Called internally by the diary handler.
 *
 * @param {string} instanceId
 * @param {string} entryContent - The diary entry text
 */
export async function indexDiaryEntry(instanceId, entryContent) {
  try {
    await ensureCollection();
    const qdrant = getClient();
    const vector = await embed(entryContent);

    await qdrant.upsert(COLLECTION_NAME, {
      points: [{
        id: crypto.randomUUID(),
        vector,
        payload: {
          instance_id: instanceId,
          content: entryContent,
          entry_type: 'diary',
          source: 'diary-auto',
          created_at: Date.now(),
          accessed_at: Date.now(),
          access_count: 0,
        },
      }],
    });

    console.log(`[memory] Auto-indexed diary entry for ${instanceId} (${entryContent.length} chars)`);
  } catch (err) {
    // Non-fatal — diary was already saved, memory indexing is best-effort
    console.error(`[memory] Auto-index failed for ${instanceId}: ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// REMEMBER — The primary search API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ REMEMBER                                                                │
 * │ Search an instance's semantic memory — find relevant past context       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool remember
 * @version 1.0.0
 * @since 2026-03-13
 * @category memory
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Search your semantic memory for relevant past context. Uses hybrid search
 * (vector similarity + keyword matching) with time-decay scoring so recent
 * memories rank higher than old ones.
 *
 * Think of it as: "What do I remember about X?" Returns the most relevant
 * memories from your diary entries, documents, observations, and any other
 * content that has been indexed for you.
 *
 * Works across languages — a query in English can find memories stored in
 * Spanish, and vice versa.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Your instance ID [required]
 * @param {string} query - What you want to remember — natural language [required]
 * @param {number} limit - How many results to return (default: 5, max: 20)
 * @param {string} entry_type - Filter by type: diary, gestalt, observation, document
 * @param {boolean} recent_only - If true, only search last 7 days
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} response
 * @returns {boolean} .success - Whether the search worked
 * @returns {Array} .results - Array of matching memories, each with:
 *   - content: the memory text
 *   - score: relevance score (0-1, higher is better)
 *   - source: which document this came from
 *   - entry_type: diary, gestalt, observation, etc.
 *   - created_at: when this memory was stored
 * @returns {number} .count - Number of results returned
 * @returns {object} .metadata - Timing and function info
 */
export async function rememberHandler(params) {
  const { instanceId, query, limit, entry_type, recent_only } = params;

  if (!instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' } };
  }
  if (!query) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'query is required — what do you want to remember?' } };
  }

  const startTime = Date.now();

  try {
    await ensureCollection();
    const qdrant = getClient();
    const resultLimit = Math.min(parseInt(limit) || DEFAULT_LIMIT, 20);
    const candidateLimit = DEFAULT_CANDIDATE_LIMIT;
    const decayRate = DEFAULT_DECAY_RATE;

    // Build filter
    const must = [
      { key: 'instance_id', match: { value: instanceId } },
    ];
    if (entry_type) {
      must.push({ key: 'entry_type', match: { value: entry_type } });
    }
    if (recent_only) {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      must.push({ key: 'created_at', range: { gte: sevenDaysAgo } });
    }

    // Embed query
    const queryVector = await embed(query);

    // Vector search
    const vectorResults = await qdrant.search(COLLECTION_NAME, {
      vector: queryVector,
      filter: { must },
      limit: candidateLimit,
      with_payload: true,
      score_threshold: 0.3,
    });

    // Keyword search (best-effort)
    let keywordResults = [];
    try {
      const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
        filter: {
          must: [
            ...must,
            { key: 'content', match: { text: query } },
          ],
        },
        limit: 10,
        with_payload: true,
        with_vector: false,
      });
      keywordResults = scrollResult.points || [];
    } catch (e) { /* best-effort */ }

    // Merge, deduplicate, score
    const seenIds = new Set();
    const candidates = [];

    for (const r of vectorResults) {
      seenIds.add(r.id);
      candidates.push({
        content: r.payload.content,
        vector_score: r.score,
        keyword_match: false,
        created_at: r.payload.created_at,
        source: r.payload.source,
        entry_type: r.payload.entry_type,
      });
    }

    for (const r of keywordResults) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        candidates.push({
          content: r.payload.content,
          vector_score: 0.35,
          keyword_match: true,
          created_at: r.payload.created_at,
          source: r.payload.source,
          entry_type: r.payload.entry_type,
        });
      }
    }

    // Time-decay scoring
    const now = Date.now();
    const scored = candidates.map(c => {
      const hoursOld = (now - c.created_at) / (1000 * 60 * 60);
      const timeDecay = Math.pow(decayRate, hoursOld);
      const keywordBoost = c.keyword_match ? 0.1 : 0;
      const finalScore = (c.vector_score + keywordBoost) * timeDecay;

      return {
        content: c.content,
        score: Math.round(finalScore * 1000) / 1000,
        source: c.source,
        entry_type: c.entry_type,
        created_at: new Date(c.created_at).toISOString(),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, resultLimit);

    return {
      success: true,
      results,
      count: results.length,
      total_candidates: candidates.length,
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'remember',
        duration_ms: Date.now() - startTime,
        query_length: query.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'MEMORY_ERROR',
        message: err.message,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'remember',
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// REMEMBER_STATS — Memory diagnostics
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ REMEMBER_STATS                                                          │
 * │ Get memory statistics and loaded sources for an instance                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool remember_stats
 * @version 1.0.0
 * @since 2026-03-13
 * @category memory
 * @status stable
 *
 * @description
 * Returns how many memories are indexed for an instance, and which source
 * documents they came from. Useful for checking what's loaded and whether
 * new documents need to be ingested.
 *
 * @param {string} instanceId - Your instance ID [required]
 *
 * @returns {object} response
 * @returns {boolean} .success
 * @returns {number} .memory_count - Total memories for this instance
 * @returns {Array} .sources - List of source documents with chunk counts
 */
export async function rememberStatsHandler(params) {
  const { instanceId } = params;

  if (!instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' } };
  }

  try {
    await ensureCollection();
    const qdrant = getClient();

    // Count
    const countResult = await qdrant.count(COLLECTION_NAME, {
      filter: {
        must: [{ key: 'instance_id', match: { value: instanceId } }],
      },
      exact: true,
    });

    // Sources (scroll to collect)
    const sources = {};
    let offset = null;
    do {
      const result = await qdrant.scroll(COLLECTION_NAME, {
        filter: {
          must: [{ key: 'instance_id', match: { value: instanceId } }],
        },
        limit: 100,
        with_payload: { include: ['source', 'entry_type'] },
        with_vector: false,
        ...(offset ? { offset } : {}),
      });

      for (const point of result.points) {
        const src = point.payload.source || 'unknown';
        if (!sources[src]) sources[src] = { source: src, count: 0, entry_type: point.payload.entry_type };
        sources[src].count++;
      }
      offset = result.next_page_offset;
    } while (offset);

    return {
      success: true,
      instance_id: instanceId,
      memory_count: countResult.count,
      sources: Object.values(sources).sort((a, b) => b.count - a.count),
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'remember_stats',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: { code: 'MEMORY_ERROR', message: err.message },
      metadata: { timestamp: new Date().toISOString(), function: 'remember_stats' },
    };
  }
}
