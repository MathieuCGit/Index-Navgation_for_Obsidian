import { ALL_FORMAT_MODES, BoldIndexEntry, filterBoldIndexEntries, FormatMode, ALL_SORT_MODES, SortMode, sortBoldIndexEntries } from '../domain/markdownIndex';

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
    ALL_FORMAT_MODES.forEach((mode) => {
      const label = mode === 'bold' ? 'B' : mode === 'italic' ? 'I' : mode === 'highlight' ? 'H' : '"';
      const title = mode === 'bold' ? 'Bold' : mode === 'italic' ? 'Italic' : mode === 'highlight' ? 'Highlight' : 'Quoted';
      const button = modeBar.createEl('button', {
        text: label,
        cls: 'mod-cta'
      });
      button.title = title;

      const isActive = selectedModes.includes(mode);
      button.setAttribute('aria-pressed', String(isActive));
      button.style.opacity = isActive ? '1' : '0.6';
      button.style.border = isActive ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';
      button.style.minWidth = '32px';
      button.style.width = '32px';
      button.style.height = '32px';
      button.style.padding = '0';
      button.style.fontWeight = mode === 'bold' ? '700' : '500';
      button.style.fontStyle = mode === 'italic' ? 'italic' : 'normal';
      button.style.backgroundColor = mode === 'highlight' && isActive ? 'var(--text-highlight-bg)' : undefined;
      button.style.color = mode === 'highlight' ? 'var(--text-normal)' : undefined;
      button.style.fontSize = '14px';

      modeButtons.set(mode, button);

      // Toggling a filter updates the active set of modes. If all filters were removed, the plugin
      // preserves a sensible default by re-enabling bold mode to avoid an empty and confusing index.
      button.addEventListener('click', () => {
        const currentModes = new Set(selectedModes);
        if (currentModes.has(mode)) {
          currentModes.delete(mode);
        } else {
          currentModes.add(mode);
        }

        const nextModes = [...currentModes];
        if (nextModes.length === 0) {
          nextModes.push('bold');
        }

        modeButtons.forEach((btn, key) => {
          const active = nextModes.includes(key);
          btn.setAttribute('aria-pressed', String(active));
          btn.style.opacity = active ? '1' : '0.6';
          btn.style.border = active ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';
        });

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
      // First filter entries based on the search query, then apply the selected sort mode.
      const filteredEntries = filterBoldIndexEntries(entries, query);
      const sortedEntries = sortBoldIndexEntries(filteredEntries, selectedSort);
      resultsContainer.empty();

      if (entries.length === 0) {
        this.renderEmpty(resultsContainer, 'Aucun mot formaté.');
        return;
      }

      if (filteredEntries.length === 0) {
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

        const term = item.createEl('span', { text: entry.term, cls: 'bold-index-term' });
        term.style.marginRight = '8px';

        const lines = item.createEl('span', { cls: 'bold-index-lines' });
        entry.occurrences.forEach((occurrence, index) => {
          const line = lines.createEl('span', {
            text: String(occurrence.line),
            cls: 'bold-index-line'
          });

          line.style.cursor = 'pointer';
          line.style.color = 'var(--text-accent)';
          line.style.textDecoration = 'underline';
          line.style.marginRight = '6px';

          // Each line number acts as a clickable anchor in the note. When selected, it jumps to the
          // exact text range matching the emphasis pattern in the editor, which makes the sidebar
          // behave more like a true navigation index than a simple list.
          line.addEventListener('click', (event: any) => {
            event.stopPropagation();
            const length = entry.term.length + 4;
            onNavigate(occurrence.offset, length);
          });

          if (index < entry.occurrences.length - 1) {
            const separator = lines.createEl('span', { text: ',' });
            separator.style.marginRight = '6px';
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
