const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]);

function field(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 300) {
    throw new TypeError(`${name} must be a non-empty string of at most 300 characters.`);
  }
  return escapeHtml(value.trim());
}

export function renderTicket({ title, summary, requestedBy }) {
  const safeTitle = field(title, 'title');
  const safeSummary = field(summary, 'summary');
  const safeRequester = field(requestedBy, 'requestedBy');
  return `<article><h1>${safeTitle}</h1><p>${safeSummary}</p><footer>Requested by ${safeRequester}</footer></article>`;
}
