async function handleBulkUpload() {
    const fileInput = document.getElementById('csv-file');
    const uploadBtn = document.getElementById('upload-btn');
    const status = document.getElementById('upload-status');
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');

    if (!fileInput.files[0]) return alert("Please select a file.");

    const file = fileInput.files[0];
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    // UI Reset
    status.innerHTML = "⏳ Processing file...";
    status.style.color = "#333";
    errorLog.classList.add('hidden');
    errorList.innerHTML = "";
    
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = "⏳ Processing...";
    uploadBtn.style.opacity = "0.5";

    if (isExcel) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            // Read as raw array of arrays to handle custom report headers
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            processRows(rawData); 
        };
        reader.readAsArrayBuffer(file);
    } else {
        // Standard CSV processing
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                // Check if it's the raw array style or object style
                processRows(results.data);
            }
        });
    }
}

async function processRows(data) {
    const status = document.getElementById('upload-status');
    const uploadBtn = document.getElementById('upload-btn');
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');
    const fileInput = document.getElementById('csv-file');

    try {
        const housesSnapshot = await db.ref('Houses').once('value');
        const housesData = housesSnapshot.val();
        let readyToUpload = [];

        // --- DETECTION LOGIC ---
        // Determine if we are looking at a School Report or a Standard Template
        const isReportFormat = data.some(row => Array.isArray(row) && row.includes("Student Name"));
        const isStandardCSV = !isReportFormat && data[0] && data[0].hasOwnProperty("House");

        if (isReportFormat) {
            status.innerHTML = "Mode: School Report Detected";
            readyToUpload = parseSchoolReport(data);
        } else if (isStandardCSV) {
            status.innerHTML = "Mode: Standard Template Detected";
            const result = parseStandardTemplate(data, housesData);
            if (result.errors.length > 0) {
                showErrors(result.errors);
                return resetUploadButton(uploadBtn);
            }
            readyToUpload = result.data;
        } else {
            status.innerHTML = "❌ Error: Unrecognized file format.";
            return resetUploadButton(uploadBtn);
        }

        if (readyToUpload.length === 0) {
            status.innerHTML = "❌ No valid data found to upload.";
            return resetUploadButton(uploadBtn);
        }

        // --- ATOMIC EXECUTION ---
        await executeAtomicUpload(readyToUpload, housesData);
        status.innerHTML = `✅ Successfully uploaded ${readyToUpload.length} entries!`;
        status.style.color = "#22c55e";
        fileInput.value = ""; // Reset file input

    } catch (err) {
        console.error(err);
        status.innerHTML = "❌ Critical Error: " + err.message;
    }
    resetUploadButton(uploadBtn);
}

// --- PARSER 1: SCHOOL REPORT ---
function parseSchoolReport(data) {
    let grade = "7.1";
    let headerRowIndex = -1;
    let headers = [];

    for (let i = 0; i < data.length; i++) {
        const rowString = data[i].join(" ");
        if (rowString.includes("Grade")) {
            const match = rowString.match(/Grade\s*:\s*([\d.]+)/i);
            if (match) grade = match[1];
        }
        if (data[i].includes("Student Name")) {
            headerRowIndex = i;
            headers = data[i];
            break;
        }
    }

    if (headerRowIndex === -1) return [];

    const studentData = [];
    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const firstCell = String(data[i][0] || "");
        if (firstCell.includes("Exam Details") || firstCell.includes("Report Generated")) break;
        
        let obj = {};
        headers.forEach((h, idx) => { if (h) obj[h] = data[i][idx]; });
        if (obj["Student Name"]) studentData.push(obj);
    }

    const subjects = [
        { key: "Bahasa", cleanName: "BM Assessment Test 1" },
        { key: "Mathematics", cleanName: "Mathematic Assessment Test 1" },
        { key: "Biology", cleanName: "Biology Assessment Test 1" },
        { key: "English", cleanName: "English Assessment Test 1" }
    ];

    const results = [];
    subjects.forEach(sub => {
        const actualKey = headers.find(h => h && h.toLowerCase().includes(sub.key.toLowerCase()));
        if (!actualKey) return;

        let entries = studentData
            .map(s => ({ name: s["Student Name"], score: parseFloat(s[actualKey]) }))
            .filter(e => !isNaN(e.score))
            .sort((a, b) => b.score - a.score);

        let currentRank = 0;
        let lastScore = null;
        for (let entry of entries) {
            if (entry.score !== lastScore) currentRank++;
            lastScore = entry.score;
            if (currentRank > 3) break;

            results.push({
                houseId: "red", // Defaulting to Prometheus as requested
                houseName: "Prometheus",
                addedPoints: currentRank === 1 ? 10 : currentRank === 2 ? 7 : 5,
                category: sub.cleanName,
                rankText: `${currentRank}${currentRank===1?'st':currentRank===2?'nd':'rd'} Place`,
                eventType: "individual",
                comment: `${entry.name} ${grade}`.trim()
            });
        }
    });
    return results;
}

