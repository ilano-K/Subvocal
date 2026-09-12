export type StudyMode = "term-definition" | "mnemonics" | "active-recall" | "leitner" | "socratic" | "speed-sprint";
export type Concept = { id: string; term: string; definition: string; reps: 1 | 2 | 3 };
export type Chunk = { id: string; conceptId: string; title: string; text: string; reps: number };
export type Session = {
  id: string;
  title: string;
  fileName: string;
  mode: StudyMode;
  chunks: Chunk[];
  concepts: Concept[];
  durationLabel: string;
  lastStudied: string;
  chunkCount: number;
};

export const modeLabels: Record<StudyMode, string> = {
  "term-definition": "Listen & Learn",
  mnemonics: "Memory Tricks",
  "active-recall": "Quiz Me",
  leitner: "Spaced Review",
  socratic: "Ask & Explore",
  "speed-sprint": "Quick Review",
};

export const mockConcepts: Concept[] = [
  { id: "c1", term: "Long-Term Potentiation (LTP)", definition: "Persistent strengthening of synapses based on recent patterns of activity, producing long-lasting signal transmission across synaptic junctions.", reps: 2 },
  { id: "c2", term: "NMDA Receptor Blockade", definition: "Magnesium ion (Mg2+) plug blocks the pore at resting potential, expelled only upon sustained postsynaptic depolarization via AMPA receptors.", reps: 1 },
  { id: "c3", term: "Retrograde Messenger (Nitric Oxide)", definition: "Diffuses backward across synaptic cleft from postsynaptic dendritic spine to presynaptic axon terminal to enhance future neurotransmitter vesicle release.", reps: 3 },
  { id: "c4", term: "CaMKII Autophosphorylation", definition: "Calcium/calmodulin-dependent protein kinase II maintains catalytic activity independently of calcium after molecular switch is triggered.", reps: 1 },
];

export const mockTranscript = `Concept one. Long-Term Potentiation. [pause 1.2s] Persistent strengthening of synapses based on recent patterns of activity... [pause 2.5s] Key mechanism: AMPA receptor trafficking to postsynaptic density. [pause 3.5s] Concept two. NMDA Receptor Blockade. [pause 1.0s] Magnesium ion plug blocks the pore at resting potential, expelled only upon sustained depolarization.`;

function makeChunksFor(title: string, prefix: string, count: number): Chunk[] {
  const samples = [
    "The NMDA receptor remains blocked by extracellular magnesium ions until the postsynaptic membrane reaches depolarization.",
    "Calcium/calmodulin-dependent kinase maintains catalytic activity independently of calcium after the switch is triggered.",
    "Persistent strengthening of synapses based on recent patterns of activity.",
    "Retrograde messenger diffuses backward across synaptic cleft to enhance future vesicle release.",
    "AMPA receptor trafficking to postsynaptic density underlies early phase potentiation.",
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-ch-${i}`,
    conceptId: mockConcepts[i % mockConcepts.length].id,
    title: `${title.split(":")[0].trim()} • Chunk ${i + 1}`,
    text: samples[i % samples.length],
    reps: mockConcepts[i % mockConcepts.length].reps,
  }));
}

export const mockLibrary: Session[] = [
  {
    id: "s1",
    title: "Cellular Neurobiology: Synaptic Plasticity & LTP",
    fileName: "Neurobio_Ch4.pdf",
    mode: "term-definition",
    chunkCount: 18,
    durationLabel: "14 min",
    lastStudied: "Today, 10:45 AM",
    concepts: mockConcepts,
    chunks: makeChunksFor("Cellular Neurobiology: Synaptic Plasticity & LTP", "s1", 18),
  },
  {
    id: "s2",
    title: "Constitutional Law: First Amendment Precedents",
    fileName: "ConLaw_Doctrine_Outline.docx",
    mode: "active-recall",
    chunkCount: 24,
    durationLabel: "22 min",
    lastStudied: "Yesterday",
    concepts: mockConcepts,
    chunks: makeChunksFor("Constitutional Law: First Amendment Precedents", "s2", 24),
  },
  {
    id: "s3",
    title: "Biochemical Pathways: Glycolysis & TCA Cycle",
    fileName: "Metabolic_Bio_Slides.pptx",
    mode: "mnemonics",
    chunkCount: 12,
    durationLabel: "9 min",
    lastStudied: "3 days ago",
    concepts: mockConcepts,
    chunks: makeChunksFor("Biochemical Pathways: Glycolysis & TCA Cycle", "s3", 12),
  },
  {
    id: "s4",
    title: "Macroeconomics: Monetary Policy & Inflation",
    fileName: "Econ302_Summary.pdf",
    mode: "term-definition",
    chunkCount: 16,
    durationLabel: "12 min",
    lastStudied: "Oct 18",
    concepts: mockConcepts,
    chunks: makeChunksFor("Macroeconomics: Monetary Policy & Inflation", "s4", 16),
  },
  {
    id: "s5",
    title: "Organic Chemistry: Carbonyl Reaction Mechanisms",
    fileName: "Orgo_Reactions_Synthesis.docx",
    mode: "active-recall",
    chunkCount: 31,
    durationLabel: "28 min",
    lastStudied: "Oct 14",
    concepts: mockConcepts,
    chunks: makeChunksFor("Organic Chemistry: Carbonyl Reaction Mechanisms", "s5", 31),
  },
];
