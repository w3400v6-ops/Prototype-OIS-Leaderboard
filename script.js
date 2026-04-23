const firebaseConfig = {
    apiKey: "AIzaSyBIIEQt0ryHNulKYNmfCliMywmSzzQuBls",
    authDomain: "my-epic-database.firebaseapp.com",
    databaseURL: "https://my-epic-database-default-rtdb.firebaseio.com",
    projectId: "my-epic-database",
    storageBucket: "my-epic-database.appspot.com",
    messagingSenderId: "533989527206",
    appId: "1:533989527206:web:d34c0a693e6f19dc43ae67"
};

// 1. Initialize (Using Compat/Namespaced Syntax)
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const analytics = firebase.analytics();

// Forces the login picker to only show your school domain accounts
provider.setCustomParameters({ hd: "oakbridge.edu.my" }); 

const houseEls = Array.from(document.querySelectorAll('.house'));
let currentData = {};
let allLogs = {};
let initialized = false;

const authOverlay = document.getElementById('auth-overlay');
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');

// 2. Global Logs Listener (Pre-renders data)
db.ref("Logs").on("value", (snap) => {
    allLogs = snap.val() || {};
    
    // Refresh logs for every house immediately so they are ready before the click
    houseEls.forEach(el => {
        if (el.querySelector('.log-container')) {
            renderHouseLogs(el, el.dataset.house);
            refreshSidebarLogs();
        }
    });
});



// 3. Auth State Observer
auth.onAuthStateChanged(async (user) => {
    const pillEmail = document.getElementById('pill-email');
    const adminLink = document.getElementById('pill-admin-link');


    if (user && user.email.endsWith('@oakbridge.edu.my')) {
        authOverlay.style.display = 'none';
        startLeaderboard();

        // Sanitize email for Firebase keys (replace . with ,)
        const emailKey = user.email.replace(/\./g, ',');
        const adminRef = db.ref('AdminEmails/' + emailKey);
        pillEmail.textContent = user.email;

        try {
            const snapshot = await adminRef.once('value'); // Replaces get()
            logoutBtn.style.display = 'flex';
            if (snapshot.exists()) {
                adminLink.style.display = "flex";
            } else {
                adminLink.style.display = "none";
            }
        } catch (error) {
            console.error("Admin check failed:", error);
        }

    } else {
        authOverlay.style.display = 'flex';
        adminLink.style.display = "none";
        if (user) {
            alert("Access Denied: Please use your @oakbridge.edu.my account.");
            auth.signOut();
        }
    }
});

// 4. Login Click Handler
loginBtn.addEventListener('click', () => {
    auth.signInWithPopup(provider)
        .catch((error) => {
            if (error.code === 'auth/popup-blocked') {
                alert("Please enable popups to sign in.");
            }
            console.error("Auth Error:", error);
        });
});

const logoutBtn = document.getElementById('pill-logout-link');
// 🟢 The actual Logout Function
logoutBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to sign out?")) {
        auth.signOut().then(() => {
            console.log("User signed out.");
            // Force a page reload to clear all cached data and listeners
            window.location.reload(); 
        }).catch((error) => {
            console.error("Logout Error:", error);
        });
    }
});

