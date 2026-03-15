// ===========================================
// QuickTrip Mutation Functions (Pure/Functional)
// ===========================================
// Pure functions that operate on a trip document.
// Used by both the store and tests.
// ===========================================

const QuickTripMutations = (function() {

    function generateId() {
        return Math.random().toString(36).substring(2, 10);
    }

    function createDefault() {
        return { title: '', participants: [], dates: [] };
    }

    function addParticipant(doc, name) {
        const participant = { id: generateId(), name: name.trim() };
        doc.participants.push(participant);
        return participant;
    }

    function removeParticipant(doc, participantId) {
        const idx = doc.participants.findIndex(p => p.id === participantId);
        if (idx === -1) return;
        doc.participants.splice(idx, 1);
        doc.dates = doc.dates.filter(d => d.participantId !== participantId);
    }

    function addDate(doc, participantId, dateStr, type) {
        if (!doc.participants.some(p => p.id === participantId)) {
            throw new Error('Participant not found');
        }
        if (type !== 'available' && type !== 'blocked') {
            throw new Error('Invalid date type');
        }
        const entry = { id: generateId(), participantId, date: dateStr, type };
        doc.dates.push(entry);
        return entry;
    }

    function removeDate(doc, dateId) {
        const idx = doc.dates.findIndex(d => d.id === dateId);
        if (idx !== -1) doc.dates.splice(idx, 1);
    }

    /**
     * Cycle date type for a participant on a specific date.
     * unmarked -> available -> blocked -> removed (null)
     * Returns the new type or null if removed.
     */
    function cycleDateType(doc, participantId, dateStr) {
        const existing = doc.dates.find(
            d => d.participantId === participantId && d.date === dateStr
        );

        if (!existing) {
            // unmarked -> available
            addDate(doc, participantId, dateStr, 'available');
            return 'available';
        }

        if (existing.type === 'available') {
            existing.type = 'blocked';
            return 'blocked';
        }

        // blocked -> removed
        removeDate(doc, existing.id);
        return null;
    }

    function getParticipantDates(doc, participantId) {
        return doc.dates
            .filter(d => d.participantId === participantId)
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Group sorted dates into consecutive same-type ranges.
     * Input: sorted array of { date, type }
     * Output: [{ start, end, type }]
     */
    function groupIntoRanges(dates) {
        if (dates.length === 0) return [];

        const ranges = [];
        let current = { start: dates[0].date, end: dates[0].date, type: dates[0].type };

        for (let i = 1; i < dates.length; i++) {
            const d = dates[i];
            const prevDate = new Date(current.end + 'T00:00:00');
            const nextDate = new Date(d.date + 'T00:00:00');
            const diffDays = (nextDate - prevDate) / (1000 * 60 * 60 * 24);

            if (d.type === current.type && diffDays === 1) {
                current.end = d.date;
            } else {
                ranges.push(current);
                current = { start: d.date, end: d.date, type: d.type };
            }
        }
        ranges.push(current);
        return ranges;
    }

    /**
     * Compute overlap: Map<dateStr, { available: [names], blocked: [names] }>
     */
    function computeOverlap(doc) {
        const nameMap = new Map();
        doc.participants.forEach(p => nameMap.set(p.id, p.name));

        const map = new Map();
        doc.dates.forEach(d => {
            if (!map.has(d.date)) {
                map.set(d.date, { available: [], blocked: [] });
            }
            const entry = map.get(d.date);
            const name = nameMap.get(d.participantId) || d.participantId;
            if (d.type === 'available') {
                entry.available.push(name);
            } else if (d.type === 'blocked') {
                entry.blocked.push(name);
            }
        });

        // Return sorted by date
        const sorted = new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
        return sorted;
    }

    /**
     * Build a month grid for calendar rendering.
     * month is 0-indexed (0 = January).
     * Returns array of cells: { day: number|null, dateStr, available: [names], blocked: [names] }
     */
    function getMonthGrid(doc, year, month) {
        const overlap = computeOverlap(doc);
        const firstDay = new Date(year, month, 1);
        const startDow = firstDay.getDay(); // 0=Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells = [];

        // Leading empty cells
        for (let i = 0; i < startDow; i++) {
            cells.push({ day: null, dateStr: null, available: [], blocked: [] });
        }

        // Day cells
        for (let d = 1; d <= daysInMonth; d++) {
            const mm = String(month + 1).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            const dateStr = `${year}-${mm}-${dd}`;
            const data = overlap.get(dateStr) || { available: [], blocked: [] };
            cells.push({
                day: d,
                dateStr,
                available: data.available,
                blocked: data.blocked
            });
        }

        return cells;
    }

    return {
        createDefault,
        addParticipant,
        removeParticipant,
        addDate,
        removeDate,
        cycleDateType,
        getParticipantDates,
        groupIntoRanges,
        computeOverlap,
        getMonthGrid
    };
})();
