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
                    const houseName = row.House?.trim();
                    const houseId = findHouseId(houseName);
                    const addedPoints = parseInt(row.Points);
                    const category = row.Category?.trim();

                    let rowError = "";
                    if (!houseName) rowError = "Missing House name.";
                    else if (!houseId) rowError = `House "${houseName}" is not recognized.`;
                    else if (isNaN(addedPoints)) rowError = `Points must be a number (found "${row.Points}").`;
                    else if (!category) rowError = "Missing Category.";

                    if (rowError) {
                        validationErrors.push(`Line ${lineNumber}: ${rowError}`);
                    } else {
                        // Store the validated data so we don't have to look it up again
                        readyToUpload.push({
                            houseId,
                            houseName,
                            addedPoints,
                            category,
                            rankText: row.Rank || "",
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
            csvContent += `${name},Badminton,Individual,1st Place,10,Bulk Update\n`;
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