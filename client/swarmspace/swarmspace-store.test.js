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
        expect(result).toEqual({ resources: [], locations: [], names: [] });
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
});
