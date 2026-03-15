// ===========================================
// QuickTrip Store (State Container)
// ===========================================
// Holds the trip document and delegates to QuickTripMutations.
// ===========================================

const QuickTripStore = (function() {
    let doc = QuickTripMutations.createDefault();

    function getDoc() {
        return doc;
    }

    function setDoc(newDoc) {
        doc = newDoc || QuickTripMutations.createDefault();
    }

    function addParticipant(name) {
        return QuickTripMutations.addParticipant(doc, name);
    }

    function removeParticipant(id) {
        return QuickTripMutations.removeParticipant(doc, id);
    }

    function addDate(participantId, dateStr, type) {
        return QuickTripMutations.addDate(doc, participantId, dateStr, type);
    }

    function removeDate(dateId) {
        return QuickTripMutations.removeDate(doc, dateId);
    }

    function cycleDateType(participantId, dateStr) {
        return QuickTripMutations.cycleDateType(doc, participantId, dateStr);
    }

    function getParticipantDates(participantId) {
        return QuickTripMutations.getParticipantDates(doc, participantId);
    }

    function groupIntoRanges(dates) {
        return QuickTripMutations.groupIntoRanges(dates);
    }

    function computeOverlap() {
        return QuickTripMutations.computeOverlap(doc);
    }

    function getMonthGrid(year, month) {
        return QuickTripMutations.getMonthGrid(doc, year, month);
    }

    return {
        getDoc,
        setDoc,
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
