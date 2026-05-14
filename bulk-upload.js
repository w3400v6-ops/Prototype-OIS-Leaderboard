async function handleBulkUpload() {
    const fileInput = document.getElementById('csv-file');
    const uploadBtn = document.getElementById('upload-btn');
    const status = document.getElementById('upload-status');
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');
    const categoryAppendNameSelect = document.getElementById('catergory-append-name-select');
    const assessmentSelectContainer = document.getElementById('assessment-select-container');

    if (!fileInput.files[0]) return alert("Please select a file.");

    const file = fileInput.files[0];

    // UI Reset
    status.innerHTML = "⏳ Processing file...";
    status.style.color = "#333";
    errorLog.classList.add('hidden');
    errorList.innerHTML = "";
    
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = "⏳ Processing...";
    uploadBtn.style.opacity = "0.5";

    const processFileData = (rawData) => {
        if (!Array.isArray(rawData) || rawData.length === 0) {
            status.innerHTML = "❌ Error: Empty file or unsupported format.";
            assessmentSelectContainer?.classList.add('hidden');
            return resetUploadButton(uploadBtn);
        }

        const firstRow = rawData[0].map(cell => String(cell || "").trim());
        const firstRowText = firstRow.join(" ").toLowerCase();

        if (firstRowText.includes("oakbridge international school")) {
            assessmentSelectContainer?.classList.remove('hidden');
            if (categoryAppendNameSelect.value === "") {
                status.innerHTML = "❌ Please select an Assessment/Module Test for Clobas uploads.";
                resetUploadButton(uploadBtn);
                return;
            }
            processRows(rawData, true);
            return;
        }

        assessmentSelectContainer?.classList.add('hidden');
        if (firstRow.some(cell => /\b1a\b/i.test(cell)) || firstRow.some(cell => /house/i.test(cell))) {
            const objectRows = convertRowsToObjects(rawData);
            if (!objectRows || objectRows.length === 0) {
                status.innerHTML = "❌ Error: Could not interpret custom template format.";
                return resetUploadButton(uploadBtn);
            }
            processRows(objectRows, false);
            return;
        }

        status.innerHTML = "❌ Error: Unrecognized file format.";
        resetUploadButton(uploadBtn);
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            processFileData(rawData);
        };
        reader.readAsArrayBuffer(file);
    } else {
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                processFileData(results.data);
            }
        });
    }
}

function convertRowsToObjects(rawData) {
    if (!rawData || rawData.length < 2) return [];

    const rawHeader = rawData[0].map(cell => String(cell || "").trim());
    const lowerHeaders = rawHeader.map(h => h.toLowerCase());
    const hasHeader = ["house", "category", "eventtype", "rank", "points"].every(
        required => lowerHeaders.some(header => header.includes(required))
    );

    if (hasHeader) {
        return rawData.slice(1).map(row => {
            const obj = {};
            rawHeader.forEach((col, idx) => {
                if (col) obj[col.trim()] = row[idx];
            });
            return obj;
        });
    }

    // Fallback: assume columns are in the standard template order.
    return rawData.map(row => ({
        House: row[0],
        Category: row[1],
        EventType: row[2],
        Rank: row[3],
        Points: row[4],
        Comment: row[5]
    }));
}

function isClobasFileData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) return false;
    const firstRow = rawData[0].map(cell => String(cell || "").trim());
    const firstRowText = firstRow.join(" ").toLowerCase();
    return firstRowText.includes("oakbridge international school");
}

function updateAssessmentVisibility(show) {
    const assessmentSelectContainer = document.getElementById('assessment-select-container');
    const categoryAppendNameSelect = document.getElementById('catergory-append-name-select');
    if (!assessmentSelectContainer) return;
    assessmentSelectContainer.classList.toggle('hidden', !show);
    if (!show && categoryAppendNameSelect) categoryAppendNameSelect.value = "";
}

function handleFileInputChange() {
    const fileInput = document.getElementById('csv-file');
    const status = document.getElementById('upload-status');
    if (!fileInput || !fileInput.files[0]) {
        updateAssessmentVisibility(false);
        return;
    }

    const file = fileInput.files[0];
    status.innerHTML = "";

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            updateAssessmentVisibility(isClobasFileData(rawData));
        };
        reader.readAsArrayBuffer(file);
    } else {
        Papa.parse(file, {
            header: false,
            preview: 1,
            skipEmptyLines: true,
            complete: (results) => {
                updateAssessmentVisibility(isClobasFileData(results.data));
            }
        });
    }
}

