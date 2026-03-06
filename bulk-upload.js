async function handleBulkUpload() {
    const fileInput = document.getElementById('csv-file');
    const status = document.getElementById('upload-status');
    const errorLog = document.getElementById('error-log');
    const errorList = document.getElementById('error-list');
    
    if (!fileInput.files[0]) return alert("Please select a CSV file.");

    // Reset UI
    status.innerHTML = "⏳ Processing...";
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
                let successCount = 0;
                let failureDetails = [];

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const lineNumber = i + 2; // Row 1 is header, so data starts at 2
                    
                    const houseName = row.House?.trim();
                    const houseId = findHouseId(houseName);
                    const addedPoints = parseInt(row.Points);
                    const category = row.Category?.trim();
                    
                    // --- VALIDATION CHECKS ---
                    let errorMsg = "";
                    if (!houseName) errorMsg = "House name is missing.";
                    else if (!houseId) errorMsg = `House "${houseName}" not found in database. Check spelling.`;
                    else if (isNaN(addedPoints)) errorMsg = `Invalid points value: "${row.Points}".`;
                    else if (!category) errorMsg = "Category is missing.";

                    if (errorMsg) {
                        failureDetails.push(`Line ${lineNumber}: ${errorMsg}`);
                        continue; // Skip to next row
                    }

                    // --- DATABASE UPDATE ---
                    try {
                        const houseRef = db.ref(`Houses/${houseId}/score`);
                        const result = await houseRef.transaction(curr => (curr || 0) + addedPoints);

                        if (result.committed) {
                            const newScore = result.snapshot.val();
                            const oldScore = newScore - addedPoints;
                            
                            await db.ref('Logs').push().set({
                                fullDateTime: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
                                unixTimestamp: firebase.database.ServerValue.TIMESTAMP,
                                rankText: row.Rank || "",
                                houseId: houseId,
                                houseName: houseName,
                                previousPoints: oldScore,
                                pointsAdded: addedPoints,
                                newTotal: newScore,
                                category: category,
                                eventType: row.EventType || "",
                                comment: row.Comment || "No comment provided",
                                adminEmail: auth.currentUser.email
                            });
                            successCount++;
                        }
                    } catch (e) {
                        failureDetails.push(`Line ${lineNumber}: Database write failed.`);
                    }
                }

                // --- FINAL REPORTING ---
                status.innerHTML = `✅ Successfully added ${successCount} entries.`;
                
                if (failureDetails.length > 0) {
                    status.innerHTML += ` ⚠️ ${failureDetails.length} errors found.`;
                    errorLog.classList.remove('hidden');
                    
                    failureDetails.forEach(msg => {
                        const li = document.createElement('li');
                        li.innerText = msg;
                        errorList.appendChild(li);
                    });
                }
                
                fileInput.value = ""; 
            }
        });
    } catch (err) {
        status.innerHTML = "❌ Error: " + err.message;
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