/**
 * main.js
 * Application entry point.
 * Boots all controllers in the correct order once the DOM is ready.
 */
document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();              // redirects to /login.html if not authenticated
  AppController.init();
  CalendarController.init();
  TaskController.init();
});
