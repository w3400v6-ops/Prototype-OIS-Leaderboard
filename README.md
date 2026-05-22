# OIS Leaderboard Project

## Overview

This project is a static frontend for the OIS Leaderboard, with a public leaderboard page and an admin page for score updates and bulk upload. It uses Firebase Realtime Database and Firebase Authentication for data storage and admin access.

## Git Workflow

### Clone the repository

```bash
git clone <repository-url>
cd Prototype-OIS-Leaderboard
```

### Pull latest changes

```bash
git pull origin main
```

> Replace `main` with the correct branch name if the repository uses `master` or another branch.

### Make a commit

1. Check current status:

```bash
git status
```

2. Stage modified files:

```bash
git add .
```

3. Commit with a message:

```bash
git commit -m "Describe the change clearly"
```

4. Push to remote:

```bash
git push origin main
```

## File Structure

- `index.html` — public leaderboard page
- `admin.html` — admin control panel
- `style.css` — styles for the public page
- `admin.css` — styles for the admin page
- `script.js` — public leaderboard logic
- `user_searchbar.js` — search and paginated result display for the public page
- `admin.js` — admin page interaction and UI logic
- `bulk-upload.js` — bulk upload parsing and Firebase update logic
- `firebase-init.js` — shared Firebase initialization
- `README.md` — this documentation file

## How to Run Locally

Because this is a static HTML/CSS/JS project, you can open `index.html` and `admin.html` directly in the browser. For a better local development experience, use a simple static server such as VS Code Live Server.

## Function Documentation

### `firebase-init.js`

- `firebase.initializeApp(firebaseConfig)`
  - Initializes Firebase using shared config.
- `const db = firebase.database()`
  - Sets up Firebase Realtime Database access.
- `const auth = firebase.auth()`
  - Sets up Firebase Authentication.
- `const auth = firebase.analytics()`
  - Sets up Google Analytics.
- `const provider = new firebase.auth.GoogleAuthProvider()`
  - Configures Google sign-in for admins.
- `provider.setCustomParameters({ hd: "oakbridge.edu.my" })`
  - Restricts sign-in to school email domain.

### `user_searchbar.js`

- `renderPaginatedLogs()`
  - Calculates the current page slice from `filteredLogsGlobal`.
  - Renders search results into `#search-log-list`.
  - Shows a "No logs found" message when the result list is empty.
- `createLogEntryHTML(log)`
  - Formats a single log entry HTML block.
  - Adds special formatting for penalties and positive points.
- `updatePaginationUI(totalResults)`
  - Creates and updates pagination buttons based on result count.
- `window.changeSearchPage = (direction) => { ... }`
  - Changes the current search page and rerenders the list.

### `script.js`

- `startLeaderboard()`
  - Starts live Firebase listeners for `Houses` data.
  - Builds the leaderboard cards once on initialization.
  - Animates score changes and reorders cards when data updates.
- `renderHouseLogs(el, houseId)`
  - Displays recent logs for the selected house.
  - Handles penalty, custom points, and standard ranking formatting.
- `updateBodyState()`
  - Tracks whether a house drawer is expanded and toggles a body class.
- `runTicker()`
  - Rotates the ticker text for each house card.
  - Skips ticker updates when the house card is expanded.
- `animateScore(el, from, to)`
  - Animates score changes smoothly in the UI.
- `animateCards(sortedEls, data)`
  - Reorders house cards by score.
  - Applies the `leader` class to the top scoring house(s).
- `calculateTotalPoints()`
  - For admin to check if total points is correct
  - Run `calculateTotalPoints()` in the console


### `admin.js`

- `showUnauthorized()`
  - Shows the unauthorized page state when the user is not an admin.
- `fetchInitialData()`
  - Loads houses, categories, and event type data from Firebase.
  - Populates UI select inputs.
- `handleCategoryChange()`
  - Shows or hides the custom category field.
  - Switches between penalty deduction and normal scoring UI.
- `updateRankingDropdown()`
  - Loads ranking options based on selected event type.
  - Adds a custom points option.
- `updateScore()`
  - Validates form inputs.
  - Calculates points for penalties, custom points, and selected ranks.
  - Updates house score and writes a new log entry.
  - Clears the form after submission.
- `startLeaderboardListener()`
  - Reads `Houses` data and updates the admin leaderboard UI.
  - Sorts houses by score and highlights the top house.
