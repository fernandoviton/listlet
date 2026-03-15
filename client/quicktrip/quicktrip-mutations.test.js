/**
 * Tests for QuickTripMutations - pure mutation functions for trip planning.
 *
 * The mutations module is browser IIFE code, so we eval it to get QuickTripMutations on globalThis.
 */

const fs = require('fs');
const path = require('path');

// Load the mutations IIFE into global scope
const mutationsCode = fs.readFileSync(path.join(__dirname, 'quicktrip-mutations.js'), 'utf-8');

const wrappedCode = mutationsCode.replace(
    'const QuickTripMutations = (function()',
    'global.QuickTripMutations = (function()'
);
eval(wrappedCode);

const m = global.QuickTripMutations;

// ============ createDefault ============

describe('createDefault', () => {
    test('returns empty doc structure', () => {
        expect(m.createDefault()).toEqual({
            title: '',
            participants: [],
            dates: []
        });
    });

    test('returns a deep clone each time', () => {
        const d1 = m.createDefault();
        d1.title = 'modified';
        d1.participants.push({ id: 'x', name: 'X' });

        const d2 = m.createDefault();
        expect(d2.title).toBe('');
        expect(d2.participants).toEqual([]);
    });
});

// ============ addParticipant ============

describe('addParticipant', () => {
    test('adds participant with generated id', () => {
        const doc = m.createDefault();
        const p = m.addParticipant(doc, 'Alice');
        expect(p.name).toBe('Alice');
        expect(p.id).toBeDefined();
        expect(typeof p.id).toBe('string');
        expect(p.id.length).toBeGreaterThan(0);
        expect(doc.participants).toContainEqual(p);
    });

    test('two participants get unique ids', () => {
        const doc = m.createDefault();
        const p1 = m.addParticipant(doc, 'Alice');
        const p2 = m.addParticipant(doc, 'Bob');
        expect(p1.id).not.toBe(p2.id);
        expect(doc.participants).toHaveLength(2);
    });

    test('trims whitespace from name', () => {
        const doc = m.createDefault();
        const p = m.addParticipant(doc, '  Alice  ');
        expect(p.name).toBe('Alice');
    });
});

// ============ removeParticipant ============

describe('removeParticipant', () => {
    test('removes participant and their dates', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        const bob = m.addParticipant(doc, 'Bob');
        m.addDate(doc, alice.id, '2026-07-01', 'available');
        m.addDate(doc, alice.id, '2026-07-02', 'blocked');
        m.addDate(doc, bob.id, '2026-07-01', 'available');

        m.removeParticipant(doc, alice.id);

        expect(doc.participants).toHaveLength(1);
        expect(doc.participants[0].id).toBe(bob.id);
        expect(doc.dates).toHaveLength(1);
        expect(doc.dates[0].participantId).toBe(bob.id);
    });

    test('no-op for non-existent participant', () => {
        const doc = m.createDefault();
        m.addParticipant(doc, 'Alice');
        m.removeParticipant(doc, 'nonexistent');
        expect(doc.participants).toHaveLength(1);
    });
});

// ============ addDate ============

describe('addDate', () => {
    test('adds a date entry with generated id', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        const d = m.addDate(doc, alice.id, '2026-07-01', 'available');
        expect(d.participantId).toBe(alice.id);
        expect(d.date).toBe('2026-07-01');
        expect(d.type).toBe('available');
        expect(d.id).toBeDefined();
        expect(doc.dates).toContainEqual(d);
    });

    test('throws if participant does not exist', () => {
        const doc = m.createDefault();
        expect(() => m.addDate(doc, 'nonexistent', '2026-07-01', 'available'))
            .toThrow('Participant not found');
    });

    test('throws for invalid type', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        expect(() => m.addDate(doc, alice.id, '2026-07-01', 'maybe'))
            .toThrow('Invalid date type');
    });
});

// ============ removeDate ============

