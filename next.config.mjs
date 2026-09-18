/** API-only application; keep the generated Prisma client and driver on the Node runtime. */
export default {
  serverExternalPackages: ["@prisma/client", "bcrypt", "@prisma/adapter-mariadb", "mariadb"],
  webpack(config) {
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".ts", ".js"] };
    return config;
  },
};
