(function() {
  // Find the existing overlay div
  const overlay = document.getElementById('under-construction-overlay');

  // If the div does NOT exist, exit silently
  if (!overlay) {
    console.log('No #under-construction-overlay div found. Injection aborted.');
    return;
  }

  // Prevent double injection (if already populated)
  if (overlay.hasAttribute('data-injected')) return;
  overlay.setAttribute('data-injected', 'true');

  // Inject styles and content into the existing div
  overlay.innerHTML = `
    <style>
      #under-construction-overlay {
        position: fixed !important;
        top: 111px !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.85) !important;
        backdrop-filter: blur(5px) !important;
        z-index: 99 !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
        cursor: default !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .under-construction-card {
        background: white !important;
        border-radius: 24px !important;
        padding: 2rem 3rem !important;
        max-width: 500px !important;
        text-align: center !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
        animation: fadeInUp 0.4s ease-out !important;
        color: #1f2937 !important;
      }
      .under-construction-card h1 {
        font-size: 2.5rem !important;
        margin: 0 0 0.5rem !important;
        color: #dc2626 !important;
      }
      .under-construction-card p {
        font-size: 1.1rem !important;
        margin-bottom: 0 !important;
        line-height: 1.4 !important;
      }
      .under-construction-card .emoji {
        font-size: 4rem !important;
        margin-bottom: 0.5rem !important;
      }
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    </style>
    <div class="under-construction-card">
      <div class="emoji">🚧👷‍♀️</div>
      <h1>Under Construction</h1>
      <p>This page is currently being updated.<br>Please check back soon!</p>
    </div>
  `;
})();