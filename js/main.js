/**
 * main.js
 * Application entry point.
 * Boots all controllers in the correct order once the DOM is ready.
 */
document.addEventListener('DOMContentLoaded', () => {
  AppController.init();
  CalendarController.init();
  TaskController.init();
});
