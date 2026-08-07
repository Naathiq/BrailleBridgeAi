import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp({
  ...firebaseConfig,
  databaseURL: `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`
});
export const rtdb = getDatabase(app);
export const auth = getAuth();
