// Mobile navigation toggle
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Project console: switch active project + panel
const consoleItems = document.querySelectorAll('.console-item');
const panels = document.querySelectorAll('.panel');

consoleItems.forEach((item) => {
  item.addEventListener('click', () => {
    const target = item.dataset.project;

    consoleItems.forEach((i) => {
      const active = i === item;
      i.classList.toggle('active', active);
      i.setAttribute('aria-selected', String(active));
    });

    panels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === target);
    });
  });
});

// Code showcase tabs
const codeTabs = document.querySelectorAll('.code-tab');
const codePanels = document.querySelectorAll('.code-snippet');

codeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.code;

    codeTabs.forEach((t) => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });

    codePanels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.codePanel === target);
    });
  });
});

// Diagram nodes: hover/focus/tap shows the node's description in the caption
document.querySelectorAll('.diagram').forEach((diagram) => {
  const caption = diagram.querySelector('.diagram-caption');
  const defaultText = caption ? caption.dataset.default : '';
  const nodes = diagram.querySelectorAll('.node');

  const showDesc = (node) => {
    if (!caption) return;
    caption.textContent = node.dataset.desc || defaultText;
  };
  const resetDesc = () => {
    if (!caption) return;
    caption.textContent = defaultText;
  };

  nodes.forEach((node) => {
    node.addEventListener('mouseenter', () => showDesc(node));
    node.addEventListener('mouseleave', resetDesc);
    node.addEventListener('focus', () => showDesc(node));
    node.addEventListener('blur', resetDesc);
    node.addEventListener('click', () => showDesc(node));
  });
});