async function processRows(data, isClobas = false) {
    const status = document.getElementById('upload-status');
    const uploadBtn = document.getElementById('upload-btn');
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');
    const fileInput = document.getElementById('csv-file');

    try {
        const housesSnapshot = await db.ref('Houses').once('value');
        const housesData = housesSnapshot.val();
        const studentDataSnapshot = await db.ref('StudentData').once('value');
        const studentData = studentDataSnapshot.val();
        let readyToUpload = [];

        // --- DETECTION LOGIC ---
        // Determine if we are looking at a School Report or a Standard Template
        const isReportFormat = data.some(row => Array.isArray(row) && row.includes("Student Name"));
        const isStandardCSV = !isReportFormat && data[0] && data[0].hasOwnProperty("House");

        if (isReportFormat) {
            status.innerHTML = "Mode: School Report Detected";
            const result = parseSchoolReport(data, housesData, studentData);
            if (result.errors.length > 0) {
                showErrors(result.errors);
                return resetUploadButton(uploadBtn);
            }
            readyToUpload = result.data;
        } else if (isStandardCSV) {
            status.innerHTML = "Mode: Standard Template Detected";
            const result = parseStandardTemplate(data, housesData, studentData);
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
        updateAssessmentVisibility(false);

    } catch (err) {
        console.error(err);
        status.innerHTML = "❌ Critical Error: " + err.message;
    }
    resetUploadButton(uploadBtn);
}

// --- HELPER: Find student house from StudentData ---
function findStudentHouse(studentName, grade, studentData, housesData) {
    // Map display grade names to database keys for grades 9 and 10
    const gradeMappings = {
        "9 Arts": "Grade9A",
        "9 Science": "Grade9S",
        "10 Arts": "Grade10A",
        "10 Science": "Grade10S"
    };

    let gradeKey;
    if (gradeMappings[grade]) {
        gradeKey = gradeMappings[grade];
    } else {
        // Format grade to match the StudentData key format (e.g., "7.1" -> "Grade7,1")
        gradeKey = "Grade" + grade.replace(".", ",");
    }
    
    if (!studentData || !studentData[gradeKey]) {
        return { houseId: null, houseName: null, error: `student "${studentName}" not found` };
    }
    
    // Normalize name for comparison (case-insensitive, order-independent)
    const normalizeNameParts = (name) => {
        if (!name) return "";
        const withoutParens = name.replace(/\([^)]*\)/g, "");
        return withoutParens.toLowerCase().trim().split(/\s+/).filter(Boolean).sort().join(" ");
    };
    
    const inputNameNormalized = normalizeNameParts(studentName);
    
    // Case and order-insensitive student name lookup, including nickname in full-name search
    let studentKey = Object.keys(studentData[gradeKey]).find((key) => {
        const studentRecord = studentData[gradeKey][key] || {};
        const nicknames = studentRecord.nickname || studentRecord.nicknames;
        const nicknameList = nicknames ? (Array.isArray(nicknames) ? nicknames : [nicknames]) : [];

        // Check exact full name first
        if (normalizeNameParts(key) === inputNameNormalized) return true;

        // Check full name plus nickname tokens together
        if (nicknameList.some(nickname => normalizeNameParts(`${key} ${nickname}`) === inputNameNormalized)) return true;
        if (nicknameList.some(nickname => normalizeNameParts(`${nickname} ${key}`) === inputNameNormalized)) return true;

        // Also allow matching nickname alone
        if (nicknameList.some(nickname => normalizeNameParts(nickname) === inputNameNormalized)) return true;

        return false;
    });
    
    if (!studentKey) {
        return { houseId: null, houseName: null, error: `student "${studentName}" not found` };
    }
    
    const houseName = studentData[gradeKey][studentKey].houses;
    if (!houseName) {
        return { houseId: null, houseName: null, error: `Houses for student "${studentName}" is null` };
    }
    
    // Find the house ID from the house name
    let houseId = null;
    for (let id in housesData) {
        if (housesData[id].name.toLowerCase().trim() === houseName.toLowerCase().trim()) {
            houseId = id;
            break;
        }
    }
    
    if (!houseId) {
        return { houseId: null, houseName: null, error: `House "${houseName}" not found in system` };
    }
    
    return { houseId, houseName, error: null };
}

