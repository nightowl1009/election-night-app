/* Firebase settings for the Election Pool.
   These keys are meant to be public; the database rules are what keep data safe. */
window.POOL_CONFIG = {
  apiKey: "AIzaSyCTF7XgR63NcwfxP9dBpxxl--cTV0FsVsU",
  authDomain: "election-night-pool.firebaseapp.com",
  projectId: "election-night-pool",
  storageBucket: "election-night-pool.firebasestorage.app",
  messagingSenderId: "167217762910",
  appId: "1:167217762910:web:090e40bbce6f23e3321acf"
};
/* Emails allowed to call races in the pool (must match the database rules' admin email). */
window.POOL_ADMINS = ["brad.w.crook@gmail.com"];
