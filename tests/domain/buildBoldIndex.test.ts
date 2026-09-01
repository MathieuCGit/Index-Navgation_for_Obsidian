import { describe, expect, it } from 'vitest';
import { buildBoldIndex } from '../../src/domain/markdownIndex';

// This suite verifies the core parsing logic of the bold index builder.
// It covers the main cases we need to preserve while editing the markdown parser.
describe('buildBoldIndex', () => {
  // The parser should extract bold fragments from markdown text and sort them alphabetically.
  // Duplicate terms are merged under the same entry while keeping all matching positions.
  it('extracts bold terms and keeps them sorted alphabetically', () => {
    const content = '# Notes\n**Alpha** is here.\n**Beta** and **Alpha** appear again.\n';

    expect(buildBoldIndex(content)).toEqual([
      {
        term: 'Alpha',
        occurrences: [
          { term: 'Alpha', offset: 8, line: 2 },
          { term: 'Alpha', offset: 40, line: 3 }
        ]
      },
      {
        term: 'Beta',
        occurrences: [{ term: 'Beta', offset: 27, line: 3 }]
      }
    ]);
  });

  // Some bold markers may appear in fenced code blocks or inline code snippets.
  // These should be ignored, otherwise the index would report false positives from code examples.
  it('ignores bold terms inside code blocks and inline code', () => {
    const content = '**Visible**\n```\n**Ignored**\n```\n~~~\n**IgnoredToo**\n~~~\n`**Inline**`\n**AnotherVisible**\n';

    expect(buildBoldIndex(content).map((entry) => entry.term)).toEqual(['AnotherVisible', 'Visible']);
  });

  // If the file contains no markdown emphasis at all, the parser should return an empty index.
  it('returns an empty list when no bold text exists', () => {
    expect(buildBoldIndex('plain text without emphasis')).toEqual([]);
  });

  // Multiple matches on the same line should not create duplicate line references for the same term.
  // This keeps the UI cleaner and prevents repeated line numbers for a single bold phrase.
  it('keeps only the first occurrence per line for each term', () => {
    const content = '**Same** repeated **Same** on line one.\nAnother **Same** on another line.\n';

    expect(buildBoldIndex(content)).toEqual([
      {
        term: 'Same',
        occurrences: [
          { term: 'Same', offset: 0, line: 1 },
          { term: 'Same', offset: 48, line: 2 }
        ]
      }
    ]);
  });

  it('supports cumulative formatting modes across bold, italic, and highlight', () => {
    const content = '**Bold** and *Italic* and ==Highlight==\n**BoldTwo** and _ItalicTwo_ and ==HighlightTwo==\n';

    expect(buildBoldIndex(content, ['bold', 'italic', 'highlight'])).toEqual([
      {
        term: 'Bold',
        occurrences: [{ term: 'Bold', offset: 0, line: 1 }]
      },
      {
        term: 'BoldTwo',
        occurrences: [{ term: 'BoldTwo', offset: 40, line: 2 }]
      },
      {
        term: 'Highlight',
        occurrences: [{ term: 'Highlight', offset: 26, line: 1 }]
      },
      {
        term: 'HighlightTwo',
        occurrences: [{ term: 'HighlightTwo', offset: 72, line: 2 }]
      },
      {
        term: 'Italic',
        occurrences: [{ term: 'Italic', offset: 13, line: 1 }]
      },
      {
        term: 'ItalicTwo',
        occurrences: [{ term: 'ItalicTwo', offset: 56, line: 2 }]
      }
    ]);
  });

  // The parser should extract quoted text fragments between « and » and sort them alphabetically.
  // Duplicate quoted terms are merged under the same entry while keeping all matching positions.
  it('extracts quoted terms and keeps them sorted alphabetically', () => {
    const content = '# Notes\n«Alpha» is here.\n«Beta» and «Alpha» appear again.\n';

    expect(buildBoldIndex(content, ['quoted'])).toEqual([
      {
        term: 'Alpha',
        occurrences: [
          { term: 'Alpha', offset: 8, line: 2 },
          { term: 'Alpha', offset: 36, line: 3 }
        ]
      },
      {
        term: 'Beta',
        occurrences: [{ term: 'Beta', offset: 25, line: 3 }]
      }
    ]);
  });

  // Quoted text inside code blocks should be ignored to avoid false positives.
  it('ignores quoted terms inside code blocks and inline code', () => {
    const content = '«Visible»\n```\n«Ignored»\n```\n~~~\n«IgnoredToo»\n~~~\n`«Inline»`\n«AnotherVisible»\n';

    expect(buildBoldIndex(content, ['quoted']).map((entry) => entry.term)).toEqual(['AnotherVisible', 'Visible']);
  });

  // Multiple quoted terms on the same line should not create duplicate line references.
  it('keeps only the first quoted occurrence per line for each term', () => {
    const content = '«Same» repeated «Same» on line one.\nAnother «Same» on another line.\n';

    expect(buildBoldIndex(content, ['quoted'])).toEqual([
      {
        term: 'Same',
        occurrences: [
          { term: 'Same', offset: 0, line: 1 },
          { term: 'Same', offset: 44, line: 2 }
        ]
      }
    ]);
  });

  // The parser should support cumulative formatting modes including the new quoted mode.
  it('supports cumulative formatting modes across bold, italic, highlight, and quoted', () => {
    const content = '**Bold** and «Quoted» and ==Highlight==\n**BoldTwo** and «QuotedTwo» and _Italic_\n';

    expect(buildBoldIndex(content, ['bold', 'italic', 'highlight', 'quoted'])).toEqual([
      {
        term: 'Bold',
        occurrences: [{ term: 'Bold', offset: 0, line: 1 }]
      },
      {
        term: 'BoldTwo',
        occurrences: [{ term: 'BoldTwo', offset: 40, line: 2 }]
      },
      {
        term: 'Highlight',
        occurrences: [{ term: 'Highlight', offset: 26, line: 1 }]
      },
      {
        term: 'Italic',
        occurrences: [{ term: 'Italic', offset: 72, line: 2 }]
      },
      {
        term: 'Quoted',
        occurrences: [{ term: 'Quoted', offset: 13, line: 1 }]
      },
      {
        term: 'QuotedTwo',
        occurrences: [{ term: 'QuotedTwo', offset: 56, line: 2 }]
      }
    ]);
  });

  // Empty quoted fragments should not generate index entries.
  it('ignores empty quoted text', () => {
    const content = '«» and «Valid» and «» again.\n';

    expect(buildBoldIndex(content, ['quoted']).map((entry) => entry.term)).toEqual(['Valid']);
  });
});
