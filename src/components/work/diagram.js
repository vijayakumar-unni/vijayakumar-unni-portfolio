// Diagram nodes: hover, focus, or tap swaps the caption for that node's
// description, so the explanation lives in one place instead of a tooltip.
document.querySelectorAll(".diagram").forEach((diagram) => {
  const caption = diagram.querySelector(".diagram-caption");
  if (!caption) return;

  const defaultText = caption.dataset.default ?? "";
  const show = (node) => {
    caption.textContent = node.dataset.desc || defaultText;
  };
  const reset = () => {
    caption.textContent = defaultText;
  };

  diagram.querySelectorAll(".node").forEach((node) => {
    node.addEventListener("mouseenter", () => show(node));
    node.addEventListener("mouseleave", reset);
    node.addEventListener("focus", () => show(node));
    node.addEventListener("blur", reset);
    node.addEventListener("click", () => show(node));
  });
});
