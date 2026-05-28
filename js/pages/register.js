// Registration Page Handler
document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const emailInput = document.getElementById('email');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loading = document.getElementById('loading');
  const buttonText = document.getElementById('buttonText');
  const generalError = document.getElementById('generalError');
  const successBox = document.getElementById('successBox');
  const codeDisplay = document.getElementById('codeDisplay');
  const submitBtn = document.getElementById('submitBtn');
  const passwordStrength = document.getElementById('passwordStrength');
  const strengthText = document.getElementById('strengthText');
  const strengthFill = document.getElementById('strengthFill');

  // Redirect if already logged in
  if (auth.isLoggedIn()) {
    window.location.href = '/index.html';
  }

  // Password strength checker
  passwordInput.addEventListener('input', (e) => {
    const password = e.target.value;
    const strength = checkPasswordStrength(password);

    if (password.length > 0) {
      passwordStrength.style.display = 'block';
      strengthText.textContent = `Strength: ${strength.label}`;

      strengthFill.className = 'strength-fill';
      if (strength.score === 1) strengthFill.classList.add('fair');
      else if (strength.score === 2) strengthFill.classList.add('good');
      else if (strength.score === 3) strengthFill.classList.add('strong');
    } else {
      passwordStrength.style.display = 'none';
    }
  });

  // Username validation - no spaces or special chars
  usernameInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors and success
    generalError.style.display = 'none';
    generalError.textContent = '';
    successBox.classList.remove('active');
    registerForm.style.display = 'block';

    const email = emailInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    // Validate inputs
    const validation = validateRegistration(email, username, password);
    if (!validation.valid) {
      showError(generalError, validation.message);
      return;
    }

    // Show loading state
    loading.classList.add('active');
    buttonText.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
      // Attempt registration
      const result = await auth.register(email, username, password);

      // Success - show code and hide form
      registerForm.style.display = 'none';
      codeDisplay.textContent = result.code;
      successBox.classList.add('active');
    } catch (error) {
      showError(generalError, error.message);
    } finally {
      // Hide loading state
      loading.classList.remove('active');
      buttonText.textContent = 'Create Account';
      submitBtn.disabled = false;
    }
  });
});

function validateRegistration(email, username, password) {
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { valid: false, message: 'Please enter a valid email address' };
  }

  // Username validation
  if (!username || username.length < 3) {
    return { valid: false, message: 'Username must be at least 3 characters' };
  }

  if (username.length > 30) {
    return { valid: false, message: 'Username must be less than 30 characters' };
  }

  // Password validation
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }

  return { valid: true };
}

function checkPasswordStrength(password) {
  let score = 0;

  // Length
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Complexity
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);

  const complexityCount = [hasLower, hasUpper, hasNumbers, hasSpecial].filter(Boolean).length;

  if (complexityCount >= 2) score++;
  if (complexityCount >= 3) score++;

  // Determine label
  let label = 'Weak';
  if (score >= 2) label = 'Fair';
  if (score >= 3) label = 'Good';
  if (score >= 4) label = 'Strong';

  return { score: Math.min(score, 3), label };
}

function showError(element, message) {
  element.textContent = message;
  element.style.display = 'block';
  element.style.color = '#ef4444';
}

function copyCode() {
  const codeDisplay = document.getElementById('codeDisplay');
  const code = codeDisplay.textContent;

  navigator.clipboard.writeText(code).then(() => {
    const copyBtn = event.target;
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  }).catch(() => {
    alert('Failed to copy code');
  });
}
