// A single formatted occurrence in the current note.
// This model is intentionally small and lightweight because it is reused both by the
// sidebar UI and by the markdown export routine. Each match retains the original textual
// value, the byte offset inside the file, the line number used for navigation, and the
// format modes (bold, italic, highlight, quoted, or combinations like italic+quoted)
// so the sidebar can apply the correct styling and filtering.
export type FormattedOccurrence = {
  term: string;
  offset: number;
  line: number;
  modes: FormatMode[];
};

// One normalized entry in the index. The same term can appear several times in the same file,
// so we group all of its occurrences under a single bucket and keep them ordered from top to bottom.
export type BoldIndexEntry = {
  term: string;
  occurrences: FormattedOccurrence[];
};

// The plugin supports four content styles. The selected format modes determine which
// markdown patterns are considered valid candidates when building the index.
export type FormatMode = 'bold' | 'italic' | 'highlight' | 'quoted';

// A fixed list of supported emphasis modes. The sidebar exposes them as cumulative filters,
// which means the user can combine bold, italic, highlight, and quoted entries in the same index.
export const ALL_FORMAT_MODES: FormatMode[] = ['bold', 'italic', 'highlight', 'quoted'];

// Determines the order in which index entries are displayed to the user.
// - 'alphabetical': entries are sorted alphabetically (default, user-friendly natural order)
// - 'byLine': entries are sorted by the line number of their first occurrence (document order)
export type SortMode = 'alphabetical' | 'byLine';

// A fixed list of supported sort modes for the index entries.
export const ALL_SORT_MODES: SortMode[] = ['alphabetical', 'byLine'];

// Sorts the given index entries according to the specified sort mode.
// This function preserves the original structure of entries and their occurrences,
// only changing the presentation order in the sidebar UI.
//
// Alphabetical sorting uses the French locale to ensure consistent, natural ordering
// across different environments. Line-based sorting groups entries by their first occurrence
// in the document, which helps users navigate in reading order.
export function sortBoldIndexEntries(entries: BoldIndexEntry[], mode: SortMode): BoldIndexEntry[] {
  if (mode === 'alphabetical') {
    // Sort alphabetically using French locale for consistent, natural-feeling order.
    return [...entries].sort((left, right) => left.term.localeCompare(right.term, 'fr'));
  }

  if (mode === 'byLine') {
    // Sort by the line number of the first occurrence of each term.
    // This maintains document order and helps users scan the index in reading sequence.
    return [...entries].sort((left, right) => {
      const leftFirstLine = left.occurrences[0]?.line ?? 0;
      const rightFirstLine = right.occurrences[0]?.line ?? 0;
      return leftFirstLine - rightFirstLine;
    });
  }

  // Fallback to alphabetical if an unexpected mode is received (defensive programming).
  return [...entries].sort((left, right) => left.term.localeCompare(right.term, 'fr'));
}

// Filters the already-built index entries using the current live search query from the sidebar.
// The comparison is intentionally case-insensitive so the user can type the search term
// naturally without worrying about the original capitalization in the note.
export function filterBoldIndexEntries(entries: BoldIndexEntry[], query: string): BoldIndexEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) => entry.term.toLowerCase().includes(normalizedQuery));
}

// Filters entries by selected format modes using AND logic.
// An entry is included only if it has at least one occurrence that contains ALL selected modes.
// This enables finding terms with combined formatting like italic+quoted: _«text»_ or «_text_»
//
// Examples:
// - Selected modes: ['bold'] → includes entries with bold occurrences
// - Selected modes: ['italic', 'quoted'] → includes entries with at least one occurrence that is both italic AND quoted
// - Selected modes: ['bold', 'italic', 'quoted'] → requires all three modes in a single occurrence
export function filterByFormattingModes(entries: BoldIndexEntry[], selectedModes: FormatMode[]): BoldIndexEntry[] {
  // If no modes selected (shouldn't happen due to UI logic), return all entries
  if (selectedModes.length === 0) {
    return entries;
  }

  return entries.filter((entry) => {
    // An entry passes the filter if it has at least one occurrence that contains ALL selected modes
    return entry.occurrences.some((occurrence) => {
      // Check if this occurrence's modes contain all selected modes (subset check)
      return selectedModes.every((mode) => occurrence.modes.includes(mode));
    });
  });
}

// Creates the markdown export document for the selected note.
// This function is deliberately simple and deterministic: it converts the index into a
// readable bullet list where each item contains the term itself and the line numbers where
// it occurred. The exported document is saved alongside the current note in the vault.
export function buildMarkdownIndexDocument(title: string, entries: BoldIndexEntry[]): string {
  const lines = entries.map((entry) => {
    const numbers = entry.occurrences.map((occurrence) => occurrence.line).join(', ');
    return `- ${entry.term}: ${numbers}`;
  });

  const content = lines.length > 0 ? lines.join('\n') : 'Aucun terme indexé.';
  return `# Index lexical - ${title}\n\n${content}\n`;
}

