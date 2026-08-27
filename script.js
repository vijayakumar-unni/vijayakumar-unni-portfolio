const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

menuToggle.addEventListener('click', () => {
	const open = navLinks.classList.toggle('open');
	menuToggle.setAttribute('aria-expanded', String(open));
	menuToggle.textContent = open ? 'Close' : 'Menu';
});

document.querySelectorAll('.nav-links a').forEach((link) => link.addEventListener('click', () => {
	navLinks.classList.remove('open');
	menuToggle.setAttribute('aria-expanded', 'false');
	menuToggle.textContent = 'Menu';
}));

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
	if (entry.isIntersecting) {
		entry.target.classList.add('visible');
		observer.unobserve(entry.target);
	}
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
	document.querySelectorAll('.filter-button').forEach((item) => item.classList.remove('active'));
	button.classList.add('active');
	const filter = button.dataset.filter;
	document.querySelectorAll('[data-category]').forEach((project) => {
		project.classList.toggle('filtered-out', filter !== 'all' && project.dataset.category !== filter);
	});
}));

document.querySelectorAll('.code-tab').forEach((tab) => tab.addEventListener('click', () => {
	document.querySelectorAll('.code-tab').forEach((item) => {
		const active = item === tab;
		item.classList.toggle('active', active);
		item.setAttribute('aria-selected', String(active));
	});
	document.querySelectorAll('.code-snippet').forEach((snippet) => snippet.classList.toggle('active', snippet.dataset.codePanel === tab.dataset.code));
}));
