async function handleBulkUpload() {
    const fileInput = document.getElementById('csv-file');
    const status = document.getElementById('upload-status');
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');
    const uploadBtn = document.getElementById('upload-btn');
    
    if (!fileInput.files[0]) return alert("Please select a CSV file.");

    status.innerHTML = "⏳ Auditing file for errors...";
    status.style.color = "#333";
    errorLog.classList.add('hidden');
    errorList.innerHTML = "";

    // 1. DISABLE THE BUTTON IMMEDIATELY
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = "⏳ Uploading...";
    uploadBtn.style.opacity = "0.5";
    uploadBtn.style.cursor = "not-allowed";

    try {
        const housesSnapshot = await db.ref('Houses').once('value');
        const housesData = housesSnapshot.val();

        const findHouseId = (name) => {
            for (let id in housesData) {
                if (housesData[id].name.toLowerCase().trim() === (name || "").toLowerCase().trim()) return id;
            }
            return null;
        };

        Papa.parse(fileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: async function(results) {
                const rows = results.data;
                const validationErrors = [];
                const readyToUpload = [];

               // --- PASS 1: THE AUDITOR ---
                rows.forEach((row, i) => {
                    const lineNumber = i + 2;
                    
                    let rawHouseName = row.House?.trim() || "";
                    const formattedHouseName = rawHouseName.charAt(0).toUpperCase() + rawHouseName.slice(1).toLowerCase();
                    const houseId = findHouseId(formattedHouseName);
                    
                    let category = row.Category?.trim() || "";
                    let eventType = row.EventType?.trim() || "";
                    let rawRank = row.Rank?.toString().trim() || "";
                    let addedPoints = parseInt(row.Points);

                    // 1. Identify if this is a Penalty
                    const isPenalty = 
                        category.toLowerCase() === "penalty" || 
                        eventType.toLowerCase() === "penalty" || 
                        rawRank.toLowerCase() === "penalty" ||
                        addedPoints < 0;

                    let rankText = "";

                    if (isPenalty) {
                        category = "Penalty";
                        eventType = "Penalty";
                        rankText = "Penalty"; // Fixed: Capitalized to match validRanks
                        if (!isNaN(addedPoints)) {
                            addedPoints = -Math.abs(addedPoints);
                        }
                    } else {
                        // 2. Map numeric shorthand (1 -> 1st Place)
                        const rankMap = { "1": "1st Place", "2": "2nd Place", "3": "3rd Place", "4": "4th Place" };
                        // If it's in the map, use the long version; otherwise, use the raw text
                        rankText = rankMap[rawRank] || rawRank;
                    }

                    // 3. Validation Logic
                    const validRanks = ["1st Place", "2nd Place", "3rd Place", "4th Place", "Penalty"];
                    let rowError = "";

                    if (!rawHouseName) rowError = "Missing House name.";
                    else if (!houseId) rowError = `House "${formattedHouseName}" is not recognized.`;
                    else if (isNaN(addedPoints)) rowError = `Points must be a number.`;
                    else if (!category) rowError = "Missing Category.";
                    // Fixed: Now rankText will be "1st Place" even if the user typed "1"
                    else if (!validRanks.includes(rankText)) {
                        rowError = `Invalid Rank "${rawRank}". Use 1-4 or 1st-4th Place.`;
                    }

                    // 4. Strict Scoring Rules (Only if NOT a penalty)
                    if (!rowError && !isPenalty) {
                        const type = eventType.toLowerCase();
                        if (type === "individual") {
                            if (rankText === "1st Place") finalPoints = 10;
                            else if (rankText === "2nd Place") finalPoints = 7;
                            else if (rankText === "3rd Place") finalPoints = 5;
                        } 
                        else if (type === "group") {
                            if (rankText === "1st Place") finalPoints = 100;
                            else if (rankText === "2nd Place") finalPoints = 70;
                            else if (rankText === "3rd Place") finalPoints = 50;
                            else if (rankText === "4th Place") finalPoints = 20;
                        }
                    }

                    if (rowError) {
                        validationErrors.push(`Line ${lineNumber}: ${rowError}`);
                    } else {
                        readyToUpload.push({
                            houseId,
                            houseName: formattedHouseName,
                            addedPoints: finalPoints,
                            category,
                            rankText: rankText, 
                            eventType: eventType,
                            comment: row.Comment || ""
                        });
                    }
                });

                // --- DECISION POINT ---
                if (validationErrors.length > 0) {
                    status.innerHTML = "❌ Upload Cancelled: Errors Found";
                    status.style.color = "#ef4444";
                    errorLog.classList.remove('hidden');
                    
                    validationErrors.forEach(msg => {
                        const li = document.createElement('li');
                        li.innerText = msg;
                        errorList.appendChild(li);
                    });
                    
                    alert("No data was uploaded. Please fix the errors listed below and try again.");
                    
                    // FIXED: Re-enable the button here before exiting!
                    resetUploadButton(uploadBtn);
                    return; 
                }

                // --- PASS 2: THE EXECUTOR (Atomic Update) ---
                status.innerHTML = `No errors found! Preparing bulk upload...`;
                status.style.color = "#0077ff";

                const updates = {};
                const currentHouseScores = {}; // To track point changes locally before sending
                
                // Clone the initial scores from housesData
                for (let id in housesData) {
                    currentHouseScores[id] = housesData[id].score || 0;
                }

                readyToUpload.forEach(item => {
                    // 1. Calculate the New Score
                    const oldScore = currentHouseScores[item.houseId];
                    const newScore = oldScore + item.addedPoints;
                    
                    // Update our local tracker so the next row for the same house is accurate
                    currentHouseScores[item.houseId] = newScore;

                    // 2. Add Score Update to the batch
                    updates[`Houses/${item.houseId}/score`] = newScore;

                    // 3. Add Log Entry to the batch
                    const newLogKey = db.ref('Logs').push().key;
                    updates[`Logs/${newLogKey}`] = {
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
                        adminEmail: auth.currentUser.email
                    };
                });

                try {
                    // SEND EVERYTHING AT ONCE
                    await db.ref().update(updates);
                    
                    status.innerHTML = `✅ Successfully uploaded all ${readyToUpload.length} entries!`;
                    status.style.color = "#22c55e";
                    fileInput.value = ""; 
                } catch (e) {
                    console.error("Atomic Update Failed:", e);
                    status.innerHTML = "❌ Upload Failed: Database connection lost.";
                }

                resetUploadButton(uploadBtn);
            }
        });
    } catch (err) {
        status.innerHTML = "❌ Critical Error: " + err.message;
        resetUploadButton(uploadBtn);
    }
}

// Helper function to keep code clean
function resetUploadButton(btn) {
    btn.disabled = false;
    btn.innerHTML = "Process CSV";
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
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