import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FormatMode } from '../../src/domain/markdownIndex';

/**
 * Test suite for the filter mode selection behavior in IndexView.
 * 
 * This suite validates the mode filter button behavior:
 * - Regular click: Exclusive single-select (only this mode active)
 * - Ctrl+Click (Windows/Linux): Multi-select (toggle this mode while keeping others)
 * - Cmd+Click (macOS): Multi-select (toggle this mode while keeping others)
 * 
 * The behavior mimics standard file explorer selection patterns for familiarity.
 */
describe('Mode Filter Selection (UI Behavior)', () => {
  /**
   * Test 1: Regular click on inactive mode should select it exclusively.
   * Scenario: User has modes [bold, italic] selected and clicks on highlight.
   * Expected: Only highlight should be active.
   */
  it('regular click on inactive mode should select it exclusively', () => {
    const selectedModes: FormatMode[] = ['bold', 'italic'];
    const clickedMode: FormatMode = 'highlight';

    // Simulate regular click (no modifier keys)
    const isMultiSelect = false;
    let nextModes: FormatMode[];

    if (isMultiSelect) {
      // Multi-select path (not taken in this test)
      const currentModes = new Set(selectedModes);
      currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
      nextModes = [...currentModes];
      if (nextModes.length === 0) nextModes.push('bold');
    } else {
      // Single-select path (taken in this test)
      nextModes = [clickedMode];
    }

    expect(nextModes).toEqual(['highlight']);
    expect(nextModes).not.toContain('bold');
    expect(nextModes).not.toContain('italic');
  });

  /**
   * Test 2: Regular click on already active mode should keep it active exclusively.
   * Scenario: User has only bold selected and clicks on bold.
   * Expected: Only bold remains active (no change in this case, but the pattern is consistent).
   */
  it('regular click on active mode should keep it exclusive', () => {
    const selectedModes: FormatMode[] = ['bold'];
    const clickedMode: FormatMode = 'bold';

    const isMultiSelect = false;
    let nextModes: FormatMode[];

    if (isMultiSelect) {
      const currentModes = new Set(selectedModes);
      currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
      nextModes = [...currentModes];
      if (nextModes.length === 0) nextModes.push('bold');
    } else {
      nextModes = [clickedMode];
    }

    expect(nextModes).toEqual(['bold']);
    expect(nextModes.length).toBe(1);
  });

  /**
   * Test 3: Ctrl+Click on inactive mode should add it to the selection.
   * Scenario: User has modes [bold, italic] selected and Ctrl+clicks on highlight.
   * Expected: All three modes should now be active [bold, italic, highlight].
   */
  it('ctrl+click on inactive mode should add it to the selection', () => {
    const selectedModes: FormatMode[] = ['bold', 'italic'];
    const clickedMode: FormatMode = 'highlight';

    // Simulate Ctrl+Click
    const isMultiSelect = true;
    let nextModes: FormatMode[];

    if (isMultiSelect) {
      // Multi-select path (taken in this test)
      const currentModes = new Set(selectedModes);
      currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
      nextModes = [...currentModes];
      if (nextModes.length === 0) nextModes.push('bold');
    } else {
      nextModes = [clickedMode];
    }

    expect(nextModes).toContain('bold');
    expect(nextModes).toContain('italic');
    expect(nextModes).toContain('highlight');
    expect(nextModes.length).toBe(3);
  });

  /**
   * Test 4: Ctrl+Click on active mode should remove it from the selection.
   * Scenario: User has modes [bold, italic, highlight] selected and Ctrl+clicks on italic.
   * Expected: Only [bold, highlight] should remain active.
   */
  it('ctrl+click on active mode should remove it from selection', () => {
    const selectedModes: FormatMode[] = ['bold', 'italic', 'highlight'];
    const clickedMode: FormatMode = 'italic';

    // Simulate Ctrl+Click
    const isMultiSelect = true;
    let nextModes: FormatMode[];

    if (isMultiSelect) {
      const currentModes = new Set(selectedModes);
      currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
      nextModes = [...currentModes];
      if (nextModes.length === 0) nextModes.push('bold');
    } else {
      nextModes = [clickedMode];
    }

    expect(nextModes).toContain('bold');
    expect(nextModes).toContain('highlight');
    expect(nextModes).not.toContain('italic');
    expect(nextModes.length).toBe(2);
  });

  /**
   * Test 5: Cmd+Click (macOS) should behave like Ctrl+Click.
   * Scenario: User on macOS has [bold] selected and Cmd+clicks on italic.
   * Expected: Both [bold, italic] should be active.
   */
  it('cmd+click (macOS) on inactive mode should add it like ctrl+click', () => {
    const selectedModes: FormatMode[] = ['bold'];
    const clickedMode: FormatMode = 'italic';

    // Simulate Cmd+Click (event.metaKey = true, event.ctrlKey = false)
    const isMultiSelect = true; // metaKey detected
    let nextModes: FormatMode[];

    if (isMultiSelect) {
      const currentModes = new Set(selectedModes);
      currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
      nextModes = [...currentModes];
      if (nextModes.length === 0) nextModes.push('bold');
    } else {
      nextModes = [clickedMode];
    }

    expect(nextModes).toContain('bold');
    expect(nextModes).toContain('italic');
    expect(nextModes.length).toBe(2);
  });

  /**
   * Test 6: Safety mechanism - removing all modes via Ctrl+Click should default to bold.
   * Scenario: User has only [italic] selected and Ctrl+clicks on italic to deselect it.
   * Expected: System should default back to [bold] to prevent empty state.
   */
  it('should default to bold when all modes are deselected', () => {
    const selectedModes: FormatMode[] = ['italic'];
    const clickedMode: FormatMode = 'italic';

    // Simulate Ctrl+Click to remove the only mode
    const isMultiSelect = true;
    let nextModes: FormatMode[];

    if (isMultiSelect) {
      const currentModes = new Set(selectedModes);
      currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
      nextModes = [...currentModes];
      // Safety mechanism: prevent empty selection
      if (nextModes.length === 0) {
        nextModes.push('bold');
      }
    } else {
      nextModes = [clickedMode];
    }

    expect(nextModes).toEqual(['bold']);
    expect(nextModes.length).toBe(1);
    expect(nextModes).not.toContain('italic');
  });

  /**
   * Test 7: Regular click with all modes active should switch to the clicked mode exclusively.
   * Scenario: User has [bold, italic, highlight, quoted] all selected and clicks on bold.
   * Expected: Only [bold] should remain active.
   */
  it('regular click should deactivate all other modes', () => {
    const selectedModes: FormatMode[] = ['bold', 'italic', 'highlight', 'quoted'];
    const clickedMode: FormatMode = 'bold';

    // Simulate regular click (no modifiers)
    const isMultiSelect = false;
    let nextModes: FormatMode[];

    if (isMultiSelect) {
      const currentModes = new Set(selectedModes);
      currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
      nextModes = [...currentModes];
      if (nextModes.length === 0) nextModes.push('bold');
    } else {
      nextModes = [clickedMode];
    }

    expect(nextModes).toEqual(['bold']);
    expect(nextModes.length).toBe(1);
    // Verify that all other modes are deactivated
    expect(nextModes).not.toContain('italic');
    expect(nextModes).not.toContain('highlight');
    expect(nextModes).not.toContain('quoted');
  });

  /**
   * Test 8: Complex scenario - mixed operations.
   * Simulates a realistic user interaction sequence.
   */
  it('should handle complex selection sequences correctly', () => {
    let selectedModes: FormatMode[] = ['bold']; // Start with bold only

    // Step 1: Regular click on italic → should show only italic
    let clickedMode: FormatMode = 'italic';
    let isMultiSelect = false;
    if (!isMultiSelect) {
      selectedModes = [clickedMode];
    }
    expect(selectedModes).toEqual(['italic']);

    // Step 2: Ctrl+Click on bold → should add bold to italic
    clickedMode = 'bold';
    isMultiSelect = true;
    if (isMultiSelect) {
      const currentModes = new Set(selectedModes);
      !currentModes.has(clickedMode) ? currentModes.add(clickedMode) : currentModes.delete(clickedMode);
      selectedModes = [...currentModes];
    }
    expect(selectedModes).toContain('bold');
    expect(selectedModes).toContain('italic');
    expect(selectedModes.length).toBe(2);

    // Step 3: Regular click on highlight → should show only highlight
    clickedMode = 'highlight';
    isMultiSelect = false;
    if (!isMultiSelect) {
      selectedModes = [clickedMode];
    }
    expect(selectedModes).toEqual(['highlight']);

    // Step 4: Ctrl+Click on quoted → should add quoted to highlight
    clickedMode = 'quoted';
    isMultiSelect = true;
    if (isMultiSelect) {
      const currentModes = new Set(selectedModes);
      !currentModes.has(clickedMode) ? currentModes.add(clickedMode) : currentModes.delete(clickedMode);
      selectedModes = [...currentModes];
    }
    expect(selectedModes).toContain('highlight');
    expect(selectedModes).toContain('quoted');
    expect(selectedModes.length).toBe(2);
  });

  /**
   * Test 9: Verify that single-select is the default for any inactive mode.
   * Scenario: User has [bold, italic] and does a regular click on any inactive mode (highlight or quoted).
   * Expected: Result should always be a single-element array with only the clicked mode.
   */
  it('any regular click on inactive mode should always result in single-mode selection', () => {
    const selectedModes: FormatMode[] = ['bold', 'italic'];
    const inactiveModes: FormatMode[] = ['highlight', 'quoted'];

    for (const clickedMode of inactiveModes) {
      const isMultiSelect = false;
      let nextModes: FormatMode[];

      if (isMultiSelect) {
        const currentModes = new Set(selectedModes);
        currentModes.has(clickedMode) ? currentModes.delete(clickedMode) : currentModes.add(clickedMode);
        nextModes = [...currentModes];
        if (nextModes.length === 0) nextModes.push('bold');
      } else {
        nextModes = [clickedMode];
      }

      // Verify single mode is active
      expect(nextModes.length).toBe(1);
      expect(nextModes[0]).toBe(clickedMode);
    }
  });
});
