# Nudge notification server

The server sends FCM notifications for tasks created by signed-in Firebase users. It verifies the caller's Firebase ID token and checks that the task belongs to that caller before sending.

## Configure and run

1. In Firebase Console, enable Email/Password Authentication and create the Firestore database used by the Android app. Publish the repository's `firestore.rules`; do not use open/test-mode rules. The app stores public user email addresses in `users`, private FCM tokens in `deviceTokens`, and task records in `tasks`.
2. Create a Firebase service account with access to Firebase Authentication, Firestore, and Cloud Messaging. Keep its JSON private; never add it to the app or commit it.
3. From this directory, install and start the server:

   ```powershell
   npm install
   $env:SERVICE_ACCOUNT = Get-Content -Raw 'C:\secure\service-account.json'
   npm start
   ```

   Alternatively, configure `SERVICE_ACCOUNT` as a secret environment variable on the hosting provider. `PORT` is read from the environment when set.
4. Deploy this directory on a Node.js 20+ host with HTTPS. In `www/js/index.js`, replace `https://YOUR-APP.onrender.com` with the deployed server's HTTPS base URL.
5. Build and run the Cordova Android app on devices. Sign in on both devices and allow notifications. Send a task from one device to the other to test delivery.

The browser preview cannot exercise FirebaseX's native authentication, Firestore, or FCM APIs. The sender must be signed in, and the task and recipient token must be present in the same Firebase project configured for the Android app and server.
