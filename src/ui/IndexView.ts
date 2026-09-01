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
    container.createEl('h4', { text: title });

    // The controls are grouped in one compact toolbar so the sidebar uses space efficiently while
    // keeping both the format filters and export actions visible without requiring multiple rows.
    const toolbar = container.createEl('div', { cls: 'bold-index-toolbar' });
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.justifyContent = 'space-between';
    toolbar.style.gap = '6px';
    toolbar.style.marginBottom = '8px';

    // The mode toggles are cumulative: the user can enable or disable any combination of bold,
    // italic, and highlight. This is necessary because the parser supports multiple markdown
    // emphasis styles at the same time and the panel should reflect that behavior directly.
    const modeBar = toolbar.createEl('div', { cls: 'bold-index-mode-bar' });
    modeBar.style.display = 'flex';
    modeBar.style.gap = '6px';
    modeBar.style.flexWrap = 'wrap';

    const actionsBar = toolbar.createEl('div', { cls: 'bold-index-actions-bar' });
    actionsBar.style.display = 'flex';
    actionsBar.style.alignItems = 'center';
    actionsBar.style.gap = '6px';

    // These action buttons are intentionally compact because they are secondary controls compared to
    // the main filter toggles. Keeping them small leaves more space for the actual index list and the
    // search field while still making the export actions visible when needed.
    const exportButton = actionsBar.createEl('button', { text: 'Export' });
    exportButton.type = 'button';
    exportButton.title = 'Export to Markdown';
    exportButton.style.minWidth = '52px';
    exportButton.style.height = '28px';
    exportButton.style.padding = '0 8px';
    exportButton.addEventListener('click', () => onExport?.());

    const openExportButton = actionsBar.createEl('button', { text: 'Open' });
    openExportButton.type = 'button';
    openExportButton.title = 'Open exported file';
    openExportButton.style.minWidth = '52px';
    openExportButton.style.height = '28px';
    openExportButton.style.padding = '0 8px';
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
        cls: 'mod-cta'
      });
      button.title = title;

      // Visual indicators for the active state:
      // - Active: full opacity (1.0) with accent border
      // - Inactive: reduced opacity (0.6) with dimmed border
      const isActive = selectedModes.includes(mode);
      button.setAttribute('aria-pressed', String(isActive));
      button.style.opacity = isActive ? '1' : '0.6';
      button.style.border = isActive ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';
      button.style.minWidth = '32px';
      button.style.width = '32px';
      button.style.height = '32px';
      button.style.padding = '0';
      // Bold text gets heavier font weight, italic text gets italic style
      button.style.fontWeight = mode === 'bold' ? '700' : '500';
      button.style.fontStyle = mode === 'italic' ? 'italic' : 'normal';
      // Highlight button uses the theme's highlight background color when active
      button.style.backgroundColor = mode === 'highlight' && isActive ? 'var(--text-highlight-bg)' : undefined;
      button.style.color = mode === 'highlight' ? 'var(--text-normal)' : undefined;
      button.style.fontSize = '14px';

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
          // Active buttons are fully opaque with an accent border
          btn.style.opacity = active ? '1' : '0.6';
          // Inactive buttons are semi-transparent with a dimmed border
          btn.style.border = active ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';
        });

        // Notify the controller of the mode change so it can re-render the index with the new filters
        onModeChange?.(nextModes);
      });
    });

    // The sort menu allows users to change how the index entries are ordered.
    // This is placed after the format mode buttons (B, I, H) to keep related controls grouped together.
    // The sort button displays the current sort mode and opens a dropdown menu with all available options.
    const sortButtonContainer = modeBar.createEl('div', { cls: 'bold-index-sort-button-container' });
    sortButtonContainer.style.position = 'relative';
    sortButtonContainer.style.display = 'flex';
    sortButtonContainer.style.alignItems = 'center';

    const sortButton = sortButtonContainer.createEl('button', {
      text: selectedSort === 'alphabetical' ? 'A↓' : 'L↓',
      cls: 'mod-cta'
    });
    sortButton.type = 'button';
    sortButton.title = selectedSort === 'alphabetical' ? 'Sort: Alphabetical' : 'Sort: By Line';
    sortButton.style.minWidth = '32px';
    sortButton.style.width = '32px';
    sortButton.style.height = '32px';
    sortButton.style.padding = '0';
    sortButton.style.border = '1px solid var(--interactive-accent)';
    sortButton.style.fontSize = '14px';
    sortButton.style.fontWeight = '500';
    sortButton.style.zIndex = '1';

    // The dropdown menu is positioned absolutely relative to the sort button container.
    // It remains hidden until the user clicks the button, then is toggled on/off with each click.
    const sortMenu = sortButtonContainer.createEl('div', { cls: 'bold-index-sort-menu' });
    sortMenu.style.position = 'absolute';
    sortMenu.style.top = '100%';
    sortMenu.style.left = '0';
    sortMenu.style.marginTop = '4px';
    sortMenu.style.backgroundColor = 'var(--background-secondary)';
    sortMenu.style.border = '1px solid var(--background-modifier-border)';
    sortMenu.style.borderRadius = '4px';
    sortMenu.style.minWidth = '150px';
    sortMenu.style.zIndex = '1000';
    sortMenu.style.display = 'none';
    sortMenu.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';

    // Create menu items for each available sort mode.
    // Each item is selectable and the currently active mode is visually highlighted.
    const sortModeItems = new Map<SortMode, any>();

    ALL_SORT_MODES.forEach((mode) => {
      const label = mode === 'alphabetical' ? 'Alphabetical (A↓)' : 'By Line (L↓)';
      const item = sortMenu.createEl('div', { text: label, cls: 'bold-index-sort-menu-item' });
      item.style.padding = '8px 12px';
      item.style.cursor = 'pointer';
      item.style.fontSize = '13px';
      item.style.userSelect = 'none';

      // Highlight the currently selected sort mode.
      if (mode === selectedSort) {
        item.style.backgroundColor = 'var(--background-modifier-active)';
        item.style.color = 'var(--text-accent)';
      } else {
        item.style.backgroundColor = 'transparent';
        item.style.color = 'var(--text-normal)';
      }

      // Add hover effect for better UX.
      item.addEventListener('mouseenter', () => {
        if (mode !== selectedSort) {
          item.style.backgroundColor = 'var(--background-modifier-hover)';
        }
      });

      item.addEventListener('mouseleave', () => {
        if (mode !== selectedSort) {
          item.style.backgroundColor = 'transparent';
        }
      });

      // When a menu item is clicked, update the sort mode, refresh the UI, and close the menu.
      item.addEventListener('click', () => {
        // Update button text and title to reflect the new sort mode.
        sortButton.setText(mode === 'alphabetical' ? 'A↓' : 'L↓');
        sortButton.title = mode === 'alphabetical' ? 'Sort: Alphabetical' : 'Sort: By Line';

        // Update visual appearance of all menu items.
        sortModeItems.forEach((menuItem, key) => {
          if (key === mode) {
            menuItem.style.backgroundColor = 'var(--background-modifier-active)';
            menuItem.style.color = 'var(--text-accent)';
          } else {
            menuItem.style.backgroundColor = 'transparent';
            menuItem.style.color = 'var(--text-normal)';
          }
        });

        // Close the menu.
        sortMenu.style.display = 'none';

        // Trigger the callback to notify the controller of the sort mode change.
        onSortChange?.(mode);
      });

      sortModeItems.set(mode, item);
    });

    // Toggle the sort menu visibility when the sort button is clicked.
    sortButton.addEventListener('click', () => {
      const isVisible = sortMenu.style.display === 'block';
      sortMenu.style.display = isVisible ? 'none' : 'block';
    });

    // Close the sort menu when clicking outside of it (standard dropdown behavior).
    document.addEventListener('click', (event: any) => {
      if (!sortButtonContainer.contains(event.target)) {
        sortMenu.style.display = 'none';
      }
    });

    // The search box gives the user a quick way to narrow the index without rebuilding the full note.
    // It filters the list in real time using the underlying data already computed in the controller.
    const searchInput = container.createEl('input', {
      type: 'text',
      cls: 'bold-index-search-input',
      placeholder: 'Filtrer...'
    });
    searchInput.style.width = '100%';
    searchInput.style.boxSizing = 'border-box';
    searchInput.style.marginBottom = '8px';

    // The result container is kept separate so the code can rerender only the list when the query
    // changes instead of recreating a large part of the whole panel each time.
    const resultsContainer = container.createEl('div');

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
      list.style.listStyle = 'none';
      list.style.paddingLeft = '0';

      // Render each sorted and filtered entry with all its occurrences.
      sortedEntries.forEach((entry) => {
        const item = list.createEl('li');
        item.style.marginBottom = '6px';
        // Use flex layout to allow proper line wrapping of terms and line numbers
        item.style.display = 'flex';
        item.style.flexWrap = 'wrap';
        item.style.alignItems = 'flex-start';
        item.style.gap = '8px';

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
          if (mode === 'bold') {
            term.style.fontWeight = '700';
          } else if (mode === 'italic') {
            term.style.fontStyle = 'italic';
          } else if (mode === 'highlight') {
            hasHighlight = true;
          }
          // For 'quoted' mode, we keep the text normal (no special styling needed)
        }
        
        // Apply highlight styling if present
        if (hasHighlight) {
          term.style.backgroundColor = 'var(--text-highlight-bg)';
          term.style.padding = '0 2px';
        }
        
        // Allow term to wrap to next line if sidebar is narrow
        term.style.wordBreak = 'break-word';
        term.style.overflowWrap = 'break-word';

        // Line numbers container using flex with wrapping for responsive multi-line display.
        // This container dynamically wraps line numbers based on available sidebar width:
        // - When sidebar is wide: line numbers can fit on one line
        // - When sidebar is narrow: line numbers wrap to multiple lines
        // - Fully responsive without fixed widths or media queries
        const lines = item.createEl('div', { cls: 'bold-index-lines' });
        lines.style.display = 'flex';
        lines.style.flexWrap = 'wrap';
        lines.style.alignItems = 'center';
        lines.style.gap = '6px';
        lines.style.flex = '1';
        lines.style.minWidth = '0';

        entry.occurrences.forEach((occurrence, index) => {
          const line = lines.createEl('span', {
            text: String(occurrence.line),
            cls: 'bold-index-line'
          });

          line.style.cursor = 'pointer';
          line.style.color = 'var(--text-accent)';
          line.style.textDecoration = 'underline';
          line.style.whiteSpace = 'nowrap';

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
            separator.style.color = 'var(--text-normal)';
            separator.style.whiteSpace = 'nowrap';
            separator.style.lineHeight = '1';
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