// 5. Leaderboard Core Logic
function startLeaderboard() {

    db.ref("Logs").on("value", (snap) => {
        allLogs = snap.val() || {};
        console.log("Logs synced for logged-in user");
        
        // Refresh any currently rendered cards
        houseEls.forEach(el => {
            if (el.querySelector('.log-container')) {
                renderHouseLogs(el, el.dataset.house);
            }
        });
    });

    db.ref('Houses').on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        if (!initialized) {
            const imgMap = {
                red: 'red.png',
                blue: 'blue.png',
                green: 'green.png',
                yellow: 'yellow.png'
            };

            houseEls.forEach(el => {
                const key = el.dataset.house;
                
                // Build HTML Structure
                el.innerHTML = `
                    <div class="card-header">
                        <img src="${imgMap[key]}" alt="${data[key].name}">
                        <div class="info">
                            <div class="name">${data[key].name}</div>
                            <div class="log-ticker">
                                <span class="ticker-text"></span>
                            </div> 
                        </div>
                        <div class="score">${data[key].score}</div>
                    </div>
                    <div class="details-drawer">
                        <div class="details-content">
                            <div class="log-container"></div>
                        </div>
                    </div>
                `;

                // Click to Expand
                el.addEventListener('click', () => {
                    const isExpanded = el.classList.contains('expanded');
                    houseEls.forEach(h => h.classList.remove('expanded'));
                    
                    if (!isExpanded) {
                        // Small delay to ensure browser paints the text during expansion
                        requestAnimationFrame(() => {
                            renderHouseLogs(el, key);
                            el.classList.add('expanded');
                        });
                    }
                    setTimeout(updateBodyState, 450)
                });

                currentData[key] = data[key].score;
            });

             // Intial sort
            // 1. Sort elements by score for visual order
            const sorted = [...houseEls].sort((a, b) => data[b.dataset.house].score - data[a.dataset.house].score);
            sorted.forEach((el, i) => el.style.order = i);

            // 2. Find the highest score currently on the board
            const highestScore = Math.max(...Object.values(data).map(h => h.score));

            // 3. Apply 'leader' class to ANY house that has that highest score
            houseEls.forEach(el => {
                const houseScore = data[el.dataset.house].score;
                
                // Remove class first to reset
                el.classList.remove('leader'); 
                
                // Add if it matches the top score
                if (houseScore === highestScore && highestScore > 0) {
                    el.classList.add('leader');
                }
            });

            initialized = true;
            return;
        }

        // 🟢 Live Update Re-ordering Logic
        let needsReorder = false;
        let updatingHouses = [];

        houseEls.forEach(el => {
            const key = el.dataset.house;
            const scoreEl = el.querySelector('.score');
            const newScore = data[key].score;
            const oldScore = currentData[key];

            if (oldScore !== newScore) {
                needsReorder = true;
                updatingHouses.push(el);
                el.classList.add('updating');
                animateScore(scoreEl, oldScore, newScore);
                currentData[key] = newScore;
            }
        });

        if (needsReorder) {
            setTimeout(() => {
                const sorted = [...houseEls].sort((a, b) => data[b.dataset.house].score - data[a.dataset.house].score);
                animateCards(sorted, data);
                setTimeout(() => {
                    updatingHouses.forEach(el => el.classList.remove('updating'));
                }, 600);
            }, 100);
        }
    });
}


// 6. Log Rendering
function renderHouseLogs(el, houseId) {
    const container = el.querySelector('.log-container');
    if (!container) return;

    const filteredLogs = Object.values(allLogs).filter(log => log.houseId === houseId);
    if (filteredLogs.length === 0) {
        container.innerHTML = `<div style="padding:20px; color:#999; text-align:center; font-style:italic;">No points earned yet.</div>`;
        return;
    }

    const html = [...filteredLogs].reverse().map(log => {
        const isPenalty = log.rankText === 'Penalty' || log.pointsAdded < 0;
        
        // 1. Logic for Custom Points (Empty RankText) or Standard Win
        let description;
        if (isPenalty) {
            description = `<strong>Penalty</strong>`;
        } else if (!log.rankText || log.rankText === "") {
            // Format for Custom Points: "Gains X points in Category"
            description = `In <strong>${log.category}</strong>`;
        } else {
            // Standard Format: "1st place in Category"
            description = `<strong>${log.rankText}</strong> in <strong>${log.category}</strong>`;
        }

        // 2. Filter out the default comment
        // Only add the comment if it's not empty and not the default placeholder
        const commentText = (log.comment && log.comment !== "No comment provided") 
            ? ` - ${log.comment}` 
            : "";

        const pointsDisplay = isPenalty ? `${log.pointsAdded}` : `+${log.pointsAdded}`;

        return `
            <div class="log-item">
                <div class="log-reason">${description}${commentText}</div>
                <div class="${isPenalty ? 'log-points-negative' : 'log-points'}" style="font-weight:bold; color:${isPenalty ? '#e74c3c' : '#2ecc71'}">
                    ${pointsDisplay}
                </div>
            </div>
        `;
    }).join('');

    if (container.innerHTML !== html) {
        container.innerHTML = html;
    }
}

// 1. Track if any drawer is open
function updateBodyState() {
  const anyOpen = document.querySelector('.house.expanded');
  document.body.classList.toggle('drawer-open', !!anyOpen);
}

// 2. The Ticker Loop
const logIndices = {}; // Track which log index we are on for each house

