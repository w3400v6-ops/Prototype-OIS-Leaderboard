let currentSearchPage = 1;
let filteredLogsGlobal = [];
const logsPerPage = 10;
const searchDelayMs = 300;
let searchTimer = null;

const searchInput = document.getElementById('studentSearch');
const dynamicView = document.getElementById('dynamic-log-view');
const logList = document.getElementById('search-log-list');


// 2. Updated Event Listener
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();

    if (query.length === 0) {
        dynamicView.classList.add('hidden');
        clearTimeout(searchTimer);
        return;
    }

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        const currentData = Object.values(allLogs);
        const fuse = new Fuse(currentData, {
            keys: ['houseName', 'category', 'rankText', 'comment'],
            threshold: 0.4
        });

        const results = fuse.search(query);
        filteredLogsGlobal = results.map(result => result.item);

        currentSearchPage = 1;
        dynamicView.classList.remove('hidden');
        renderPaginatedLogs();

        const searchSection = document.querySelector('.search-section');
        setTimeout(() => {
            searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }, searchDelayMs);
});

function renderPaginatedLogs() {
    const startIndex = (currentSearchPage - 1) * logsPerPage;
    const endIndex = startIndex + logsPerPage;
    const pageResults = filteredLogsGlobal.slice(startIndex, endIndex);

    if (filteredLogsGlobal.length === 0) {
        logList.innerHTML = `<p style="color:#999; text-align:center; font-size:0.8em; padding:20px;">No logs found.</p>`;
        updatePaginationUI(0);
        return;
    }

    // 2. Render the specific slice for this page
    logList.innerHTML = pageResults.map(log => createLogEntryHTML(log)).join('');
    
    // 3. Update the buttons
    updatePaginationUI(filteredLogsGlobal.length);
}

// Helper function to keep your code clean
function createLogEntryHTML(log) {
    const houseName = log.houseName;
    const logComment = log.comment && log.comment !== "No comment provided" ? ` - ${log.comment} ` : "";
    const isPenalty = log.rankText === 'Penalty' || log.pointsAdded < 0;
    const pointsDisplay = isPenalty ? `${log.pointsAdded}` : `+${log.pointsAdded}`;
    const pointsClass = isPenalty ? 'log-points-negative' : 'log-points';
    const pointsColor = isPenalty ? '#e74c3c' : '#2ecc71';

    const reasonText = (isPenalty) 
        ? `${log.rankText}${logComment}` 
        : `${log.rankText} in ${log.category}${logComment}`;

    return `
        <div class="log-entry">
            <div class="log-info">
                <div class="log-house" style="font-weight:bold; white-space:pre-wrap;">${houseName}:
</div>
                <div class="log-reason">${reasonText}</div>
            </div>
            <div class="${pointsClass}" style="font-weight:bold; color:${pointsColor}">
                ${pointsDisplay}
            </div>
        </div>
    `;
}

function updatePaginationUI(totalResults) {
    const totalPages = Math.ceil(totalResults / logsPerPage);
    let controls = document.getElementById('pagination-controls');
    
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'pagination-controls';
        dynamicView.appendChild(controls);
    }

    if (totalPages <= 1) {
        controls.innerHTML = '';
        return;
    }

    controls.className = 'pagination-wrapper';
    controls.innerHTML = `
        <button ${currentSearchPage === 1 ? 'disabled' : ''} onclick="changeSearchPage(-1)">Prev</button>
        <span class="page-info">Page ${currentSearchPage} of ${totalPages}</span>
        <button ${currentSearchPage === totalPages ? 'disabled' : ''} onclick="changeSearchPage(1)">Next</button>
    `;
}

// Global function to handle button clicks
window.changeSearchPage = (direction) => {
    currentSearchPage += direction;
    renderPaginatedLogs();
};
