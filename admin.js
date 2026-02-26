const firebaseConfig = {
    apiKey: "AIzaSyBIIEQt0ryHNulKYNmfCliMywmSzzQuBls",
    authDomain: "my-epic-database.firebaseapp.com",
    databaseURL: "https://my-epic-database-default-rtdb.firebaseio.com",
    projectId: "my-epic-database",
    storageBucket: "my-epic-database.appspot.com",
    messagingSenderId: "533989527206",
    appId: "1:533989527206:web:d34c0a693e6f19dc43ae67"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

const houseEls = Array.from(document.querySelectorAll('.house'))

let eventTypeData = {}; // Global variable to store points from DB

auth.onAuthStateChanged(async (user) => {
const adminSection = document.getElementById('admin-section');
const unauthorizedSection = document.getElementById('unauthorized-section');
const loadingOverlay = document.getElementById('loading-overlay');

if (user && user.email.endsWith('@oakbridge.edu.my')) {
    // 1. Sanitize the email for Firebase key (dots to commas)
    const emailKey = user.email.toLowerCase().split('.').join(',');
    
    // 2. Check the AdminEmail list in the DB
    db.ref(`AdminEmails/${emailKey}`).once('value', snapshot => {
    if (snapshot.exists()) {
        // SUCCESS: User is an authorized admin
        unauthorizedSection.classList.add('hidden');
        adminSection.classList.remove('hidden');
        loadingOverlay.classList.add('hidden');
        document.getElementById('admin-email-display').innerText = user.email;

        // Start all your listeners
        fetchInitialData();
        startLeaderboardListener();
        startIdleTracking();
        startLogsListener();
        startRecycleBinListener();
    } else {
        // FAIL: Logged in with school email, but NOT an admin
        showUnauthorized();
    }
    });
} else {
    // FAIL: Not logged in or wrong domain
    showUnauthorized();
}
});

function showUnauthorized() {
document.body.classList.remove('loading');
document.getElementById('loading-overlay').classList.add('hidden');
document.getElementById('admin-section').classList.add('hidden');
document.getElementById('unauthorized-section').classList.remove('hidden');
}

function fetchInitialData() {
    db.ref('Houses').once('value', snapshot => {
    const select = document.getElementById('house-select');
    select.innerHTML = "";
    snapshot.forEach(child => {
        select.add(new Option(child.val().name, child.key));
    });
    });

    db.ref('Categories').once('value', snapshot => {
    const select = document.getElementById('category-select');
    // Clear everything except the first (Select) and last (Other)
    const otherOption = select.options[select.options.length - 1];
    const deductionOption = select.options[select.options.length - 2];
    const placeholder = select.options[0];
    
    select.innerHTML = "";
    select.add(placeholder);
    
    snapshot.forEach(child => {
        select.add(new Option(child.val(), child.val()));
    });
    select.add(deductionOption);
    select.add(otherOption);
    });

    db.ref('EventType').once('value', snapshot => {
    eventTypeData = snapshot.val();
    });
}

function handleCategoryChange() {
    const category = document.getElementById('category-select').value;
    const scoringSection = document.getElementById('scoring-section');
    const deductionSection = document.getElementById('deduction-section');
    const customContainer = document.getElementById('custom-category-container');

    // 1. Handle "Other" text box
    customContainer.classList.toggle('hidden', category !== "Other");

    // 2. Handle Deduction vs Normal Scoring
    if (category === "Bad Behaviour") {
    scoringSection.classList.add('hidden');
    deductionSection.classList.remove('hidden');
    } else {
    scoringSection.classList.remove('hidden');
    deductionSection.classList.add('hidden');
    }
}

function updateRankingDropdown() {
    const type = document.getElementById('event-type-select').value;
    const rankSelect = document.getElementById('ranking-select');
    rankSelect.innerHTML = "";

    if (!type || !eventTypeData[type]) {
    rankSelect.add(new Option("-- Select Event Type First --", ""));
    return;
    }

    const scores = eventTypeData[type];
    rankSelect.add(new Option("-- Select Ranking --", ""));

    // Loop through 1, 2, 3, (and 4 if Group)
    Object.keys(scores).forEach(rank => {
    const pts = scores[rank];
    const suffix = (rank == 1) ? "st" : (rank == 2) ? "nd" : (rank == 3) ? "rd" : "th";
    const text = `${rank}${suffix} place - ${pts} points`;
    rankSelect.add(new Option(text, pts)); // Value is the actual points
    });
}

function updateScore() {
    const houseId = document.getElementById('house-select').value;
    const houseName = document.getElementById('house-select').options[document.getElementById('house-select').selectedIndex].text;
    const categorySelect = document.getElementById('category-select');
    const comment = document.getElementById('comment').value || "No comment provided"; // Handle empty comment
    let category = categorySelect.value;
    let addedPoints = 0;
    let rankText = "";
    let eventType = "";

    // Logic for Bad Behaviour
    if (category === "Bad Behaviour") {
    const deduction = parseInt(document.getElementById('deduction-input').value);
    if (isNaN(deduction) || deduction <= 0) return alert("Please enter a valid deduction amount.");
    addedPoints = -deduction; // Turn into negative
    rankText = "Penalty";
    eventType = ""
    } 
    // Logic for Normal Scoring
    else {
    addedPoints = parseInt(document.getElementById('ranking-select').value);
    const rankSelect = document.getElementById('ranking-select');
    rankText = rankSelect.options[rankSelect.selectedIndex].text.split(' - ')[0];
    eventType = document.getElementById('event-type-select').value;

    if (category === "Other") {
        category = document.getElementById('custom-category-input').value.trim();
    }
    if (!eventType) return alert("Please select an Event Type.");
    if (isNaN(addedPoints)) return alert("Please select a ranking.");
    }

    if (!category || category === "") return alert("Category Required: Please select a category or enter a custom one under 'Other'.");

    const now = new Date();
    const fullTimestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    
    let oldScore = 0;
    const houseRef = db.ref(`Houses/${houseId}`);

    houseRef.child('score').transaction(current => {
    oldScore = current || 0;
    return oldScore + addedPoints;
    }).then((result) => {
    if(result.committed) {
        db.ref('Logs').push().set({
        fullDateTime: fullTimestamp,
        unixTimestamp: firebase.database.ServerValue.TIMESTAMP,
        rankText: rankText,
        houseId: houseId, 
        houseName: houseName,
        previousPoints: oldScore, 
        pointsAdded: addedPoints, 
        newTotal: oldScore + addedPoints,
        category: category, 
        eventType: eventType,
        comment: comment, 
        adminEmail: auth.currentUser.email
        });
        
        if (category === "Bad Behaviour") {
        alert(`Success! deduct ${Math.abs(addedPoints)} points from ${houseName}`);
        }
        else
        {
        alert(`Success! added ${Math.abs(addedPoints)} points to ${houseName}`);
        }

        document.getElementById('comment').value = "";
        document.getElementById('custom-category-input').value = "";
        document.getElementById('ranking-select').selectedIndex = 0;
        document.getElementById('event-type-select').selectedIndex = 0;
        categorySelect.selectedIndex = 0;
        toggleCustomCategory();
    }
    });
}

function startLeaderboardListener() {
    const houseIds = ['red', 'blue', 'green', 'yellow'];
    db.ref('Houses').on('value', snapshot => {
    const data = snapshot.val();
    if(!data) return;
    // Remove loading state once data arrives
    document.body.classList.remove('loading');

    houseEls.forEach(el => {
        const key = el.dataset.house;
        const scoreEl = el.querySelector('.score');
        const nameEl = el.querySelector('.name');

        // 1. Re-insert the real image (replaces the skeleton-img div)
        // Adjust the path to your local image files
        const imgMap = {
        red: 'red.png',
        blue: 'blue.png',
        green: 'green.png',
        yellow: 'yellow.png'
        };
        
        // 1. Set names and scores immediately after loading
        el.innerHTML = `
        <img src="${imgMap[key]}" alt="${data[key].name}">
        <div class="info"><p class="name">${data[key].name}</p></div>
        <div class="score">${data[key].score}</div>
        `;
    });

    const sorted = houseIds.slice().sort((a,b) => (data[b]?.score || 0) - (data[a]?.score || 0));
    sorted.forEach((id, i) => {
        document.getElementById(id).style.order = i;
        document.getElementById(id).classList.remove('leader');
    });
    document.getElementById(sorted[0]).classList.add('leader');
    });
}

let displayLimit = 5; // Start with 5

function expandLogs() {
    displayLimit += 10; // Increase to 50 (or whatever number you prefer)
    startLogsListener(); // Restart the listener with the new limit

    const container = document.querySelector('.logs-container');
    if (container) {
    container.scrollTop = 0;
    }
}

function startLogsListener() {
    const logsRef = db.ref('Logs');

    // 1. First, check the total count of logs to see if we even need a button
    logsRef.on('value', totalSnapshot => {
    const totalCount = totalSnapshot.numChildren();
    const readMoreContainer = document.getElementById('read-more-container');

    // If total logs in DB is more than what we are currently displaying, show button
    if (totalCount > displayLimit) {
        readMoreContainer.classList.remove('hidden');
    } else {
        readMoreContainer.classList.add('hidden');
    }
    });

    // Listen for the last 5 logs
    logsRef.orderByChild('unixTimestamp').limitToLast(displayLimit).on('value', snapshot => {
    const logsBody = document.getElementById('logs-body');
    logsBody.innerHTML = ""; // Clear current table

    const logs = [];
    snapshot.forEach(child => {
        // 1. Get the data fields (houseName, pointsAdded, etc.)
        const data = child.val();
        // 2. Get the UNIQUE ID (the key like -Njk123...)
        const id = child.key;
        // 3. Combine them into one object and push to our array
        logs.push({ id: id, ...data });
    });

    // Reverse so the newest is at the top
    logs.reverse().forEach(log => {
        const row = logsBody.insertRow();
        
        // Column 1: Time
        const timeCell = row.insertCell(0);
        const AddedAt = new Date(log.unixTimestamp).toLocaleString([], {year:"numeric", month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
        timeCell.innerHTML = `${AddedAt}`;


        // Column 2: Description
        const descCell = row.insertCell(1);
        //const pointText = log.pointsAdded > 0 ? `added ${log.pointsAdded}` : `removed ${Math.abs(log.pointsAdded)}`;
        const rankInfo = log.rankText ? `${log.rankText}` : "";

        if (log.rankText === "Penalty")
        {
        descCell.innerHTML = `
            <span class="log-house">${log.houseName}</span> loses <span class="log-house">${Math.abs(log.pointsAdded)} points </span> for receiving a
            <span class="log-house"> ${rankInfo}</span> due to <span class="log-house">${log.category}</span>. 
            <br><small style="color:#888;">"${log.comment}" — ${log.adminEmail}</small>
        `;
        }
        else{
        descCell.innerHTML = `
            <span class="log-house">${log.houseName}</span> gains <span class="log-house">${Math.abs(log.pointsAdded)} points </span> for winning
            <span class="log-house"> ${rankInfo}</span> in <span class="log-house">${log.category}</span>. 
            <br><small style="color:#888;">"${log.comment}" — ${log.adminEmail}</small>
        `;
        }
        

        const actionCell = row.insertCell(2);
        const btn = document.createElement('button');
        btn.className = "icon-btn";
        btn.title = "Delete and Revert Points";
        btn.innerHTML = `
        <svg viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>`;
        btn.onclick = () => deleteLog(log.id, log);
        actionCell.appendChild(btn)
    });
    });
}

function deleteLog(logId, logData) {
    console.log(logId);

    const currentUserEmail = auth.currentUser.email;

    if (logData.adminEmail !== currentUserEmail) {
    alert(`Permission Denied: Only ${logData.adminEmail} can delete this log.`);
    return; // Stop the function here
    }

    const confirmation = confirm(`Are you sure you want to delete this log? This will remove ${logData.pointsAdded} points from ${logData.houseName}.`);
    
    if (!confirmation) return;

    const houseRef = db.ref(`Houses/${logData.houseId}/score`);

    // 1. Revert the math using a transaction
    houseRef.transaction(currentScore => {
    // To reverse, we SUBTRACT the points that were originally added
    return (currentScore || 0) - logData.pointsAdded;
    }).then((result) => {
    if (result.committed) {
        // 2. Add the log to the Recycle node
        const recycleRef = db.ref('Recycle').push();
        recycleRef.set({
        ...logData,
        deletedAt: firebase.database.ServerValue.TIMESTAMP,
        deletedBy: auth.currentUser.email
        });

        // 3. Remove the original log from Logs
        return db.ref('Logs').child(logId).remove();
        alert("Log deleted and points reverted!");
    }
    }).catch(err => {
    alert("Error reverting points: " + err.message);
    });
}

function startRecycleBinListener() {
    const recycleRef = db.ref('Recycle');

    recycleRef.on('value', snapshot => {
    const recycleBody = document.getElementById('recycle-body');
    recycleBody.innerHTML = ""; // Clear table once before the loop

    const deletedItems = [];
    snapshot.forEach(child => {
        // Capture the ID (key) so we can restore it later
        deletedItems.push({ recycleKey: child.key, ...child.val() });
    });

    // Sort by deletion time (newest first)
    deletedItems.sort((a, b) => b.deletedAt - a.deletedAt);

    // Limit to last 5 for now
    deletedItems.slice(0, 5).forEach(item => {
        const row = recycleBody.insertRow();
        
        const deletedAt = new Date(item.deletedAt).toLocaleString([], {year:"numeric", month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
        
        row.insertCell(0).innerHTML = `${deletedAt}`;

        if (item.rankText === "Penalty"){
            row.insertCell(1).innerHTML = `
            <strong>${item.houseName}</strong> loses <strong>${Math.abs(item.pointsAdded)} points </strong>
            for recieving a <strong>${item.rankText}</strong> due to <strong>${item.category}</strong>
            <br><small> Deleted by — ${item.deletedBy}</small>
        `;
        }
        else{
        row.insertCell(1).innerHTML = `
            <strong>${item.houseName}</strong> gains <strong>${Math.abs(item.pointsAdded)} points </strong>
            for winning <strong>${item.rankText}</strong> in <strong>${item.category}</strong>
            <br><small> Deleted by — ${item.deletedBy}</small>
        `;
        }
        

        // Restore Button Column
        const actionCell = row.insertCell(2);
        const btn = document.createElement('button');
        btn.className = "restore-btn";
        btn.title = "Restore Log and Re-apply Points";
        btn.innerHTML = `
        <svg viewBox="0 0 24 24">
            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z"/>
        </svg>`;
        
        btn.onclick = () => restoreLog(item.recycleKey, item);
        actionCell.appendChild(btn);
    });
    });
}

function restoreLog(recycleId, itemData) {
    console.log(recycleId);

    const currentUserEmail = auth.currentUser.email;

    if (itemData.adminEmail !== currentUserEmail) {
    alert(`Permission Denied: Only ${itemData.adminEmail} can restore this.`);
    return;
    }

    const confirmation = confirm(`Restore this log? This will restore ${itemData.pointsAdded} points to ${itemData.houseName}.`);
    if (!confirmation) return;

    const houseRef = db.ref(`Houses/${itemData.houseId}/score`);
    
    // 1. Put the points back
    houseRef.transaction(current => (current || 0) + itemData.pointsAdded)
    .then(() => {
        // 2. Move back to Logs (removing deletion-specific metadata)
        const { deletedAt, deletedBy, id, ...originalLogData } = itemData;
        return db.ref('Logs').push().set(originalLogData);
    })
    .then(() => {
        // 3. Remove from Recycle Bin
        return db.ref('Recycle').child(recycleId).remove();
    })
    .then(() => {
        alert("Log restored successfully!");
    })
    .catch(err => alert("Restore failed: " + err.message));
}

let idleTimer;
function resetTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { logout(); }, 10 * 60 * 1000);
}
function startIdleTracking() {
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(e => {
    document.addEventListener(e, resetTimer, true);
    });
    resetTimer();
}