// Swarm Space RPG Session Store

const SwarmSpaceStore = (function() {
    // Default empty session
    const DEFAULT_SESSION = {
        title: '',
        setting: '',
        currentWeekId: null,
        weeks: [],
        resources: [],
        locations: [],
        names: []
    };

    // Current session data
    let session = JSON.parse(JSON.stringify(DEFAULT_SESSION));

    /**
     * Generate a unique ID
     */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get the full session data
     */
    function getSession() {
        return session;
    }

    /**
     * Create a deep clone of the default empty session
     */
    function createDefaultSession() {
        return JSON.parse(JSON.stringify(DEFAULT_SESSION));
    }

    /**
     * Set the full session data
     */
    function setSession(data) {
        session = data || createDefaultSession();
        // Ensure all required fields exist
        session.weeks = session.weeks || [];
        session.resources = session.resources || [];
        session.locations = session.locations || [];
        session.names = session.names || [];
    }

    /**
     * Update session metadata
     */
    function updateMeta(title, setting) {
        session.title = title;
        session.setting = setting;
    }

    // ============ WEEK OPERATIONS ============

    /**
     * Add a new week
     */
    function addWeek() {
        // If weeks exist, new week is last week's number + 1; otherwise default to 1
        let weekNum = 1;
        if (session.weeks.length > 0) {
            const lastWeek = session.weeks[session.weeks.length - 1];
            weekNum = (lastWeek.weekNumber || 1) + 1;
        }
        const week = {
            id: generateId(),
            weekNumber: weekNum,
            event: { text: '', comments: [] },
            action: { type: 'discussion', text: '', comments: [] },
            completions: []
        };
        session.weeks.push(week);
        return week;
    }

    /**
     * Get a week by ID
     */
    function getWeek(weekId) {
        return session.weeks.find(w => w.id === weekId);
    }

    /**
     * Update week event text
     */
    function updateWeekEvent(weekId, text) {
        const week = getWeek(weekId);
        if (week) {
            week.event.text = text;
        }
    }

    /**
     * Update week action
     */
    function updateWeekAction(weekId, type, text) {
        const week = getWeek(weekId);
        if (week) {
            week.action.type = type;
            week.action.text = text;
        }
    }

    /**
     * Add comment to event or action
     */
    function addComment(weekId, target, text) {
        const week = getWeek(weekId);
        if (!week) return null;

        const comment = {
            id: generateId(),
            text: text
        };

        if (target === 'event') {
            week.event.comments.push(comment);
        } else if (target === 'action') {
            week.action.comments.push(comment);
        } else if (target.startsWith('completion:')) {
            const completionId = target.split(':')[1];
            const completion = week.completions.find(c => c.id === completionId);
            if (completion) {
                completion.comments = completion.comments || [];
                completion.comments.push(comment);
            }
        }
        return comment;
    }

    /**
     * Delete a comment
     */
    function deleteComment(weekId, target, commentId) {
        const week = getWeek(weekId);
        if (!week) return;

        let comments;
        if (target === 'event') {
            comments = week.event.comments;
        } else if (target === 'action') {
            comments = week.action.comments;
        } else if (target.startsWith('completion:')) {
            const completionId = target.split(':')[1];
            const completion = week.completions.find(c => c.id === completionId);
            if (completion) comments = completion.comments || [];
        }

        if (comments) {
            const idx = comments.findIndex(c => c.id === commentId);
            if (idx !== -1) comments.splice(idx, 1);
        }
    }

    /**
     * Delete a week
     */
    function deleteWeek(weekId) {
        const idx = session.weeks.findIndex(w => w.id === weekId);
        if (idx !== -1) {
            session.weeks.splice(idx, 1);
            // Clear current if deleted
            if (session.currentWeekId === weekId) {
                session.currentWeekId = null;
            }
        }
    }

    /**
     * Set the current week
     */
    function setCurrentWeek(weekId) {
        session.currentWeekId = weekId;
    }

    /**
     * Get the current week ID (defaults to first week if not set)
     */
    function getCurrentWeekId() {
        if (session.currentWeekId) {
            // Verify the week still exists
            const exists = session.weeks.some(w => w.id === session.currentWeekId);
            if (exists) return session.currentWeekId;
        }
        // Default to first week
        return session.weeks.length > 0 ? session.weeks[0].id : null;
    }

    // ============ PROJECT OPERATIONS ============

    /**
     * Start a new project
     */
    function startProject(weekId, name, duration) {
        const week = getWeek(weekId);
        if (!week) return null;

        const completionWeekNum = week.weekNumber + duration;

        // Set the action on the source week
        week.action.type = 'project';
        week.action.projectName = name;
        week.action.projectDuration = duration;

        // Add completion entry to the target week (create if needed)
        ensureWeekExists(completionWeekNum);
        const completionWeek = session.weeks.find(w => w.weekNumber === completionWeekNum);
        if (completionWeek) {
            completionWeek.completions.push({
                id: generateId(),
                projectName: name,
                comments: []
            });
        }

        return { name, completionWeek: completionWeekNum };
    }

    /**
     * Ensure a week exists (creates empty weeks up to weekNum)
     */
    function ensureWeekExists(weekNum) {
        while (session.weeks.length < weekNum) {
            addWeek();
        }
    }

    /**
     * Add a manual completion (not linked to a project)
     */
    function addManualCompletion(weekId, name) {
        const week = getWeek(weekId);
        if (!week) return null;

        const completion = {
            id: generateId(),
            projectName: name,
            comments: []
        };
        week.completions.push(completion);
        return completion;
    }

    /**
     * Delete a completion
     */
    function deleteCompletion(weekId, completionId) {
        const week = getWeek(weekId);
        if (!week) return;

        const idx = week.completions.findIndex(c => c.id === completionId);
        if (idx !== -1) {
            week.completions.splice(idx, 1);
        }
    }

    // ============ RESOURCE OPERATIONS ============

    /**
     * Add or update a resource
     */
    function upsertResource(id, name, status) {
        if (id) {
            const resource = session.resources.find(r => r.id === id);
            if (resource) {
                resource.name = name;
                resource.status = status;
                return resource;
            }
        }
        const resource = { id: generateId(), name, status };
        session.resources.push(resource);
        return resource;
    }

    /**
     * Delete a resource
     */
    function deleteResource(id) {
        const idx = session.resources.findIndex(r => r.id === id);
        if (idx !== -1) session.resources.splice(idx, 1);
    }

    // ============ LOCATION OPERATIONS ============

    /**
     * Add or update a location
     */
    function upsertLocation(id, name, distance, notes) {
        if (id) {
            const location = session.locations.find(l => l.id === id);
            if (location) {
                location.name = name;
                location.distance = distance;
                location.notes = notes;
                return location;
            }
        }
        const location = { id: generateId(), name, distance, notes };
        session.locations.push(location);
        return location;
    }

    /**
     * Delete a location
     */
    function deleteLocation(id) {
        const idx = session.locations.findIndex(l => l.id === id);
        if (idx !== -1) session.locations.splice(idx, 1);
    }

    // ============ NAME OPERATIONS ============

    /**
     * Add or update a name
     */
    function upsertName(id, name, description) {
        if (id) {
            const existing = session.names.find(n => n.id === id);
            if (existing) {
                existing.name = name;
                existing.description = description;
                return existing;
            }
        }
        const entry = { id: generateId(), name, description };
        session.names.push(entry);
        return entry;
    }

    /**
     * Delete a name
     */
    function deleteName(id) {
        const idx = session.names.findIndex(n => n.id === id);
        if (idx !== -1) session.names.splice(idx, 1);
    }

    // ============ EXPORT ============

    /**
     * Export session to Markdown
     */
    function exportMarkdown() {
        // Split multi-line text: first line stays inline, rest become sub-bullets
        function formatLines(text, indent) {
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length <= 1) return text;
            return lines[0] + '\n' + lines.slice(1).map(l => `${indent}- ${l.trim()}`).join('\n');
        }

        let md = '';

        // Title and setting
        if (session.title) {
            md += `# ${session.title}\n\n`;
        }
        if (session.setting) {
            md += `**Setting:** ${session.setting}\n\n`;
        }
        md += '---\n\n## Weekly Log\n\n';

        // Weeks
        session.weeks.forEach(week => {
            const isCurrent = week.id === session.currentWeekId;
            md += `### Week ${week.weekNumber}${isCurrent ? ' (Current)' : ''}\n\n`;

            // Event
            if (week.event.text) {
                md += `- **Event:** ${formatLines(week.event.text, '  ')}\n`;
                if (week.event.comments.length > 0) {
                    week.event.comments.forEach(c => {
                        md += `  - ${formatLines(c.text, '    ')}\n`;
                    });
                }
            }

            // Completions
            if (week.completions && week.completions.length > 0) {
                week.completions.forEach(comp => {
                    md += `- **Completed:** ${comp.projectName}\n`;
                    if (comp.comments && comp.comments.length > 0) {
                        comp.comments.forEach(c => {
                            md += `  - ${formatLines(c.text, '    ')}\n`;
                        });
                    }
                });
            }

            // Action
            const actionLabel = week.action.type.charAt(0).toUpperCase() + week.action.type.slice(1);
            if (week.action.type === 'project' && week.action.projectName) {
                const duration = week.action.projectDuration || '?';
                md += `- **Project:** ${week.action.projectName} (${duration} week${duration !== 1 ? 's' : ''})\n`;
                if (week.action.comments && week.action.comments.length > 0) {
                    week.action.comments.forEach(c => {
                        md += `  - ${formatLines(c.text, '    ')}\n`;
                    });
                }
            } else if (week.action.comments && week.action.comments.length > 0) {
                if (week.action.type === 'discussion') {
                    md += `- **${actionLabel}:** <discussion type="speculative - not established facts">\n`;
                    week.action.comments.forEach(c => {
                        md += `  - ${formatLines(c.text, '    ')}\n`;
                    });
                    md += `  </discussion>\n`;
                } else {
                    md += `- **${actionLabel}:**\n`;
                    week.action.comments.forEach(c => {
                        md += `  - ${formatLines(c.text, '    ')}\n`;
                    });
                }
            }

            md += '\n';
        });

        // Scarcities and Abundances
        const scarcities = session.resources.filter(r => r.status === 'scarce' || r.status === 'critical');
        const abundances = session.resources.filter(r => r.status === 'abundant' || r.status === 'sufficient');

        if (scarcities.length > 0 || abundances.length > 0) {
            md += '---\n\n';
        }

        if (scarcities.length > 0) {
            md += '## Scarcities\n\n';
            scarcities.forEach(r => {
                md += `- ${r.name}\n`;
            });
            md += '\n';
        }

        if (abundances.length > 0) {
            md += '## Abundances\n\n';
            abundances.forEach(r => {
                md += `- ${r.name}\n`;
            });
            md += '\n';
        }

        // Locations summary
        if (session.locations.length > 0) {
            md += '## Locations\n\n';
            md += '| Location | Distance | Notes |\n';
            md += '|----------|----------|-------|\n';
            session.locations.forEach(l => {
                md += `| ${l.name} | ${l.distance || '-'} | ${l.notes || '-'} |\n`;
            });
            md += '\n';
        }

        // Projects - derived from starts and completions
        const starts = new Map();
        session.weeks.forEach(week => {
            if (week.action.type === 'project' && week.action.projectName) {
                const name = week.action.projectName.toLowerCase();
                starts.set(name, { name: week.action.projectName, startWeek: week.weekNumber });
            }
        });

        const completions = new Map();
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

        const allNames = new Set([...starts.keys(), ...completions.keys()]);
        const projects = [];

        allNames.forEach(nameLower => {
            const start = starts.get(nameLower);
            const completion = completions.get(nameLower);
            projects.push({
                name: start?.name || completion?.name,
                startWeek: start?.startWeek || null,
                completionWeek: completion?.completionWeek || null,
                status: completion?.hasComments ? 'completed' : 'active'
            });
        });

        if (projects.length > 0) {
            md += '## Projects\n\n';
            projects.forEach(p => {
                const startLabel = p.startWeek ? `Week ${p.startWeek}` : '?';
                const endLabel = p.completionWeek ? `Week ${p.completionWeek}` : '?';
                const status = p.status === 'completed' ? '✓' : '...';
                md += `- ${p.name} (${startLabel} → ${endLabel}) ${status}\n`;
            });
            md += '\n';
        }

        // Names (organized by group)
        if (session.names.length > 0) {
            md += '## Names\n\n';

            // Group names by their group field
            const ungrouped = [];
            const grouped = new Map();

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

            // Output ungrouped names first
            if (ungrouped.length > 0) {
                ungrouped.forEach(n => {
                    if (n.description) {
                        md += `- **${n.name}**: ${n.description}\n`;
                    } else {
                        md += `- ${n.name}\n`;
                    }
                });
                if (sortedGroups.length > 0) {
                    md += '\n';
                }
            }

            // Output grouped names
            sortedGroups.forEach((groupName, idx) => {
                md += `### ${groupName}\n\n`;
                grouped.get(groupName).forEach(n => {
                    if (n.description) {
                        md += `- **${n.name}**: ${n.description}\n`;
                    } else {
                        md += `- ${n.name}\n`;
                    }
                });
                if (idx < sortedGroups.length - 1) {
                    md += '\n';
                }
            });
        }

        return md;
    }

    /**
     * Export session as structured JSON for importing into a new session.
     * Strips IDs (they'll get new ones on import), includes startingWeekNumber.
     */
    function exportForImport() {
        const data = {
            version: '1.0',
            exportType: 'swarmspace-import',
            startingWeekNumber: 1,
            resources: [],
            locations: [],
            names: [],
            unfinishedProjects: []
        };

        // startingWeekNumber: current week's weekNumber + 1 (or 1 if no weeks)
        if (session.weeks.length > 0) {
            const currentWeekId = getCurrentWeekId();
            const currentWeek = currentWeekId ? getWeek(currentWeekId) : null;
            const currentWeekNumber = currentWeek ? currentWeek.weekNumber : session.weeks[session.weeks.length - 1].weekNumber;
            data.startingWeekNumber = (currentWeekNumber || 1) + 1;
        }

        // Resources (strip IDs)
        data.resources = session.resources.map(r => ({ name: r.name, status: r.status }));

        // Locations (strip IDs)
        data.locations = session.locations.map(l => {
            const loc = { name: l.name, distance: l.distance || '', notes: l.notes || '' };
            return loc;
        });

        // Names (strip IDs, preserve group)
        data.names = session.names.map(n => {
            const entry = { name: n.name, description: n.description || '' };
            if (n.group) entry.group = n.group;
            return entry;
        });

        // Unfinished projects: same derivation as exportMarkdown() lines 446-478
        const starts = new Map();
        session.weeks.forEach(week => {
            if (week.action.type === 'project' && week.action.projectName) {
                const name = week.action.projectName.toLowerCase();
                starts.set(name, { name: week.action.projectName, startWeek: week.weekNumber });
            }
        });

        const completions = new Map();
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

        const allProjectNames = new Set([...starts.keys(), ...completions.keys()]);
        const currentWeekId = getCurrentWeekId();
        const currentWeekObj = currentWeekId ? getWeek(currentWeekId) : null;
        const currentWeekNumber = currentWeekObj
            ? currentWeekObj.weekNumber
            : (session.weeks.length > 0 ? session.weeks[session.weeks.length - 1].weekNumber : 0);

        allProjectNames.forEach(nameLower => {
            const start = starts.get(nameLower);
            const completion = completions.get(nameLower);

            // Only include unfinished projects (completion has no comments)
            if (completion?.hasComments) return;

            const completionWeek = completion?.completionWeek || null;
            let remaining = null;
            if (completionWeek && currentWeekNumber) {
                remaining = completionWeek - currentWeekNumber;
                if (remaining < 1) remaining = 1;
            }

            data.unfinishedProjects.push({
                name: start?.name || completion?.name,
                remaining
            });
        });

        return JSON.stringify(data, null, 2);
    }

    /**
     * Parse JSON export into importable items (pure function, no side effects).
     * Validates the format and returns the same shape as parseMarkdownImport plus startingWeekNumber.
     * @param {string} jsonString - The exported JSON text
     * @returns {{ startingWeekNumber: number, resources: Array, locations: Array, names: Array, unfinishedProjects: Array }}
     */
    function parseJsonImport(jsonString) {
        let data;
        try {
            data = JSON.parse(jsonString);
        } catch (e) {
            throw new Error('Invalid JSON format');
        }

        if (data.exportType !== 'swarmspace-import') {
            throw new Error("This doesn't look like a SwarmSpace export. Use 'Export for Import' to get the right format.");
        }

        if (!data.version) {
            throw new Error('Missing version');
        }

        if (parseFloat(data.version) > 1.0) {
            throw new Error('Unsupported version');
        }

        const validStatuses = ['scarce', 'critical', 'abundant', 'sufficient'];

        // Validate resources
        const resources = (data.resources || []).map((r, i) => {
            if (!r.name) throw new Error(`Resource at index ${i} is missing a name`);
            if (!validStatuses.includes(r.status)) {
                throw new Error(`Resource "${r.name}" has invalid status "${r.status}"`);
            }
            return { name: r.name, status: r.status };
        });

        // Validate locations
        const locations = (data.locations || []).map((l, i) => {
            if (!l.name) throw new Error(`Location at index ${i} is missing a name`);
            return { name: l.name, distance: l.distance || '', notes: l.notes || '' };
        });

        // Validate names
        const names = (data.names || []).map((n, i) => {
            if (!n.name) throw new Error(`Name at index ${i} is missing a name`);
            const entry = { name: n.name, description: n.description || '' };
            if (n.group) entry.group = n.group;
            return entry;
        });

        // Validate unfinished projects
        const unfinishedProjects = (data.unfinishedProjects || []).map((p, i) => {
            if (!p.name) throw new Error(`Project at index ${i} is missing a name`);
            return { name: p.name, remaining: p.remaining || null };
        });

        return {
            startingWeekNumber: data.startingWeekNumber || 1,
            resources,
            locations,
            names,
            unfinishedProjects
        };
    }

    /**
     * Parse exported markdown into importable items (pure function, no side effects)
     * @param {string} markdown - The exported markdown text
     * @returns {{ resources: Array, locations: Array, names: Array, unfinishedProjects: Array }}
     */
    function parseMarkdownImport(markdown) {
        const resources = [];
        const locations = [];
        const names = [];
        const unfinishedProjects = [];

        // Parse Scarcities
        const scarcitiesMatch = markdown.match(/## Scarcities\n\n([\s\S]*?)(?=\n## (?!#)|$)/);
        if (scarcitiesMatch) {
            const lines = scarcitiesMatch[1].split('\n').filter(l => l.startsWith('- '));
            lines.forEach(line => {
                const name = line.replace(/^- /, '').trim();
                if (name) {
                    resources.push({ name, status: 'scarce' });
                }
            });
        }

        // Parse Abundances
        const abundancesMatch = markdown.match(/## Abundances\n\n([\s\S]*?)(?=\n## (?!#)|$)/);
        if (abundancesMatch) {
            const lines = abundancesMatch[1].split('\n').filter(l => l.startsWith('- '));
            lines.forEach(line => {
                const name = line.replace(/^- /, '').trim();
                if (name) {
                    resources.push({ name, status: 'abundant' });
                }
            });
        }

        // Parse Locations
        const locationsMatch = markdown.match(/## Locations\n\n\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n## (?!#)|$)/);
        if (locationsMatch) {
            const lines = locationsMatch[1].split('\n').filter(l => l.startsWith('|'));
            lines.forEach(line => {
                const cols = line.split('|').map(c => c.trim()).filter(c => c);
                if (cols.length >= 1) {
                    const name = cols[0];
                    const distance = cols[1] !== '-' ? cols[1] : '';
                    const notes = cols[2] !== '-' ? cols[2] : '';
                    if (name) {
                        locations.push({ name, distance: distance || '', notes: notes || '' });
                    }
                }
            });
        }

        // Parse Names (negative lookahead: stop at next h2, not h3 group headers)
        const namesMatch = markdown.match(/## Names\n\n([\s\S]*?)(?=\n## (?!#)|$)/);
        if (namesMatch) {
            const lines = namesMatch[1].split('\n');
            let currentGroup = '';
            lines.forEach(line => {
                // Track group headers (### GroupName)
                const groupMatch = line.match(/^### (.+)$/);
                if (groupMatch) {
                    currentGroup = groupMatch[1].trim();
                    return;
                }
                if (!line.startsWith('- ')) return;
                // Match: - **Name**: Description or - Name
                const boldMatch = line.match(/^- \*\*(.+?)\*\*: (.+)$/);
                if (boldMatch) {
                    const entry = { name: boldMatch[1], description: boldMatch[2] };
                    if (currentGroup) entry.group = currentGroup;
                    names.push(entry);
                } else {
                    const name = line.replace(/^- /, '').trim();
                    if (name) {
                        const entry = { name, description: '' };
                        if (currentGroup) entry.group = currentGroup;
                        names.push(entry);
                    }
                }
            });
        }

        // Parse last week number from Weekly Log (needed for remaining duration calc)
        let lastWeekNumber = 0;
        const weekHeaders = markdown.match(/### Week (\d+)/g);
        if (weekHeaders) {
            weekHeaders.forEach(h => {
                const num = parseInt(h.match(/\d+/)[0], 10);
                if (num > lastWeekNumber) lastWeekNumber = num;
            });
        }

        // Parse Projects - find unfinished ones (marked with ...)
        const projectsMatch = markdown.match(/## Projects\n\n([\s\S]*?)(?=\n## (?!#)|$)/);
        if (projectsMatch) {
            const lines = projectsMatch[1].split('\n').filter(l => l.startsWith('- '));
            lines.forEach(line => {
                // Format: - ProjectName (Week X → Week Y) ...  or  ✓
                const m = line.match(/^- (.+?) \((Week (\d+)|\?) → (Week (\d+)|\?)\) (\.\.\.|✓)$/);
                if (m && m[6] === '...') {
                    const name = m[1];
                    const startWeek = m[3] ? parseInt(m[3], 10) : null;
                    const completionWeek = m[5] ? parseInt(m[5], 10) : null;
                    let remaining = null;
                    if (completionWeek && lastWeekNumber) {
                        remaining = completionWeek - lastWeekNumber;
                        if (remaining < 1) remaining = 1;
                    }
                    unfinishedProjects.push({ name, startWeek, completionWeek, remaining });
                }
            });
        }

        return { resources, locations, names, unfinishedProjects };
    }

    // Public API
    return {
        getSession,
        setSession,
        createDefaultSession,
        updateMeta,
        addWeek,
        getWeek,
        updateWeekEvent,
        updateWeekAction,
        addComment,
        deleteComment,
        deleteWeek,
        setCurrentWeek,
        getCurrentWeekId,
        startProject,
        addManualCompletion,
        deleteCompletion,
        upsertResource,
        deleteResource,
        upsertLocation,
        deleteLocation,
        upsertName,
        deleteName,
        exportMarkdown,
        exportForImport,
        parseMarkdownImport,
        parseJsonImport
    };
})();
