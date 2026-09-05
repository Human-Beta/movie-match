import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const allowedDevOrigins = process.env.MOVIE_MATCH_ALLOWED_DEV_ORIGINS?.split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