describe('removeDate', () => {
    test('removes date by id', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        const d1 = m.addDate(doc, alice.id, '2026-07-01', 'available');
        const d2 = m.addDate(doc, alice.id, '2026-07-02', 'blocked');

        m.removeDate(doc, d1.id);
        expect(doc.dates).toHaveLength(1);
        expect(doc.dates[0].id).toBe(d2.id);
    });

    test('no-op for non-existent date id', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        m.addDate(doc, alice.id, '2026-07-01', 'available');
        m.removeDate(doc, 'nonexistent');
        expect(doc.dates).toHaveLength(1);
    });
});

// ============ cycleDateType ============

describe('cycleDateType', () => {
    test('available -> blocked', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        m.addDate(doc, alice.id, '2026-07-01', 'available');

        const result = m.cycleDateType(doc, alice.id, '2026-07-01');
        expect(result).toBe('blocked');
        expect(doc.dates).toHaveLength(1);
        expect(doc.dates[0].type).toBe('blocked');
    });

    test('blocked -> removed (date deleted)', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        m.addDate(doc, alice.id, '2026-07-01', 'blocked');

        const result = m.cycleDateType(doc, alice.id, '2026-07-01');
        expect(result).toBe(null);
        expect(doc.dates).toHaveLength(0);
    });

    test('unmarked -> available (adds new date)', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');

        const result = m.cycleDateType(doc, alice.id, '2026-07-01');
        expect(result).toBe('available');
        expect(doc.dates).toHaveLength(1);
        expect(doc.dates[0].type).toBe('available');
        expect(doc.dates[0].participantId).toBe(alice.id);
    });
});

// ============ getParticipantDates ============

describe('getParticipantDates', () => {
    test('returns dates for one participant', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        const bob = m.addParticipant(doc, 'Bob');
        m.addDate(doc, alice.id, '2026-07-01', 'available');
        m.addDate(doc, alice.id, '2026-07-02', 'blocked');
        m.addDate(doc, bob.id, '2026-07-01', 'available');

        const dates = m.getParticipantDates(doc, alice.id);
        expect(dates).toHaveLength(2);
        expect(dates.every(d => d.participantId === alice.id)).toBe(true);
    });

    test('returns empty for participant with no dates', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        expect(m.getParticipantDates(doc, alice.id)).toEqual([]);
    });

    test('returns dates sorted by date string', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        m.addDate(doc, alice.id, '2026-07-05', 'available');
        m.addDate(doc, alice.id, '2026-07-01', 'available');
        m.addDate(doc, alice.id, '2026-07-03', 'blocked');

        const dates = m.getParticipantDates(doc, alice.id);
        expect(dates.map(d => d.date)).toEqual(['2026-07-01', '2026-07-03', '2026-07-05']);
    });
});

// ============ groupIntoRanges ============

describe('groupIntoRanges', () => {
    test('groups consecutive same-type dates into ranges', () => {
        const dates = [
            { date: '2026-07-01', type: 'available' },
            { date: '2026-07-02', type: 'available' },
            { date: '2026-07-03', type: 'available' },
            { date: '2026-07-05', type: 'blocked' },
            { date: '2026-07-06', type: 'blocked' }
        ];

        const ranges = m.groupIntoRanges(dates);
        expect(ranges).toEqual([
            { start: '2026-07-01', end: '2026-07-03', type: 'available' },
            { start: '2026-07-05', end: '2026-07-06', type: 'blocked' }
        ]);
    });

    test('single date becomes a range with same start and end', () => {
        const dates = [{ date: '2026-07-01', type: 'available' }];
        const ranges = m.groupIntoRanges(dates);
        expect(ranges).toEqual([{ start: '2026-07-01', end: '2026-07-01', type: 'available' }]);
    });

    test('non-consecutive same-type dates are separate ranges', () => {
        const dates = [
            { date: '2026-07-01', type: 'available' },
            { date: '2026-07-03', type: 'available' }
        ];
        const ranges = m.groupIntoRanges(dates);
        expect(ranges).toHaveLength(2);
    });

    test('type change breaks the range even if consecutive', () => {
        const dates = [
            { date: '2026-07-01', type: 'available' },
            { date: '2026-07-02', type: 'blocked' },
            { date: '2026-07-03', type: 'available' }
        ];
        const ranges = m.groupIntoRanges(dates);
        expect(ranges).toHaveLength(3);
    });

    test('empty array returns empty', () => {
        expect(m.groupIntoRanges([])).toEqual([]);
    });
});

