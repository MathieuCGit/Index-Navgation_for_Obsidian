import { ALL_FORMAT_MODES, BoldIndexEntry, filterBoldIndexEntries, filterByFormattingModes, FormatMode, ALL_SORT_MODES, SortMode, sortBoldIndexEntries } from '../domain/markdownIndex';

// This callback is invoked when the user clicks one of the line numbers displayed next to a term.
// The offset is the exact position in the markdown document, and the length is used to select the
// matching emphasized fragment in the editor so the user lands exactly on the relevant text.
export type NavigationCallback = (offset: number, length: number) => void;

// This callback is triggered whenever the user toggles one of the format filters in the sidebar.
// It allows the parent controller to refresh the index using the newly selected emphasis modes.
export type IndexModeChangeCallback = (modes: FormatMode[]) => void;

// This callback is triggered whenever the user changes the sorting order of the index entries.
// It allows the parent controller to persist the selected sort mode and refresh the display.
export type IndexSortChangeCallback = (sortMode: SortMode) => void;

// This class is responsible for all rendering work inside the custom Obsidian view.
// It creates the filter buttons, the search box, the empty state, and the clickable list of terms
// that are extracted from the current note. It keeps the DOM logic separate from the parsing logic,
// which makes the code far easier to reason about and test.
export class IndexView {
  constructor(private readonly app: any) {}

  // Displays a friendly message when there is no active file or when the current note does not
  // contain any matches for the selected emphasis modes. This keeps the sidebar explicit instead of
  // leaving the user with a blank panel.
  renderEmpty(container: any, message: string): void {
    container.empty();
    container.createEl('p', { text: message, cls: 'pane-empty' });
  }

