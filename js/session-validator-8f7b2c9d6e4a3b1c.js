// Check authentication on page load
document.addEventListener("DOMContentLoaded", () => {
  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) {
    // Redirect to login if not authenticated
    window.location.href = "/pages/login.html";
  }
});

// Also check immediately for faster redirect
if (!localStorage.getItem("accessToken")) {
  window.location.href = "/pages/login.html";
}
