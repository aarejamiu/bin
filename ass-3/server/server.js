const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const serviceAccount = require('/etc/secrets/secretAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '16kb' }));

app.post('/send', async (req, res) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Sign-in is required.' });
  }

  let sender;
  try {
    sender = await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    return res.status(401).json({ error: 'The Firebase sign-in token is invalid or expired.' });
  }

  const { toUid, taskId } = req.body || {};
  if (typeof toUid !== 'string' || !toUid || toUid.includes('/')
      || typeof taskId !== 'string' || !taskId || taskId.includes('/')
      || toUid.length > 256 || taskId.length > 256) {
    return res.status(400).json({ error: 'A recipient and task ID are required.' });
  }

  try {
    const taskRef = admin.firestore().collection('tasks').doc(taskId);
    const taskSnapshot = await taskRef.get();
    if (!taskSnapshot.exists) {
      return res.status(404).json({ error: 'The task was not found.' });
    }

    const task = taskSnapshot.data();
    if (task.fromUid !== sender.uid || task.toUid !== toUid) {
      return res.status(403).json({ error: 'You are not allowed to send this task notification.' });
    }
    if (typeof task.text !== 'string' || !task.text.trim() || task.text.length > 1000) {
      return res.status(400).json({ error: 'The task has no notification text.' });
    }

    const recipientSnapshot = await admin.firestore().collection('deviceTokens').doc(toUid).get();
    const token = recipientSnapshot.data()?.token;
    if (typeof token !== 'string' || !token) {
      return res.status(404).json({ error: 'The recipient has no registered notification token.' });
    }

    await admin.messaging().send({
      token,
      notification: {
        title: 'New task from ' + (sender.email || 'a Nudge user'),
        body: task.text.trim()
      },
      data: { taskId }
    });

    return res.json({ ok: true });
  } catch (error) {
    if (error.code === 'messaging/registration-token-not-registered') {
      try {
        await admin.firestore().collection('deviceTokens').doc(toUid).delete();
      } catch (cleanupError) {
        console.error('Failed to clear an expired notification token:', cleanupError);
      }
    }
    console.error('Failed to send Firebase notification:', error);
    return res.status(502).json({ error: 'Firebase could not send the notification.' });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Notification server listening on port ${port}`);
});
