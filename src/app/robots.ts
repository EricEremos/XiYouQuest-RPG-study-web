import type { MetadataRoute } from "next";

/**
 * Served publicly at /robots.txt (the proxy matcher exempts it from the auth
 * redirect). Everything except the login page sits behind SSO, so crawlers
 * are pointed at the public surface and kept out of the API.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login"],
        disallow: ["/api/"],
      },
    ],
  };
}
