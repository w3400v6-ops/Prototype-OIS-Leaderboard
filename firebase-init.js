const firebaseConfig = {
  apiKey: "AIzaSyBIIEQt0ryHNulKYNmfCliMywmSzzQuBls",
  authDomain: "my-epic-database.firebaseapp.com",
  databaseURL: "https://my-epic-database-default-rtdb.firebaseio.com",
  projectId: "my-epic-database",
  storageBucket: "my-epic-database.appspot.com",
  messagingSenderId: "533989527206",
  appId: "1:533989527206:web:d34c0a693e6f19dc43ae67"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const analytics = firebase.analytics();

provider.setCustomParameters({ hd: "oakbridge.edu.my" });
