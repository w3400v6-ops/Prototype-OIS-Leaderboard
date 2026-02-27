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
        }
    });
});



// 3. Auth State Observer
auth.onAuthStateChanged(async (user) => {
    const adminBtn = document.getElementById('admin-btn');

    if (user && user.email.endsWith('@oakbridge.edu.my')) {
        authOverlay.style.display = 'none';
        startLeaderboard();

        // Sanitize email for Firebase keys (replace . with ,)
        const emailKey = user.email.replace(/\./g, ',');
        const adminRef = db.ref('AdminEmails/' + emailKey);

        try {
            const snapshot = await adminRef.once('value'); // Replaces get()
            logoutBtn.style.display = 'flex';
            if (snapshot.exists()) {
                adminBtn.style.display = "flex";
            } else {
                adminBtn.style.display = "none";
            }
        } catch (error) {
            console.error("Admin check failed:", error);
        }

    } else {
        authOverlay.style.display = 'flex';
        adminBtn.style.display = "none";
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

const logoutBtn = document.getElementById('logout-btn');
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
                        <div class="info" style="flex-grow:1;">
                            <p class="name">${data[key].name}</p>
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
                });

                currentData[key] = data[key].score;
            });

            // Initial Sort
            const sorted = [...houseEls].sort((a, b) => data[b.dataset.house].score - data[a.dataset.house].score);
            sorted.forEach((el, i) => el.style.order = i);
            sorted[0].classList.add('leader');

            initialized = true;
            return;
        }

        // 🟢 Live Update Re-ordering Logic
        let needsReorder = false;
        let activeHouseEl = null;

        houseEls.forEach(el => {
            const key = el.dataset.house;
            const scoreEl = el.querySelector('.score');
            const newScore = data[key].score;
            const oldScore = currentData[key];

            if (oldScore !== newScore) {
                needsReorder = true;
                activeHouseEl = el;
                el.classList.add('updating');
                animateScore(scoreEl, oldScore, newScore);
                currentData[key] = newScore;
            }
        });

        if (needsReorder) {
            setTimeout(() => {
                const sorted = [...houseEls].sort((a, b) => data[b.dataset.house].score - data[a.dataset.house].score);
                animateCards(sorted);
                setTimeout(() => {
                    if (activeHouseEl) activeHouseEl.classList.remove('updating');
                }, 600);
            }, 100);
        }
    });
}

// 6. Log Rendering (The Logic you provided)
function renderHouseLogs(el, houseId) {
    const container = el.querySelector('.log-container');
    if (!container) return;

    const filteredLogs = Object.values(allLogs).filter(log => log.houseId === houseId);
    if (filteredLogs.length === 0) {
        container.innerHTML = `<div style="padding:20px; color:#999; text-align:center; font-style:italic;">No points earned yet.</div>`;
        return;
    }

    const html = [...filteredLogs].reverse().map(log => {
        const isPenalty = log.rankText === 'Penalty';
        const description = isPenalty 
            ? `<strong>Penalty</strong> for <strong>${log.category}</strong>` 
            : `Wins <strong>${log.rankText || ''}</strong> in <strong>${log.category || 'Event'}</strong>`;
        const pointsDisplay = isPenalty ? `${log.pointsAdded}` : `+${log.pointsAdded}`;

        return `
            <div class="log-item" style="display: flex; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid #f0f0f0;">
                <div class="log-reason" style="color: #333;">${description}</div>
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

function animateCards(sortedEls) {
    const firstPositions = new Map();
    houseEls.forEach(el => firstPositions.set(el, el.getBoundingClientRect().top));
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
        houseEls.forEach(el => el.classList.remove('leader'));
        sortedEls[0].classList.add('leader');
    });
}