// --- PARSER 1: SCHOOL REPORT ---
function parseSchoolReport(data, housesData, studentData) {
    let grade = "7.1";
    let headerRowIndex = -1;
    let headers = [];

    for (let i = 0; i < data.length; i++) {
        const rowString = data[i].join(" ");
        if (rowString.includes("Grade")) {
            const match = rowString.match(/Grade\s*:\s*(.+)/i);
            if (match) grade = match[1].trim();
        }
        if (data[i].includes("Student Name")) {
            headerRowIndex = i;
            headers = data[i];
            break;
        }
    }

    if (headerRowIndex === -1) return { data: [], errors: [] };

    const reportStudents = [];
    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const firstCell = String(data[i][0] || "");
        if (firstCell.includes("Exam Details") || firstCell.includes("Report Generated")) break;
        
        let obj = {};
        headers.forEach((h, idx) => { if (h) obj[h] = data[i][idx]; });
        if (obj["Student Name"]) reportStudents.push(obj);
    }

    const categoryAppendNameSelect = document.getElementById('catergory-append-name-select');
    const subjects = [
        { key: "Bahasa Malaysia", cleanName: "BM " + categoryAppendNameSelect.value },
        { key: "Mathematics", cleanName: "Mathematic " + categoryAppendNameSelect.value},
        { key: "Biology", cleanName: "Biology " + categoryAppendNameSelect.value },
        { key: "Chemistry", cleanName: "Chemistry " + categoryAppendNameSelect.value },
        { key: "Physics", cleanName: "Physics " + categoryAppendNameSelect.value },
        { key: "Additional Mathematics", cleanName: "Add Math " + categoryAppendNameSelect.value},
        { key: "Economics", cleanName: "Econ " + categoryAppendNameSelect.value},
        { key: "Psychology", cleanName: "Psychology " + categoryAppendNameSelect.value },
        { key: "Accounting", cleanName: "Account " + categoryAppendNameSelect.value },
        { key: "Business Studies", cleanName: "Business Studies " + categoryAppendNameSelect.value },
        { key: "English as a second language", cleanName: "ESL " + categoryAppendNameSelect.value},
        { key: "English - first language", cleanName: "EFL " + categoryAppendNameSelect.value},
        { key: "English", cleanName: "English " + categoryAppendNameSelect.value},
        { key: "History", cleanName: "History " + categoryAppendNameSelect.value },
        { key: "Geography", cleanName: "Geography " + categoryAppendNameSelect.value },
        { key: "C.sci", cleanName: "Combined Science " + categoryAppendNameSelect.value },
    ];

    const results = [];
    const errors = [];
    
    subjects.forEach(sub => {
        const actualKey = headers.find(h => {
            if (!h) return false;
            const headerLower = h.toLowerCase();
            const keyLower = sub.key.toLowerCase();

            if (sub.key === "English" && headerLower.includes("language")) {
                return false;
            }
            if (sub.key === "Mathematics" && headerLower.includes("Additional")) {
                return false;
            }
            return headerLower.includes(keyLower);
        });

        let entries = reportStudents
            .map(s => ({ name: s["Student Name"], score: parseFloat(s[actualKey]) }))
            .filter(e => !isNaN(e.score))
            .sort((a, b) => b.score - a.score);

        let currentRank = 0;
        let lastScore = null;
        for (let entry of entries) {
            if (entry.score !== lastScore) currentRank++;
            lastScore = entry.score;
            if (currentRank > 3) break;

            // Look up student house from database
            const houseInfo = findStudentHouse(entry.name, grade, studentData, housesData);
            if (houseInfo.error) {
                errors.push(houseInfo.error);
                return; // Skip this entry
            }

            results.push({
                houseId: houseInfo.houseId,
                houseName: houseInfo.houseName,
                addedPoints: currentRank === 1 ? 10 : currentRank === 2 ? 7 : 5,
                category: sub.cleanName,
                rankText: `${currentRank}${currentRank===1?'st':currentRank===2?'nd':'rd'} Place`,
                eventType: "individual",
                comment: `${entry.name} ${grade}`.trim()
            });
        }
    });
    return { data: results, errors: errors };
}

// --- PARSER 2: STANDARD TEMPLATE ---
function parseStandardTemplate(rows, housesData, studentData) {
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

const uploadHelpSteps = [
  { 
    header: "Prepare your File", 
    desc: "Download Student Marks Result(.xls) from Clobas or prepare your own CSV that has headers: House, Category, EventType, Rank, Points, and Comment. \n(Download template for examples.)", 
    img: "📄" 
  },
  { 
    header: "Select Assessment", 
    desc: "Pick the correct Assessment or Module Test from the dropdown before processing.", 
    img: "🎯" 
  },
  { 
    header: "Check for Errors", 
    desc: "If any data is missing or incorrect, an error log will appear at the bottom.", 
    img: "⚠️" 
  }
];

let currentStep = 0;

const fileInput = document.getElementById('csv-file');
if (fileInput) {
    fileInput.addEventListener('change', handleFileInputChange);
}

const modal = document.getElementById('helpModal');
const helpBtn = document.getElementById('helpBtn');
const closeBtn = document.getElementById('closeBtn');
const dotsContainer = document.getElementById('dotsContainer');

// Open Modal
helpBtn.addEventListener('click', () => {
  modal.classList.remove('hidden');
  renderStep();
});

// Close Modal
closeBtn.onclick = () => modal.classList.add('hidden');
window.onclick = (e) => { if(e.target === modal) modal.classList.add('hidden'); };

function renderStep() {
  const data = uploadHelpSteps[currentStep];
  document.getElementById('slideHeader').innerText = data.header;
  document.getElementById('slideDesc').innerText = data.desc;
  document.getElementById('slideImage').innerText = data.img;

  // Dots logic
  dotsContainer.innerHTML = uploadHelpSteps.map((_, i) => 
    `<div class="dot ${i === currentStep ? 'active' : 'inactive'}"></div>`
  ).join('');

  // Nav Buttons
  document.getElementById('prevBtn').disabled = currentStep === 0;
  document.getElementById('nextBtn').disabled = currentStep === uploadHelpSteps.length - 1;
}

document.getElementById('prevBtn').onclick = () => { if(currentStep > 0) { currentStep--; renderStep(); } };
document.getElementById('nextBtn').onclick = () => { if(currentStep < uploadHelpSteps.length - 1) { currentStep++; renderStep(); } };