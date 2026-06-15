export function section(title) {
  const root = document.createElement("div");
  root.style = "margin-top:0.55rem;";
  const heading = document.createElement("div");
  heading.style = "color:#fff;font-weight:900;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.04em;font-size:clamp(0.56rem,0.95vw,0.7rem);border-left:0.2rem solid #00aaff;padding-left:0.45rem;background:rgba(255,255,255,0.03);";
  heading.textContent = title;
  root.appendChild(heading);
  return root;
}

export function htmlFragment(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content;
}
