// Compute a relative path to login.html from the current page's location.
// This works at any folder depth and under both http:// and file:// schemes.
(function () {
  function getLoginPath() {
    const path = window.location.pathname;
    // Split path into non-empty segments, ignoring the filename at the end
    const segments = path.split('/').filter(Boolean);
    // If the last segment looks like a file (has a '.'), exclude it from depth count
    const depth = segments.length > 0 && segments[segments.length - 1].includes('.')
      ? segments.length - 1
      : segments.length;
    // Walk up 'depth' levels then go into pages/login.html
    const prefix = depth > 0 ? '../'.repeat(depth) : './';
    return prefix + 'pages/login.html';
  }

  function redirectToLogin() {
    window.location.href = getLoginPath();
  }

  // Immediate check (before DOMContentLoaded) for fastest redirect
  if (!localStorage.getItem('accessToken')) {
    redirectToLogin();
  }

  // Belt-and-suspenders: also check after DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    if (!localStorage.getItem('accessToken')) {
      redirectToLogin();
    }
  });
})();