- `startLogsListener()`
  - Reads `Logs` data from Firebase.
  - Stores logs in `totalLogsArray` for pagination and search.
- `handleSearch()`
  - Filters logs based on search input.
  - Resets pagination to page 1.
- `getFilteredLogs()`
  - Returns logs filtered by house, category, rank, comment, or admin email.
- `renderLogTable()`
  - Renders the visible page of logs in the admin audit table.
  - Resets scroll position when the table is rerendered.
- `renderPaginationControls()`
  - Builds Prev/Next controls and page number buttons.
  - Shows a sliding window of page numbers when there are many pages.
- `changePage(direction)`
  - Advances or rewinds the current page.
- `deleteLog(logId, logData)`
  - Confirms deletion eligibility for the current admin user.
  - Reverts house score using a Firebase transaction.
  - Moves the deleted log to `Recycle` and removes it from `Logs`.
- `startRecycleBinListener()`
  - Reads deleted logs from `Recycle`.
  - Shows the latest deleted entries.
- `restoreLog(recycleId, itemData)`
  - Restores points and re-creates the log entry.
  - Removes the restored entry from `Recycle`.
- `calculateTotalPoints()`
  - For admin to check if total points is correct
  - Run `calculateTotalPoints()` in the console

### `bulk-upload.js`

- `handleBulkUpload()`
  - Handles the upload button click.
  - Reads CSV or Excel files.
  - Detects Clobas / school report files and custom templates.
  - Sends validated data for upload.
- `getRawDataFromFile(file)`
  - Reads `.xlsx` and `.xls` files via `FileReader` and `XLSX`.
  - Parses CSV files with `Papa.parse`.
- `convertRowsToObjects(rawData)`
  - Converts CSV row arrays to objects when headers exist.
  - Falls back to a standard column order if needed.
- `isClobasFileData(rawData)`
  - Detects Clobas school report files by header text.
- `updateAssessmentVisibility(show)`
  - Shows or hides the assessment dropdown.
- `handleFileInputChange()`
  - Detects the uploaded file type and updates assessment visibility.
- `processRows(data, isClobas = false)`
  - Detects upload format and parses school report or standard template.
  - Validates data and executes Firebase updates.
- `normalizeGradeInput(rawGrade)`
  - Normalizes grade strings like `Grade 9A` or `9S`.
- `titleCaseName(name)`
  - Formats student names to title case.
- `findStudentHouse(studentName, grade, studentData, housesData)`
  - Finds a student record in `StudentData` and maps it to a house.
- `parseSchoolReport(data, housesData, studentData)`
  - Parses Clobas-style marks reports.
  - Picks top 3 students per subject and maps them to house points.
- `parseStandardTemplate(rows, housesData, studentData)`
  - Parses a standard CSV template.
  - Supports penalties and event-based scoring rules.
- `executeAtomicUpload(readyToUpload, housesData)`
  - Updates house totals and writes logs in a single Firebase update.
- `showErrors(errors)`
  - Displays upload validation errors in the UI.
- `resetUploadButton(btn)`
  - Restores the upload button state.
- `downloadCSVTemplate()`
  - Creates and downloads a sample CSV template.
- `renderStep()`
  - Displays help modal steps in the admin bulk upload help UI.

## google6799ac2803a7a724
- Google Search Console verification.

## Notes

- `index.html` is the public leaderboard page and must load `firebase-init.js` before `script.js` and `user_searchbar.js`.
- `admin.html` is the admin panel and must load `firebase-init.js` before Firebase-dependent admin scripts.
- No additional package install is required for running the project locally unless you want to use a local server.


## Firebase Database
- `API Keys` - Download google-services.json from project Setting>General to obtain api keys
- `Deleting Node` - Don't delete logs directly from the database - the total points will no be updated - if deleted, run `calculateTotalPoints()` in the inspector mode console to check to the correct current points
- `Adding new node` - Always add/change rules of the database when added new node
- `Database rule` - for student: {"auth != null && auth.token.email.endsWith('@oakbridge.edu.my')"}
for admin: {"auth != null && root.child('AdminEmails').hasChild(auth.token.email.replace('.', ','))"}
- `Adding new admin` - add new admin in the database under AdminEmails node e.g `darrenfongzr@oakbridge,edu.my : true `
- `Adding new student` - Add new student name under the StudentData node with their email, gender and houses.
- `Changing domain` - Add new domain in under the Authentication>Setting>Authorized Domain

---