  // Renders the full sidebar interface for the current note.
  // The panel begins with the note title, then the export button, then the mode filters, the sort menu,
  // then the live search input and the result list. We pass callbacks to keep the UI decoupled from the
  // controller and avoid hard-coding the actual navigation logic directly in the DOM layer.
  render(
    container: any,
    title: string,
    entries: BoldIndexEntry[],
    onNavigate: NavigationCallback,
    selectedModes: FormatMode[] = ['bold'],
    onModeChange?: IndexModeChangeCallback,
    onExport?: () => void,
    onOpenExport?: () => void,
    selectedSort: SortMode = 'alphabetical',
    onSortChange?: IndexSortChangeCallback
  ): void {
    container.empty();
    // The root class keeps all layout rules in the stylesheet and leaves this method responsible
    // only for constructing the view and coordinating its interactions.
    container.classList.add('bold-index-view');

    container.createEl('h4', { text: title });

    // The controls are grouped in one compact toolbar so the sidebar uses space efficiently while
    // keeping both the format filters and export actions visible without requiring multiple rows.
    const toolbar = container.createEl('div', { cls: 'bold-index-toolbar' });

    // The mode toggles are cumulative: the user can enable or disable any combination of bold,
    // italic, and highlight. This is necessary because the parser supports multiple markdown
    // emphasis styles at the same time and the panel should reflect that behavior directly.
    const modeBar = toolbar.createEl('div', { cls: 'bold-index-mode-bar' });

    const actionsBar = toolbar.createEl('div', { cls: 'bold-index-actions-bar' });

    // These action buttons are intentionally compact because they are secondary controls compared to
    // the main filter toggles. Keeping them small leaves more space for the actual index list and the
    // search field while still making the export actions visible when needed.
    const exportButton = actionsBar.createEl('button', { text: 'Export', cls: 'bold-index-action-button' });
    exportButton.type = 'button';
    exportButton.title = 'Export to Markdown';
    exportButton.addEventListener('click', () => onExport?.());

    const openExportButton = actionsBar.createEl('button', { text: 'Open', cls: 'bold-index-action-button' });
    openExportButton.type = 'button';
    openExportButton.title = 'Open exported file';
    openExportButton.addEventListener('click', () => onOpenExport?.());

    const modeButtons = new Map<FormatMode, any>();

    // The format buttons are reduced to single-letter icons to match the compact visual language of
    // editing tools while still keeping the exact semantic meaning visible through the tooltip.
    // Icons: B = Bold, I = Italic, H = Highlight, " = Quoted text between « and »
    ALL_FORMAT_MODES.forEach((mode) => {
      const label = mode === 'bold' ? 'B' : mode === 'italic' ? 'I' : mode === 'highlight' ? 'H' : '"';
      const title = mode === 'bold' ? 'Bold' : mode === 'italic' ? 'Italic' : mode === 'highlight' ? 'Highlight' : 'Quoted';
      const button = modeBar.createEl('button', {
        text: label,
        cls: `mod-cta bold-index-mode-button bold-index-mode-${mode}`
      });
      button.title = title;

      // Visual indicators for the active state:
      // - Active: full opacity (1.0) with accent border
      // - Inactive: reduced opacity (0.6) with dimmed border
      const isActive = selectedModes.includes(mode);
      button.setAttribute('aria-pressed', String(isActive));
      // CSS owns the visual representation of the state, allowing the same markup to adapt to
      // light and dark Obsidian themes without inline style assignments.
      button.classList.toggle('is-active', isActive);

      modeButtons.set(mode, button);

      // Filter selection behavior mimics file explorers for familiarity:
      // - Regular click: Makes this filter the ONLY active filter (exclusive single-select mode)
      // - Ctrl+Click (Windows/Linux) or Cmd+Click (macOS): Toggles this filter while keeping others selected
      //
      // Example scenarios:
      // 1. User selects B, I, H → clicks on B → only B is selected
      // 2. User selects only B → Ctrl+clicks on H → both B and H are selected
      // 3. User selects B and H → Ctrl+clicks on B → only H remains selected
      // 4. User selects only B → Ctrl+clicks on B → system default: reverts to B (prevents empty selection)
      //
      // This UX pattern is consistent with:
      // - Windows Explorer file selection
      // - macOS Finder file selection
      // - Linux file managers (Nautilus, Dolphin, Thunar)
      button.addEventListener('click', (event: MouseEvent) => {
        // Determine if user is holding a modifier key for multi-select
        // event.ctrlKey: Windows/Linux Ctrl key
        // event.metaKey: macOS Cmd key (⌘)
        const isMultiSelect = event.ctrlKey || event.metaKey;

        let nextModes: FormatMode[];

        if (isMultiSelect) {
          // MULTI-SELECT MODE (Ctrl/Cmd+Click):
          // Toggle the clicked mode while preserving the state of all other modes.
          // This allows users to build complex filter combinations.
          const currentModes = new Set(selectedModes);
          
          if (currentModes.has(mode)) {
            // Mode is already active → remove it
            currentModes.delete(mode);
          } else {
            // Mode is inactive → add it
            currentModes.add(mode);
          }

          nextModes = [...currentModes];
          
          // Safety mechanism: if user removes all filters, default back to bold.
          // This prevents a confusing empty state and ensures the index always shows something.
          if (nextModes.length === 0) {
            nextModes.push('bold');
          }
        } else {
          // SINGLE-SELECT MODE (Regular Click):
          // Make this mode the ONLY active filter. This is the default, intuitive behavior.
          // All other filters are deactivated, providing a clean focus on one filter type.
          nextModes = [mode];
        }

        // Update visual appearance of all filter buttons to reflect the new selection state.
        // This creates immediate visual feedback so users see their selection changes instantly.
        modeButtons.forEach((btn, key) => {
          const active = nextModes.includes(key);
          btn.setAttribute('aria-pressed', String(active));
          // Keep the ARIA state and the CSS state synchronized after every selection change.
          btn.classList.toggle('is-active', active);
        });

        // Notify the controller of the mode change so it can re-render the index with the new filters
        onModeChange?.(nextModes);
      });
    });

    // The sort menu allows users to change how the index entries are ordered.
    // This is placed after the format mode buttons (B, I, H) to keep related controls grouped together.
    // The sort button displays the current sort mode and opens a dropdown menu with all available options.
    const sortButtonContainer = modeBar.createEl('div', { cls: 'bold-index-sort-button-container' });

    const sortButton = sortButtonContainer.createEl('button', {
      text: selectedSort === 'alphabetical' ? 'A↓' : 'L↓',
      cls: 'mod-cta bold-index-sort-button'
    });
    sortButton.type = 'button';
    sortButton.title = selectedSort === 'alphabetical' ? 'Sort: Alphabetical' : 'Sort: By Line';

    // The dropdown menu is positioned absolutely relative to the sort button container.
    // It remains hidden until the user clicks the button, then is toggled on/off with each click.
    const sortMenu = sortButtonContainer.createEl('div', { cls: 'bold-index-sort-menu' });

    // Create menu items for each available sort mode.
    // Each item is selectable and the currently active mode is visually highlighted.
    const sortModeItems = new Map<SortMode, any>();

    ALL_SORT_MODES.forEach((mode) => {
      const label = mode === 'alphabetical' ? 'Alphabetical (A↓)' : 'By Line (L↓)';
      const item = sortMenu.createEl('div', { text: label, cls: 'bold-index-sort-menu-item' });

      // Highlight the currently selected sort mode.
      if (mode === selectedSort) {
        item.classList.add('is-active');
      }

      // Add hover effect for better UX.
      item.addEventListener('mouseenter', () => {
        item.classList.add('is-hovered');
      });

      item.addEventListener('mouseleave', () => {
        item.classList.remove('is-hovered');
      });

      // When a menu item is clicked, update the sort mode, refresh the UI, and close the menu.
      item.addEventListener('click', () => {
        // Update button text and title to reflect the new sort mode.
        sortButton.setText(mode === 'alphabetical' ? 'A↓' : 'L↓');
        sortButton.title = mode === 'alphabetical' ? 'Sort: Alphabetical' : 'Sort: By Line';

        // Update visual appearance of all menu items.
        sortModeItems.forEach((menuItem, key) => {
          // The selected item keeps its active class after the menu is refreshed; all other items
          // return to the neutral state and receive hover feedback only while pointed at.
          if (key === mode) {
            menuItem.classList.add('is-active');
          } else {
            menuItem.classList.remove('is-active');
          }
        });

        // Close the menu.
        sortMenu.classList.remove('is-visible');

        // Trigger the callback to notify the controller of the sort mode change.
        onSortChange?.(mode);
      });

      sortModeItems.set(mode, item);
    });

    // Toggle the sort menu visibility when the sort button is clicked.
    sortButton.addEventListener('click', () => {
      // A class toggle keeps visibility declarative and avoids mutating the element's style object.
      sortMenu.classList.toggle('is-visible');
    });

    // Close the sort menu when clicking outside of it (standard dropdown behavior).
    document.addEventListener('click', (event: any) => {
      if (!sortButtonContainer.contains(event.target)) {
        sortMenu.classList.remove('is-visible');
      }
    });

    // The search box gives the user a quick way to narrow the index without rebuilding the full note.
    // It filters the list in real time using the underlying data already computed in the controller.
    const searchInput = container.createEl('input', {
      type: 'text',
      cls: 'bold-index-search-input',
      placeholder: 'Filtrer...'
    });

    // The result container is kept separate so the code can rerender only the list when the query
    // changes instead of recreating a large part of the whole panel each time.
    // We keep the controls fixed at the top and let only this scrollable area move, which makes the
    // sidebar easier to browse when the result list becomes long.
    const resultsContainer = container.createEl('div', { cls: 'bold-index-results' });

    const renderEntries = (query: string): void => {
      // First filter entries by selected modes (AND logic for combined formatting).
      // Then filter by search query, and finally apply the selected sort mode.
      const modeFilteredEntries = filterByFormattingModes(entries, selectedModes);
      const queryFilteredEntries = filterBoldIndexEntries(modeFilteredEntries, query);
      const sortedEntries = sortBoldIndexEntries(queryFilteredEntries, selectedSort);
      resultsContainer.empty();

      if (entries.length === 0) {
        this.renderEmpty(resultsContainer, 'Aucun mot formaté.');
        return;
      }

      if (sortedEntries.length === 0) {
        this.renderEmpty(resultsContainer, 'Aucun résultat.');
        return;
      }

      const list = resultsContainer.createEl('ul', { cls: 'bold-index-list' });

      // Render each sorted and filtered entry with all its occurrences.
      sortedEntries.forEach((entry) => {
        const item = list.createEl('li', { cls: 'bold-index-item' });

        const term = item.createEl('span', { text: entry.term, cls: 'bold-index-term' });
        // Determine the formatting styles based on the modes of the first occurrence.
        // Multiple modes can apply (e.g., italic+quoted for _«text»_), so we apply all of them.
        const firstModes = entry.occurrences[0]?.modes ?? ['bold'];
        
        // Apply visual formatting that matches the markdown semantics:
        // - bold mode: bold text (fontWeight)
        // - italic mode: italic text (fontStyle)
        // - highlight mode: background highlight color
        // - quoted mode: normal text (quotation marks are usually implied by the extraction)
        // When multiple modes apply, we combine their visual effects.
        let hasHighlight = false;
        
        for (const mode of firstModes) {
          // Formatting modes are additive: separate classes preserve combinations such as bold plus
          // italic, while quoted text intentionally keeps the normal text appearance.
          if (mode === 'bold') {
            term.classList.add('bold-index-term-bold');
          } else if (mode === 'italic') {
            term.classList.add('bold-index-term-italic');
          } else if (mode === 'highlight') {
            hasHighlight = true;
          }
          // For 'quoted' mode, we keep the text normal (no special styling needed)
        }
        
        // Apply highlight styling if present
        if (hasHighlight) {
          term.classList.add('bold-index-term-highlight');
        }
        
        // Allow term to wrap to next line if sidebar is narrow

        // Line numbers container using flex with wrapping for responsive multi-line display.
        // This container dynamically wraps line numbers based on available sidebar width:
        // - When sidebar is wide: line numbers can fit on one line
        // - When sidebar is narrow: line numbers wrap to multiple lines
        // - Fully responsive without fixed widths or media queries
        const lines = item.createEl('div', { cls: 'bold-index-lines' });

        entry.occurrences.forEach((occurrence, index) => {
          const line = lines.createEl('span', {
            text: String(occurrence.line),
            cls: 'bold-index-line'
          });


          // Each line number acts as a clickable anchor in the note. When selected, it jumps to the
          // exact text range matching the emphasis pattern in the editor, which makes the sidebar
          // behave more like a true navigation index than a simple list.
          line.addEventListener('click', (event: any) => {
            event.stopPropagation();
            const length = entry.term.length + 4;
            onNavigate(occurrence.offset, length);
          });

          // Add separator commas between line numbers (but not after the last one)
          if (index < entry.occurrences.length - 1) {
            const separator = lines.createEl('span', { text: ',' });
            separator.classList.add('bold-index-line-separator');
          }
        });
      });
    };

    // The live filter is updated on every keystroke so the user sees the list narrow in real time
    // without needing to reload or re-open the panel.
    searchInput.addEventListener('input', (event: any) => {
      renderEntries(event.target.value ?? '');
    });

    renderEntries('');
  }
}
