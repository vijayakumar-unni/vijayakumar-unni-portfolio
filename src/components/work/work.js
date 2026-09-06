// Project console: a proper ARIA tablist over the project panels.
// Roving tabindex means the list is one tab stop; arrows move between projects.
const tablist = document.querySelector(".console-list");

if (tablist) {
  const tabs = [...tablist.querySelectorAll(".console-item")];
  const panels = [...document.querySelectorAll(".panel")];

  const select = (tab, { focus = false } = {}) => {
    tabs.forEach((candidate) => {
      const active = candidate === tab;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-selected", String(active));
      candidate.tabIndex = active ? 0 : -1;
    });

    panels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === tab.dataset.project);
    });

    if (focus) tab.focus();
  };

  tabs.forEach((tab) => tab.addEventListener("click", () => select(tab)));

  tablist.addEventListener("keydown", (event) => {
    const current = tabs.indexOf(document.activeElement);
    if (current === -1) return;

    const offsets = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next;

    if (event.key in offsets) {
      next = (current + offsets[event.key] + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    select(tabs[next], { focus: true });
  });
}
