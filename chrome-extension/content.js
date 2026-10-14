// Runs on every page — extracts useful lead info and responds to popup messages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'GET_PAGE_INFO') return;

  // Try to pull a company name from common meta tags / OG tags / title
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content || '';
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const metaAuthor = document.querySelector('meta[name="author"]')?.content || '';

  // Heuristic: strip " | Company" suffix from <title> as fallback company name
  const titleParts = document.title.split(/[|\-–—]/);
  const titleCompany = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : '';

  // Try to find an email on the page (first match)
  const bodyText = document.body.innerText || '';
  const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);

  // Try to find a phone number on the page (India-ish format first)
  const phoneMatch = bodyText.match(/(?:\+91[\s\-]?)?[6-9]\d{9}/);

  sendResponse({
    url: location.href,
    title: document.title,
    company: ogSiteName || titleCompany || metaAuthor || '',
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '',
    description: document.querySelector('meta[name="description"]')?.content || ogTitle || '',
  });

  return true; // keep channel open for async
});
