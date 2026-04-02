async function handleBulkUpload() {
    const fileInput = document.getElementById('csv-file');
    const status = document.getElementById('upload-status');
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');
    
    if (!fileInput.files[0]) return alert("Please select a CSV file.");

    status.innerHTML = "⏳ Auditing file for errors...";
    status.style.color = "#333";
    errorLog.classList.add('hidden');
    errorList.innerHTML = "";

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
                    
                    // 1. Format House Name (First letter Caps, rest lower)
                    let rawHouseName = row.House?.trim() || "";
                    const formattedHouseName = rawHouseName.charAt(0).toUpperCase() + rawHouseName.slice(1).toLowerCase();
                    
                    const houseId = findHouseId(formattedHouseName);
                    const addedPoints = parseInt(row.Points);
                    const category = row.Category?.trim();
                    
                    // 2. Rank Logic & Shorthand Mapping
                    let rawRank = row.Rank?.toString().trim() || "";
                    let rankText = rawRank;

                    const rankMap = {
                        "1": "1st Place",
                        "2": "2nd Place",
                        "3": "3rd Place",
                        "4": "4th Place"
                    };

                    // Convert numeric shorthand (1 -> 1st Place)
                    if (rankMap[rawRank]) {
                        rankText = rankMap[rawRank];
                    }

                    // Force "Penalty" if points are negative
                    if (addedPoints < 0) {
                        rankText = "Penalty";
                    }

                    // 3. Allowed Final Values
                    const validRanks = ["1st Place", "2nd Place", "3rd Place", "4th Place", "Penalty"];

                    let rowError = "";
                    if (!rawHouseName) rowError = "Missing House name.";
                    else if (!houseId) rowError = `House "${formattedHouseName}" is not recognized.`;
                    else if (isNaN(addedPoints)) rowError = `Points must be a number.`;
                    else if (addedPoints < -100 || addedPoints > 100) rowError = `Points must be between -100 and 100.`;
                    else if (!category) rowError = "Missing Category.";
                    // Final check for rank validity
                    else if (!validRanks.includes(rankText)) {
                        rowError = `Invalid Rank "${rawRank}". Use 1-4, "1st Place", etc. (or Penalty for negative points).`;
                    }

                    if (rowError) {
                        validationErrors.push(`Line ${lineNumber}: ${rowError}`);
                    } else {
                        readyToUpload.push({
                            houseId,
                            houseName: formattedHouseName,
                            addedPoints,
                            category,
                            rankText: rankText.toLowerCase(), // This will now be "1st Place", "Penalty", etc.
                            eventType: row.EventType || "",
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
                    return; // STOP HERE
                }

                // --- PASS 2: THE EXECUTOR (Only runs if 0 errors) ---
                status.innerHTML = `🚀 No errors found! Uploading ${readyToUpload.length} entries...`;
                status.style.color = "#0077ff";

                let successCount = 0;
                for (const item of readyToUpload) {
                    try {
                        const houseRef = db.ref(`Houses/${item.houseId}/score`);
                        const result = await houseRef.transaction(curr => (curr || 0) + item.addedPoints);

                        if (result.committed) {
                            const newScore = result.snapshot.val();
                            const oldScore = newScore - item.addedPoints;
                            
                            await db.ref('Logs').push().set({
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
                            });
                            successCount++;
                        }
                    } catch (e) {
                        console.error("Database error during upload:", e);
                    }
                }

                status.innerHTML = `✅ Successfully uploaded ${successCount} entries!`;
                status.style.color = "#22c55e";
                fileInput.value = ""; 
            }
        });
    } catch (err) {
        status.innerHTML = "❌ Critical Error: " + err.message;
    }
}

function downloadCSVTemplate() {
    db.ref('Houses').once('value', snapshot => {
        const houses = [];
        snapshot.forEach(child => houses.push(child.val().name));
        
        // Added EventType and Rank to the headers
        let csvContent = "data:text/csv;charset=utf-8,House,Category,EventType,Rank,Points,Comment\n";
        
        houses.forEach(name => {
            csvContent += `${name},Badminton,Individual,1st place,10,Bulk Update\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "bulk_upload_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}