function runTicker() {
    
    houseEls.forEach(el => {
        // Skip updating if this specific house is expanded
        if (el.classList.contains('expanded')) return;

        const nameEl = el.querySelector('.name');
        if (nameEl) {
            nameEl.classList.add('shifted');
        }
        const houseId = el.dataset.house;
        const ticker = el.querySelector('.log-ticker');
        const tickerText = el.querySelector('.ticker-text')
        
        // Filter logs for this house and reverse so index 0 = Newest
        const houseLogs = Object.values(allLogs)
            .filter(l => l.houseId === houseId)
            .reverse(); 

        if (houseLogs.length === 0 || !ticker) return;

        // Cycle the index
        if (logIndices[houseId] === undefined) logIndices[houseId] = 0;
        const index = logIndices[houseId] % houseLogs.length;
        const log = houseLogs[index]; // reverse to show newest first

        // Set text
        const rank = log.rankText;
        const logComment = log.comment && log.comment !== "No comment provided" ? ` - ${log.comment} ` : "";
        

        // Trigger animation
        ticker.classList.remove('fade-ticker');
        tickerText.classList.remove('should-scroll');
        tickerText.style.transform = "translateX(0)";

        void ticker.offsetWidth;  //FORCE REFLOW: This tells the browser "Reset the styles NOW"

        const isPenalty = log.rankText === 'Penalty' || log.pointsAdded < 0;
        
        if (isPenalty) {
            tickerText.innerText = `${rank}${logComment}`;
        }
        else{
            tickerText.innerText = `${rank} in ${log.category}${logComment}`;
        }
        
        ticker.classList.add('fade-ticker');

        setTimeout(() => {
            if (tickerText.offsetWidth > ticker.offsetWidth) {
                tickerText.classList.add('should-scroll');
            }
        }, 50);

        logIndices[houseId]++;
  });
}

// Start the ticker interval (every 4 seconds)
setInterval(runTicker, 4000);

// 7. Animations (Kept as provided)
function animateScore(el, from, to) {
    const duration = 900;
    const start = performance.now();
    function step(now) {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = Math.floor(from + (to - from) * p);
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function animateCards(sortedEls, data) { // 🟢 Added 'data' as an argument
    const firstPositions = new Map();
    houseEls.forEach(el => firstPositions.set(el, el.getBoundingClientRect().top));
    
    // Re-order the elements in the flex/grid container
    sortedEls.forEach((el, i) => el.style.order = i);

    requestAnimationFrame(() => {
        houseEls.forEach(el => {
            const lastTop = el.getBoundingClientRect().top;
            const firstTop = firstPositions.get(el);
            const dy = firstTop - lastTop;

            if (dy !== 0) {
                if (el.classList.contains('updating')) {
                    el.style.setProperty('--travel-dist', `${dy}px`);
                    el.classList.remove('moving-up');
                    void el.offsetWidth;
                    el.classList.add('moving-up');
                } else {
                    el.style.transform = `translateY(${dy}px)`;
                    el.style.transition = 'none';
                    requestAnimationFrame(() => {
                        el.style.transition = 'transform 0.6s ease-out';
                        el.style.transform = '';
                    });
                }
            }
        });

        // --- 🟢 NEW TIE-LEADER LOGIC ---
        
        // 1. Get all scores from the data object
        const scores = Object.values(data).map(h => h.score);
        
        // 2. Find the maximum score
        const highestScore = Math.max(...scores);

        // 3. Apply 'leader' class to everyone who matches that score
        houseEls.forEach(el => {
            const houseId = el.dataset.house;
            const currentScore = data[houseId].score;

            // Remove it first to reset the state
            el.classList.remove('leader'); 

            // Add it if they are tied for the top (and score is > 0)
            if (currentScore === highestScore && highestScore > 0) {
            el.classList.add('leader'); 
                
            }
        });
    });
}


// Button for IOS
document.addEventListener('DOMContentLoaded', () => {
  const pill = document.querySelector('.admin-action-pill');

  pill.addEventListener('click', function(e) {
    // Only intercept if we are on a touch device 
    // This prevents double-triggering on desktop
    if (window.matchMedia("(pointer: coarse)").matches) {
      // If clicking the row links, let them work
      if (e.target.closest('.action-row')) return;
      
      e.preventDefault();
      this.classList.toggle('expanded');
    }
  });

  // Close pill when clicking outside
  document.addEventListener('click', (e) => {
    if (!pill.contains(e.target)) {
      pill.classList.remove('expanded');
    }
  });
});