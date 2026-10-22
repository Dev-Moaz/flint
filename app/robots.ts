import type { MetadataRoute } from 'next';

// Private pages are never crawled (they also carry noindex): applicant links, the agency
// dashboard and the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: ['/screen/', '/report/', '/api/'] }],
  };
}