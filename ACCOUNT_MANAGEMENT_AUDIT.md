# Read-Only Implementation Audit: User Account Management Architecture

**Repository:** `attendance-tracker-v2`  
**Framework:** React 19 + Vite + Tailwind CSS  
**Database & Auth Provider:** Google Cloud Firestore & Firebase Authentication (`firebase@12.16.0`)  
**Audit Date:** October 2026  
**Mode:** Read-Only Analysis (No mutations performed)

---

## 1. Account-Management Architecture Overview

The portal implements a **serverless, client-orchestrated account-management architecture** built entirely on the Firebase Web Browser SDK (`firebase@12.16.0`) and React 19. It does **not** use a trusted backend, server endpoints, cloud functions, or the Firebase Admin SDK.

```
+---------------------------------------------------------------------------------------+
|                                 CLIENT BROWSER (SPA)                                  |
|                                                                                       |
|  [AdminDashboard.jsx]                                                                 |
|         |                                                                             |
|         v                                                                             |
|  [src/firebase/config.js]                                                             |
|         |                                                                             |
|         +---> initializeApp(firebaseConfig, "temp-app-...")                            |
|         |        |                                                                    |
|         |        +---> createUserWithEmailAndPassword(tempAuth, email, password)      |
|         |        +---> signOut(tempAuth)                                              |
|         |        +---> deleteApp(tempApp)                                             |
|         |                                                                             |
|         +---> setDoc(doc(db, "users", uid), profileData)                              |
+-------------------|------------------------------------------------|------------------+
                    |                                                |
                    v                                                v
       +-------------------------+                      +-------------------------+
       |  Firebase Auth Service  |                      | Cloud Firestore (DB)    |
       |  (Identity & Password)  |                      | (users/{uid} document)  |
       +-------------------------+                      +-------------------------+
```

### Core Architectural Mechanics:
1. **Secondary App Pattern for Account Provisioning**: In standard Firebase client SDK usage, calling `createUserWithEmailAndPassword()` immediately signs out the active user and signs in the newly registered account. To circumvent this from the browser without a backend, the portal creates an isolated, ephemeral `FirebaseApp` instance (`initializeApp(firebaseConfig, "temp-app-<timestamp>")`), registers the user in Firebase Auth, signs out of the temporary instance, destroys the temporary app via `deleteApp()`, and writes the user's metadata to Firestore using the main client database instance.
2. **Dual-Model Identity Linking**:
   - **Teachers**: Created with an email address and an admin-specified password.
   - **Students**: Created with an auto-generated alphanumeric code (`WCS-XXXX`) and a 4-digit PIN. The system creates a synthetic, hidden email (`wcs-xxxx@students.wcs.edu`) and pads the PIN to 6 digits (`authPin = pin.padEnd(6, '0')`) to satisfy Firebase Authentication's minimum password length.
   - The user's Firestore document path is explicitly keyed by the Firebase Authentication UID: `/users/{uid}`.
3. **Client-Side Authorization**: Roles (`admin`, `teacher`, `student`) are stored as plain string attributes in Firestore profile documents (`/users/{uid}`). When a user logs in, `onAuthStateChanged` fetches their Firestore document and populates `user.role` in React's `AuthContext`. Route protection is enforced entirely in the browser via React Router (`<ProtectedRoute allowedRoles={['admin']}>` in `src/App.jsx`).

---

## 2. Walkthrough: What Happens When an Admin Clicks "Add User"

The portal separates user creation into two distinct UI entry points: **"Provision New Teacher"** and **"Provision New Student"**. (There is no UI to create new `admin` accounts; admin accounts are created through automatic database seeding in `src/pages/Login.jsx`).

### Flow A: Adding a Teacher ("Provision New Teacher")
1. **Admin Input**: The admin opens the modal in `src/pages/AdminDashboard.jsx` (lines 4531–4630) and enters:
   - Full Name (`name`)
   - Login Email (`email`)
   - Initial Password (`password`)
   - Class Assignments (Grade, Subject, Start Time, End Time, Schedule Days)
2. **Form Submission**: Clicking "Submit" triggers `handleSubmit()` in `src/pages/AdminDashboard.jsx` (lines 1175–1231).
3. **Secondary Auth Provisioning**: Calls `provisionUserSecondary(email, password, profileData)` in `src/firebase/config.js` (lines 25–59):
   - A unique ephemeral app is instantiated: `initializeApp(firebaseConfig, "temp-app-" + Date.now())`.
   - `createUserWithEmailAndPassword(tempAuth, email, password)` executes on Firebase Auth servers.
   - `tempAuth.signOut()` and `deleteApp(tempApp)` execute immediately. The admin's session on the primary app remains intact in `localStorage`.
4. **Firestore Profile Creation**: `setDoc(doc(db, "users", uid), { id: uid, email, name, role: "teacher", avatar, assignments })` executes via the primary Firestore instance.
5. **State Synchronization**: The modal displays a success animation, resets form inputs, closes after 1.2 seconds, and calls `loadData()` to re-fetch the teacher list from Firestore.

