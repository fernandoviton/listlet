/**
 * Tests for SwarmSpaceStore.parseMarkdownImport and export/import roundtrip.
 *
 * The store is browser IIFE code, so we eval it to get SwarmSpaceStore on globalThis.
 */

const fs = require('fs');
const path = require('path');

// Load the store IIFE into global scope
// The file uses `const SwarmSpaceStore = ...` which doesn't attach to global,
// so we wrap it to capture the result.
const storeCode = fs.readFileSync(path.join(__dirname, 'swarmspace-store.js'), 'utf-8');

// Provide escapeHtml (used by exportMarkdown)
global.escapeHtml = (s) => s;

// Replace `const SwarmSpaceStore` with assignment to global
const wrappedCode = storeCode.replace(
    'const SwarmSpaceStore = (function()',
    'global.SwarmSpaceStore = (function()'
);
eval(wrappedCode);

const store = global.SwarmSpaceStore;

// ============ parseMarkdownImport ============

describe('parseMarkdownImport', () => {
    test('parses ungrouped names', () => {
        const md = `## Names

- **Alice**: The leader
- Bob
`;
        const result = store.parseMarkdownImport(md);
        expect(result.names).toEqual([
            { name: 'Alice', description: 'The leader' },
            { name: 'Bob', description: '' }
        ]);
    });

    test('parses grouped names under ### headers', () => {
        const md = `## Names

### Villagers

- **Alice**: The leader
- Bob

### Outsiders

- **Charlie**: A wanderer
`;
        const result = store.parseMarkdownImport(md);
        expect(result.names).toEqual([
            { name: 'Alice', description: 'The leader', group: 'Villagers' },
            { name: 'Bob', description: '', group: 'Villagers' },
            { name: 'Charlie', description: 'A wanderer', group: 'Outsiders' }
        ]);
    });

    test('parses mix of ungrouped and grouped names', () => {
        const md = `## Names

- **Solo**: No group

### Team Alpha

- **Alpha1**: First
- Alpha2
`;
        const result = store.parseMarkdownImport(md);
        expect(result.names).toEqual([
            { name: 'Solo', description: 'No group' },
            { name: 'Alpha1', description: 'First', group: 'Team Alpha' },
            { name: 'Alpha2', description: '', group: 'Team Alpha' }
        ]);
    });

    test('names section is not truncated by a following h2 section', () => {
        const md = `## Names

### Group A

- **Name1**: Desc1

## Projects

- Some project (Week 1 → Week 3) ...
`;
        const result = store.parseMarkdownImport(md);
        expect(result.names).toEqual([
            { name: 'Name1', description: 'Desc1', group: 'Group A' }
        ]);
    });

    test('parses scarcities and abundances', () => {
        const md = `## Scarcities

- Water
- Food

## Abundances

- Stone
`;
        const result = store.parseMarkdownImport(md);
        expect(result.resources).toEqual([
            { name: 'Water', status: 'scarce' },
            { name: 'Food', status: 'scarce' },
            { name: 'Stone', status: 'abundant' }
        ]);
    });

    test('parses locations table', () => {
        const md = `## Locations

| Location | Distance | Notes |
|----------|----------|-------|
| Village | 2 days | Friendly |
| Cave | - | - |
`;
        const result = store.parseMarkdownImport(md);
        expect(result.locations).toEqual([
            { name: 'Village', distance: '2 days', notes: 'Friendly' },
            { name: 'Cave', distance: '', notes: '' }
        ]);
    });

    test('returns empty arrays when no sections found', () => {
        const result = store.parseMarkdownImport('# Just a title\n\nSome text.');
        expect(result).toEqual({ resources: [], locations: [], names: [], unfinishedProjects: [] });
    });

    test('parses unfinished projects with remaining duration', () => {
        const md = `## Weekly Log

### Week 1

- **Event:** Something

### Week 5

- **Event:** Latest

## Projects

- Walls (Week 2 → Week 7) ...
- Bridge (Week 1 → Week 3) ✓
- Aqueduct (Week 4 → Week 10) ...
`;
        const result = store.parseMarkdownImport(md);
        // Only unfinished projects (not Bridge which is ✓)
        expect(result.unfinishedProjects).toHaveLength(2);
        expect(result.unfinishedProjects[0]).toEqual({
            name: 'Walls', startWeek: 2, completionWeek: 7, remaining: 2  // 7 - 5
        });
        expect(result.unfinishedProjects[1]).toEqual({
            name: 'Aqueduct', startWeek: 4, completionWeek: 10, remaining: 5  // 10 - 5
        });
    });

    test('remaining is clamped to at least 1', () => {
        const md = `## Weekly Log

### Week 5

- **Event:** Latest

## Projects

- Overdue (Week 1 → Week 3) ...
`;
        const result = store.parseMarkdownImport(md);
        expect(result.unfinishedProjects).toHaveLength(1);
        // 3 - 5 = -2, clamped to 1
        expect(result.unfinishedProjects[0].remaining).toBe(1);
    });

    test('handles projects with unknown week numbers', () => {
        const md = `## Projects

- Mystery (? → ?) ...
`;
        const result = store.parseMarkdownImport(md);
        expect(result.unfinishedProjects).toHaveLength(1);
        expect(result.unfinishedProjects[0]).toEqual({
            name: 'Mystery', startWeek: null, completionWeek: null, remaining: null
        });
    });

    test('no projects section returns empty array', () => {
        const md = `## Names

- Alice
`;
        const result = store.parseMarkdownImport(md);
        expect(result.unfinishedProjects).toEqual([]);
    });
});

