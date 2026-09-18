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

export type ExtractedConcept = {
  id: string;
  term: string;
  definition: string;
};

export type ExtractConceptsResponse = {
  document_id: string;
  concepts: ExtractedConcept[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

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
