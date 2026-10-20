const SERVER = 'https://bin-hr2h.onrender.com';
let me = null, target = null;

const fb = () => FirebasePlugin;
// Wrap the plugin's callback style into promises
const p = (fn, ...args) => new Promise((res, rej) => fn.call(fb(), ...args, res, rej));
const $ = id => document.getElementById(id);

function show(id) {
  ['login', 'home', 'users', 'assign', 'tasks'].forEach(s => $(s).classList.add('hidden'));
  $(id).classList.remove('hidden');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindUI, { once: true });
} else {
  bindUI();
}

document.addEventListener('deviceready', async () => {
  try { await afterLogin(); } catch (e) { show('login'); } // already signed in?
});

function bindUI() {
  $('btnLogin').onclick = () => auth('signInUserWithEmailAndPassword');
  $('btnRegister').onclick = () => auth('createUserWithEmailAndPassword');
  $('btnUsers').onclick = loadUsers;
  $('btnTasks').onclick = loadTasks;
  $('btnSend').onclick = sendTask;
  document.querySelectorAll('.back').forEach(b => b.onclick = () => show('home'));
}

async function auth(method) {
  try {
    const firebase = window.FirebasePlugin;
    const authMethod = firebase && firebase[method];
    if (typeof authMethod !== 'function') {
      throw new Error('Firebase Authentication is unavailable. Run the Cordova app on Android instead of the browser preview.');
    }
    await p(authMethod, $('email').value.trim(), $('password').value);
    await afterLogin();
  } catch (e) { alert('Auth error: ' + (e && e.message ? e.message : e)); }
}

async function afterLogin() {
  me = await p(fb().getCurrentUser);
  if (!me || !me.uid) throw new Error('not signed in');

  const permissionGranted = await p(fb().grantPermission);
  const token = await p(fb().getToken);
  await saveToken(token);
  fb().onTokenRefresh(saveToken, console.error);
  fb().onMessageReceived(onPush, console.error);

  $('whoami').textContent = 'Signed in as ' + me.email;
  show('home');
  if (permissionGranted === false) {
    alert('Notifications are disabled. Enable them in Android settings to receive task alerts.');
  }
}

function saveToken(token) {
  return Promise.all([
    p(fb().setDocumentInFirestoreCollection, me.uid, { email: me.email }, 'users'),
    p(fb().setDocumentInFirestoreCollection, me.uid, { token }, 'deviceTokens')
  ]);
}

async function loadUsers() {
  const all = await p(fb().fetchFirestoreCollection, 'users', []);
  $('userList').innerHTML = '';
  Object.entries(all).filter(([id]) => id !== me.uid).forEach(([id, u]) => {
    const d = document.createElement('div');
    d.className = 'card';
    d.textContent = u.email;
    d.onclick = () => { target = { id, email: u.email }; $('assignTo').textContent = 'Task for ' + u.email; show('assign'); };
    $('userList').appendChild(d);
  });
  show('users');
}

async function sendTask() {
  const text = $('taskText').value.trim();
  if (!text) return alert('Enter a task');
  if (!me || !target) return alert('Sign in and choose a recipient first.');

  let serverUrl;
  try {
    serverUrl = new URL(SERVER);
    if (serverUrl.protocol !== 'https:' || serverUrl.hostname === 'YOUR-APP.onrender.com') {
      throw new Error('Set SERVER to your deployed HTTPS backend URL in www/js/index.js.');
    }
  } catch (e) {
    return alert(e.message);
  }

  try {
    me = await p(fb().getCurrentUser);
    if (!me || me.uid === undefined || !me.idToken) {
      throw new Error('Could not get a current Firebase sign-in token. Sign in again.');
    }

    const taskId = await p(fb().addDocumentToFirestoreCollection, {
      fromUid: me.uid, fromEmail: me.email, toUid: target.id,
      text, done: false, createdAt: Date.now()
    }, 'tasks');

    const response = await fetch(serverUrl.origin + '/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + me.idToken
      },
      body: JSON.stringify({ toUid: target.id, taskId })
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      throw new Error(result.error || 'The server did not confirm the notification.');
    }

    $('taskText').value = '';
    alert('Task sent; Firebase accepted the notification.');
    show('home');
  } catch (e) {
    alert('Task may be saved, but the notification was not sent: ' + (e.message || e));
  }
}

async function loadTasks() {
  const all = await p(fb().fetchFirestoreCollection, 'tasks', [['where', 'toUid', '==', me.uid]]);
  $('taskList').innerHTML = '';
  Object.entries(all).forEach(([id, t]) => {
    const d = document.createElement('div');
    d.className = 'card' + (t.done ? ' done' : '');
    d.textContent = t.text + ' (from ' + t.fromEmail + ')';
    if (!t.done) d.onclick = async () => {
      await p(fb().updateDocumentInFirestoreCollection, id, { done: true }, 'tasks');
      loadTasks();
    };
    $('taskList').appendChild(d);
  });
  show('tasks');
}

function onPush(msg) {
  if (msg.tap) loadTasks();                    // user tapped the notification
  else { alert(msg.title + ': ' + msg.body); } // app was open
}