const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

export type ApiError = {
  error: string;
  message: string;
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      errorDetail = body.message || body.detail || body.error || errorDetail;
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorDetail);
  }
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  return res.json();
}

// ---------------- Document Extraction ----------------

export type DocumentParseResponse = {
  document_id: string;
  extracted_text: string;
  page_count: number;
};

export async function parseDocument(file: File): Promise<DocumentParseResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/documents/parse`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<DocumentParseResponse>(res);
}

// ---------------- Concept Extraction ----------------

export type FactualSchema = {
  shape: "factual";
  canonical_term: string;
  definition: string;
  synonyms: string[];
};

export type ConceptualSchema = {
  shape: "conceptual";
  parent_concept: string;
  categorical_taxonomy: string;
  child_definitions: string[];
};

export type ProceduralSchema = {
  shape: "procedural";
  goal_state: string;
  ordered_steps: string[];
  decision_branches: string[];
};

export type TheoreticalSchema = {
  shape: "theoretical";
  principle_statement: string;
  cause_effect_variables: string[];
  boundary_conditions: string;
};

export type KnowledgeSchema =
  | FactualSchema
  | ConceptualSchema
  | ProceduralSchema
  | TheoreticalSchema;

export type LearningModule = {
  id: string;
  knowledge_schema: KnowledgeSchema;
  prepended_context: string;
  locked_keywords: string[];
  prerequisite_ids: string[];
};

export type ExtractConceptsResponse = {
  document_id: string;
  document_epitome: string;
  modules: LearningModule[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export function flattenModule(m: LearningModule): { term: string; definition: string } {
  const s = m.knowledge_schema;
  switch (s.shape) {
    case "factual":
      return { term: s.canonical_term, definition: s.definition };
    case "conceptual":
      return {
        term: s.parent_concept,
        definition: `${s.categorical_taxonomy}: ${s.child_definitions.join("; ")}`,
      };
    case "procedural":
      return {
        term: s.goal_state,
        definition: s.ordered_steps.join(" → "),
      };
    case "theoretical":
      return {
        term: s.principle_statement,
        definition: `Variables: ${s.cause_effect_variables.join(", ")}. Boundary: ${s.boundary_conditions}`,
      };
  }
}

export async function extractConcepts(documentId: string): Promise<ExtractConceptsResponse> {
  const res = await fetch(`${API_BASE}/concepts/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId }),
  });
  return handleResponse<ExtractConceptsResponse>(res);
}

// ---------------- Script Compilation ----------------

export type ScriptChunkData = {
  id: string;
  conceptId: string;
  title: string;
  text: string;
  reps: number;
};

export type CompileScriptPayload = {
  deckTitle: string;
  concepts: { id: string; term: string; definition: string; reps: number }[];
  pauseSec: number;
  voiceRate: number;
  transcriptOverride?: string;
  documentId?: string;
  documentEpitome?: string;
};

export type CompileScriptResponse = {
  deckTitle: string;
  pauseSec: number;
  voiceRate: number;
  estimatedSec: number;
  transcript: string;
  chunks: ScriptChunkData[];
};

export async function compileScript(payload: CompileScriptPayload): Promise<CompileScriptResponse> {
  const res = await fetch(`${API_BASE}/scripts/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<CompileScriptResponse>(res);
}

// ---------------- Library / Study Decks ----------------

export type StudyDeckRecord = {
  id: string | number;
  filename: string;
  deckTitle: string;
  pauseSec: number;
  voiceRate: number;
  estimatedSec: number;
  transcript: string;
  style?: string;
  chunks: ScriptChunkData[];
  concepts: { id: string; term: string; definition: string; reps: number }[];
};

export type StudyDeckCreatePayload = {
  filename: string;
  deckTitle: string;
  pauseSec: number;
  voiceRate: number;
  estimatedSec: number;
  transcript: string;
  style?: string;
  chunks: ScriptChunkData[];
  concepts: { id: string; term: string; definition: string; reps: number }[];
};

export async function fetchStudyDecks(): Promise<StudyDeckRecord[]> {
  const res = await fetch(`${API_BASE}/library/study_decks`);
  return handleResponse<StudyDeckRecord[]>(res);
}

export async function createStudyDeck(deck: StudyDeckCreatePayload): Promise<StudyDeckRecord> {
  const res = await fetch(`${API_BASE}/library/study_decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });
  return handleResponse<StudyDeckRecord>(res);
}

export async function updateStudyDeck(
  id: string | number,
  patch: Partial<StudyDeckCreatePayload>
): Promise<StudyDeckRecord> {
  const res = await fetch(`${API_BASE}/library/study_decks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return handleResponse<StudyDeckRecord>(res);
}

export async function deleteStudyDeck(id: string | number): Promise<void> {
  const res = await fetch(`${API_BASE}/library/study_decks/${id}`, {
    method: "DELETE",
  });
  return handleResponse<void>(res);
}