### Flow B: Adding a Student ("Provision New Student")
1. **Admin Input**: The admin enters the student's legal name, optional international name, grade level, and community center in `src/pages/AdminDashboard.jsx` (lines 5120–5260).
2. **Account Generation**: Clicking "Provision Student" calls `generateStudentAccount()` in `src/firebase/config.js` (lines 65–92):
   - Generates a random 4-character suffix (e.g., `WCS-9A2B`).
   - Generates a random 4-digit PIN (e.g., `4821`).
   - Generates synthetic credentials: `${code.toLowerCase()}@students.wcs.edu` and `pin.padEnd(6, '0')`.
   - Calls `provisionUserSecondary()` to register the hidden Auth credentials and creates the Firestore document with `defaultPin: pin` saved in plaintext.
3. **Credential Presentation**: The UI switches to a credential card displaying the generated **Student Code** and **Default PIN** for the admin to distribute.

---

## 3. UI Action vs. API Trace Table

| UI Action | Actual API / Function Called | Records Changed | Where Authorization Is Enforced | Relevant File & Function Evidence |
|---|---|---|---|---|
| **Provision Teacher** | `provisionUserSecondary(email, password, profileData)` | 1. Firebase Auth user created<br>2. Firestore doc `users/{uid}` created (`role: "teacher"`) | Client-side only (`ProtectedRoute allowedRoles={['admin']}`). Firestore rules: **Not verified** (no rules file in repo). | `src/firebase/config.js` (lines 25–59)<br>`src/pages/AdminDashboard.jsx` (lines 1175–1231) |
| **Provision Student** | `generateStudentAccount(...)` -> `provisionUserSecondary(...)` | 1. Firebase Auth user created (`...students.wcs.edu`)<br>2. Firestore doc `users/{uid}` created (`role: "student"`, stores `defaultPin`) | Client-side only (`ProtectedRoute allowedRoles={['admin']}`). | `src/firebase/config.js` (lines 65–92)<br>`src/pages/AdminDashboard.jsx` (lines 1021–1047) |
| **Edit Teacher Schedule / Assignments** | `updateDoc(doc(db, "users", teacherId), { assignments })` | Updates `assignments` array in `users/{teacherId}` | Client-side only. | `src/pages/AdminDashboard.jsx` (lines 1251–1290, `handleEditSubmit`) |
| **Edit Teacher Display Name or Email** | **None (Not Supported in UI)** | No records changed. Name and email are displayed as read-only static text in the edit modal. | N/A | `src/pages/AdminDashboard.jsx` (lines 4784–4793) |
| **Edit Student Demographic Profile** | `updateDoc(doc(db, "users", studentId), updateData)` | Updates `name`, `internationalName`, `nationalName`, `communityCenter`, `gradeLevel` in `users/{studentId}` | Client-side only. | `src/pages/AdminDashboard.jsx` (lines 904–947, `handleSaveStudentProfile`) |
| **Edit Student Login / PIN** | **None (Not Supported in UI)** | No records changed. Form explicitly states "Login credentials remain immutable." | N/A | `src/pages/AdminDashboard.jsx` (line 5403) |
| **Assign or Change User Role** | **None (Not Supported in UI)** | No records changed. Roles are fixed to `"teacher"` or `"student"` at creation; no dropdown or input exists to modify roles. | N/A | `src/pages/AdminDashboard.jsx` (line 1201) |
| **Activate / Deactivate Access** | **None (Not Supported in UI)** | No records changed. There is no `active` or `status` flag on accounts. | N/A | Entire codebase audit confirms no `disabled` or `active` fields on user documents. |
| **Send Password Reset Email** | `sendPasswordResetEmail(auth, teacherEmail)` | Firebase Auth sends a standard reset email; no Firestore documents modified. | Client-side only. | `src/pages/AdminDashboard.jsx` (lines 2862–2873, `handleSendResetEmail`) |
| **Delete Teacher** | `deleteDoc(doc(db, "users", teacherId))` + batch `updateDoc` cleaning `enrolledClasses` from student docs | 1. Firestore doc `users/{teacherId}` deleted.<br>2. Student `enrolledClasses` tags matching `teacherId_*` removed.<br>3. **Firebase Auth record is NOT deleted.** | Client-side only. | `src/pages/AdminDashboard.jsx` (lines 1293–1332, `handleDeleteTeacher`) |
| **Delete Student** | `deleteDoc(doc(db, "users", studentId))` + batch `deleteDoc` on `diaries` and `vocab_submissions` | 1. Firestore doc `users/{studentId}` deleted.<br>2. Associated diary and vocab docs deleted.<br>3. **Firebase Auth record is NOT deleted.** | Client-side only. | `src/pages/AdminDashboard.jsx` (lines 1335–1359, `handleDeleteStudent`) |
| **Edit Own Admin Profile** | `updateProfile(currentUser, ...)` + `updateDoc(doc(db, "users", uid), ...)` + `updatePassword(currentUser, ...)` | Updates active admin's Auth profile, Firestore user doc, and Auth password. | Firebase Auth session token (`currentUser`). | `src/components/ProfileSettingsModal.jsx` (lines 72–141) |

