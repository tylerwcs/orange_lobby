const ALLOWED = new Set(["p", "h2", "h3", "ul", "ol", "li", "a", "img", "strong", "em", "br"]);
const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

export function sanitizeHtml(html: string): string {
  let s = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  return s.replace(/<\/?([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/g, (_m, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED.has(tag)) return "";
    const closing = _m.startsWith("</");
    if (closing) return `</${tag}>`;
    let out = `<${tag}`;
    if (tag === "a") { const h = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]; if (h && SAFE_URL.test(h)) out += ` href="${h}"`; }
    if (tag === "img") {
      const src = /src\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]; const alt = /alt\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
      if (src && SAFE_URL.test(src)) out += ` src="${src}" alt="${alt.replace(/"/g, "")}"`; else return "";
    }
    return out + ">";
  });
}
