import { describe, expect, it } from 'vitest';
import { buildBoldIndex, FormatMode } from '../../src/domain/markdownIndex';

// Helper function to create test occurrences with modes array
const occurrence = (term: string, offset: number, line: number, ...modes: FormatMode[]) => ({
  term,
  offset,
  line,
  modes: modes.length > 0 ? modes : ['bold']
});

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
          occurrence('Same', 0, 1, 'bold'),
          occurrence('Same', 48, 2, 'bold')
        ]
      }
    ]);
  });

  it('supports cumulative formatting modes across bold, italic, and highlight', () => {
    const content = '**Bold** and *Italic* and ==Highlight==\n**BoldTwo** and _ItalicTwo_ and ==HighlightTwo==\n';

    expect(buildBoldIndex(content, ['bold', 'italic', 'highlight'])).toEqual([
      {
        term: 'Bold',
        occurrences: [occurrence('Bold', 0, 1, 'bold')]
      },
      {
        term: 'BoldTwo',
        occurrences: [occurrence('BoldTwo', 40, 2, 'bold')]
      },
      {
        term: 'Highlight',
        occurrences: [occurrence('Highlight', 26, 1, 'highlight')]
      },
      {
        term: 'HighlightTwo',
        occurrences: [occurrence('HighlightTwo', 72, 2, 'highlight')]
      },
      {
        term: 'Italic',
        occurrences: [occurrence('Italic', 13, 1, 'italic')]
      },
      {
        term: 'ItalicTwo',
        occurrences: [occurrence('ItalicTwo', 56, 2, 'italic')]
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
          occurrence('Alpha', 8, 2, 'quoted'),
          occurrence('Alpha', 36, 3, 'quoted')
        ]
      },
      {
        term: 'Beta',
        occurrences: [occurrence('Beta', 25, 3, 'quoted')]
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
          occurrence('Same', 0, 1, 'quoted'),
          occurrence('Same', 44, 2, 'quoted')
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
        occurrences: [occurrence('Bold', 0, 1, 'bold')]
      },
      {
        term: 'BoldTwo',
        occurrences: [occurrence('BoldTwo', 40, 2, 'bold')]
      },
      {
        term: 'Highlight',
        occurrences: [occurrence('Highlight', 26, 1, 'highlight')]
      },
      {
        term: 'Italic',
        occurrences: [occurrence('Italic', 72, 2, 'italic')]
      },
      {
        term: 'Quoted',
        occurrences: [occurrence('Quoted', 13, 1, 'quoted')]
      },
      {
        term: 'QuotedTwo',
        occurrences: [occurrence('QuotedTwo', 56, 2, 'quoted')]
      }
    ]);
  });

  // Nested formats such as italic + quoted must be detected on the full wrapped match, not only on the inner text.
  it('detects italic + quoted combinations when the italic markers wrap the quotation marks', () => {
    const content = '_« we built the sound track from that sound out. We built the music as we built the picture. »_';

    expect(buildBoldIndex(content, ['italic', 'quoted'])).toEqual([
      {
        term: 'we built the sound track from that sound out. We built the music as we built the picture.',
        occurrences: [occurrence(
          'we built the sound track from that sound out. We built the music as we built the picture.',
          0,
          1,
          'italic',
          'quoted'
        )]
      }
    ]);
  });

  // Empty quoted fragments should not generate index entries.
  it('ignores empty quoted text', () => {
    const content = '«» and «Valid» and «» again.\n';

    expect(buildBoldIndex(content, ['quoted']).map((entry) => entry.term)).toEqual(['Valid']);
  });
});
