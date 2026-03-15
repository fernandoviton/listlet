// ===========================================
// QuickTrip UI
// ===========================================

const QuickTripUI = (function() {
    let api = null;
    let activeParticipantId = null;
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();

    const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // ===========================================
    // Init
    // ===========================================

    async function init(listName) {
        api = createApi(listName, CONFIG.API_BASE_QUICKTRIP);
        bindEvents();

        try {
            const data = await api.fetchTasks(QuickTripMutations.createDefault());
            QuickTripStore.setDoc(data);
            render();

            SwarmSpaceSync.init(api, function(serverData) {
                QuickTripStore.setDoc(serverData);
                render();
            });
        } catch (err) {
            if (err.code === 'NOT_FOUND') {
                // New trip - save default doc
                const defaultDoc = QuickTripMutations.createDefault();
                await api.saveTasks(function(d) {
                    Object.assign(d, defaultDoc);
                });
                QuickTripStore.setDoc(defaultDoc);
                render();

                SwarmSpaceSync.init(api, function(serverData) {
                    QuickTripStore.setDoc(serverData);
                    render();
                });
            } else {
                showError(err.message);
            }
        }
    }

    function showListSelector() {
        const container = document.querySelector('.container');
        container.innerHTML = `
            <header class="header"><h1>QuickTrip</h1></header>
            <div style="text-align:center; padding:40px 0;">
                <p style="color:#666; margin-bottom:20px;">Plan a trip with friends</p>
                <button class="btn btn-primary" id="newTripBtn">Create New Trip</button>
                <div style="margin-top:20px;">
                    <form id="openTripForm" style="display:flex; gap:8px; justify-content:center;">
                        <input type="text" class="input" id="tripIdInput" placeholder="Trip ID..." style="width:180px;">
                        <button type="submit" class="btn btn-secondary">Open</button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('newTripBtn').addEventListener('click', function() {
            const id = generateListId();
            window.location.href = '/quicktrip/?list=' + id;
        });
        document.getElementById('openTripForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const id = document.getElementById('tripIdInput').value.trim();
            if (id) window.location.href = '/quicktrip/?list=' + encodeURIComponent(id);
        });
    }

    // ===========================================
    // Event binding
    // ===========================================

    function bindEvents() {
        // Title
        document.getElementById('tripTitle').addEventListener('change', handleTitleChange);

        // Add participant
        document.getElementById('addParticipantBtn').addEventListener('click', function() {
            showModal('participantModal');
            document.getElementById('participantName').value = '';
            document.getElementById('participantName').focus();
        });
        document.getElementById('saveParticipantBtn').addEventListener('click', handleAddParticipant);
        document.getElementById('cancelParticipantBtn').addEventListener('click', function() {
            hideModal('participantModal');
        });
        document.getElementById('participantName').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') handleAddParticipant();
        });

        // Calendar nav
        document.getElementById('prevMonthBtn').addEventListener('click', function() {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar();
        });
        document.getElementById('nextMonthBtn').addEventListener('click', function() {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderCalendar();
        });

        // Modal overlay click-to-close
        document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) hideModal(overlay.id);
            });
        });
    }

    // ===========================================
    // Handlers
    // ===========================================

    async function handleTitleChange() {
        const title = document.getElementById('tripTitle').value.trim();
        showSaving();
        try {
            SwarmSpaceSync.resetActivity();
            const result = await api.patchItem('title', title);
            QuickTripStore.setDoc(result);
            render();
        } catch (err) {
            showError('Failed to update title');
        }
        hideSaving();
    }

    async function handleAddParticipant() {
        const name = document.getElementById('participantName').value.trim();
        if (!name) return;

        hideModal('participantModal');
        showSaving();

        try {
            SwarmSpaceSync.resetActivity();
            const participant = QuickTripMutations.addParticipant(
                QuickTripMutations.createDefault(), name
            );
            const result = await api.appendItem('participants', participant);
            QuickTripStore.setDoc(result);
            activeParticipantId = participant.id;
            render();
        } catch (err) {
            showError('Failed to add participant');
        }
        hideSaving();
    }

    async function handleRemoveParticipant(participantId) {
        showSaving();
        try {
            SwarmSpaceSync.resetActivity();

            // Remove participant via API
            await api.deleteItem('participants', participantId);

            // Clean up orphan dates via saveTasks
            const result = await api.saveTasks(function(doc) {
                doc.dates = (doc.dates || []).filter(function(d) {
                    return d.participantId !== participantId;
                });
            });

            QuickTripStore.setDoc(result);
            if (activeParticipantId === participantId) {
                activeParticipantId = null;
            }
            render();
        } catch (err) {
            showError('Failed to remove participant');
        }
        hideSaving();
    }

    async function handleCalendarClick(dateStr) {
        if (!activeParticipantId) return;

        const doc = QuickTripStore.getDoc();
        const existing = doc.dates.find(function(d) {
            return d.participantId === activeParticipantId && d.date === dateStr;
        });

        showSaving();
        SwarmSpaceSync.resetActivity();

        try {
            if (!existing) {
                // unmarked -> available
                const entry = {
                    id: Math.random().toString(36).substring(2, 10),
                    participantId: activeParticipantId,
                    date: dateStr,
                    type: 'available'
                };
                const result = await api.appendItem('dates', entry);
                QuickTripStore.setDoc(result);
            } else if (existing.type === 'available') {
                // available -> blocked (need saveTasks for type change)
                const result = await api.saveTasks(function(doc) {
                    var d = (doc.dates || []).find(function(x) { return x.id === existing.id; });
                    if (d) d.type = 'blocked';
                });
                QuickTripStore.setDoc(result);
            } else {
                // blocked -> remove
                const result = await api.deleteItem('dates', existing.id);
                QuickTripStore.setDoc(result);
            }
            render();
        } catch (err) {
            showError('Failed to update date');
        }
        hideSaving();
    }

    async function handleDeleteDateRange(dateIds) {
        showSaving();
        SwarmSpaceSync.resetActivity();

        try {
            let result;
            for (var i = 0; i < dateIds.length; i++) {
                result = await api.deleteItem('dates', dateIds[i]);
            }
            if (result) QuickTripStore.setDoc(result);
            render();
        } catch (err) {
            showError('Failed to delete dates');
        }
        hideSaving();
    }

    // ===========================================
    // Rendering
    // ===========================================

    function render() {
        renderTitle();
        renderParticipants();
        renderCalendar();
    }

    function renderTitle() {
        var doc = QuickTripStore.getDoc();
        var el = document.getElementById('tripTitle');
        if (el && document.activeElement !== el) {
            el.value = doc.title || '';
        }
        // Update page title
        document.title = (doc.title ? doc.title + ' - ' : '') + 'QuickTrip';
    }

    function renderParticipants() {
        var doc = QuickTripStore.getDoc();
        var container = document.getElementById('participantsContainer');

        if (doc.participants.length === 0) {
            container.innerHTML = '<div class="no-participant-hint">Add people to start planning</div>';
            return;
        }

        var html = '';

        // "All" card with aggregated dates
        var allDates = computeAllDates(doc);
        var allRanges = QuickTripStore.groupIntoRanges(allDates);
        html += '<div class="participant-card' + (activeParticipantId === null ? ' active' : '') +
            '" data-participant-id="__all__">';
        html += '<div class="participant-header">';
        html += '<span class="participant-name">All</span>';
        html += '</div>';
        if (allRanges.length > 0) {
            html += '<div class="participant-dates">';
            allRanges.forEach(function(r) {
                html += '<span class="date-pill ' + r.type + '" data-nav-date="' +
                    escapeHtml(r.start) + '">' + formatRange(r.start, r.end) + '</span>';
            });
            html += '</div>';
        }
        html += '</div>';

        // Individual participant cards
        doc.participants.forEach(function(p) {
            var dates = QuickTripStore.getParticipantDates(p.id);
            var ranges = QuickTripStore.groupIntoRanges(dates);

            html += '<div class="participant-card' + (p.id === activeParticipantId ? ' active' : '') +
                '" data-participant-id="' + escapeHtml(p.id) + '">';
            html += '<div class="participant-header">';
            html += '<span class="participant-name">' + escapeHtml(p.name) + '</span>';
            html += '<button class="participant-delete" data-delete-participant="' +
                escapeHtml(p.id) + '" title="Remove">&times;</button>';
            html += '</div>';

            if (ranges.length > 0) {
                html += '<div class="participant-dates">';
                ranges.forEach(function(r) {
                    var label = formatRange(r.start, r.end);
                    var rangeIds = dates.filter(function(d) {
                        return d.date >= r.start && d.date <= r.end && d.type === r.type;
                    }).map(function(d) { return d.id; });

                    html += '<span class="date-pill ' + r.type + '" data-nav-date="' +
                        escapeHtml(r.start) + '">' + label + '</span>';
                });
                html += '</div>';
            }

            html += '</div>';
        });

        container.innerHTML = html;

        // Bind card clicks for selection
        container.querySelectorAll('.participant-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (e.target.closest('.participant-delete') || e.target.closest('[data-nav-date]')) return;
                var id = card.getAttribute('data-participant-id');
                activeParticipantId = (id === '__all__') ? null : id;
                renderParticipants();
                renderCalendar();
            });
        });

        container.querySelectorAll('[data-delete-participant]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = btn.getAttribute('data-delete-participant');
                if (confirm('Remove this person and all their dates?')) {
                    handleRemoveParticipant(id);
                }
            });
        });

        container.querySelectorAll('[data-nav-date]').forEach(function(pill) {
            pill.addEventListener('click', function(e) {
                e.stopPropagation();
                var dateStr = pill.getAttribute('data-nav-date');
                var parts = dateStr.split('-');
                currentYear = parseInt(parts[0], 10);
                currentMonth = parseInt(parts[1], 10) - 1;
                renderCalendar();
            });
        });
    }

    function renderLegend(activeName) {
        var legend = document.getElementById('calendarLegend');
        if (activeName) {
            legend.innerHTML =
                '<div class="legend-item"><span class="legend-swatch all-available"></span><span class="cell-indicator available">&check;</span> Available</div>' +
                '<div class="legend-item"><span class="legend-swatch has-blocked"></span><span class="cell-indicator blocked">&times;</span> Blocked</div>';
        } else {
            legend.innerHTML =
                '<div class="legend-item"><span class="legend-swatch all-available"></span> All available</div>' +
                '<div class="legend-item"><span class="legend-swatch some-available"></span> Some available</div>' +
                '<div class="legend-item"><span class="legend-swatch has-blocked"></span><span class="cell-indicator blocked">&times;</span> Blocked</div>' +
                '<div class="legend-item legend-hint">Numbers show available/total</div>';
        }
    }

    function renderActiveIndicator() {
        var el = document.getElementById('activeIndicator');
        if (!activeParticipantId) {
            el.style.display = 'none';
            return;
        }
        var doc = QuickTripStore.getDoc();
        var p = doc.participants.find(function(x) { return x.id === activeParticipantId; });
        if (!p) { el.style.display = 'none'; return; }

        el.style.display = 'flex';
        el.innerHTML = 'Editing dates for <strong>' + escapeHtml(p.name) + '</strong>';
    }

    function renderCalendar() {
        var doc = QuickTripStore.getDoc();
        var grid = QuickTripStore.getMonthGrid(currentYear, currentMonth);
        var totalParticipants = doc.participants.length;

        document.getElementById('monthLabel').textContent =
            MONTH_NAMES[currentMonth] + ' ' + currentYear;

        var html = '';
        DOW_LABELS.forEach(function(d) {
            html += '<div class="calendar-dow">' + d + '</div>';
        });

        // When a participant is selected, find their name for filtering
        var activeName = null;
        if (activeParticipantId) {
            var activeP = doc.participants.find(function(x) { return x.id === activeParticipantId; });
            if (activeP) activeName = activeP.name;
        }

        grid.forEach(function(cell) {
            if (cell.day === null) {
                html += '<div class="calendar-cell empty"></div>';
                return;
            }

            // Filter to only the active participant's dates when one is selected
            var available = cell.available;
            var blocked = cell.blocked;
            if (activeName) {
                available = available.indexOf(activeName) !== -1 ? [activeName] : [];
                blocked = blocked.indexOf(activeName) !== -1 ? [activeName] : [];
            }

            var cls = 'calendar-cell';
            if (totalParticipants > 0 && (available.length > 0 || blocked.length > 0)) {
                if (activeName) {
                    // Single participant view: just available or blocked
                    if (blocked.length > 0) {
                        cls += ' has-blocked';
                    } else {
                        cls += ' all-available';
                    }
                } else {
                    if (blocked.length > 0) {
                        cls += ' has-blocked';
                    } else if (available.length === totalParticipants) {
                        cls += ' all-available';
                    } else if (available.length > 0) {
                        cls += ' some-available';
                    }
                }
            }

            // Status indicator
            var indicator = '';
            if (totalParticipants > 0 && (available.length > 0 || blocked.length > 0)) {
                if (blocked.length > 0) {
                    indicator = '<span class="cell-indicator blocked">&times;</span>';
                } else if (activeName) {
                    indicator = '<span class="cell-indicator available">&check;</span>';
                } else {
                    indicator = '<span class="cell-indicator available">' +
                        available.length + '/' + totalParticipants + '</span>';
                }
            }

            html += '<div class="' + cls + '" data-date="' + cell.dateStr + '">';
            html += '<span class="day-number">' + cell.day + '</span>';
            html += indicator;
            html += '</div>';
        });

        document.getElementById('calendarGrid').innerHTML = html;
        renderLegend(activeName);
        renderActiveIndicator();

        // Bind calendar cell clicks
        document.querySelectorAll('.calendar-cell[data-date]').forEach(function(cell) {
            cell.addEventListener('click', function() {
                handleCalendarClick(cell.getAttribute('data-date'));
            });

            // Tooltip on hover
            cell.addEventListener('mouseenter', function(e) {
                var dateStr = cell.getAttribute('data-date');
                showTooltip(e, dateStr);
            });
            cell.addEventListener('mouseleave', hideTooltip);
        });
    }

    // ===========================================
    // Tooltip
    // ===========================================

    function showTooltip(e, dateStr) {
        var overlap = QuickTripStore.computeOverlap();
        var data = overlap.get(dateStr);
        if (!data || (data.available.length === 0 && data.blocked.length === 0)) return;

        var tip = document.getElementById('calendarTooltip');
        var html = '<div class="tooltip-date">' + formatDateShort(dateStr) + '</div>';

        if (data.available.length > 0) {
            html += '<div class="tooltip-list tooltip-available">' +
                data.available.map(escapeHtml).join(', ') + '</div>';
        }
        if (data.blocked.length > 0) {
            html += '<div class="tooltip-list tooltip-blocked">' +
                data.blocked.map(function(n) { return escapeHtml(n) + ' (blocked)'; }).join(', ') +
                '</div>';
        }

        tip.innerHTML = html;
        tip.classList.add('visible');

        // Position
        var rect = e.target.getBoundingClientRect();
        tip.style.left = rect.left + 'px';
        tip.style.top = (rect.bottom + 6) + 'px';
    }

    function hideTooltip() {
        document.getElementById('calendarTooltip').classList.remove('visible');
    }

    // ===========================================
    // Helpers
    // ===========================================

    function computeAllDates(doc) {
        var overlap = QuickTripStore.computeOverlap();
        var totalParticipants = doc.participants.length;
        var result = [];
        overlap.forEach(function(data, dateStr) {
            if (data.blocked.length > 0) {
                result.push({ date: dateStr, type: 'blocked' });
            } else if (data.available.length === totalParticipants) {
                result.push({ date: dateStr, type: 'available' });
            }
        });
        return result;
    }

    function formatRange(start, end) {
        if (start === end) return formatDateShort(start);
        return formatDateShort(start) + ' - ' + formatDateShort(end);
    }

    function formatDateShort(dateStr) {
        var parts = dateStr.split('-');
        var m = parseInt(parts[1], 10);
        var d = parseInt(parts[2], 10);
        return MONTH_NAMES[m - 1].substring(0, 3) + ' ' + d;
    }

    function showModal(id) {
        document.getElementById(id).classList.add('visible');
    }

    function hideModal(id) {
        document.getElementById(id).classList.remove('visible');
    }

    function showSaving() {
        document.getElementById('savingIndicator').classList.add('visible');
    }

    function hideSaving() {
        document.getElementById('savingIndicator').classList.remove('visible');
    }

    function showError(msg) {
        var el = document.getElementById('errorDisplay');
        el.textContent = msg;
        el.classList.add('visible');
        setTimeout(function() { el.classList.remove('visible'); }, 4000);
    }

    function manualRefresh() {
        SwarmSpaceSync.manualRefresh();
    }

    return {
        init: init,
        showListSelector: showListSelector,
        manualRefresh: manualRefresh
    };
})();
