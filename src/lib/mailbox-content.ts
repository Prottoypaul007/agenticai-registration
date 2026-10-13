const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]!);

function inline(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

export function renderMailboxBody(body: string) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => { if (paragraph.length) blocks.push(`<p>${paragraph.map(inline).join("<br>")}</p>`); paragraph = []; };
  const flushList = () => { if (list.length) blocks.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join("")}</ul>`); list = []; };
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { flushParagraph(); list.push(bullet[1]); }
    else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line); }
  }
  flushParagraph(); flushList();
  return blocks.join("\n");
}

export function mailboxEmailHtml(body: string) {
  return `<div style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#13233a;line-height:1.65">${renderMailboxBody(body)}<p style="margin-top:32px;font-size:12px;color:#64748b">This mailbox is not monitored.</p></div>`;
}
