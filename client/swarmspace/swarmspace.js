// Swarm Space RPG Session Tracker UI

const SwarmSpaceUI = (function() {
    // State
    let api = null;
    let isSaving = false;
    let saveTimeout = null;

    // Modal state
    let currentCommentTarget = null; // { weekId, target: 'event'|'action'|'completion:id' }
    let currentProjectWeekId = null;
    let currentCompletionWeekId = null;
    let editingResourceId = null;
    let currentResourceStatus = null; // 'scarce' or 'abundant'
    let editingLocationId = null;
    let editingNameId = null;

    // DOM elements
    let savingIndicator;

    /**
     * Initialize the UI
     */
    async function init(listName) {
        api = createApi(listName);

        // Cache common elements
        savingIndicator = document.getElementById('savingIndicator');

        // Set up event listeners
        setupEventListeners();

        // Load session data
        await loadSession();
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Session metadata
        document.getElementById('sessionTitle').addEventListener('input', debounce(handleMetaChange, 500));
        document.getElementById('sessionSetting').addEventListener('input', debounce(handleMetaChange, 500));
        document.getElementById('startingWeek').addEventListener('input', debounce(handleStartingWeekChange, 500));

        // Add week button
        document.getElementById('addWeekBtn').addEventListener('click', handleAddWeek);

        // Export button
        document.getElementById('exportBtn').addEventListener('click', handleExport);

        // Comment modal
        document.getElementById('cancelCommentBtn').addEventListener('click', () => closeModal('commentModal'));
        document.getElementById('saveCommentBtn').addEventListener('click', handleSaveComment);
        document.getElementById('commentText').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveComment();
            }
        });
        document.getElementById('commentModal').addEventListener('click', (e) => {
            if (e.target.id === 'commentModal') closeModal('commentModal');
        });

        // Project modal
        document.getElementById('cancelProjectBtn').addEventListener('click', () => closeModal('projectModal'));
        document.getElementById('saveProjectBtn').addEventListener('click', handleSaveProject);
        document.getElementById('projectModal').addEventListener('click', (e) => {
            if (e.target.id === 'projectModal') closeModal('projectModal');
        });

        // Completion modal
        document.getElementById('cancelCompletionBtn').addEventListener('click', () => closeModal('completionModal'));
        document.getElementById('saveCompletionBtn').addEventListener('click', handleSaveCompletion);
        document.getElementById('completionName').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveCompletion();
            }
        });
        document.getElementById('completionModal').addEventListener('click', (e) => {
            if (e.target.id === 'completionModal') closeModal('completionModal');
        });

        // Resource modal (scarcities and abundances)
        document.getElementById('addScarcityBtn').addEventListener('click', () => openResourceModal('scarce'));
        document.getElementById('addAbundanceBtn').addEventListener('click', () => openResourceModal('abundant'));
        document.getElementById('cancelResourceBtn').addEventListener('click', () => closeModal('resourceModal'));
        document.getElementById('saveResourceBtn').addEventListener('click', handleSaveResource);
        document.getElementById('resourceName').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveResource();
            }
        });
        document.getElementById('resourceModal').addEventListener('click', (e) => {
            if (e.target.id === 'resourceModal') closeModal('resourceModal');
        });

        // Resource summaries (delegation)
        document.getElementById('scarcitiesSummary').addEventListener('click', handleResourcesClick);
        document.getElementById('abundancesSummary').addEventListener('click', handleResourcesClick);

        // Location modal
        document.getElementById('addLocationBtn').addEventListener('click', () => openLocationModal());
        document.getElementById('cancelLocationBtn').addEventListener('click', () => closeModal('locationModal'));
        document.getElementById('saveLocationBtn').addEventListener('click', handleSaveLocation);
        document.getElementById('locationModal').addEventListener('click', (e) => {
            if (e.target.id === 'locationModal') closeModal('locationModal');
        });

        // Export modal
        document.getElementById('closeExportBtn').addEventListener('click', () => closeModal('exportModal'));
        document.getElementById('copyExportBtn').addEventListener('click', handleCopyExport);
        document.getElementById('exportModal').addEventListener('click', (e) => {
            if (e.target.id === 'exportModal') closeModal('exportModal');
        });

        // Weeks container (delegation)
        document.getElementById('weeksContainer').addEventListener('click', handleWeeksClick);
        document.getElementById('weeksContainer').addEventListener('input', handleWeeksInput);

        // Name modal
        document.getElementById('addNameBtn').addEventListener('click', () => openNameModal());
        document.getElementById('cancelNameBtn').addEventListener('click', () => closeModal('nameModal'));
        document.getElementById('saveNameBtn').addEventListener('click', handleSaveName);
        document.getElementById('nameValue').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveName();
            }
        });
        document.getElementById('nameModal').addEventListener('click', (e) => {
            if (e.target.id === 'nameModal') closeModal('nameModal');
        });

        // Import modal
        document.getElementById('importPreviousBtn').addEventListener('click', () => {
            document.getElementById('importInput').value = '';
            openModal('importModal');
        });
        document.getElementById('cancelImportBtn').addEventListener('click', () => closeModal('importModal'));
        document.getElementById('doImportBtn').addEventListener('click', handleImport);
        document.getElementById('importModal').addEventListener('click', (e) => {
            if (e.target.id === 'importModal') closeModal('importModal');
        });

        // Summary panels (delegation)
        document.getElementById('projectsSummary').addEventListener('click', handleProjectsClick);
        document.getElementById('locationsSummary').addEventListener('click', handleLocationsClick);
        document.getElementById('namesSummary').addEventListener('click', handleNamesClick);
    }

    /**
     * Load session data from API/localStorage
     */
    async function loadSession() {
        try {
            const data = await api.fetchTasks(null);
            SwarmSpaceStore.setSession(data);
            renderAll();
        } catch (error) {
            console.log('No existing session, starting fresh');
            SwarmSpaceStore.setSession(null);
            renderAll();
        }
    }

    /**
     * Save session data
     */
    async function saveSession() {
        if (isSaving) return;

        isSaving = true;
        savingIndicator.classList.add('visible');

        try {
            const session = SwarmSpaceStore.getSession();
            if (api.isMock) {
                localStorage.setItem(`mockTasks_${api.listName}`, JSON.stringify(session));
            } else {
                await fetch(`${CONFIG.API_BASE}/${api.listName}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(session)
                });
            }
        } catch (error) {
            console.error('Save error:', error);
        } finally {
            isSaving = false;
            setTimeout(() => savingIndicator.classList.remove('visible'), 300);
        }
    }

    /**
     * Debounced save
     */
    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveSession, 500);
    }

    // ============ RENDER FUNCTIONS ============

    /**
     * Render everything
     */
    function renderAll() {
        const session = SwarmSpaceStore.getSession();

        // Metadata
        document.getElementById('sessionTitle').value = session.title || '';
        document.getElementById('sessionSetting').value = session.setting || '';
        document.getElementById('startingWeek').value = session.startingWeek || 1;

        // Weeks
        renderWeeks();

        // Summaries
        renderProjectsSummary();
        renderResourcesSummary();
        renderLocationsSummary();
        renderNamesSummary();
    }

    /**
     * Get IDs of currently expanded weeks
     */
    function getExpandedWeekIds() {
        return Array.from(document.querySelectorAll('.week-section:not(.collapsed)')).map(el => el.dataset.weekId);
    }

    /**
     * Render weeks timeline
     * @param {string|string[]|null} expandWeekIds - ID(s) of week(s) to leave expanded (null = collapse all)
     */
    function renderWeeks(expandWeekIds = null) {
        const session = SwarmSpaceStore.getSession();
        const container = document.getElementById('weeksContainer');

        if (session.weeks.length === 0) {
            container.innerHTML = '<div class="empty-state">No weeks yet. Click "Add Week" to start tracking your session.</div>';
            return;
        }

        // Get explicitly set current week
        const currentWeekId = SwarmSpaceStore.getCurrentWeekId();
        const currentWeekIndex = session.weeks.findIndex(w => w.id === currentWeekId);

        // Normalize to array
        const expandSet = new Set(Array.isArray(expandWeekIds) ? expandWeekIds : (expandWeekIds ? [expandWeekIds] : []));

        container.innerHTML = session.weeks.map((week, index) => {
            const isCurrent = week.id === currentWeekId;
            const isBeforeCurrent = currentWeekIndex >= 0 && index < currentWeekIndex;
            return renderWeek(week, !expandSet.has(week.id), isCurrent, isBeforeCurrent);
        }).join('');
    }

    /**
     * Re-render weeks preserving current expand/collapse state
     */
    function rerenderWeeksPreserveState() {
        renderWeeks(getExpandedWeekIds());
    }

    /**
     * Render a single week
     */
    function renderWeek(week, collapsed = false, isCurrent = false, isBeforeCurrent = false) {
        // Weeks before current are considered complete
        const isComplete = isBeforeCurrent;
        const statusClass = isComplete ? 'week-complete' : (isCurrent ? 'week-current' : '');
        const statusLabel = isComplete ? ' ✓' : '';
        const currentLabel = isCurrent ? '<span class="current-label">Current</span>' : '';
        const makeCurrentBtn = !isCurrent ? '<button class="make-current-btn" data-action="make-current">Make Current</button>' : '';

        return `
            <div class="week-section${collapsed ? ' collapsed' : ''} ${statusClass}" data-week-id="${week.id}">
                <div class="week-header">
                    <span class="week-title">
                        <span class="week-toggle">▼</span>
                        Week ${week.weekNumber}${statusLabel}
                        ${currentLabel}
                    </span>
                    <div class="week-header-actions">
                        ${makeCurrentBtn}
                    </div>
                </div>
                <div class="week-content">
                    ${renderEvent(week)}
                    ${renderCompletions(week)}
                    ${renderAction(week)}
                </div>
            </div>
        `;
    }

    /**
     * Render completions for a week
     */
    function renderCompletions(week) {
        const completionsHtml = (week.completions || []).map(comp => `
            <div class="entry-block completion-block" data-completion-id="${comp.id}">
                <div class="entry-header">
                    <span class="entry-type completion">✓ Completed: ${escapeHtml(comp.projectName)}</span>
                    <button class="entry-action-btn" data-action="delete-completion" title="Delete">×</button>
                </div>
                <div class="entry-body">
                    ${renderComments(week.id, `completion:${comp.id}`, comp.comments || [])}
                </div>
            </div>
        `).join('');

        return `
            ${completionsHtml}
            <button class="add-completion-btn" data-action="add-completion">+ Add Completion</button>
        `;
    }

    /**
     * Render event block
     */
    function renderEvent(week) {
        return `
            <div class="entry-block">
                <div class="entry-header">
                    <span class="entry-type event">Event (Card Draw)</span>
                </div>
                <div class="entry-body">
                    <textarea class="entry-text" data-field="event" placeholder="Paste the card text here...">${escapeHtml(week.event.text || '')}</textarea>
                    ${renderComments(week.id, 'event', week.event.comments)}
                </div>
            </div>
        `;
    }

    /**
     * Render action block
     */
    function renderAction(week) {
        const types = ['discussion', 'discovery', 'project'];
        const typeButtons = types.map(t =>
            `<button class="action-type-btn ${t} ${week.action.type === t ? 'active' : ''}" data-action-type="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
        ).join('');

        // Project-specific UI
        let projectUI = '';
        if (week.action.type === 'project') {
            if (week.action.projectName) {
                const duration = week.action.projectDuration || '?';
                projectUI = `
                    <div class="project-name-display">
                        <span class="project-name-label">Project:</span>
                        <span class="project-name-value">${escapeHtml(week.action.projectName)}</span>
                        <span class="project-duration">(${duration} week${duration !== 1 ? 's' : ''})</span>
                        <button class="project-change-btn" data-action="start-project" title="Change project">✎</button>
                    </div>
                `;
            } else {
                projectUI = `
                    <div class="project-info">
                        <button class="entry-action-btn" data-action="start-project">Set up project...</button>
                    </div>
                `;
            }
        }

        return `
            <div class="entry-block">
                <div class="entry-header">
                    <span class="entry-type ${week.action.type}">Action</span>
                </div>
                <div class="entry-body">
                    <div class="action-type-selector">${typeButtons}</div>
                    ${projectUI}
                    ${renderComments(week.id, 'action', week.action.comments)}
                </div>
            </div>
        `;
    }

    /**
     * Render comments section
     */
    function renderComments(weekId, target, comments) {
        const commentsHtml = comments.map(c => `
            <div class="comment" data-comment-id="${c.id}">
                <span class="comment-text">${escapeHtml(c.text)}</span>
                <button class="comment-delete" data-action="delete-comment" data-target="${target}">×</button>
            </div>
        `).join('');

        return `
            <div class="comments-section">
                ${commentsHtml}
                <button class="add-comment-btn" data-action="add-comment" data-target="${target}">+ Add Comment</button>
            </div>
        `;
    }

    /**
     * Render projects summary - derived from project starts and completions
     */
    function renderProjectsSummary() {
        const session = SwarmSpaceStore.getSession();
        const container = document.getElementById('projectsSummary');

        // Collect project starts (from actions with type='project' and projectName)
        const starts = new Map(); // name -> { startWeek }
        session.weeks.forEach(week => {
            if (week.action.type === 'project' && week.action.projectName) {
                const name = week.action.projectName.toLowerCase();
                starts.set(name, {
                    name: week.action.projectName,
                    startWeek: week.weekNumber
                });
            }
        });

        // Collect completions
        const completions = new Map(); // name -> { completionWeek, hasComments }
        session.weeks.forEach(week => {
            (week.completions || []).forEach(comp => {
                const name = comp.projectName.toLowerCase();
                completions.set(name, {
                    name: comp.projectName,
                    completionWeek: week.weekNumber,
                    hasComments: !!(comp.comments && comp.comments.length > 0)
                });
            });
        });

        // Merge into unified project list
        const allNames = new Set([...starts.keys(), ...completions.keys()]);
        const projects = [];

        allNames.forEach(nameLower => {
            const start = starts.get(nameLower);
            const completion = completions.get(nameLower);

            const displayName = start?.name || completion?.name;
            const startWeek = start?.startWeek || null;
            const completionWeek = completion?.completionWeek || null;

            let status = 'active';
            if (completion?.hasComments) {
                status = 'completed';
            }

            projects.push({
                name: displayName,
                startWeek,
                completionWeek,
                status
            });
        });

        if (projects.length === 0) {
            container.innerHTML = '<div class="empty-state">No projects yet</div>';
            return;
        }

        // Sort: active first, then by start week or completion week
        projects.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
            const aWeek = a.startWeek || a.completionWeek || 0;
            const bWeek = b.startWeek || b.completionWeek || 0;
            return aWeek - bWeek;
        });

        container.innerHTML = projects.map(p => {
            const startLabel = p.startWeek ? `Week ${p.startWeek}` : '?';
            const endLabel = p.completionWeek ? `Week ${p.completionWeek}` : '?';
            return `
                <div class="summary-item">
                    <div>
                        <div class="summary-item-name">${escapeHtml(p.name)}</div>
                        <div class="summary-item-detail">${startLabel} → ${endLabel}</div>
                    </div>
                    <span class="status-badge ${p.status}">${p.status}</span>
                </div>
            `;
        }).join('');
    }

    /**
     * Render resources summary (split into scarcities and abundances)
     */
    function renderResourcesSummary() {
        const session = SwarmSpaceStore.getSession();
        const scarcitiesContainer = document.getElementById('scarcitiesSummary');
        const abundancesContainer = document.getElementById('abundancesSummary');

        const scarcities = session.resources.filter(r => r.status === 'scarce' || r.status === 'critical');
        const abundances = session.resources.filter(r => r.status === 'abundant' || r.status === 'sufficient');

        if (scarcities.length === 0) {
            scarcitiesContainer.innerHTML = '<div class="empty-state">None</div>';
        } else {
            scarcitiesContainer.innerHTML = scarcities.map(r => `
                <div class="summary-item" data-resource-id="${r.id}">
                    <span class="summary-item-name">${escapeHtml(r.name)}</span>
                    <div class="summary-item-actions">
                        <button class="summary-item-btn delete" data-action="delete-resource">×</button>
                    </div>
                </div>
            `).join('');
        }

        if (abundances.length === 0) {
            abundancesContainer.innerHTML = '<div class="empty-state">None</div>';
        } else {
            abundancesContainer.innerHTML = abundances.map(r => `
                <div class="summary-item" data-resource-id="${r.id}">
                    <span class="summary-item-name">${escapeHtml(r.name)}</span>
                    <div class="summary-item-actions">
                        <button class="summary-item-btn delete" data-action="delete-resource">×</button>
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Render locations summary
     */
    function renderLocationsSummary() {
        const session = SwarmSpaceStore.getSession();
        const container = document.getElementById('locationsSummary');

        if (session.locations.length === 0) {
            container.innerHTML = '<div class="empty-state">None</div>';
            return;
        }

        container.innerHTML = session.locations.map(l => `
            <div class="summary-item" data-location-id="${l.id}">
                <div>
                    <div class="summary-item-name">${escapeHtml(l.name)}</div>
                    <div class="summary-item-detail">${escapeHtml(l.distance || '')}${l.notes ? ' - ' + escapeHtml(l.notes) : ''}</div>
                </div>
                <div class="summary-item-actions">
                    <button class="summary-item-btn delete" data-action="delete-location">×</button>
                </div>
            </div>
        `).join('');
    }

    // ============ EVENT HANDLERS ============

    /**
     * Handle metadata changes
     */
    function handleMetaChange() {
        const title = document.getElementById('sessionTitle').value;
        const setting = document.getElementById('sessionSetting').value;
        const startingWeek = parseInt(document.getElementById('startingWeek').value, 10) || 1;
        SwarmSpaceStore.updateMeta(title, setting, startingWeek);
        scheduleSave();
    }

    /**
     * Handle starting week change - renumbers all weeks
     */
    function handleStartingWeekChange() {
        const title = document.getElementById('sessionTitle').value;
        const setting = document.getElementById('sessionSetting').value;
        const startingWeek = parseInt(document.getElementById('startingWeek').value, 10) || 1;
        SwarmSpaceStore.updateMeta(title, setting, startingWeek);
        // Renumber existing weeks
        const session = SwarmSpaceStore.getSession();
        session.weeks.forEach((w, i) => {
            w.weekNumber = startingWeek + i;
        });
        rerenderWeeksPreserveState();
        scheduleSave();
    }

    /**
     * Handle add week
     */
    function handleAddWeek() {
        const newWeek = SwarmSpaceStore.addWeek();
        renderWeeks(newWeek.id); // Keep new week expanded
        renderProjectsSummary();
        scheduleSave();
    }

    /**
     * Handle clicks in weeks container (delegation)
     */
    function handleWeeksClick(e) {
        const weekEl = e.target.closest('.week-section');
        if (!weekEl) return;
        const weekId = weekEl.dataset.weekId;

        // Make current (check before toggle)
        if (e.target.dataset.action === 'make-current') {
            SwarmSpaceStore.setCurrentWeek(weekId);
            // Collapse all weeks before current, keep current expanded
            const session = SwarmSpaceStore.getSession();
            const currentIndex = session.weeks.findIndex(w => w.id === weekId);
            const expandIds = session.weeks
                .filter((w, i) => i >= currentIndex)
                .map(w => w.id);
            renderWeeks(expandIds);
            scheduleSave();
            return;
        }

        // Toggle collapse (but not if clicking buttons)
        if (e.target.closest('.week-header') && !e.target.closest('button')) {
            weekEl.classList.toggle('collapsed');
            return;
        }

        // Action type buttons
        if (e.target.classList.contains('action-type-btn')) {
            const type = e.target.dataset.actionType;
            const week = SwarmSpaceStore.getWeek(weekId);
            SwarmSpaceStore.updateWeekAction(weekId, type, week.action.text);
            rerenderWeeksPreserveState();
            scheduleSave();
            return;
        }

        // Start project
        if (e.target.dataset.action === 'start-project') {
            currentProjectWeekId = weekId;
            const week = SwarmSpaceStore.getWeek(weekId);
            // Pre-fill if editing existing project
            document.getElementById('projectName').value = week.action.projectName || '';
            document.getElementById('projectDuration').value = '1';
            openModal('projectModal');
            document.getElementById('projectName').focus();
            return;
        }

        // Add completion
        if (e.target.dataset.action === 'add-completion') {
            currentCompletionWeekId = weekId;
            document.getElementById('completionName').value = '';
            document.getElementById('completionOutcome').value = '';
            openModal('completionModal');
            document.getElementById('completionName').focus();
            return;
        }

        // Delete completion
        if (e.target.dataset.action === 'delete-completion') {
            const completionEl = e.target.closest('.completion-block');
            const completionId = completionEl.dataset.completionId;
            if (confirm('Delete this completion?')) {
                SwarmSpaceStore.deleteCompletion(weekId, completionId);
                rerenderWeeksPreserveState();
                renderProjectsSummary();
                scheduleSave();
            }
            return;
        }

        // Add comment
        if (e.target.dataset.action === 'add-comment') {
            currentCommentTarget = { weekId, target: e.target.dataset.target };
            document.getElementById('commentText').value = '';
            openModal('commentModal');
            document.getElementById('commentText').focus();
            return;
        }

        // Delete comment
        if (e.target.dataset.action === 'delete-comment') {
            const commentEl = e.target.closest('.comment');
            const commentId = commentEl.dataset.commentId;
            const target = e.target.dataset.target;
            SwarmSpaceStore.deleteComment(weekId, target, commentId);
            rerenderWeeksPreserveState();
            scheduleSave();
            return;
        }
    }

    /**
     * Handle input events in weeks container
     */
    function handleWeeksInput(e) {
        const weekEl = e.target.closest('.week-section');
        if (!weekEl) return;
        const weekId = weekEl.dataset.weekId;

        // Event text
        if (e.target.dataset.field === 'event') {
            SwarmSpaceStore.updateWeekEvent(weekId, e.target.value);
            scheduleSave();
            return;
        }
    }

    /**
     * Handle save comment
     */
    function handleSaveComment() {
        const text = document.getElementById('commentText').value.trim();

        if (!text) return;

        SwarmSpaceStore.addComment(currentCommentTarget.weekId, currentCommentTarget.target, text);
        closeModal('commentModal');
        rerenderWeeksPreserveState();
        scheduleSave();
    }

    /**
     * Handle save project
     */
    function handleSaveProject() {
        const name = document.getElementById('projectName').value.trim();
        const duration = parseInt(document.getElementById('projectDuration').value, 10);

        if (!name || !duration || duration < 1) return;

        SwarmSpaceStore.startProject(currentProjectWeekId, name, duration);
        closeModal('projectModal');
        rerenderWeeksPreserveState();
        renderProjectsSummary();
        scheduleSave();
    }

    /**
     * Handle save completion (manual)
     */
    function handleSaveCompletion() {
        const name = document.getElementById('completionName').value.trim();

        if (!name) return;

        SwarmSpaceStore.addManualCompletion(currentCompletionWeekId, name);
        closeModal('completionModal');
        rerenderWeeksPreserveState();
        renderProjectsSummary();
        scheduleSave();
    }

    /**
     * Handle projects summary clicks
     */
    function handleProjectsClick(e) {
        // Projects are display-only for now
    }

    /**
     * Handle resources summary clicks
     */
    function handleResourcesClick(e) {
        const item = e.target.closest('.summary-item');
        if (!item) return;
        const resourceId = item.dataset.resourceId;

        if (e.target.dataset.action === 'edit-resource') {
            const session = SwarmSpaceStore.getSession();
            const resource = session.resources.find(r => r.id === resourceId);
            if (resource) {
                openResourceModal(resource);
            }
            return;
        }

        if (e.target.dataset.action === 'delete-resource') {
            SwarmSpaceStore.deleteResource(resourceId);
            renderResourcesSummary();
            scheduleSave();
            return;
        }
    }

    /**
     * Handle locations summary clicks
     */
    function handleLocationsClick(e) {
        const item = e.target.closest('.summary-item');
        if (!item) return;
        const locationId = item.dataset.locationId;

        if (e.target.dataset.action === 'delete-location') {
            SwarmSpaceStore.deleteLocation(locationId);
            renderLocationsSummary();
            scheduleSave();
            return;
        }
    }

    /**
     * Open resource modal
     * @param {string} status - 'scarce' or 'abundant'
     */
    function openResourceModal(status) {
        editingResourceId = null;
        currentResourceStatus = status;
        document.getElementById('resourceModalTitle').textContent = status === 'scarce' ? 'Add Scarcity' : 'Add Abundance';
        document.getElementById('resourceName').value = '';
        openModal('resourceModal');
        document.getElementById('resourceName').focus();
    }

    /**
     * Handle save resource
     */
    function handleSaveResource() {
        const name = document.getElementById('resourceName').value.trim();

        if (!name) return;

        SwarmSpaceStore.upsertResource(editingResourceId, name, currentResourceStatus);
        closeModal('resourceModal');
        renderResourcesSummary();
        scheduleSave();
    }

    /**
     * Open location modal
     */
    function openLocationModal() {
        document.getElementById('locationName').value = '';
        document.getElementById('locationDistance').value = '';
        document.getElementById('locationNotes').value = '';
        openModal('locationModal');
        document.getElementById('locationName').focus();
    }

    /**
     * Handle save location
     */
    function handleSaveLocation() {
        const name = document.getElementById('locationName').value.trim();
        const distance = document.getElementById('locationDistance').value.trim();
        const notes = document.getElementById('locationNotes').value.trim();

        if (!name) return;

        SwarmSpaceStore.upsertLocation(null, name, distance, notes);
        closeModal('locationModal');
        renderLocationsSummary();
        scheduleSave();
    }

    /**
     * Render names summary
     */
    function renderNamesSummary() {
        const session = SwarmSpaceStore.getSession();
        const container = document.getElementById('namesSummary');

        if (session.names.length === 0) {
            container.innerHTML = '<div class="empty-state">None</div>';
            return;
        }

        container.innerHTML = session.names.map(n => `
            <div class="summary-item" data-name-id="${n.id}">
                <div>
                    <div class="summary-item-name">${escapeHtml(n.name)}${n.description ? ': ' + escapeHtml(n.description) : ''}</div>
                </div>
                <div class="summary-item-actions">
                    <button class="summary-item-btn delete" data-action="delete-name">×</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Handle names summary clicks
     */
    function handleNamesClick(e) {
        const item = e.target.closest('.summary-item');
        if (!item) return;
        const nameId = item.dataset.nameId;

        if (e.target.dataset.action === 'delete-name') {
            SwarmSpaceStore.deleteName(nameId);
            renderNamesSummary();
            scheduleSave();
            return;
        }
    }

    /**
     * Open name modal
     */
    function openNameModal() {
        document.getElementById('nameValue').value = '';
        document.getElementById('nameDescription').value = '';
        openModal('nameModal');
        document.getElementById('nameValue').focus();
    }

    /**
     * Handle save name
     */
    function handleSaveName() {
        const name = document.getElementById('nameValue').value.trim();
        const description = document.getElementById('nameDescription').value.trim();

        if (!name) return;

        SwarmSpaceStore.upsertName(null, name, description);
        closeModal('nameModal');
        renderNamesSummary();
        scheduleSave();
    }

    /**
     * Handle import from previous session
     */
    function handleImport() {
        const markdown = document.getElementById('importInput').value;
        if (!markdown.trim()) return;

        const session = SwarmSpaceStore.getSession();
        let imported = { scarcities: 0, abundances: 0, locations: 0, names: 0 };

        // Helper to check if resource exists
        const resourceExists = (name) => session.resources.some(r =>
            r.name.toLowerCase() === name.toLowerCase()
        );

        // Helper to check if location exists
        const locationExists = (name) => session.locations.some(l =>
            l.name.toLowerCase() === name.toLowerCase()
        );

        // Helper to check if name exists
        const nameExists = (name) => session.names.some(n =>
            n.name.toLowerCase() === name.toLowerCase()
        );

        // Parse Scarcities
        const scarcitiesMatch = markdown.match(/## Scarcities\n\n([\s\S]*?)(?=\n##|$)/);
        if (scarcitiesMatch) {
            const lines = scarcitiesMatch[1].split('\n').filter(l => l.startsWith('- '));
            lines.forEach(line => {
                const name = line.replace(/^- /, '').trim();
                if (name && !resourceExists(name)) {
                    SwarmSpaceStore.upsertResource(null, name, 'scarce');
                    imported.scarcities++;
                }
            });
        }

        // Parse Abundances
        const abundancesMatch = markdown.match(/## Abundances\n\n([\s\S]*?)(?=\n##|$)/);
        if (abundancesMatch) {
            const lines = abundancesMatch[1].split('\n').filter(l => l.startsWith('- '));
            lines.forEach(line => {
                const name = line.replace(/^- /, '').trim();
                if (name && !resourceExists(name)) {
                    SwarmSpaceStore.upsertResource(null, name, 'abundant');
                    imported.abundances++;
                }
            });
        }

        // Parse Locations
        const locationsMatch = markdown.match(/## Locations\n\n\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n##|$)/);
        if (locationsMatch) {
            const lines = locationsMatch[1].split('\n').filter(l => l.startsWith('|'));
            lines.forEach(line => {
                const cols = line.split('|').map(c => c.trim()).filter(c => c);
                if (cols.length >= 1) {
                    const name = cols[0];
                    const distance = cols[1] !== '-' ? cols[1] : '';
                    const notes = cols[2] !== '-' ? cols[2] : '';
                    if (name && !locationExists(name)) {
                        SwarmSpaceStore.upsertLocation(null, name, distance || '', notes || '');
                        imported.locations++;
                    }
                }
            });
        }

        // Parse Names
        const namesMatch = markdown.match(/## Names\n\n([\s\S]*?)(?=\n##|$)/);
        if (namesMatch) {
            const lines = namesMatch[1].split('\n').filter(l => l.startsWith('- '));
            lines.forEach(line => {
                // Match: - **Name**: Description or - Name
                const boldMatch = line.match(/^- \*\*(.+?)\*\*: (.+)$/);
                if (boldMatch) {
                    if (!nameExists(boldMatch[1])) {
                        SwarmSpaceStore.upsertName(null, boldMatch[1], boldMatch[2]);
                        imported.names++;
                    }
                } else {
                    const name = line.replace(/^- /, '').trim();
                    if (name && !nameExists(name)) {
                        SwarmSpaceStore.upsertName(null, name, '');
                        imported.names++;
                    }
                }
            });
        }

        closeModal('importModal');
        renderAll();
        scheduleSave();

        // Show summary
        const parts = [];
        if (imported.scarcities) parts.push(`${imported.scarcities} scarcity(ies)`);
        if (imported.abundances) parts.push(`${imported.abundances} abundance(s)`);
        if (imported.locations) parts.push(`${imported.locations} location(s)`);
        if (imported.names) parts.push(`${imported.names} name(s)`);

        if (parts.length > 0) {
            alert('Imported: ' + parts.join(', '));
        } else {
            alert('No new data found to import (duplicates skipped).');
        }
    }

    /**
     * Handle export
     */
    function handleExport() {
        const md = SwarmSpaceStore.exportMarkdown();
        document.getElementById('exportOutput').value = md;
        openModal('exportModal');
    }

    /**
     * Handle copy export
     */
    function handleCopyExport() {
        const output = document.getElementById('exportOutput');
        output.select();
        document.execCommand('copy');
        document.getElementById('copyExportBtn').textContent = 'Copied!';
        setTimeout(() => {
            document.getElementById('copyExportBtn').textContent = 'Copy to Clipboard';
        }, 2000);
    }

    // ============ UTILITIES ============

    /**
     * Open a modal
     */
    function openModal(id) {
        document.getElementById(id).classList.add('visible');
    }

    /**
     * Close a modal
     */
    function closeModal(id) {
        document.getElementById(id).classList.remove('visible');
    }

    /**
     * Debounce function
     */
    function debounce(fn, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // Public API
    return { init };
})();
