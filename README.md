Family Travel Checklist: the complete guide
A pastel travel-checklist website for your family. Everyone logs in with their own name and password, their lists are saved on the server (so they follow them to any phone or laptop), the family can see who is going where and who packed what, and you, the admin, can see everything that isn't marked private.
Status: the code is built and tested (see Testing). It has been tested against a local stand-in for the database, not against a real Vercel or Upstash account, so after you deploy, do the health check.
1. What the website does
For everyone in the family
Log in with a name and password. No Google, no email.
Trips (for example "Trip to Qadian"), each with several checklists (Clothing, Gadgets, Health…).
For every item: ✓ packed, ✕ not needed, − remove, and 👁️ share / 🙈 private.
Add your own items. An emoji is picked for you.
Countdown timer: set a travel date and see days, hours, minutes and seconds left.
🧳 Everything packed! If something isn't ticked, it tells you exactly what's missing.
New accounts start with the Qadian packing list already loaded (55 items in 9 checklists). Everyone gets their own copy, so one person's ticks never change another person's.
Auto-saves a moment after every change. A badge shows Saved, Saving… or Not saved, retrying.
Works on phones, can be installed to the home screen, and the app shell works offline.
Family connection (one code connects everyone)
Everyone who creates an account with the same family code is connected automatically.
👨‍👩‍👧 Family page: a list of names, each person's trips, travel dates and progress. Tap a name to see what they chose and ticked (view only).
Activity feed: "Amina packed 🧥 Jacket", "Bilal added ➕ Scarf", "Dara set the travel date…". A 🔔 number appears on the Family button when something new happened.
Private items: tap 👁️ to make an item 🙈 private. You can also make a whole checklist, or a whole trip, private. Private things do not appear in the family view, the activity feed or the admin pages, and nobody is told that something is hidden.
Anyone can type a different code on the Family page to start or join another, separate family.
For you, the admin
Log in as the admin, then ☰ Trips → 👑 Admin.
Tab	What you see
👥 People	Every account, when they joined, last login, last save, number of trips and items, and how many items are private (not which). Buttons: View lists, Reset password, Delete. Also Add a family member.
✈️ Trips	Who is going where, the date, and how much is packed.
🔔 Activity	Everyone's recent activity: who ticked, added, removed or planned what.
2. What you need
A free account on vercel.com (the free "Hobby" plan is meant for personal, non-commercial use, which suits a family).
A free account on github.com (the easiest way to send the files to Vercel).
A laptop or desktop is strongly recommended for the setup (about 15 minutes). Your family only needs a phone afterwards.
3. Put it online (step by step)
1. Get the files
You need the project folder: public/, api/, lib/, server.js, package.json, vercel.json and the rest. If you have the zip (family-travel-checklist.zip), unzip it. Do not upload the zip itself.
2. Upload them to GitHub
On github.com click + → New repository. Name it family-checklist, keep it Private, and click Create repository.
Click uploading an existing file, drag in everything from inside the unzipped folder, and click Commit changes. Check that you can see api, lib, public, package.json and vercel.json at the top level of the repository, not inside another folder.
3. Create the project on Vercel
On vercel.com choose Add New… → Project and Import your family-checklist repository.
Leave every setting as it is (no framework, no build command) and click Deploy.
Wait for the confetti. The site will load but won't work properly yet, because it has no database and no settings. Do steps 4 and 5 next.
4. Add the database (this is where the data is saved)
In your Vercel project open the Storage tab.
Choose Create Database and pick Upstash for Redis (or "Upstash" in the Marketplace list). Choose the free plan and a region close to you.
Connect it to your project. Vercel adds the connection settings by itself (KV_REST_API_URL and KV_REST_API_TOKEN).
5. Add your settings
Open Settings → Environment Variables and add:
Name	Value	Required?
ADMIN_PASSWORD	the admin password you choose (long and private)	Yes
ADMIN_USERNAME	the admin's login name	No (default: admin)
FAMILY_CODE	a secret word your family types to join, for example qadian2026	Recommended
SESSION_SECRET	any long random text	No (one is made from the database key if empty)
If you leave FAMILY_CODE out, sign-up is closed. Only you can add people (Admin → People → Add a family member), and they won't be connected to each other automatically.
Then go to Deployments, tap ⋯ on the latest one, and choose Redeploy.
6. Check that it works
Open https://YOUR-PROJECT.vercel.app/api/health. You should see:
{"ok":true,"storage":"upstash","adminConfigured":true,"signupOpen":true}
You see	It means
"storage":"none"	the database isn't connected yet (step 4), then redeploy
"adminConfigured":false	ADMIN_PASSWORD is missing (step 5), then redeploy
"signupOpen":false	FAMILY_CODE is missing, so only you can add people
7. Share it with your family
Send them:
the link https://YOUR-PROJECT.vercel.app
the family code
They open the link, tap Create account, choose a name and password, type the family code, and they're in. Each new account opens straight onto the Qadian list. On a phone, they can tap the browser menu and choose Add to Home screen to get an app icon.
You log in with your admin name and ADMIN_PASSWORD.
4. Everyday admin jobs
Job	How
Someone forgot their password	Admin → People → their card → Reset password. Leave it empty for a random password, or type one. Send them the temporary password. They must choose their own at their next login. This also unlocks a locked account.
Add someone yourself	Admin → People → Add a family member. The temporary password is shown once, so copy it. They are connected to the family and must set their own password at first login.
Remove someone	Admin → People → Delete. Their account and lists are removed for good.
See who is going where	Admin → Trips tab
See who ticked or added what	Admin → Activity tab
Look at someone's lists	Admin → People → View lists (view only; private items are not shown)
You forgot the admin password	In Vercel, change ADMIN_PASSWORD and redeploy. The admin password becomes the new value.
Change the family code	Best not to. If you change FAMILY_CODE and redeploy, new sign-ups join a new, separate family. Anyone who should stay connected must type the old code on the Family page (👨‍👩‍👧 Family → Use a different family code).
5. Rules, limits and good-to-know
Names and passwords
Names: 2–24 characters; letters, numbers, spaces and . _ -. Names are not case-sensitive ("Amina" = "amina").
Passwords: 6–128 characters. They are stored only as salted scrypt hashes, never in plain text.
A login lasts 30 days on that device. It is a secure, HttpOnly cookie.
Changing your password signs out your other devices. A reset by the admin signs that person out everywhere.
Lock-out
8 wrong passwords in a row for one name locks that name for 15 minutes. The admin's reset unlocks it immediately.
Many failed attempts from one network are slowed down as well.
Saving
Changes save about half a second after you stop tapping. If the internet drops, the page keeps your changes and retries automatically.
Open pages check for changes made on other devices every 20 seconds and when you return to the tab.
If one person edits on two devices at the exact same moment, the last save wins.
Privacy
The family sees your shared lists and activity. The admin sees them too.
🙈 Private items, checklists and trips are hidden on every screen and in the activity feed. Hiding something is never announced.
Private items are hidden, not encrypted. They are still stored in your database, so whoever owns the Vercel and Upstash accounts could technically read them there.
The sign-up screen tells people: "Your family and the admin can see your lists, except items you mark 🙈 private."
Limits per person: up to 100 trips, 100 checklists per trip, 500 items per checklist, and about 900 KB of data in total. The activity feed keeps the latest 300 events per family (500 overall for the admin).
Cost: Vercel Hobby and Upstash's free plan are free. A family uses a tiny amount, but both plans have usage limits, so check their pages if the family grows a lot.
6. Troubleshooting
Problem	What to do
The page says "Database is not connected yet"	Connect Upstash Redis to the project (step 4), then redeploy.
Nobody can create an account	FAMILY_CODE isn't set, so sign-up is closed. Set it and redeploy, or add people from the admin page.
"That family code is not right"	The code is not case-sensitive, but spelling and spaces must match FAMILY_CODE.
"Wrong name or password"	Check the name and password. After 8 wrong tries the name is locked for 15 minutes, and the admin can reset it.
I can log in as admin but see nobody	They haven't created accounts yet. Share the link and the family code.
I changed a setting but nothing changed	Environment variables only apply after a Redeploy.
The status badge says Not saved, retrying	The device is offline or the server is unreachable. Keep the page open and it will save when the connection returns.
The family page says Connect with your family	That account has no family code. Tap Enter family code and type the family's code.
A page looks old after an update	Close and reopen it, or pull down to refresh.
7. Run it on your own computer (optional)
You need Node.js 18 or newer.
npm run dev      # opens http://localhost:3000
Locally: admin name admin, admin password change-me-admin, family code family. Data is stored in .data/db.json.
8. Testing
npm test                       # no install needed (Node 18+ only)
Suite	What it covers
API tests (34)	sign-up, login, wrong passwords, forged cookies, cross-origin blocking, lock-out, data isolation between users, saving and reloading, bad or oversized data, admin actions, password reset and change, family connection, private items never leaking to family, admin, sharing codes or the activity feed, group checklists, static/PWA assets, restart persistence
Not yet tested in this build: automated browser (Playwright) tests, a stress run, a real Vercel + Upstash deployment. Do the health check and a quick phone walk-through after deploying.
9. Project layout
public/            the website (index.html, style.css, app.js, sw.js, manifest, icons/)
api/index.js       the Vercel entry point
lib/app.js         the server: login, data, family, admin
lib/shared.js      privacy filter and activity-feed logic
lib/security.js    password hashing and signed login cookies
lib/store.js       database layer (Upstash Redis, or a JSON file locally)
server.js          local development server
tests/             API, browser and stress tests
vercel.json        Vercel settings and security headers
package.json       scripts
10. API reference (for the curious)
All requests and responses are JSON.
Endpoint	Who	What it does
GET /api/health	anyone	status check
POST /api/signup	anyone with the family code	create an account and join the family
POST /api/login, POST /api/logout	anyone	log in / out
GET /api/me	anyone	who am I
POST /api/password	logged in	change my password
GET/PUT /api/data	logged in	load / save my trips
GET /api/family	logged in	members, trips, activity feed
GET /api/family/:name	same family	one member's shared lists
POST /api/family/join, /leave, /seen	logged in	change family, leave, mark activity as read
GET /api/family/unread	logged in	number of new events
GET /api/admin/users, /feed, /overview	admin	accounts, activity, who goes where
POST /api/admin/users	admin	add a person
GET /api/admin/users/:name/data	admin	view someone's shared lists
POST /api/admin/users/:name/reset	admin	reset a password
DELETE /api/admin/users/:name	admin	delete a person
Made with love for the family trip. Safe travels! ✈️🌴