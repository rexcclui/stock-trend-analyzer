/**
 * Safely join base URL with path, handling trailing/leading slashes
 * @param {string} baseUrl - Base API URL
 * @param {string} path - API endpoint path
 * @returns {string} Properly formatted URL
 */
export function joinUrl(baseUrl, path) {
  // Remove trailing slash from base URL
  const cleanBase = baseUrl.replace(/\/$/, '')
  // Ensure path starts with slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBase}${cleanPath}`
}