// Markdown code fences and inline code should never appear in the lexical index because they are
// technical artifacts, not concept markers. These patterns are used to define regions that must
// be ignored while scanning the current file.
const CODE_BLOCK_PATTERNS = [
  /```[\s\S]*?```/g,
  /~~~[\s\S]*?~~~/g,
  /`[^`]*`/g
];

// Regex rules used to detect the supported emphasis styles in a note.
// Each entry is generic enough to work on plain markdown while remaining compatible with the
// plugin’s idea of a lexical navigation index.
const FORMAT_PATTERNS: Record<FormatMode, RegExp[]> = {
  bold: [/\*\*(?!\*)(.*?)\*\*(?!\*)/g],
  italic: [
    /(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g,
    /(?<!_)_(?!_)(.*?)_(?!_)/g
  ],
  highlight: [/==(.*?)==/g],
  quoted: [/«(.*?)»/g]
};

// Helper function to detect all formatting modes applied to a given raw match.
// Example: the raw match "_«text»_" should return ['italic', 'quoted'] because it is wrapped
// in both italic markers and quotation marks. Testing only the stripped inner text fails for
// nested combinations, because the italics markers are outside the quoted segment and are not
// visible once we trim the match down to the interior content.
function detectFormattingModes(rawMatchText: string, availableModes: FormatMode[]): FormatMode[] {
  const detectedModes: FormatMode[] = [];

  for (const mode of availableModes) {
    const patterns = FORMAT_PATTERNS[mode] ?? [];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(rawMatchText);

      // The mode is considered active if the raw text itself is wrapped by that marker pattern.
      // This works for nested cases like "_«text»_", where the outer italic markers are on the
      // complete raw match while the inner quotes are a separate nested format.
      if (match) {
        detectedModes.push(mode);
        break;
      }
    }
  }

  return detectedModes;
}

// Removes the outer markdown wrappers from a raw formatted match so nested formats canonicalize
// to the same underlying term. For example, "_«text»_" and "«text»" both normalize to "text".
function normalizeFormattedTerm(rawMatchText: string): string {
  let normalized = rawMatchText.trim();
  let previous = '';

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^(\*\*|__|==|_|\*|«)+/, '')
      .replace(/(\*\*|__|==|_|\*|»|«)+$/, '')
      .trim();
  }

  return normalized;
}

// Builds a sorted index of all formatted terms present in the markdown content.
// The parser walks the document, filters out code artifacts, groups repeated occurrences,
// and returns a stable alphabetical structure that the sidebar UI can render and the export
// feature can write to a markdown file.
export function buildBoldIndex(content: string, modes: FormatMode[] = ['bold']): BoldIndexEntry[] {
  // Ignore ranges are computed in advance so we can cheaply reject matches that belong to code
  // snippets or inline code blocks. This protects the index from obvious false positives.
  const ignoreRanges: [number, number][] = [];

  for (const pattern of CODE_BLOCK_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      if (typeof match.index === 'number') {
        ignoreRanges.push([match.index, match.index + match[0].length]);
      }
    }
  }

  // A helper function that answers whether a given offset lies inside one of the ignored ranges.
  const isIgnored = (pos: number) => ignoreRanges.some(([start, end]) => pos >= start && pos < end);
  const grouped = new Map<string, FormattedOccurrence[]>();

  // Process each format mode to track which modes each occurrence has.
  // This allows detecting combined formatting like italic+quoted (_«text»_)
  const activeModes = modes.length > 0 ? modes : ['bold'];

  for (const mode of activeModes) {
    const patterns = FORMAT_PATTERNS[mode] ?? [];
    
    for (const pattern of patterns) {
      pattern.lastIndex = 0;

      for (const match of content.matchAll(pattern)) {
        if (typeof match.index !== 'number') continue;

        const offset = match.index;
        if (isIgnored(offset)) continue;

        const rawMatchText = match[0];
        const term = normalizeFormattedTerm(rawMatchText);
        if (!term) continue;

        // Detect all formatting modes that apply to the full wrapped match.
        // Example: the raw match "_«text»_" includes both the outer underscore italics and the
        // inner French quotes, so we must inspect the complete match instead of the stripped term.
        const detectedModes = detectFormattingModes(rawMatchText, activeModes);

        // Always include the current mode that was found via this pattern.
        if (!detectedModes.includes(mode)) {
          detectedModes.push(mode);
        }

        // Determine the line number from the content preceding the match. This value is later
        // used to create clickable references in the sidebar UI.
        const line = content.slice(0, offset).split('\n').length;
        const list = grouped.get(term) ?? [];
        list.push({ term, offset, line, modes: [...new Set(detectedModes)] });
        grouped.set(term, list);
      }
    }
  }

  return [...grouped.entries()]
    // Sort alphabetically using French locale so the resulting list feels natural in the UI and
    // is stable across runs without depending on runtime-specific sorting behavior.
    .sort(([left], [right]) => left.localeCompare(right, 'fr'))
    .map(([term, occurrences]) => ({
      term,
      occurrences: occurrences
        // Keep navigation order consistent from top to bottom of the note.
        .sort((a, b) => a.line - b.line || a.offset - b.offset)
        // The UI is easier to read when a single term only shows one line reference per line.
        .filter((occurrence, index, source) => {
          const previous = source[index - 1];
          return !previous || previous.line !== occurrence.line;
        })
    }));
}
