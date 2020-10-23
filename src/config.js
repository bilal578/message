import firebase from 'firebase'

 // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  var firebaseConfig = {
    apiKey: "AIzaSyCN7OJkbTcCuO9JUT-_8wBhvqg_yd2138g",
    authDomain: "message-30227.firebaseapp.com",
    // databaseURL: "https://message-30227.firebaseio.com",
    projectId: "message-30227",
    // storageBucket: "message-30227.appspot.com",
    // messagingSenderId: "683912508178",
    // appId: "1:683912508178:web:1245f58985f5e25ab2f9cb",
    // measurementId: "G-1EN862RRLV"
  };
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
//   firebase.analytics();

  const auth = firebase.auth();
  const db = firebase.firestore();

  export {auth, db};
