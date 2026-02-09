// Swarm Space RPG Session Tracker UI

const SwarmSpaceUI = (function() {
    // State
    let api = null;

    // Modal state
    let currentCommentTarget = null; // { weekId, target: 'event'|'action'|'completion:id' }
    let currentProjectWeekId = null;
    let currentCompletionWeekId = null;
    let currentResourceStatus = null; // 'scarce' or 'abundant' (resources are add/delete only)
    let modalMouseDownTarget = null; // Track mousedown target for backdrop click detection

    /**
     * Initialize the UI
     */
    async function init(listName) {
        api = createApi(listName, CONFIG.API_BASE_SWARM);

        // Set up event listeners
        setupEventListeners();

        // Load session data
        await loadSession();

        // Initialize sync polling for multi-user support
        SwarmSpaceSync.init(api, handleSyncRefresh);
    }

    /**
     * Handle sync refresh from server (callback for SwarmSpaceSync)
     */
    function handleSyncRefresh(data) {
        SwarmSpaceStore.setSession(data);
        rerenderWeeksPreserveState();
        renderProjectsSummary();
        renderResourcesSummary();
        renderLocationsSummary();
        renderNamesSummary();
    }

    /**
     * Manual refresh for UI (exposed for sync indicator click)
     */
    function manualRefresh() {
        SwarmSpaceSync.manualRefresh();
    }

    /**
     * Set up backdrop click dismissal for a modal.
     * Only closes if both mousedown and click occur on the backdrop itself,
     * preventing accidental closes when selecting text and releasing outside the modal content.
     * @param {string} modalId - The modal element ID
     */
    function setupModalBackdropDismiss(modalId) {
        const modal = document.getElementById(modalId);
        modal.addEventListener('mousedown', (e) => {
            if (e.target.id === modalId) {
                modalMouseDownTarget = modalId;
            } else {
                modalMouseDownTarget = null;
            }
        });
        modal.addEventListener('click', (e) => {
            if (e.target.id === modalId && modalMouseDownTarget === modalId) {
                closeModal(modalId);
            }
            modalMouseDownTarget = null;
        });
    }

    /**
     * Show error message to user and log to console
     * @param {string} message - Error message to display
     * @param {Error} error - Original error for debugging
     */
    function showError(message, error) {
        console.error('SwarmSpace error:', message, error);
        const errorEl = document.getElementById('errorDisplay');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
            setTimeout(() => errorEl.classList.remove('visible'), 5000);
        } else {
            // Fallback to alert if error element doesn't exist
            alert(message);
        }
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Close progress modal if page is restored from bfcache (e.g. back button)
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) closeModal('progressModal');
        });

        // Session metadata
        document.getElementById('sessionTitle').addEventListener('input', debounce(handleMetaChange, 500));
        document.getElementById('sessionSetting').addEventListener('input', debounce(handleMetaChange, 500));

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
        setupModalBackdropDismiss('commentModal');

        // Project modal
        document.getElementById('cancelProjectBtn').addEventListener('click', () => closeModal('projectModal'));
        document.getElementById('saveProjectBtn').addEventListener('click', handleSaveProject);
        setupModalBackdropDismiss('projectModal');

        // Completion modal
        document.getElementById('cancelCompletionBtn').addEventListener('click', () => closeModal('completionModal'));
        document.getElementById('saveCompletionBtn').addEventListener('click', handleSaveCompletion);
        document.getElementById('completionName').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveCompletion();
            }
        });
        setupModalBackdropDismiss('completionModal');

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
        setupModalBackdropDismiss('resourceModal');

        // Resource summaries (delegation)
        document.getElementById('scarcitiesSummary').addEventListener('click', handleResourcesClick);
        document.getElementById('abundancesSummary').addEventListener('click', handleResourcesClick);

        // Location modal
        document.getElementById('addLocationBtn').addEventListener('click', () => openLocationModal());
        document.getElementById('cancelLocationBtn').addEventListener('click', () => closeModal('locationModal'));
        document.getElementById('saveLocationBtn').addEventListener('click', handleSaveLocation);
        setupModalBackdropDismiss('locationModal');

        // Export modal
        document.getElementById('closeExportBtn').addEventListener('click', () => closeModal('exportModal'));
        document.getElementById('copyExportBtn').addEventListener('click', handleCopyExport);
        setupModalBackdropDismiss('exportModal');

        // Export for Import (JSON) modal
        document.getElementById('exportJsonBtn').addEventListener('click', handleExportForImport);
        document.getElementById('closeExportJsonBtn').addEventListener('click', () => closeModal('exportJsonModal'));
        document.getElementById('copyJsonExportBtn').addEventListener('click', handleCopyJsonExport);
        setupModalBackdropDismiss('exportJsonModal');

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
        setupModalBackdropDismiss('nameModal');

        // Group modal (move to group)
        document.getElementById('cancelGroupBtn').addEventListener('click', () => closeModal('groupModal'));
        document.getElementById('saveGroupBtn').addEventListener('click', handleSaveGroup);
        document.getElementById('groupValue').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveGroup();
            }
        });
        setupModalBackdropDismiss('groupModal');

        // Import modal
        document.getElementById('importPreviousBtn').addEventListener('click', () => {
            document.getElementById('importInput').value = '';
            openModal('importModal');
        });
        document.getElementById('cancelImportBtn').addEventListener('click', () => closeModal('importModal'));
        document.getElementById('doImportBtn').addEventListener('click', handleImport);
        setupModalBackdropDismiss('importModal');

        // Create next session
        document.getElementById('createNextSessionBtn').addEventListener('click', handleCreateNextSession);

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
            if (error.code === 'NOT_FOUND') {
                // No existing session - auto-create the list
                console.log('No existing session, creating new list');
                SwarmSpaceStore.setSession(null);
                renderAll();
                // Create the list on the server with default session data
                await createList();
            } else {
                // Actual error (500, network failure, etc.)
                console.error('Failed to load session:', error);
                showError(`Failed to load session: ${error.message}`);
            }
        }
    }

    /**
     * Create the list on the server with default session data
     */
    async function createList() {
        try {
            const session = SwarmSpaceStore.getSession();
            if (api.isMock) {
                localStorage.setItem(`mockTasks_${api.listName}`, JSON.stringify(session));
            } else {
                const response = await fetch(`${CONFIG.API_BASE_SWARM}/${api.listName}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(session)
                });
                if (!response.ok) {
                    throw new Error(`Failed to create list: ${response.status}`);
                }
            }
            console.log('List created successfully');
        } catch (error) {
            console.error('Failed to create list:', error);
            showError(`Failed to create list: ${error.message}`);
        }
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

        const totalWeeks = session.weeks.length;
        container.innerHTML = session.weeks.map((week, index) => {
            const isCurrent = week.id === currentWeekId;
            const isBeforeCurrent = currentWeekIndex >= 0 && index < currentWeekIndex;
            const isLastWeek = index === totalWeeks - 1;
            // Week number only editable if it's the only week (prevents sync issues)
            const isWeekNumberEditable = isLastWeek && totalWeeks === 1;
            return renderWeek(week, !expandSet.has(week.id), isCurrent, isBeforeCurrent, isWeekNumberEditable);
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
    function renderWeek(week, collapsed = false, isCurrent = false, isBeforeCurrent = false, isWeekNumberEditable = false) {
        // Weeks before current are considered complete
        const isComplete = isBeforeCurrent;
        const statusClass = isComplete ? 'week-complete' : (isCurrent ? 'week-current' : '');
        const statusLabel = isComplete ? ' ✓' : '';
        const currentLabel = isCurrent ? '<span class="current-label">Current</span>' : '';
        const makeCurrentBtn = !isCurrent ? '<button class="make-current-btn" data-action="make-current">Make Current</button>' : '';

        // Week number: editable only when it's the single week (prevents sync issues)
        const weekNumberHtml = isWeekNumberEditable
            ? `Week <input type="number" class="week-number-input" data-field="weekNumber" value="${week.weekNumber}" min="1" onclick="event.stopPropagation()">${statusLabel}`
            : `Week ${week.weekNumber}${statusLabel}`;

        return `
            <div class="week-section${collapsed ? ' collapsed' : ''} ${statusClass}" data-week-id="${week.id}">
                <div class="week-header">
                    <span class="week-title">
                        <span class="week-toggle">▼</span>
                        ${weekNumberHtml}
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
     * Handle metadata changes (title and setting - atomic PATCH)
     */
    async function handleMetaChange() {
        const title = document.getElementById('sessionTitle').value;
        const setting = document.getElementById('sessionSetting').value;
        const session = SwarmSpaceStore.getSession();

        try {
            // Only patch fields that changed
            if (title !== session.title) {
                const updatedDoc = await api.patchItem('title', title);
                SwarmSpaceStore.setSession(updatedDoc);
                SwarmSpaceSync.resetActivity();
            }
            if (setting !== session.setting) {
                const updatedDoc = await api.patchItem('setting', setting);
                SwarmSpaceStore.setSession(updatedDoc);
                SwarmSpaceSync.resetActivity();
            }
        } catch (error) {
            showError('Failed to save metadata. Please try again.', error);
        }
    }

    /**
     * Handle add week (atomic operation)
     */
    async function handleAddWeek() {
        // Create the new week object (server calculates weekNumber to prevent duplicates)
        const newWeek = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            event: { text: '', comments: [] },
            action: { type: 'discussion', text: '', comments: [] },
            completions: []
        };

        try {
            const updatedDoc = await api.appendItem('weeks', newWeek);
            SwarmSpaceStore.setSession(updatedDoc);
            renderWeeks(newWeek.id); // Keep new week expanded
            renderProjectsSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to add week. Please try again.', error);
        }
    }

    /**
     * Handle clicks in weeks container (delegation)
     */
    function handleWeeksClick(e) {
        const weekEl = e.target.closest('.week-section');
        if (!weekEl) return;
        const weekId = weekEl.dataset.weekId;

        // Make current (atomic PATCH)
        if (e.target.dataset.action === 'make-current') {
            (async () => {
                try {
                    const updatedDoc = await api.patchItem('currentWeekId', weekId);
                    SwarmSpaceStore.setSession(updatedDoc);
                    // Collapse all weeks before current, keep current expanded
                    const session = SwarmSpaceStore.getSession();
                    const currentIndex = session.weeks.findIndex(w => w.id === weekId);
                    const expandIds = session.weeks
                        .filter((w, i) => i >= currentIndex)
                        .map(w => w.id);
                    renderWeeks(expandIds);
                    SwarmSpaceSync.resetActivity();
                } catch (error) {
                    showError('Failed to set current week. Please try again.', error);
                }
            })();
            return;
        }

        // Toggle collapse (but not if clicking buttons)
        if (e.target.closest('.week-header') && !e.target.closest('button')) {
            weekEl.classList.toggle('collapsed');
            return;
        }

        // Action type buttons (atomic PATCH)
        if (e.target.classList.contains('action-type-btn')) {
            const type = e.target.dataset.actionType;
            const weekIndex = getWeekIndex(weekId);
            if (weekIndex === -1) return;

            (async () => {
                try {
                    const updatedDoc = await api.patchItem(`weeks.${weekIndex}.action.type`, type);
                    SwarmSpaceStore.setSession(updatedDoc);
                    rerenderWeeksPreserveState();
                    SwarmSpaceSync.resetActivity();
                } catch (error) {
                    showError('Failed to update action type. Please try again.', error);
                }
            })();
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
            openModal('completionModal');
            document.getElementById('completionName').focus();
            return;
        }

        // Delete completion (atomic operation)
        if (e.target.dataset.action === 'delete-completion') {
            const completionEl = e.target.closest('.completion-block');
            const completionId = completionEl.dataset.completionId;
            if (confirm('Delete this completion?')) {
                const weekIndex = getWeekIndex(weekId);
                if (weekIndex === -1) return;

                (async () => {
                    try {
                        const updatedDoc = await api.deleteItem(`weeks.${weekIndex}.completions`, completionId);
                        SwarmSpaceStore.setSession(updatedDoc);
                        rerenderWeeksPreserveState();
                        renderProjectsSummary();
                        SwarmSpaceSync.resetActivity();
                    } catch (error) {
                        showError('Failed to delete completion. Please try again.', error);
                    }
                })();
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

        // Delete comment (atomic operation)
        if (e.target.dataset.action === 'delete-comment') {
            const commentEl = e.target.closest('.comment');
            const commentId = commentEl.dataset.commentId;
            const target = e.target.dataset.target;
            const weekIndex = getWeekIndex(weekId);

            if (weekIndex === -1) return;

            const path = getCommentPath(weekIndex, target);

            (async () => {
                try {
                    const updatedDoc = await api.deleteItem(path, commentId);
                    SwarmSpaceStore.setSession(updatedDoc);
                    rerenderWeeksPreserveState();
                    SwarmSpaceSync.resetActivity();
                } catch (error) {
                    showError('Failed to delete comment. Please try again.', error);
                }
            })();
            return;
        }
    }

    /**
     * Handle input events in weeks container (debounced event text update)
     */
    const debouncedEventTextPatch = debounce(async (weekIndex, value) => {
        try {
            const updatedDoc = await api.patchItem(`weeks.${weekIndex}.event.text`, value);
            SwarmSpaceStore.setSession(updatedDoc);
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to save event text. Please try again.', error);
        }
    }, 500);

    /**
     * Debounced handler for week number changes (last week only)
     */
    const debouncedWeekNumberPatch = debounce(async (weekIndex, value) => {
        try {
            const updatedDoc = await api.patchItem(`weeks.${weekIndex}.weekNumber`, value);
            SwarmSpaceStore.setSession(updatedDoc);
            renderProjectsSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to save week number. Please try again.', error);
        }
    }, 500);

    function handleWeeksInput(e) {
        const weekEl = e.target.closest('.week-section');
        if (!weekEl) return;
        const weekId = weekEl.dataset.weekId;

        // Week number change (only editable when it's the single week)
        if (e.target.dataset.field === 'weekNumber') {
            const session = SwarmSpaceStore.getSession();
            const weekIndex = getWeekIndex(weekId);
            if (weekIndex === -1) return;
            // Only allow editing if it's the only week
            if (session.weeks.length !== 1) return;
            const newWeekNumber = parseInt(e.target.value, 10);
            if (isNaN(newWeekNumber) || newWeekNumber < 1) return;
            // Update local state immediately
            session.weeks[weekIndex].weekNumber = newWeekNumber;
            // Debounced patch to server
            debouncedWeekNumberPatch(weekIndex, newWeekNumber);
            return;
        }

        // Event text (atomic PATCH)
        if (e.target.dataset.field === 'event') {
            const weekIndex = getWeekIndex(weekId);
            if (weekIndex === -1) return;
            // Update local state immediately for responsiveness
            SwarmSpaceStore.updateWeekEvent(weekId, e.target.value);
            // Debounced atomic patch to server
            debouncedEventTextPatch(weekIndex, e.target.value);
            return;
        }
    }

    /**
     * Handle save comment (atomic operation)
     */
    async function handleSaveComment() {
        const text = document.getElementById('commentText').value.trim();
        if (!text) return;

        const weekIndex = getWeekIndex(currentCommentTarget.weekId);
        if (weekIndex === -1) return;

        const comment = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            text: text
        };

        const path = getCommentPath(weekIndex, currentCommentTarget.target);
        closeModal('commentModal');

        try {
            const updatedDoc = await api.appendItem(path, comment);
            SwarmSpaceStore.setSession(updatedDoc);
            rerenderWeeksPreserveState();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to add comment. Please try again.', error);
        }
    }

    /**
     * Handle save project (atomic operations: PATCH action + POST weeks + POST completion)
     */
    async function handleSaveProject() {
        const name = document.getElementById('projectName').value.trim();
        const duration = parseInt(document.getElementById('projectDuration').value, 10);

        if (!name || !duration || duration < 1) return;

        closeModal('projectModal');

        try {
            let session = SwarmSpaceStore.getSession();
            const weekIndex = getWeekIndex(currentProjectWeekId);
            if (weekIndex === -1) return;

            const week = session.weeks[weekIndex];
            const completionWeekNum = week.weekNumber + duration;

            // 1. PATCH the action on the source week
            const newAction = {
                type: 'project',
                projectName: name,
                projectDuration: duration,
                comments: week.action.comments || []
            };
            let updatedDoc = await api.patchItem(`weeks.${weekIndex}.action`, newAction);
            SwarmSpaceStore.setSession(updatedDoc);
            session = SwarmSpaceStore.getSession();

            // 2. Create missing weeks up to completion week (using POST for each)
            // Keep adding weeks until the last week's weekNumber reaches completionWeekNum
            while (session.weeks.length === 0 ||
                   session.weeks[session.weeks.length - 1].weekNumber < completionWeekNum) {
                const newWeek = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
                    event: { text: '', comments: [] },
                    action: { type: 'discussion', text: '', comments: [] },
                    completions: []
                };
                updatedDoc = await api.appendItem('weeks', newWeek);
                SwarmSpaceStore.setSession(updatedDoc);
                session = SwarmSpaceStore.getSession();
            }

            // 3. Append completion to target week
            const targetWeekIndex = session.weeks.findIndex(w => w.weekNumber === completionWeekNum);
            if (targetWeekIndex !== -1) {
                const completion = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
                    projectName: name,
                    comments: []
                };
                updatedDoc = await api.appendItem(`weeks.${targetWeekIndex}.completions`, completion);
                SwarmSpaceStore.setSession(updatedDoc);
            }

            rerenderWeeksPreserveState();
            renderProjectsSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to start project. Please try again.', error);
        }
    }

    /**
     * Handle save completion (atomic operation)
     */
    async function handleSaveCompletion() {
        const name = document.getElementById('completionName').value.trim();
        if (!name) return;

        const weekIndex = getWeekIndex(currentCompletionWeekId);
        if (weekIndex === -1) return;

        const completion = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            projectName: name,
            comments: []
        };

        closeModal('completionModal');

        try {
            const updatedDoc = await api.appendItem(`weeks.${weekIndex}.completions`, completion);
            SwarmSpaceStore.setSession(updatedDoc);
            rerenderWeeksPreserveState();
            renderProjectsSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to add completion. Please try again.', error);
        }
    }

    /**
     * Handle projects summary clicks
     */
    function handleProjectsClick(e) {
        // Projects are display-only for now
    }

    /**
     * Handle resources summary clicks (delete only - no editing)
     */
    function handleResourcesClick(e) {
        const item = e.target.closest('.summary-item');
        if (!item) return;
        const resourceId = item.dataset.resourceId;

        if (e.target.dataset.action === 'delete-resource') {
            (async () => {
                try {
                    const updatedDoc = await api.deleteItem('resources', resourceId);
                    SwarmSpaceStore.setSession(updatedDoc);
                    renderResourcesSummary();
                    SwarmSpaceSync.resetActivity();
                } catch (error) {
                    showError('Failed to delete resource. Please try again.', error);
                }
            })();
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
            (async () => {
                try {
                    const updatedDoc = await api.deleteItem('locations', locationId);
                    SwarmSpaceStore.setSession(updatedDoc);
                    renderLocationsSummary();
                    SwarmSpaceSync.resetActivity();
                } catch (error) {
                    showError('Failed to delete location. Please try again.', error);
                }
            })();
            return;
        }
    }

    /**
     * Open resource modal (add only - no editing)
     * @param {string} status - 'scarce' or 'abundant'
     */
    function openResourceModal(status) {
        currentResourceStatus = status;
        document.getElementById('resourceModalTitle').textContent = status === 'scarce' ? 'Add Scarcity' : 'Add Abundance';
        document.getElementById('resourceName').value = '';
        openModal('resourceModal');
        document.getElementById('resourceName').focus();
    }

    /**
     * Handle save resource (atomic append - no editing)
     */
    async function handleSaveResource() {
        const name = document.getElementById('resourceName').value.trim();
        if (!name) return;

        closeModal('resourceModal');

        const resource = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            name: name,
            status: currentResourceStatus
        };

        try {
            const updatedDoc = await api.appendItem('resources', resource);
            SwarmSpaceStore.setSession(updatedDoc);
            renderResourcesSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to add resource. Please try again.', error);
        }
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
     * Handle save location (atomic operation)
     */
    async function handleSaveLocation() {
        const name = document.getElementById('locationName').value.trim();
        const distance = document.getElementById('locationDistance').value.trim();
        const notes = document.getElementById('locationNotes').value.trim();

        if (!name) return;

        closeModal('locationModal');

        const location = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            name: name,
            distance: distance,
            notes: notes
        };

        try {
            const updatedDoc = await api.appendItem('locations', location);
            SwarmSpaceStore.setSession(updatedDoc);
            renderLocationsSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to add location. Please try again.', error);
        }
    }

    /**
     * Get all unique groups from names
     */
    function getNameGroups() {
        const session = SwarmSpaceStore.getSession();
        const groups = new Set();
        session.names.forEach(n => {
            if (n.group) groups.add(n.group);
        });
        return Array.from(groups).sort();
    }

    /**
     * Populate group datalist with existing groups
     * @param {string} datalistId - The datalist element ID
     * @param {boolean} includeUngrouped - Whether to include "Ungrouped" option (for move modal)
     */
    function populateGroupDatalist(datalistId, includeUngrouped = false) {
        const datalist = document.getElementById(datalistId);
        const groups = getNameGroups();
        let options = '';
        if (includeUngrouped) {
            options += '<option value="Ungrouped">';
        }
        options += groups.map(g => `<option value="${escapeHtml(g)}">`).join('');
        datalist.innerHTML = options;
    }

    /**
     * Render names summary with grouping
     */
    function renderNamesSummary() {
        const session = SwarmSpaceStore.getSession();
        const container = document.getElementById('namesSummary');

        if (session.names.length === 0) {
            container.innerHTML = '<div class="empty-state">None</div>';
            return;
        }

        // Group names by their group field
        const ungrouped = [];
        const grouped = new Map(); // group name -> [names]

        session.names.forEach(n => {
            if (n.group) {
                if (!grouped.has(n.group)) {
                    grouped.set(n.group, []);
                }
                grouped.get(n.group).push(n);
            } else {
                ungrouped.push(n);
            }
        });

        // Sort groups alphabetically
        const sortedGroups = Array.from(grouped.keys()).sort();

        let html = '';

        // Render ungrouped names first (if any)
        if (ungrouped.length > 0) {
            html += renderNameGroup('Ungrouped', ungrouped, 'ungrouped');
        }

        // Render each group
        sortedGroups.forEach(groupName => {
            html += renderNameGroup(groupName, grouped.get(groupName), groupName);
        });

        container.innerHTML = html;
    }

    /**
     * Render a single name group
     */
    function renderNameGroup(groupLabel, names, groupKey) {
        const itemsHtml = names.map(n => `
            <div class="name-item" data-name-id="${n.id}">
                <div class="name-item-content">
                    <span class="name-item-name">${escapeHtml(n.name)}</span>${n.description ? '<span class="name-item-description">: ' + escapeHtml(n.description) + '</span>' : ''}
                </div>
                <div class="name-item-actions">
                    <button class="name-item-btn" data-action="move-name" title="Move to group">m</button>
                    <button class="name-item-btn delete" data-action="delete-name" title="Delete">×</button>
                </div>
            </div>
        `).join('');

        return `
            <div class="name-group" data-group="${escapeHtml(groupKey)}">
                <div class="name-group-header">
                    <span class="name-group-toggle">▼</span>
                    ${escapeHtml(groupLabel)}
                </div>
                <div class="name-group-items">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    /**
     * Handle names summary clicks
     */
    function handleNamesClick(e) {
        // Handle group header toggle
        const groupHeader = e.target.closest('.name-group-header');
        if (groupHeader) {
            const group = groupHeader.closest('.name-group');
            if (group) {
                group.classList.toggle('collapsed');
            }
            return;
        }

        const item = e.target.closest('.name-item');
        if (!item) return;
        const nameId = item.dataset.nameId;

        if (e.target.dataset.action === 'delete-name') {
            (async () => {
                try {
                    const updatedDoc = await api.deleteItem('names', nameId);
                    SwarmSpaceStore.setSession(updatedDoc);
                    renderNamesSummary();
                    SwarmSpaceSync.resetActivity();
                } catch (error) {
                    showError('Failed to delete name. Please try again.', error);
                }
            })();
            return;
        }

        if (e.target.dataset.action === 'move-name') {
            openGroupModal(nameId);
            return;
        }
    }

    /**
     * Open name modal
     */
    function openNameModal() {
        document.getElementById('nameValue').value = '';
        document.getElementById('nameDescription').value = '';
        document.getElementById('nameGroup').value = '';
        populateGroupDatalist('nameGroupList');
        openModal('nameModal');
        document.getElementById('nameValue').focus();
    }

    /**
     * Handle save name (atomic operation)
     */
    async function handleSaveName() {
        const name = document.getElementById('nameValue').value.trim();
        const description = document.getElementById('nameDescription').value.trim();
        const group = document.getElementById('nameGroup').value.trim();

        if (!name) return;

        closeModal('nameModal');

        const nameEntry = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            name: name,
            description: description
        };

        // Only add group if it's not empty
        if (group) {
            nameEntry.group = group;
        }

        try {
            const updatedDoc = await api.appendItem('names', nameEntry);
            SwarmSpaceStore.setSession(updatedDoc);
            renderNamesSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to add name. Please try again.', error);
        }
    }

    // State for group modal
    let currentGroupNameId = null;
    let currentGroupOriginalValue = '';

    /**
     * Open group modal to change a name's group
     */
    function openGroupModal(nameId) {
        currentGroupNameId = nameId;
        const session = SwarmSpaceStore.getSession();
        const nameEntry = session.names.find(n => n.id === nameId);
        currentGroupOriginalValue = nameEntry?.group || '';

        // Clear input so datalist shows all options (browser filters datalist to match input)
        document.getElementById('groupValue').value = '';
        document.getElementById('groupValue').placeholder = currentGroupOriginalValue
            ? `Current: ${currentGroupOriginalValue}`
            : 'Enter group name...';
        populateGroupDatalist('groupValueList', true); // Include "Ungrouped" option
        openModal('groupModal');
        document.getElementById('groupValue').focus();
    }

    /**
     * Handle save group (PATCH operation to change group only)
     */
    async function handleSaveGroup() {
        const inputValue = document.getElementById('groupValue').value.trim();

        closeModal('groupModal');

        if (!currentGroupNameId) return;

        // Handle special "Ungrouped" value - clears the group
        // If input is empty and there was an original value, keep the original (user just clicked Move without typing)
        // If input is empty and no original value, nothing to do
        // If input has a value, use that new value
        let newGroup;
        if (inputValue.toLowerCase() === 'ungrouped') {
            newGroup = ''; // Clear the group
        } else {
            newGroup = inputValue || currentGroupOriginalValue;
        }

        // If the group hasn't changed, do nothing
        if (newGroup === currentGroupOriginalValue) {
            currentGroupNameId = null;
            currentGroupOriginalValue = '';
            return;
        }

        const session = SwarmSpaceStore.getSession();
        const nameIndex = session.names.findIndex(n => n.id === currentGroupNameId);
        if (nameIndex === -1) return;

        try {
            // Use PATCH to update only the group field
            const updatedDoc = await api.patchItem(`names.${nameIndex}.group`, newGroup);
            SwarmSpaceStore.setSession(updatedDoc);
            renderNamesSummary();
            SwarmSpaceSync.resetActivity();
        } catch (error) {
            showError('Failed to update group. Please try again.', error);
        }

        currentGroupNameId = null;
        currentGroupOriginalValue = '';
    }

    /**
     * Import parsed JSON data into a target session via its API (atomic operations).
     * @param {object} targetApi - API object (from createApi) for the target session
     * @param {string} jsonString - JSON export string from exportForImport()
     * @returns {{ projects: number, scarcities: number, abundances: number, locations: number, names: number }}
     */
    async function importIntoSession(targetApi, jsonString) {
        const parsed = SwarmSpaceStore.parseJsonImport(jsonString);

        // Fetch current state of target session
        let session = await targetApi.fetchTasks(null);

        let imported = { projects: 0, scarcities: 0, abundances: 0, locations: 0, names: 0 };

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

        // Helper to generate ID
        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        // Filter out duplicates and assign IDs
        const resourcesToAdd = [];
        const locationsToAdd = [];
        const namesToAdd = [];

        parsed.resources.forEach(r => {
            if (!resourceExists(r.name)) {
                resourcesToAdd.push({ id: generateId(), ...r });
                if (r.status === 'scarce' || r.status === 'critical') imported.scarcities++;
                else imported.abundances++;
            }
        });

        parsed.locations.forEach(l => {
            if (!locationExists(l.name)) {
                locationsToAdd.push({ id: generateId(), ...l });
                imported.locations++;
            }
        });

        parsed.names.forEach(n => {
            if (!nameExists(n.name)) {
                namesToAdd.push({ id: generateId(), ...n });
                imported.names++;
            }
        });

        // Use atomic appends for each item
        for (const resource of resourcesToAdd) {
            session = await targetApi.appendItem('resources', resource);
        }
        for (const location of locationsToAdd) {
            session = await targetApi.appendItem('locations', location);
        }
        for (const name of namesToAdd) {
            session = await targetApi.appendItem('names', name);
        }

        // Import unfinished projects: create weeks with completion entries
        if (parsed.unfinishedProjects.length > 0) {
            // Use startingWeekNumber for the first week if session has no weeks
            const startingWeekNumber = parsed.startingWeekNumber || 1;

            // Helper to check if a completion with this project name already exists
            const completionExists = (name) => session.weeks.some(w =>
                (w.completions || []).some(c => c.projectName.toLowerCase() === name.toLowerCase())
            );

            for (const project of parsed.unfinishedProjects) {
                if (!project.remaining || project.remaining < 1) continue;
                if (completionExists(project.name)) continue;

                // Completion week is relative: startingWeekNumber + remaining - 1
                // (remaining=1 means it completes in the first week of the new session)
                const completionWeekNum = startingWeekNumber + project.remaining - 1;

                // Create weeks up to the completion week number
                while (session.weeks.length === 0 ||
                       session.weeks[session.weeks.length - 1].weekNumber < completionWeekNum) {
                    const newWeek = {
                        id: generateId(),
                        event: { text: '', comments: [] },
                        action: { type: 'discussion', text: '', comments: [] },
                        completions: []
                    };
                    // Include weekNumber on the first week if session had no weeks
                    if (session.weeks.length === 0) {
                        newWeek.weekNumber = startingWeekNumber;
                    }
                    session = await targetApi.appendItem('weeks', newWeek);
                }

                // Append completion to the target week
                const targetWeekIndex = session.weeks.findIndex(w => w.weekNumber === completionWeekNum);
                if (targetWeekIndex !== -1) {
                    const completion = {
                        id: generateId(),
                        projectName: project.name,
                        comments: []
                    };
                    session = await targetApi.appendItem(`weeks.${targetWeekIndex}.completions`, completion);
                    imported.projects++;
                }
            }
        }

        return imported;
    }

    /**
     * Handle import from previous session (uses importIntoSession)
     */
    async function handleImport() {
        const input = document.getElementById('importInput').value;
        if (!input.trim()) return;

        // Validate JSON before closing modal
        try {
            SwarmSpaceStore.parseJsonImport(input);
        } catch (error) {
            showError(error.message, error);
            return;
        }

        closeModal('importModal');

        try {
            const imported = await importIntoSession(api, input);

            // Refresh local store from server
            const freshDoc = await api.fetchTasks();
            SwarmSpaceStore.setSession(freshDoc);

            renderAll();
            SwarmSpaceSync.resetActivity();

            // Show summary
            const parts = [];
            if (imported.projects) parts.push(`${imported.projects} unfinished project(s)`);
            if (imported.scarcities) parts.push(`${imported.scarcities} scarcity(ies)`);
            if (imported.abundances) parts.push(`${imported.abundances} abundance(s)`);
            if (imported.locations) parts.push(`${imported.locations} location(s)`);
            if (imported.names) parts.push(`${imported.names} name(s)`);

            if (parts.length > 0) {
                alert('Imported: ' + parts.join(', '));
            } else {
                alert('No new data found to import (duplicates skipped).');
            }
        } catch (error) {
            showError('Failed to import data. Please try again.', error);
        }
    }

    /**
     * Handle creating next session: export, create, import, navigate
     */
    async function handleCreateNextSession() {
        const currentName = api.listName;
        const match = currentName.match(/^(.*?)(\d+)$/);
        const proposedName = match ? match[1] + (parseInt(match[2], 10) + 1) : currentName + '2';

        const newName = prompt('New session name:', proposedName);
        if (!newName || !newName.trim()) return;
        const trimmed = newName.trim();

        if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
            alert('Name can only contain letters, numbers, hyphens, and underscores.');
            return;
        }

        const progressTitle = document.getElementById('progressTitle');
        const progressMsg = document.getElementById('progressMessage');

        progressTitle.textContent = `Creating "${trimmed}"...`;
        progressMsg.textContent = 'Checking if session exists...';
        openModal('progressModal');

        try {
            const checkResp = await fetch(`${CONFIG.API_BASE_SWARM}/${trimmed}`);
            if (checkResp.ok) {
                closeModal('progressModal');
                alert(`Session "${trimmed}" already exists. Please choose a different name.`);
                return;
            }
        } catch (e) { /* network error — proceed */ }

        progressMsg.textContent = 'Exporting current session...';
        const exportJson = SwarmSpaceStore.exportForImport();

        try {
            progressMsg.textContent = 'Creating new session...';
            const defaultSession = SwarmSpaceStore.createDefaultSession();
            const putResp = await fetch(`${CONFIG.API_BASE_SWARM}/${trimmed}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(defaultSession)
            });
            if (!putResp.ok) throw new Error('Failed to create session: ' + putResp.status);

            progressMsg.textContent = 'Importing data into new session...';
            const newApi = createApi(trimmed, CONFIG.API_BASE_SWARM);
            await importIntoSession(newApi, exportJson);

            progressMsg.textContent = 'Done! Redirecting...';
            window.location.href = '?list=' + encodeURIComponent(trimmed);
        } catch (error) {
            closeModal('progressModal');
            showError('Failed to create next session. ' + error.message, error);
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

    /**
     * Handle export for import (JSON)
     */
    function handleExportForImport() {
        const json = SwarmSpaceStore.exportForImport();
        document.getElementById('exportJsonOutput').value = json;
        openModal('exportJsonModal');
    }

    /**
     * Handle copy JSON export
     */
    function handleCopyJsonExport() {
        const output = document.getElementById('exportJsonOutput');
        output.select();
        document.execCommand('copy');
        document.getElementById('copyJsonExportBtn').textContent = 'Copied!';
        setTimeout(() => {
            document.getElementById('copyJsonExportBtn').textContent = 'Copy to Clipboard';
        }, 2000);
    }

    // ============ UTILITIES ============

    /**
     * Get week index by ID
     */
    function getWeekIndex(weekId) {
        const session = SwarmSpaceStore.getSession();
        return session.weeks.findIndex(w => w.id === weekId);
    }

    /**
     * Get comment path for atomic operations
     * @param {number} weekIndex - Index of the week in the weeks array
     * @param {string} target - 'event', 'action', or 'completion:id'
     * @returns {string} - Dot-separated path to the comments array
     */
    function getCommentPath(weekIndex, target) {
        if (target === 'event') {
            return `weeks.${weekIndex}.event.comments`;
        } else if (target === 'action') {
            return `weeks.${weekIndex}.action.comments`;
        } else if (target.startsWith('completion:')) {
            const completionId = target.split(':')[1];
            const session = SwarmSpaceStore.getSession();
            const week = session.weeks[weekIndex];
            const compIndex = week.completions.findIndex(c => c.id === completionId);
            return `weeks.${weekIndex}.completions.${compIndex}.comments`;
        }
        return null;
    }

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

    /**
     * Show list selector when no list name is provided
     */
    function showListSelector() {
        const container = document.querySelector('.container');
        container.innerHTML = `
            <header class="header">
                <h1>Swarm Space RPG</h1>
            </header>
            <div class="card" style="text-align: center; padding: 2rem;">
                <h2>Select a Session</h2>
                <p style="margin-bottom: 1.5rem; color: #666;">Enter a session name to create or open a session.</p>
                <form id="listSelectorForm" style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                    <input type="text" id="listNameInput" class="input" placeholder="Session name..." 
                           style="min-width: 200px;" required pattern="[a-zA-Z0-9_-]+" 
                           title="Use letters, numbers, hyphens, and underscores only">
                    <button type="submit" class="btn btn-primary">Open Session</button>
                </form>
            </div>
        `;
        
        document.getElementById('listSelectorForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const listName = document.getElementById('listNameInput').value.trim();
            if (listName) {
                window.location.href = `?list=${encodeURIComponent(listName)}`;
            }
        });
    }

    // Public API
    return { init, manualRefresh, showListSelector };
})();
