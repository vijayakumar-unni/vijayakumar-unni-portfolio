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