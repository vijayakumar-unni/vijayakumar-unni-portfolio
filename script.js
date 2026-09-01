// Mobile navigation toggle
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// Code showcase tabs
const codeTabs = document.querySelectorAll(".code-tab");
const codePanels = document.querySelectorAll(".code-snippet");

codeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.code;

    codeTabs.forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
    });

    codePanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.codePanel === target);
    });
  });
});