// ============ export → import roundtrip ============

describe('export/import roundtrip', () => {
    beforeEach(() => {
        store.setSession(null);
    });

    test('grouped names survive export then import', () => {
        // Set up session with grouped names
        store.upsertName(null, 'Alice', 'The leader');
        store.upsertName(null, 'Bob', '');

        // Manually set groups (upsertName doesn't take group param)
        const session = store.getSession();
        session.names[0].group = 'Villagers';
        session.names[1].group = 'Villagers';
        store.upsertName(null, 'Charlie', 'A wanderer');
        session.names[2].group = 'Outsiders';

        // Export
        const md = store.exportMarkdown();

        // Import back
        const parsed = store.parseMarkdownImport(md);

        expect(parsed.names).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Alice', description: 'The leader', group: 'Villagers' }),
                expect.objectContaining({ name: 'Bob', description: '', group: 'Villagers' }),
                expect.objectContaining({ name: 'Charlie', description: 'A wanderer', group: 'Outsiders' })
            ])
        );
        expect(parsed.names).toHaveLength(3);
    });

    test('resources survive export then import', () => {
        store.upsertResource(null, 'Water', 'scarce');
        store.upsertResource(null, 'Stone', 'abundant');

        const md = store.exportMarkdown();
        const parsed = store.parseMarkdownImport(md);

        expect(parsed.resources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Water', status: 'scarce' }),
                expect.objectContaining({ name: 'Stone', status: 'abundant' })
            ])
        );
    });

    test('locations survive export then import', () => {
        store.upsertLocation(null, 'Village', '2 days', 'Friendly');
        store.upsertLocation(null, 'Cave', '', '');

        const md = store.exportMarkdown();
        const parsed = store.parseMarkdownImport(md);

        expect(parsed.locations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Village', distance: '2 days', notes: 'Friendly' }),
                expect.objectContaining({ name: 'Cave' })
            ])
        );
    });

    test('unfinished projects survive export then import with correct remaining', () => {
        // Create 5 weeks
        for (let i = 0; i < 5; i++) store.addWeek();
        const session = store.getSession();

        // Start a project in week 2 with duration 5 (completes week 7)
        store.startProject(session.weeks[1].id, 'Walls', 5);
        // Start a project in week 3 with duration 2 (completes week 5) - will be "done"
        store.startProject(session.weeks[2].id, 'Bridge', 2);

        // Add a comment to Bridge's completion to mark it as truly completed
        const updatedSession = store.getSession();
        const week5 = updatedSession.weeks.find(w => w.weekNumber === 5);
        const bridgeCompletion = week5.completions.find(c => c.projectName === 'Bridge');
        store.addComment(week5.id, `completion:${bridgeCompletion.id}`, 'Built successfully');

        // Set current week to 5
        store.setCurrentWeek(updatedSession.weeks.find(w => w.weekNumber === 5).id);

        const md = store.exportMarkdown();
        const parsed = store.parseMarkdownImport(md);

        // Bridge is completed (has comments), should not appear
        // Walls is unfinished, completion at week 7, last week is 7 (weeks were created up to 7)
        // remaining = 7 - 7 = 0, clamped to 1
        expect(parsed.unfinishedProjects).toHaveLength(1);
        expect(parsed.unfinishedProjects[0].name).toBe('Walls');
        expect(parsed.unfinishedProjects[0].remaining).toBeGreaterThanOrEqual(1);
    });
});
