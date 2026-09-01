import { describe, expect, it } from 'vitest';
import { buildBoldIndex, buildMarkdownIndexDocument, filterBoldIndexEntries, FormatMode } from '../../src/domain/markdownIndex';

// Helper function to create test occurrences with modes array
const occurrence = (term: string, offset: number, line: number, ...modes: FormatMode[]) => ({
  term,
  offset,
  line,
  modes: modes.length > 0 ? modes : ['bold']
});

// This suite covers the core parsing and filtering behavior of the bold index.
// It is intentionally kept close to the domain logic so future regressions are easy to diagnose.
describe('buildBoldIndex', () => {
  it('exports the index as a markdown document with heading and term entries', () => {
    const entries = [
      {
        term: 'Alpha',
        occurrences: [
          occurrence('Alpha', 0, 2, 'bold'),
          occurrence('Alpha', 30, 4, 'bold')
        ]
      },
      {
        term: 'Beta',
        occurrences: [occurrence('Beta', 18, 3, 'bold')]
      }
    ];

    expect(buildMarkdownIndexDocument('Ma note', entries)).toBe(
      '# Index lexical - Ma note\n\n- Alpha: 2, 4\n- Beta: 3\n'
    );
  });

  // The parser must extract all bold fragments, merge duplicates, and keep the final list alphabetized.
  it('extracts bold terms and keeps them sorted alphabetically', () => {
    const content = '# Notes\n**Alpha** is here.\n**Beta** and **Alpha** appear again.\n';

    expect(buildBoldIndex(content)).toEqual([
      {
        term: 'Alpha',
        occurrences: [
          occurrence('Alpha', 8, 2, 'bold'),
          occurrence('Alpha', 40, 3, 'bold')
        ]
      },
      {
        term: 'Beta',
        occurrences: [occurrence('Beta', 27, 3, 'bold')]
      }
    ]);
  });

  // Markdown code fences and inline code snippets should never appear in the bold index.
  // Otherwise the UI would show false positives from the code itself instead of the note content.
  it('ignores bold terms inside code blocks and inline code', () => {
    const content = '**Visible**\n```\n**Ignored**\n```\n~~~\n**IgnoredToo**\n~~~\n`**Inline**`\n**AnotherVisible**\n';

    expect(buildBoldIndex(content).map((entry) => entry.term)).toEqual(['AnotherVisible', 'Visible']);
  });

  // Wikilinks are not French quotes. They should not be matched as "quoted" content.
  it('does not treat wikilinks as quoted strings', () => {
    const content = '[[Alpha]] and [[Beta|Gamma]] and [[Delta]]\n';

    expect(buildBoldIndex(content, ['quoted'])).toEqual([]);
  });

  // Markdown links inside bold text should index the displayed label, not the raw [text](url) wrapper.
  it('strips markdown link wrappers from bold terms', () => {
    const content = '**[Courbe de l\'oubli d\'Ebbinghaus](Courbe de l\'oubli d\'Ebbinghaus)**\n';

    expect(buildBoldIndex(content)).toEqual([
      {
        term: 'Courbe de l\'oubli d\'Ebbinghaus',
        occurrences: [occurrence('Courbe de l\'oubli d\'Ebbinghaus', 0, 1, 'bold')]
      }
    ]);
  });

  // Empty content or non-emphasized content should not generate index entries.
  it('returns an empty list when no bold text exists', () => {
    expect(buildBoldIndex('plain text without emphasis')).toEqual([]);
  });

  // A single term may appear multiple times on the same line, but we only keep one line reference per item.
  // This avoids noisy duplicates in the sidebar while still preserving later occurrences on other lines.
  it('keeps only the first occurrence per line for each term', () => {
    const content = '**Same** repeated **Same** on line one.\nAnother **Same** on another line.\n';

    expect(buildBoldIndex(content)).toEqual([
      {
        term: 'Same',
        occurrences: [
          occurrence('Same', 0, 1, 'bold'),
          occurrence('Same', 48, 2, 'bold')
        ]
      }
    ]);
  });

  // The search filter is case-insensitive, so users can type either uppercase or lowercase values.
  // This lets the sidebar behave naturally for note titles and search terms.
  it('filters entries by a text query ignoring case', () => {
    const entries = [
      { term: 'Alpha', occurrences: [occurrence('Alpha', 0, 1, 'bold')] },
      { term: 'Beta', occurrences: [occurrence('Beta', 10, 1, 'bold')] },
      { term: 'Gamma', occurrences: [occurrence('Gamma', 20, 1, 'bold')] }
    ];

    expect(filterBoldIndexEntries(entries, 'ta')).toEqual([
      { term: 'Beta', occurrences: [occurrence('Beta', 10, 1, 'bold')] }
    ]);
    expect(filterBoldIndexEntries(entries, 'GAM')).toEqual([
      { term: 'Gamma', occurrences: [occurrence('Gamma', 20, 1, 'bold')] }
    ]);
  });
});