// --- PARSER 2: STANDARD TEMPLATE ---
function parseStandardTemplate(rows, housesData) {
    const errors = [];
    const data = [];
    
    const findHouseId = (name) => {
        for (let id in housesData) {
            if (housesData[id].name.toLowerCase().trim() === (name || "").toLowerCase().trim()) return id;
        }
        return null;
    };

    rows.forEach((row, i) => {
        const line = i + 2;
        let houseName = row.House?.trim() || "";
        let houseId = findHouseId(houseName);
        let category = row.Category?.trim() || "";
        let eventType = (row.EventType?.trim() || "").toLowerCase();
        let rawRank = row.Rank?.toString().trim() || "";
        let points = parseInt(row.Points) || 0;

        const isPenalty = category.toLowerCase() === "penalty" || eventType === "penalty" || points < 0;

        if (!houseId) {
            errors.push(`Line ${line}: House "${houseName}" not found.`);
            return;
        }

        if (isPenalty) {
            // NEW RULE: Limit penalty to 100
            let sanitizedPoints = Math.abs(points);
            if (sanitizedPoints > 100) sanitizedPoints = 100;

            data.push({
                houseId, houseName, category: "Penalty", eventType: "Penalty",
                rankText: "Penalty", addedPoints: -sanitizedPoints, comment: row.Comment || ""
            });
        } else {
            const rankMap = { "1": "1st Place", "2": "2nd Place", "3": "3rd Place", "4": "4th Place" };
            let rankText = rankMap[rawRank] || rawRank;

            // NEW RULE: Individual 4th+ place prevention
            if (eventType === "individual") {
                if (rankText.includes("4th") || parseInt(rawRank) >= 4) {
                    errors.push(`Line ${line}: Individual events cannot have 4th place or lower.`);
                    return;
                }
            }

            // NEW RULE: Group 5th+ place prevention
            if (eventType === "group") {
                if (parseInt(rawRank) >= 5 || (!rankMap[rawRank] && rankText !== "4th Place")) {
                    // This catches "5", "5th Place", etc.
                    if (!["1st Place", "2nd Place", "3rd Place", "4th Place"].includes(rankText)) {
                        errors.push(`Line ${line}: Group events cannot have 5th place or lower.`);
                        return;
                    }
                }
            }

            // Auto-point mapping
            let finalPoints = 0;
            if (eventType === "individual") {
                finalPoints = rankText === "1st Place" ? 10 : rankText === "2nd Place" ? 7 : 5;
            } else if (eventType === "group") {
                finalPoints = rankText === "1st Place" ? 100 : rankText === "2nd Place" ? 70 : rankText === "3rd Place" ? 50 : 20;
            }

            data.push({
                houseId, houseName, category, eventType, rankText, 
                addedPoints: finalPoints, comment: row.Comment || ""
            });
        }
    });
    return { data, errors };
}

// --- EXECUTOR: ATOMIC FIREBASE UPDATE ---
async function executeAtomicUpload(readyToUpload, housesData) {
    const updates = {};
    const houseScores = {};
    for (let id in housesData) houseScores[id] = housesData[id].score || 0;

    readyToUpload.forEach(item => {
        const oldScore = houseScores[item.houseId] || 0;
        const newScore = oldScore + item.addedPoints;
        houseScores[item.houseId] = newScore;

        updates[`Houses/${item.houseId}/score`] = newScore;
        const logKey = db.ref('Logs').push().key;
        updates[`Logs/${logKey}`] = {
            fullDateTime: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
            unixTimestamp: firebase.database.ServerValue.TIMESTAMP,
            rankText: item.rankText,
            houseId: item.houseId,
            houseName: item.houseName,
            previousPoints: oldScore,
            pointsAdded: item.addedPoints,
            newTotal: newScore,
            category: item.category,
            eventType: item.eventType,
            comment: item.comment,
            adminEmail: auth.currentUser?.email || "Bulk System"
        };
    });
    return db.ref().update(updates);
}

function showErrors(errors) {
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');
    errorLog.classList.remove('hidden');
    errors.forEach(err => {
        const li = document.createElement('li');
        li.innerText = err;
        errorList.appendChild(li);
    });
}

function resetUploadButton(btn) {
    btn.disabled = false;
    btn.innerHTML = "Process CSV/Excel";
    btn.style.opacity = "1";
}
function downloadCSVTemplate() {

        // CSV Headers
        let csvContent = "data:text/csv;charset=utf-8,House,Category,EventType,Rank,Points,Comment\n";
        
        // 1. Example of an Individual Event (10 pts)      
            csvContent += `Oceanus,Badminton,Individual,1,10,Singles Win\n`;       
        // 2. Example of a Group Event (100 pts)     
            csvContent += `Gaia,Football,Group,1,100,Tournament Champions\n`;
        // 3. Example of a Penalty (Note: Points will be sanitized to negative automatically)
            csvContent += `Helios,Penalty,Penalty,Penalty,15,Late for event\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "bulk_upload_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    
}

