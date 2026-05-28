// Login Page Handler
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const codeInput = document.getElementById('code');
  const passwordInput = document.getElementById('password');
  const loading = document.getElementById('loading');
  const buttonText = document.getElementById('buttonText');
  const generalError = document.getElementById('generalError');

  // Redirect if already logged in
  if (auth.isLoggedIn()) {
    window.location.href = '/index.html';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors
    generalError.style.display = 'none';
    generalError.textContent = '';

    const code = codeInput.value.trim();
    const password = passwordInput.value;

    // Validate inputs
    if (!code || !password) {
      showError(generalError, 'Please enter both code and password');
      return;
    }

    // Show loading state
    loading.classList.add('active');
    buttonText.textContent = 'Logging in...';
    loginForm.querySelector('button').disabled = true;

    try {
      // Attempt login
      const result = await auth.login(code, password);

      // Success - redirect to dashboard
      showSuccess(generalError, 'Login successful! Redirecting...');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1000);
    } catch (error) {
      showError(generalError, error.message);
    } finally {
      // Hide loading state
      loading.classList.remove('active');
      buttonText.textContent = 'Login';
      loginForm.querySelector('button').disabled = false;
    }
  });

  // Real-time code validation
  codeInput.addEventListener('input', (e) => {
    // Allow only digits
    e.target.value = e.target.value.replace(/\D/g, '');

    // Optional: Format as user types (YYYYMMDDNNN)
    let value = e.target.value;
    if (value.length > 8) {
      e.target.value = `${value.slice(0, 8)}${value.slice(8, 11)}`;
    }
  });

  // Password field validation
  passwordInput.addEventListener('input', () => {
    clearError('passwordError');
  });
});

function showError(element, message) {
  element.textContent = message;
  element.style.display = 'block';
}

function showSuccess(element, message) {
  element.textContent = message;
  element.style.color = '#10b981';
  element.style.display = 'block';
}

function clearError(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = 'none';
    element.textContent = '';
  }
}