// ============ computeOverlap ============

describe('computeOverlap', () => {
    test('computes overlap map with participant names', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        const bob = m.addParticipant(doc, 'Bob');
        m.addDate(doc, alice.id, '2026-07-01', 'available');
        m.addDate(doc, bob.id, '2026-07-01', 'available');
        m.addDate(doc, alice.id, '2026-07-02', 'blocked');
        m.addDate(doc, bob.id, '2026-07-02', 'available');

        const overlap = m.computeOverlap(doc);

        expect(overlap.get('2026-07-01').available).toEqual(['Alice', 'Bob']);
        expect(overlap.get('2026-07-01').blocked).toEqual([]);
        expect(overlap.get('2026-07-02').available).toEqual(['Bob']);
        expect(overlap.get('2026-07-02').blocked).toEqual(['Alice']);
    });

    test('returns empty map for empty doc', () => {
        const doc = m.createDefault();
        const overlap = m.computeOverlap(doc);
        expect(overlap.size).toBe(0);
    });

    test('returns sorted keys', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        m.addDate(doc, alice.id, '2026-07-05', 'available');
        m.addDate(doc, alice.id, '2026-07-01', 'available');

        const overlap = m.computeOverlap(doc);
        const keys = Array.from(overlap.keys());
        expect(keys).toEqual(['2026-07-01', '2026-07-05']);
    });

    test('handles mixed available and blocked from different people on same date', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        const bob = m.addParticipant(doc, 'Bob');
        const charlie = m.addParticipant(doc, 'Charlie');
        m.addDate(doc, alice.id, '2026-07-01', 'available');
        m.addDate(doc, bob.id, '2026-07-01', 'blocked');
        m.addDate(doc, charlie.id, '2026-07-01', 'available');

        const overlap = m.computeOverlap(doc);
        expect(overlap.get('2026-07-01').available).toEqual(['Alice', 'Charlie']);
        expect(overlap.get('2026-07-01').blocked).toEqual(['Bob']);
    });
});

// ============ getMonthGrid ============

describe('getMonthGrid', () => {
    test('returns correct number of day cells for July 2026', () => {
        const doc = m.createDefault();
        const grid = m.getMonthGrid(doc, 2026, 6); // 0-indexed month (6 = July)

        // July 2026 has 31 days
        const dayCells = grid.filter(c => c.day !== null);
        expect(dayCells).toHaveLength(31);
    });

    test('pads with nulls for leading empty cells', () => {
        const doc = m.createDefault();
        const grid = m.getMonthGrid(doc, 2026, 6); // July 2026 starts on Wednesday

        // Wednesday = 3 leading nulls (Sun=0, Mon=1, Tue=2)
        expect(grid[0].day).toBe(null);
        expect(grid[1].day).toBe(null);
        expect(grid[2].day).toBe(null);
        expect(grid[3].day).toBe(1);
    });

    test('includes participant data for each day', () => {
        const doc = m.createDefault();
        const alice = m.addParticipant(doc, 'Alice');
        m.addDate(doc, alice.id, '2026-07-15', 'available');

        const grid = m.getMonthGrid(doc, 2026, 6);
        const day15 = grid.find(c => c.day === 15);

        expect(day15.available).toContain('Alice');
        expect(day15.blocked).toEqual([]);
    });

    test('day with no dates has empty arrays', () => {
        const doc = m.createDefault();
        m.addParticipant(doc, 'Alice');

        const grid = m.getMonthGrid(doc, 2026, 6);
        const day1 = grid.find(c => c.day === 1);

        expect(day1.available).toEqual([]);
        expect(day1.blocked).toEqual([]);
    });
});
