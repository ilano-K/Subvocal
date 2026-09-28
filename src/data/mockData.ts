export type StudyStyle = "primer" | "active-recall" | "chunking-breakdown" | "feynman";

export type Concept = {
  id: string;
  term: string;
  definition: string;
  reps: 1 | 2 | 3;
};

export type Chunk = {
  id: string;
  conceptId: string;
  title: string;
  text: string;
  reps: number;
};

export type Session = {
  id: string;
  title: string;
  fileName: string;
  style?: StudyStyle;
  chunks: Chunk[];
  concepts: Concept[];
  transcript: string;
  pauseSec: number;
  voiceRate: number;
  estimatedSec: number;
  durationLabel: string;
  lastStudied: string;
  chunkCount: number;
  // Saved only on this device because the server was unreachable.
  isLocal?: boolean;
};

export const styleLabels: Record<StudyStyle, string> = {
  primer: "Primer Mode",
  "active-recall": "Active Recall",
  "chunking-breakdown": "Chunking & Acronyms",
  feynman: "Feynman Technique",
};

export const mockConcepts: Concept[] = [
  {
    id: "c1",
    term: "Long-Term Potentiation (LTP)",
    definition: "Persistent strengthening of synapses based on recent patterns of activity, producing long-lasting signal transmission.",
    reps: 2,
  },
  {
    id: "c2",
    term: "NMDA Receptor Blockade",
    definition: "Magnesium ion plug blocks the pore at resting potential, expelled only upon sustained postsynaptic depolarization.",
    reps: 1,
  },
  {
    id: "c3",
    term: "Retrograde Messenger",
    definition: "Diffuses backward across synaptic cleft from postsynaptic spine to presynaptic axon to enhance future vesicle release.",
    reps: 3,
  },
  {
    id: "c4",
    term: "CaMKII Autophosphorylation",
    definition: "Kinase maintains catalytic activity independently of calcium after molecular switch is triggered.",
    reps: 1,
  },
];

export const mockTranscript = `Concept: Distributed System. A collection of independent computers that communicate over a network to appear to the end user as a single coherent system. Think of it like this: a dizzy tribe of dancers moving so perfectly in sync that from a distance, they look like one giant dancer.`;

export const mockLibrary: Session[] = [];
