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
     * Set the full session data
     */
    function setSession(data) {
        session = data || JSON.parse(JSON.stringify(DEFAULT_SESSION));
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
                md += `- **Event:** ${week.event.text}\n`;
                if (week.event.comments.length > 0) {
                    week.event.comments.forEach(c => {
                        md += `  - ${c.text}\n`;
                    });
                }
            }

            // Completions
            if (week.completions && week.completions.length > 0) {
                week.completions.forEach(comp => {
                    md += `- **Completed:** ${comp.projectName}\n`;
                    if (comp.comments && comp.comments.length > 0) {
                        comp.comments.forEach(c => {
                            md += `  - ${c.text}\n`;
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
                        md += `  - ${c.text}\n`;
                    });
                }
            } else if (week.action.comments && week.action.comments.length > 0) {
                if (week.action.type === 'discussion') {
                    md += `- **${actionLabel}:** <discussion type="speculative - not established facts">\n`;
                    week.action.comments.forEach(c => {
                        md += `  - ${c.text}\n`;
                    });
                    md += `  </discussion>\n`;
                } else {
                    md += `- **${actionLabel}:**\n`;
                    week.action.comments.forEach(c => {
                        md += `  - ${c.text}\n`;
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

        // Names
        if (session.names.length > 0) {
            md += '## Names\n\n';
            session.names.forEach(n => {
                if (n.description) {
                    md += `- **${n.name}**: ${n.description}\n`;
                } else {
                    md += `- ${n.name}\n`;
                }
            });
        }

        return md;
    }

    // Public API
    return {
        getSession,
        setSession,
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
        exportMarkdown
    };
})();
