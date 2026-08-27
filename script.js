const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

document.title = 'Vijayakumar Unni | AEM Developer';
document.querySelector('.hero-copy h2').innerHTML = 'Adobe Certified<br><span>AEM Developer</span>';
document.querySelector('.hero-intro').textContent = 'Enterprise AEM 6.5 and AEMaaCS developer specializing in Headless AEM, Angular SPA, and practical AI-powered ADLC automation.';
document.querySelector('.hero-photo span').innerHTML = 'AEM Developer<br>Enterprise delivery';
const coverageMetric = [...document.querySelectorAll('.proof-strip b')].find((item) => item.textContent.includes('50%'));
if (coverageMetric) {
	coverageMetric.textContent = '5';
	coverageMetric.nextElementSibling.innerHTML = 'enterprise<br>projects';
}

const projectGrid = document.querySelector('.project-grid');
if (projectGrid && !projectGrid.querySelector('[data-project="adlc"]')) {
	projectGrid.insertAdjacentHTML('afterbegin', `<article class="project-card reveal" data-category="ai" data-project="adlc"><div class="project-header"><span>01</span><span>Cognizant · Associate · Feb 2026–Present</span><span>AI / ADLC</span></div><h3>AI-Powered AEM Sites <em>ADLC</em></h3><p class="project-summary">AI-powered framework automating end-to-end AEM Sites development using specialized agents and reusable Markdown skills.</p><div class="project-columns"><div><div class="detail-block"><strong>Contribution</strong><p>Automated component, Granite UI dialog, HTL, OSGi config, and Content Fragment creation. Integrated approval workflows, Git PR automation, UI/accessibility/SEO testing, and defect feedback loops routing QA failures back to agents.</p></div><div class="stack"><span>Multi-Agent Architecture</span><span>Claude CLI</span><span>VS Code</span><span>Playwright</span><span>Lighthouse</span><span>CI/CD</span></div></div><div class="project-scene scene-adlc"><b>ADLC / DELIVERY PIPELINE</b><div class="scene-flow"><span>ARCHITECT</span><i>→</i><span>GENERATE</span><i>→</i><span>VALIDATE</span><i>→</i><span>DEPLOY</span></div><small>12 agents ready · approval gate active</small></div></div></article>`);
}

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