---

## 4. Custom Backend Assessment

> **Does this implementation require a custom backend? If yes, where does it run?**

**No.** This implementation does **not** use, require, or connect to any custom backend. 

- There are no server processes, Node.js runtimes, Express applications, Netlify Functions (`netlify/functions/`), Cloud Functions (`functions/`), or API endpoints (`/api/*`).
- The repository is a pure static single-page application built using Vite and deployed to Netlify via standard static asset routing (`public/_redirects` routes `/* /index.html 200`).
- All authentication operations, Firestore document creation, queries, updates, and deletions are executed directly from the user's web browser using the Firebase JavaScript client SDK.

---

## 5. Material Limitations and Behavioral Mismatches

1. **"Deleted" Accounts Remain in Firebase Authentication**:
   - When an administrator clicks "Delete Teacher" or "Delete Student", the code executes `deleteDoc(doc(db, "users", id))`. It **never deletes the account from Firebase Authentication**.
   - *Consequence*: The browser client SDK cannot delete arbitrary users from Firebase Auth (only `deleteUser(auth.currentUser)` exists). As a result:
     - The user's login credentials remain active in Firebase Auth.
     - The email address remains permanently claimed (`auth/email-already-in-use`), preventing re-registration.
     - When a "deleted" teacher or student logs in, Firebase Auth accepts their password, but `src/context/AuthContext.jsx` (lines 42–46) detects that `userDocSnap.exists()` is `false`, logs a console warning, and immediately forces `signOut(auth)`.
2. **Student Passwords Stored in Plaintext**:
   - In `src/firebase/config.js` (line 85), the generated 4-digit PIN is written directly into Firestore: `defaultPin: pin`.
   - In `src/pages/AdminDashboard.jsx` (line 3306), the PIN is rendered in the global student table. Any user with read access to Firestore can see all student login PINs in plaintext.
3. **Partial Provisioning Failures (Orphaned Auth Records)**:
   - If `createUserWithEmailAndPassword()` succeeds in `provisionUserSecondary()`, but `setDoc(doc(db, "users", uid))` fails (e.g. network interruption or permission rejection), the error is thrown without rolling back the Firebase Auth account. The Auth account remains orphaned, and the email cannot be used again without manual deletion in the Firebase Console.
4. **No In-App Identity Modification for Existing Users**:
   - The admin cannot change a teacher's display name or email address after creation.
   - The admin cannot change a student's Code, PIN, or email after creation.
5. **No Account Suspension / Deactivation**:
   - There is no mechanism to temporarily disable a teacher or student without permanently deleting their Firestore document.
6. **Self-Seeding Hardcoded Credentials in `Login.jsx`**:
   - `src/pages/Login.jsx` (lines 24–103) contains a `useEffect` that checks if `admin@school.edu` and `sarah.jenkins@schooldistrict.org` exist in Firestore on mount. If either query returns empty, the client executes `createUserWithEmailAndPassword()` with hardcoded default credentials and writes `role: "admin"` directly from the browser.
7. **Absence of Version-Controlled Security Rules**:
   - There is no `firestore.rules` file in the repository. Firestore security enforcement in the live production project is **Not verified**. If the live project relies on open rules, any authenticated client can read/write any user document.

---

## 6. Suitability for Another React + Firebase Attendance Portal

### Can this approach support an attendance portal where admins manage teachers entirely through the UI?
**Yes, with reservations.** The "secondary app instance" technique (`provisionUserSecondary`) successfully allows an admin to create accounts in Firebase Auth without terminating their own active session—entirely from the browser.

However, to rely on this pattern in a production portal where admins manage teachers exclusively through the UI, the following architectural gaps would require additional work:

### Capabilities Needing Additional Work:

1. **True User Deletion (Requires Backend or Admin SDK)**:
   - The browser SDK cannot call `admin.auth().deleteUser(uid)`. Without a trusted backend endpoint (e.g., a Firebase Cloud Function or Netlify Function), deleting a teacher leaves an orphaned Auth record and burns their email address permanently.
2. **Account Disabling / Revocation**:
   - To suspend access without deleting historical attendance records, the database must store an `isActive: boolean` or `status: "active" | "suspended"` flag. Both `src/context/AuthContext.jsx` and backend security rules must inspect this flag to block suspended teachers from accessing attendance sheets.
3. **Secure Credential Distribution**:
   - Storing plaintext PINs/passwords in Firestore is an anti-pattern. Instead, portals should provision accounts with a temporary random password and trigger `sendPasswordResetEmail()` or an invitation link so teachers set their own credentials securely.
4. **Teacher Profile and Email Updates**:
   - Updating a teacher's email in Firebase Auth requires `updateEmail()` on an active session or `admin.auth().updateUser(uid, { email })` on a backend. The current frontend has no mechanism to update a teacher's email address.
5. **Server-Side Authorization & Firestore Rules**:
   - Roles must be validated via Firestore Security Rules (or Firebase Auth Custom Claims) so that ordinary teachers cannot elevate themselves to admins or edit other teachers' records by sending direct Firestore SDK requests.
