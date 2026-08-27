const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.textContent = isOpen ? 'Close' : 'Menu';
});

document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.textContent = 'Menu';
  });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

document.querySelectorAll('.filter-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter-button').forEach((filter) => filter.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.filter;
    document.querySelectorAll('[data-category]').forEach((project) => {
      project.classList.toggle('filtered-out', filter !== 'all' && project.dataset.category !== filter);
    });
  });
});

document.querySelectorAll('.project-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const project = button.closest('.project');
    const isOpen = project.classList.toggle('details-open');
    button.setAttribute('aria-expanded', String(isOpen));
    button.innerHTML = isOpen ? 'Hide project brief <span>−</span>' : 'View project brief <span>+</span>';
  });
});

document.querySelectorAll('.pipeline-step').forEach((step) => {
  step.addEventListener('click', () => {
    const pipeline = step.closest('.adlc-visual');
    const steps = [...pipeline.querySelectorAll('.pipeline-step')];
    const selectedIndex = steps.indexOf(step);
    steps.forEach((item, index) => {
      item.classList.toggle('is-done', index < selectedIndex);
      item.classList.toggle('is-active', index === selectedIndex);
      item.querySelector('i').textContent = index < selectedIndex ? '✓' : index === selectedIndex ? '●' : '○';
    });
    pipeline.querySelector('.stage-message').textContent = `${step.dataset.stage} agent is ready`;
  });
});

document.querySelectorAll('.ticket-action').forEach((button) => {
  button.addEventListener('click', () => {
    button.textContent = 'Running...';
    button.closest('.support-visual').querySelector('.support-message').textContent = 'Diagnostics running via Adobe MCP';
    window.setTimeout(() => {
      button.textContent = 'Resolved';
      button.closest('.support-visual').querySelector('.support-message').textContent = 'Evidence collected · approval required';
    }, 900);
  });
});

fetch('resume-data.json')
  .then((response) => response.ok ? response.json() : null)
  .then((resume) => {
    if (resume) {
      document.querySelectorAll('[data-resume-summary]').forEach((element) => {
        element.textContent = `Resume synced · ${resume.lastUpdated}`;
      });
    }
  })
  .catch(() => {});